import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    ArrowPathIcon,
    CheckCircleIcon,
    DocumentArrowUpIcon,
    ExclamationTriangleIcon,
} from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';
import Layout from '../components/Layout';
import { findColumn, normalizeHeader, parseCsv, parseNumber } from '../lib/csv';
import { supabase } from '../lib/supabase';

const SKU_HEADERS = ['sku', 'product_sku', 'item_sku', 'item_code', 'code'];
const QUANTITY_HEADERS = ['quantity', 'qty', 'units', 'units_sold', 'sold_quantity', 'sold_qty'];
const PRICE_HEADERS = ['unit_price', 'price', 'sale_price', 'selling_price'];

const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB
const MAX_CSV_ROWS = 10_000;

async function hashText(text) {
    const buffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return Array.from(new Uint8Array(buffer))
        .map((byte) => byte.toString(16).padStart(2, '0'))
        .join('');
}

function buildImportPreview(text, products) {
    const csvRows = parseCsv(text);
    if (csvRows.length < 2) {
        throw new Error('The file must include a header row and at least one sale row.');
    }
    if (csvRows.length - 1 > MAX_CSV_ROWS) {
        throw new Error(`File has too many rows. Maximum is ${MAX_CSV_ROWS.toLocaleString()} data rows.`);
    }

    const headers = csvRows[0].map(normalizeHeader);
    const skuColumn = findColumn(headers, SKU_HEADERS);
    const quantityColumn = findColumn(headers, QUANTITY_HEADERS);
    const priceColumn = findColumn(headers, PRICE_HEADERS);

    if (!skuColumn || !quantityColumn) {
        throw new Error('The file must include SKU and quantity columns.');
    }

    const skuIndex = headers.indexOf(skuColumn);
    const quantityIndex = headers.indexOf(quantityColumn);
    const priceIndex = priceColumn ? headers.indexOf(priceColumn) : -1;
    const productBySku = new Map(products.map((product) => [product.sku.toLowerCase(), product]));
    const aggregated = new Map();
    const previewRows = [];

    csvRows.slice(1).forEach((cells, offset) => {
        const rowNumber = offset + 2;
        const sku = String(cells[skuIndex] || '').trim();
        const normalizedSku = sku.toLowerCase();
        const rawQuantity = parseNumber(cells[quantityIndex]);
        const quantity = rawQuantity == null ? null : Math.round(rawQuantity);
        const unitPrice = priceIndex >= 0 ? parseNumber(cells[priceIndex]) : null;
        const product = productBySku.get(normalizedSku);
        const errors = [];

        if (!sku) errors.push('Missing SKU');
        if (!product) errors.push('Unknown SKU');
        if (!Number.isInteger(quantity) || quantity <= 0 || quantity !== rawQuantity) {
            errors.push('Invalid quantity');
        }
        if (unitPrice != null && unitPrice < 0) errors.push('Invalid price');

        previewRows.push({
            rowNumber,
            sku,
            productName: product?.name || '-',
            currentStock: product?.current_stock ?? '-',
            quantity: quantity || 0,
            unitPrice,
            status: errors.length ? errors.join(', ') : 'Ready',
            valid: errors.length === 0,
        });

        if (errors.length) return;

        const existing = aggregated.get(normalizedSku) || {
            sku: product.sku,
            product,
            quantity: 0,
            unitPrice,
        };
        existing.quantity += quantity;
        if (unitPrice != null) existing.unitPrice = unitPrice;
        aggregated.set(normalizedSku, existing);
    });

    const items = Array.from(aggregated.values()).map((item) => {
        const stockError = item.quantity > item.product.current_stock
            ? `Only ${item.product.current_stock} in stock`
            : null;
        return { ...item, stockError };
    });

    return {
        rowCount: csvRows.length - 1,
        previewRows,
        items,
        errors: previewRows.filter((row) => !row.valid).length + items.filter((item) => item.stockError).length,
    };
}

function money(value) {
    return `Rs ${Number(value || 0).toFixed(2)}`;
}

export default function SalesImport() {
    const fileInputRef = useRef(null);
    const [products, setProducts] = useState([]);
    const [loadingProducts, setLoadingProducts] = useState(true);
    const [fileName, setFileName] = useState('');
    const [fileHash, setFileHash] = useState('');
    const [preview, setPreview] = useState(null);
    const [importing, setImporting] = useState(false);
    const [importResult, setImportResult] = useState(null);

    const loadProducts = useCallback(async () => {
        setLoadingProducts(true);
        const { data, error } = await supabase
            .from('products')
            .select('id, name, sku, current_stock, unit_price')
            .order('name');

        if (error) toast.error('Failed to load products');
        else setProducts(data || []);
        setLoadingProducts(false);
    }, []);

    useEffect(() => {
        loadProducts();
    }, [loadProducts]);

    const readyItems = useMemo(
        () => (preview?.items || []).filter((item) => !item.stockError),
        [preview]
    );

    const totalUnits = readyItems.reduce((sum, item) => sum + item.quantity, 0);
    const estimatedTotal = readyItems.reduce(
        (sum, item) => sum + item.quantity * Number(item.unitPrice ?? item.product.unit_price ?? 0),
        0
    );
    const canImport = readyItems.length > 0 && preview?.errors === 0 && !importing;

    async function handleFileChange(event) {
        const file = event.target.files?.[0];
        setImportResult(null);
        setPreview(null);
        setFileName('');
        setFileHash('');

        if (!file) return;

        if (!file.name.toLowerCase().endsWith('.csv')) {
            toast.error('Upload a CSV file');
            event.target.value = '';
            return;
        }

        if (file.size > MAX_FILE_SIZE_BYTES) {
            toast.error('File is too large. Maximum size is 5 MB.');
            event.target.value = '';
            return;
        }

        try {
            const text = await file.text();
            const nextPreview = buildImportPreview(text, products);
            setFileHash(await hashText(text));
            setFileName(file.name);
            setPreview(nextPreview);
        } catch (error) {
            toast.error(error.message);
            event.target.value = '';
        }
    }

    async function handleImport() {
        if (!canImport) return;

        setImporting(true);
        try {
            const { data, error } = await supabase.rpc('import_sales_batch', {
                p_file_name: fileName,
                p_file_hash: fileHash,
                p_items: readyItems.map((item) => ({
                    sku: item.sku,
                    quantity: item.quantity,
                    unit_price: item.unitPrice,
                })),
            });

            if (error) throw error;

            setImportResult(data);
            toast.success(`Imported ${data.total_units} sold units`);
            await loadProducts();
            if (fileInputRef.current) fileInputRef.current.value = '';
        } catch (error) {
            toast.error(`Import failed: ${error.message}`);
        }
        setImporting(false);
    }

    return (
        <Layout title="Sales Import">
            <div className="space-y-6">
                <div className="grid grid-cols-1 lg:grid-cols-[380px_1fr] gap-6">
                    <div className="card">
                        <div className="flex items-center gap-2 mb-4">
                            <DocumentArrowUpIcon className="w-5 h-5 text-accent" />
                            <h3 className="font-bold text-gray-800">Cashier Export</h3>
                        </div>
                        <div className="space-y-4">
                            <div>
                                <label className="block text-xs font-medium text-gray-600 mb-1">CSV File</label>
                                <input
                                    ref={fileInputRef}
                                    type="file"
                                    accept=".csv,text/csv"
                                    className="input-field"
                                    disabled={loadingProducts}
                                    onChange={handleFileChange}
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div className="bg-gray-50 rounded-lg p-3">
                                    <p className="text-xs text-gray-400">Rows</p>
                                    <p className="text-xl font-bold text-gray-800">{preview?.rowCount || 0}</p>
                                </div>
                                <div className="bg-gray-50 rounded-lg p-3">
                                    <p className="text-xs text-gray-400">Units</p>
                                    <p className="text-xl font-bold text-gray-800">{totalUnits}</p>
                                </div>
                            </div>
                            <div className="bg-gray-50 rounded-lg p-3">
                                <p className="text-xs text-gray-400">Estimated Sales</p>
                                <p className="text-xl font-bold text-gray-800">{money(estimatedTotal)}</p>
                            </div>
                            {preview?.errors > 0 && (
                                <div className="flex gap-2 text-sm text-red-700 bg-red-50 rounded-lg p-3">
                                    <ExclamationTriangleIcon className="w-5 h-5 flex-shrink-0" />
                                    <span>{preview.errors} issue{preview.errors === 1 ? '' : 's'} must be fixed before import.</span>
                                </div>
                            )}
                            {importResult && (
                                <div className="flex gap-2 text-sm text-green-700 bg-green-50 rounded-lg p-3">
                                    <CheckCircleIcon className="w-5 h-5 flex-shrink-0" />
                                    <span>Imported as {importResult.receipt_number}</span>
                                </div>
                            )}
                            <button
                                className="btn-primary w-full flex items-center justify-center gap-2"
                                disabled={!canImport}
                                onClick={handleImport}
                            >
                                {importing ? <ArrowPathIcon className="w-4 h-4 animate-spin" /> : <DocumentArrowUpIcon className="w-4 h-4" />}
                                {importing ? 'Importing...' : 'Import Sales'}
                            </button>
                        </div>
                    </div>

                    <div className="card p-0 overflow-hidden">
                        <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                            <h3 className="font-bold text-gray-800">Import Preview</h3>
                            <span className="text-xs text-gray-400">{fileName || 'No file selected'}</span>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full">
                                <thead className="bg-gray-50">
                                    <tr>
                                        <th className="table-header">Row</th>
                                        <th className="table-header">SKU</th>
                                        <th className="table-header">Product</th>
                                        <th className="table-header">Stock</th>
                                        <th className="table-header">Sold</th>
                                        <th className="table-header">Price</th>
                                        <th className="table-header">Status</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {!preview ? (
                                        <tr>
                                            <td colSpan={7} className="text-center py-12 text-gray-400 text-sm">
                                                Select a CSV file to preview sales.
                                            </td>
                                        </tr>
                                    ) : preview.previewRows.slice(0, 100).map((row) => (
                                        <tr key={`${row.rowNumber}-${row.sku}`} className="table-row">
                                            <td className="table-cell text-xs text-gray-500">{row.rowNumber}</td>
                                            <td className="table-cell font-mono text-xs">{row.sku || '-'}</td>
                                            <td className="table-cell text-sm">{row.productName}</td>
                                            <td className="table-cell font-semibold">{row.currentStock}</td>
                                            <td className="table-cell font-bold">{row.quantity}</td>
                                            <td className="table-cell">{row.unitPrice == null ? '-' : money(row.unitPrice)}</td>
                                            <td className="table-cell">
                                                <span className={row.valid ? 'badge-ok' : 'badge-critical'}>
                                                    {row.status}
                                                </span>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        {preview?.previewRows.length > 100 && (
                            <div className="px-4 py-2 border-t border-gray-50 text-xs text-gray-400">
                                Showing first 100 rows of {preview.previewRows.length}.
                            </div>
                        )}
                    </div>
                </div>

                {preview?.items?.length > 0 && (
                    <div className="card p-0 overflow-hidden">
                        <div className="px-4 py-3 border-b border-gray-100">
                            <h3 className="font-bold text-gray-800">Stock Update Summary</h3>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full">
                                <thead className="bg-gray-50">
                                    <tr>
                                        <th className="table-header">Product</th>
                                        <th className="table-header">SKU</th>
                                        <th className="table-header">Current</th>
                                        <th className="table-header">Sold</th>
                                        <th className="table-header">After Import</th>
                                        <th className="table-header">Status</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {preview.items.map((item) => (
                                        <tr key={item.sku} className="table-row">
                                            <td className="table-cell font-medium text-gray-800">{item.product.name}</td>
                                            <td className="table-cell font-mono text-xs text-gray-500">{item.sku}</td>
                                            <td className="table-cell font-semibold">{item.product.current_stock}</td>
                                            <td className="table-cell font-bold text-red-600">-{item.quantity}</td>
                                            <td className="table-cell font-semibold">
                                                {Math.max(item.product.current_stock - item.quantity, 0)}
                                            </td>
                                            <td className="table-cell">
                                                <span className={item.stockError ? 'badge-critical' : 'badge-ok'}>
                                                    {item.stockError || 'Ready'}
                                                </span>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}
            </div>
        </Layout>
    );
}
