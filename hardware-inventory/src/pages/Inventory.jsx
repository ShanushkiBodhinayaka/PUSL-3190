import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Dialog } from '@headlessui/react';
import {
    ArchiveBoxIcon,
    EyeIcon,
    PencilSquareIcon,
    CpuChipIcon,
    DocumentArrowUpIcon,
    ExclamationTriangleIcon,
    MagnifyingGlassIcon,
    PlusIcon,
    ShoppingCartIcon,
    TrashIcon,
} from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';
import Layout from '../components/Layout';
import { useAuth } from '../contexts/AuthContext';
import {
    buildForecastPrediction,
    getStockStatus,
} from '../lib/predictions';
import { getCell, normalizeHeader, parseCsv, parseNumber, toCsv } from '../lib/csv';
import { canCreatePurchaseOrders, canManageInventory } from '../lib/roles';
import { supabase } from '../lib/supabase';

const DEFAULT_CATEGORIES = ['Fasteners', 'Power Tools', 'Plumbing', 'Paint', 'Lumber', 'Concrete', 'Electrical', 'Safety', 'Uncategorized'];

const PRODUCT_IMPORT_MODES = [
    { value: 'create_update', label: 'Create + update stock' },
    { value: 'create_only', label: 'Create only' },
    { value: 'update_details', label: 'Update details only' },
    { value: 'update_baseline', label: 'Update stock baseline' },
];

const PAGE_SIZE_OPTIONS = [25, 50, 100];

const EMPTY_EDIT_PRODUCT = {
    id: '',
    name: '',
    sku: '',
    category: 'Uncategorized',
    reorder_point: 10,
    reorder_quantity: 50,
    unit_price: '',
    supplier_name: '',
};

const STATUS_BADGE = {
    ok: <span className="badge-ok">OK</span>,
    low: <span className="badge-low">Low</span>,
    critical: <span className="badge-critical">Critical</span>,
    out_of_stock: <span className="badge-critical">Out of Stock</span>,
};

function formatUnits(value) {
    const numeric = Number(value || 0);
    return Number.isInteger(numeric) ? numeric : numeric.toFixed(1);
}

function formatDateTime(value) {
    if (!value) return '-';
    return new Date(value).toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
    });
}

function todayIsoDate() {
    return new Date().toISOString().slice(0, 10);
}

async function getFunctionErrorMessage(error) {
    const fallback = error?.message || 'Request failed';

    try {
        const context = error?.context;
        if (context && typeof context.json === 'function') {
            const body = await context.json();
            return body?.error || body?.message || fallback;
        }
    } catch (_parseError) {
        return fallback;
    }

    return fallback;
}

function riskRank(riskLevel) {
    if (riskLevel === 'critical') return 0;
    if (riskLevel === 'at_risk') return 1;
    return 2;
}

function predictionSourceLabel(prediction) {
    if (prediction.source === 'forecast') {
        return `Stored model${prediction.modelName ? `: ${prediction.modelName}` : ''}`;
    }
    if (prediction.source === 'model') {
        return `Live model: ${prediction.modelName || 'sales history'}`;
    }
    return 'Baseline rule';
}

export default function Inventory() {
    const { role } = useAuth();
    const canEdit = canManageInventory(role);
    const canRequestOrders = canCreatePurchaseOrders(role);
    const canImportProducts = role === 'admin';
    const productImportInputRef = useRef(null);

    const [products, setProducts] = useState([]);
    const [productIndex, setProductIndex] = useState([]);
    const [catalogCount, setCatalogCount] = useState(0);
    const [categories, setCategories] = useState([]);
    const [categoryDrafts, setCategoryDrafts] = useState({});
    const [activeTab, setActiveTab] = useState('catalog');
    const [search, setSearch] = useState('');
    const [category, setCategory] = useState('All');
    const [productStatus, setProductStatus] = useState('active');
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(50);
    const [loading, setLoading] = useState(true);
    const [showAdd, setShowAdd] = useState(false);
    const [showEdit, setShowEdit] = useState(false);
    const [showCategoryManagement, setShowCategoryManagement] = useState(false);
    const [showProductImport, setShowProductImport] = useState(false);
    const [saving, setSaving] = useState(false);
    const [deletingProductId, setDeletingProductId] = useState(null);
    const [archivingProductId, setArchivingProductId] = useState(null);
    const [editProduct, setEditProduct] = useState(EMPTY_EDIT_PRODUCT);
    const [detailProduct, setDetailProduct] = useState(null);
    const [detailData, setDetailData] = useState(null);
    const [loadingDetail, setLoadingDetail] = useState(false);
    const [savingCategory, setSavingCategory] = useState(false);
    const [newCategoryName, setNewCategoryName] = useState('');
    const [importingProducts, setImportingProducts] = useState(false);
    const [productImportFileName, setProductImportFileName] = useState('');
    const [productImportCsvText, setProductImportCsvText] = useState('');
    const [productImportMode, setProductImportMode] = useState('create_update');
    const [productImportPreview, setProductImportPreview] = useState(null);
    const [showForecastModal, setShowForecastModal] = useState(false);
    const [forecastResults, setForecastResults] = useState(null);
    const [forecastSignals, setForecastSignals] = useState(new Map());
    const [pendingOrderProductIds, setPendingOrderProductIds] = useState(new Set());
    const [selectedOrders, setSelectedOrders] = useState({});
    const [runningForecast, setRunningForecast] = useState(false);
    const [placingOrders, setPlacingOrders] = useState(false);
    const [newProduct, setNewProduct] = useState({
        name: '',
        sku: '',
        category: 'Fasteners',
        current_stock: 0,
        reorder_point: 10,
        reorder_quantity: 50,
        unit_price: '',
        supplier_name: '',
    });

    const load = useCallback(async () => {
        setLoading(true);
        const forecastDate = todayIsoDate();

        let productQuery = supabase
            .from('products')
            .select('*', { count: 'exact' })
            .order('name');

        if (activeTab === 'catalog') {
            const trimmedSearch = search.trim();
            if (trimmedSearch) {
                const escaped = trimmedSearch.replace(/[%_]/g, '\\$&');
                productQuery = productQuery.or(`name.ilike.%${escaped}%,sku.ilike.%${escaped}%`);
            }

            if (category !== 'All') {
                productQuery = productQuery.eq('category', category);
            }

            if (productStatus !== 'all') {
                productQuery = productQuery.eq('active', productStatus === 'active');
            }

            productQuery = productQuery.range((page - 1) * pageSize, (page * pageSize) - 1);
        } else {
            productQuery = productQuery.eq('active', true);
        }

        const [
            { data: productRows, error: productError, count: productCount },
            { data: forecastRows },
            { data: pendingOrders },
            { data: categoryRows },
            { data: productIndexRows },
        ] = await Promise.all([
            productQuery,
            supabase
                .from('demand_forecasts')
                .select('*')
                .eq('forecast_date', forecastDate)
                .order('generated_at', { ascending: false }),
            supabase
                .from('purchase_orders')
                .select('product_id')
                .eq('status', 'pending'),
            supabase
                .from('categories')
                .select('*')
                .order('name'),
            supabase
                .from('products')
                .select('id, sku')
                .order('sku'),
        ]);

        if (productError) {
            toast.error('Failed to load products');
        } else {
            const latestForecasts = new Map();
            for (const forecast of forecastRows || []) {
                if (!latestForecasts.has(forecast.product_id)) {
                    latestForecasts.set(forecast.product_id, forecast);
                }
            }

            const nextSignals = new Map();
            for (const product of productRows || []) {
                const forecast = latestForecasts.get(product.id);
                if (forecast) {
                    nextSignals.set(product.id, buildForecastPrediction(product, forecast));
                }
            }

            setProducts(productRows || []);
            setProductIndex(productIndexRows || []);
            setCatalogCount(productCount ?? (productRows || []).length);
            setForecastSignals(nextSignals);
            setPendingOrderProductIds(new Set((pendingOrders || []).map((order) => order.product_id)));
            const nextCategories = categoryRows?.length
                ? categoryRows
                : DEFAULT_CATEGORIES.map((name) => ({ id: name, name, active: true }));
            setCategories(nextCategories);
            setCategoryDrafts(Object.fromEntries(nextCategories.map((row) => [row.id, row.name])));
        }
        setLoading(false);
    }, [activeTab, category, page, pageSize, productStatus, search]);

    useEffect(() => {
        load();
    }, [load]);

    useEffect(() => {
        setPage(1);
    }, [search, category, productStatus, pageSize]);

    const activeCategories = categories.filter((row) => row.active);
    const categoryNames = activeCategories.length ? activeCategories.map((row) => row.name) : DEFAULT_CATEGORIES;
    const filterCategories = ['All', ...Array.from(new Set(categoryNames))];
    const productCategoryOptions = Array.from(new Set([...categoryNames, newProduct.category, editProduct.category].filter(Boolean)));

    const totalPages = Math.max(1, Math.ceil(catalogCount / pageSize));
    const safePage = Math.min(page, totalPages);

    const forecastOrderRows = useMemo(() => {
        return products
            .map((product) => {
                const prediction = forecastSignals.get(product.id);
                if (!prediction || !prediction.shouldReorder) return null;

                return {
                    product,
                    prediction,
                    pending: pendingOrderProductIds.has(product.id),
                    projectedStockAfter7Days: Math.max(product.current_stock - prediction.expectedSalesNext7Days, 0),
                    recommendedQuantity: Math.max(1, Math.round(prediction.suggestedQuantity || product.reorder_quantity || 1)),
                };
            })
            .filter(Boolean)
            .sort((a, b) => {
                const riskDiff = riskRank(a.prediction.riskLevel) - riskRank(b.prediction.riskLevel);
                if (riskDiff !== 0) return riskDiff;

                const aDays = a.prediction.daysUntilStockout ?? Number.MAX_SAFE_INTEGER;
                const bDays = b.prediction.daysUntilStockout ?? Number.MAX_SAFE_INTEGER;
                if (aDays !== bDays) return aDays - bDays;

                return b.prediction.expectedSalesNext7Days - a.prediction.expectedSalesNext7Days;
            });
    }, [forecastSignals, pendingOrderProductIds, products]);

    const selectedForecastRows = forecastOrderRows.filter((row) => selectedOrders[row.product.id]?.selected && !row.pending);
    const selectedForecastCount = selectedForecastRows.length;

    function getProductImportAction(exists, mode) {
        if (mode === 'create_only') return exists ? 'Skip' : 'Create';
        if (mode === 'update_details' || mode === 'update_baseline') return exists ? 'Update' : 'Skip';
        return exists ? 'Update' : 'Create';
    }

    function buildProductImportPreview(text, mode = productImportMode) {
        const csvRows = parseCsv(text);
        if (csvRows.length < 2) {
            throw new Error('The file must include a header row and at least one product row.');
        }

        const headers = csvRows[0].map(normalizeHeader);
        const skuIndex = headers.indexOf('sku');
        const nameIndex = headers.indexOf('name');
        const categoryIndex = headers.indexOf('category');
        const stockIndex = headers.indexOf('current_stock');
        const safetyStockIndex = headers.findIndex((header) => ['safety_stock', 'reorder_point'].includes(header));
        const orderQtyIndex = headers.findIndex((header) => ['suggested_order_qty', 'suggested_order_quantity', 'reorder_quantity'].includes(header));
        const unitPriceIndex = headers.indexOf('unit_price');
        const supplierIndex = headers.indexOf('supplier_name');

        if (skuIndex < 0) {
            throw new Error('The file must include a sku column.');
        }

        if (nameIndex < 0 && !['update_baseline'].includes(mode)) {
            throw new Error('The file must include a name column for this import mode.');
        }

        if (stockIndex < 0 && mode !== 'update_details') {
            throw new Error('The file must include a current_stock column for this import mode.');
        }

        const existingBySku = new Map(productIndex.map((product) => [product.sku.toLowerCase(), product]));
        const seenSkus = new Set();
        const rows = csvRows.slice(1).map((cells, offset) => {
            const rowNumber = offset + 2;
            const sku = getCell(cells, skuIndex);
            const normalizedSku = sku.toLowerCase();
            const name = getCell(cells, nameIndex);
            const category = getCell(cells, categoryIndex) || 'Uncategorized';
            const currentStock = parseNumber(getCell(cells, stockIndex));
            const safetyStock = parseNumber(getCell(cells, safetyStockIndex));
            const suggestedOrderQty = parseNumber(getCell(cells, orderQtyIndex));
            const unitPrice = parseNumber(getCell(cells, unitPriceIndex));
            const supplierName = getCell(cells, supplierIndex);
            const errors = [];
            const exists = existingBySku.has(normalizedSku);
            const action = getProductImportAction(exists, mode);
            const skipped = action === 'Skip';

            if (!sku) errors.push('Missing SKU');
            if (!skipped && mode !== 'update_baseline' && !name) errors.push('Missing name');
            if (sku && seenSkus.has(normalizedSku)) errors.push('Duplicate SKU in file');
            if (!skipped && mode !== 'update_details' && (currentStock == null || !Number.isInteger(currentStock) || currentStock < 0)) {
                errors.push('Invalid current stock');
            }
            if (safetyStock != null && (!Number.isInteger(safetyStock) || safetyStock < 0)) errors.push('Invalid safety stock');
            if (suggestedOrderQty != null && (!Number.isInteger(suggestedOrderQty) || suggestedOrderQty <= 0)) errors.push('Invalid suggested order qty');
            if (unitPrice != null && unitPrice < 0) errors.push('Invalid unit price');

            if (sku) seenSkus.add(normalizedSku);

            return {
                rowNumber,
                sku,
                name,
                category,
                current_stock: currentStock,
                reorder_point: safetyStock ?? 10,
                reorder_quantity: suggestedOrderQty ?? 50,
                unit_price: unitPrice ?? 0,
                supplier_name: supplierName || null,
                action,
                status: errors.length ? errors.join(', ') : skipped ? 'Skipped by mode' : 'Ready',
                valid: errors.length === 0,
                importable: errors.length === 0 && !skipped,
            };
        });

        return {
            rowCount: rows.length,
            rows,
            errors: rows.filter((row) => !row.valid).length,
            readyRows: rows.filter((row) => row.importable),
        };
    }

    async function handleAddProduct(event) {
        event.preventDefault();
        setSaving(true);
        const { error } = await supabase.from('products').insert([newProduct]);

        if (error) {
            toast.error(`Failed to add product: ${error.message}`);
        } else {
            toast.success('Product added');
            setShowAdd(false);
            setNewProduct({
                name: '',
                sku: '',
                category: 'Fasteners',
                current_stock: 0,
                reorder_point: 10,
                reorder_quantity: 50,
                unit_price: '',
                supplier_name: '',
            });
            await load();
        }
        setSaving(false);
    }

    function openEditProduct(product) {
        setEditProduct({
            id: product.id,
            name: product.name,
            sku: product.sku,
            category: product.category || 'Uncategorized',
            reorder_point: product.reorder_point ?? 10,
            reorder_quantity: product.reorder_quantity ?? 50,
            unit_price: product.unit_price ?? '',
            supplier_name: product.supplier_name || '',
        });
        setShowEdit(true);
    }

    async function handleEditProduct(event) {
        event.preventDefault();
        setSaving(true);
        const { error } = await supabase.rpc('update_product_master', {
            p_product_id: editProduct.id,
            p_name: editProduct.name,
            p_category: editProduct.category,
            p_reorder_point: Number(editProduct.reorder_point),
            p_reorder_quantity: Number(editProduct.reorder_quantity),
            p_unit_price: Number(editProduct.unit_price || 0),
            p_supplier_name: editProduct.supplier_name || null,
        });

        if (error) {
            toast.error(`Failed to update product: ${error.message}`);
        } else {
            toast.success('Product updated');
            setShowEdit(false);
            setEditProduct(EMPTY_EDIT_PRODUCT);
            await load();
        }
        setSaving(false);
    }

    async function handleArchiveProduct(product) {
        const nextActive = product.active === false;
        const confirmed = window.confirm(`${nextActive ? 'Restore' : 'Archive'} ${product.name}?`);
        if (!confirmed) return;

        setArchivingProductId(product.id);
        const { error } = await supabase.rpc('archive_product', {
            p_product_id: product.id,
            p_active: nextActive,
        });

        if (error) {
            toast.error(`Failed to ${nextActive ? 'restore' : 'archive'} product: ${error.message}`);
        } else {
            toast.success(nextActive ? 'Product restored' : 'Product archived');
            await load();
        }
        setArchivingProductId(null);
    }

    async function handleDeleteProduct(product) {
        const confirmed = window.confirm(`Delete ${product.name}? Products with sales history cannot be deleted.`);
        if (!confirmed) return;

        setDeletingProductId(product.id);
        const { error } = await supabase.rpc('delete_product', {
            p_product_id: product.id,
        });

        if (error) {
            toast.error(`Failed to delete product: ${error.message}`);
        } else {
            toast.success('Product deleted');
            await load();
        }
        setDeletingProductId(null);
    }

    async function openProductDetail(product) {
        setDetailProduct(product);
        setDetailData(null);
        setLoadingDetail(true);

        const [
            { data: movements, error: movementError },
            { data: sales, error: salesError },
            { data: orders, error: orderError },
            { data: forecasts, error: forecastError },
        ] = await Promise.all([
            supabase
                .from('stock_movements')
                .select('*')
                .eq('product_id', product.id)
                .order('created_at', { ascending: false })
                .limit(10),
            supabase
                .from('sale_items')
                .select('quantity, unit_price, line_total, sales(receipt_number, created_at)')
                .eq('product_id', product.id)
                .order('id', { ascending: false })
                .limit(10),
            supabase
                .from('purchase_orders')
                .select('*')
                .eq('product_id', product.id)
                .order('created_at', { ascending: false })
                .limit(10),
            supabase
                .from('demand_forecasts')
                .select('*')
                .eq('product_id', product.id)
                .order('generated_at', { ascending: false })
                .limit(5),
        ]);

        if (movementError || salesError || orderError || forecastError) {
            toast.error('Failed to load product details');
        } else {
            setDetailData({
                movements: movements || [],
                sales: sales || [],
                orders: orders || [],
                forecasts: forecasts || [],
            });
        }
        setLoadingDetail(false);
    }

    async function handleProductImportFileChange(event) {
        const file = event.target.files?.[0];
        setProductImportPreview(null);
        setProductImportFileName('');
        setProductImportCsvText('');

        if (!file) return;

        if (!file.name.toLowerCase().endsWith('.csv')) {
            toast.error('Upload a CSV file');
            event.target.value = '';
            return;
        }

        try {
            const text = await file.text();
            setProductImportCsvText(text);
            setProductImportPreview(buildProductImportPreview(text, productImportMode));
            setProductImportFileName(file.name);
        } catch (error) {
            toast.error(error.message);
            event.target.value = '';
        }
    }

    function handleProductImportModeChange(event) {
        const nextMode = event.target.value;
        setProductImportMode(nextMode);
        if (!productImportCsvText) return;

        try {
            setProductImportPreview(buildProductImportPreview(productImportCsvText, nextMode));
        } catch (error) {
            setProductImportPreview(null);
            toast.error(error.message);
        }
    }

    function handleExportProductImportIssues() {
        const issueRows = (productImportPreview?.rows || []).filter((row) => !row.valid);
        if (issueRows.length === 0) {
            toast.error('There are no import issues to export');
            return;
        }

        const headers = [
            'rowNumber',
            'sku',
            'name',
            'category',
            'current_stock',
            'reorder_point',
            'reorder_quantity',
            'unit_price',
            'supplier_name',
            'action',
            'status',
        ];
        const csv = toCsv(issueRows, headers);
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = 'product-import-issues.csv';
        link.click();
        URL.revokeObjectURL(url);
    }

    async function handleImportProducts() {
        const readyRows = productImportPreview?.readyRows || [];
        if (readyRows.length === 0 || productImportPreview?.errors > 0) {
            toast.error('Fix product import issues before importing');
            return;
        }

        setImportingProducts(true);
        const { data, error } = await supabase.rpc('import_product_master', {
            p_mode: productImportMode,
            p_items: readyRows.map((row) => ({
                sku: row.sku,
                name: row.name,
                category: row.category,
                current_stock: row.current_stock,
                reorder_point: row.reorder_point,
                reorder_quantity: row.reorder_quantity,
                unit_price: row.unit_price,
                supplier_name: row.supplier_name,
            })),
        });

        if (error) {
            toast.error(`Product import failed: ${error.message}`);
        } else {
            toast.success(`Products: ${data.created || 0} created, ${data.updated || 0} updated, ${data.skipped || 0} skipped`);
            setShowProductImport(false);
            setProductImportPreview(null);
            setProductImportFileName('');
            setProductImportCsvText('');
            if (productImportInputRef.current) productImportInputRef.current.value = '';
            await load();
        }
        setImportingProducts(false);
    }

    async function handleAddCategory(event) {
        event.preventDefault();
        const name = newCategoryName.trim();
        if (!name) {
            toast.error('Enter a category name');
            return;
        }

        setSavingCategory(true);
        const { error } = await supabase.from('categories').insert([{ name, active: true }]);

        if (error) {
            toast.error(`Failed to add category: ${error.message}`);
        } else {
            toast.success('Category added');
            setNewCategoryName('');
            await load();
        }
        setSavingCategory(false);
    }

    async function handleSaveCategory(categoryRow) {
        const nextName = String(categoryDrafts[categoryRow.id] || '').trim();
        if (!nextName) {
            toast.error('Category name cannot be empty');
            return;
        }

        setSavingCategory(true);
        const { error } = await supabase.rpc('rename_category', {
            p_category_id: categoryRow.id,
            p_name: nextName,
        });

        if (error) {
            toast.error(`Failed to update category: ${error.message}`);
            setSavingCategory(false);
            return;
        }

        toast.success('Category updated');
        await load();
        setSavingCategory(false);
    }

    async function handleToggleCategory(categoryRow) {
        setSavingCategory(true);
        const { error } = await supabase
            .from('categories')
            .update({ active: !categoryRow.active })
            .eq('id', categoryRow.id);

        if (error) {
            toast.error(`Failed to update category: ${error.message}`);
        } else {
            toast.success(categoryRow.active ? 'Category deactivated' : 'Category activated');
            await load();
        }
        setSavingCategory(false);
    }

    async function handleRunForecast() {
        setRunningForecast(true);
        try {
            const { data: result, error: generateError } = await supabase.functions.invoke('generate-forecasts');
            if (generateError) {
                throw new Error(await getFunctionErrorMessage(generateError));
            }

            const forecastDate = result?.forecast_date || todayIsoDate();
            const [{ data: productsData, error: productError }, { data: forecastRows, error: forecastError }] = await Promise.all([
                supabase.from('products').select('*').eq('active', true).order('name'),
                supabase
                    .from('demand_forecasts')
                    .select('*')
                    .eq('forecast_date', forecastDate)
                    .order('generated_at', { ascending: false }),
            ]);

            if (productError) throw productError;
            if (forecastError) throw forecastError;

            const latestForecasts = new Map();
            for (const forecast of forecastRows || []) {
                if (!latestForecasts.has(forecast.product_id)) {
                    latestForecasts.set(forecast.product_id, forecast);
                }
            }

            const results = (productsData || [])
                .map((product) => {
                    const forecast = latestForecasts.get(product.id);
                    return forecast
                        ? { product, prediction: buildForecastPrediction(product, forecast) }
                        : null;
                })
                .filter(Boolean)
                .sort((a, b) => {
                const riskDiff = riskRank(a.prediction.riskLevel) - riskRank(b.prediction.riskLevel);
                if (riskDiff !== 0) return riskDiff;
                const aDays = a.prediction.daysUntilStockout ?? Number.MAX_SAFE_INTEGER;
                const bDays = b.prediction.daysUntilStockout ?? Number.MAX_SAFE_INTEGER;
                return aDays - bDays;
            });

            const nextSignals = new Map(forecastSignals);
            for (const result of results) {
                nextSignals.set(result.product.id, result.prediction);
            }

            setForecastResults(results);
            setForecastSignals(nextSignals);
            setShowForecastModal(true);
            toast.success(`Generated ${result?.generated || results.length} forecasts for ${forecastDate}`);
        } catch (error) {
            toast.error(`Forecast analysis failed: ${error.message}`);
        }
        setRunningForecast(false);
    }

    function handleToggleForecastOrder(row, checked) {
        setSelectedOrders((current) => ({
            ...current,
            [row.product.id]: {
                selected: checked,
                quantity: current[row.product.id]?.quantity || row.recommendedQuantity,
            },
        }));
    }

    function handleForecastQuantityChange(productId, quantity) {
        setSelectedOrders((current) => ({
            ...current,
            [productId]: {
                selected: current[productId]?.selected ?? true,
                quantity,
            },
        }));
    }

    async function handlePlaceForecastOrders() {
        const orders = selectedForecastRows.map((row) => ({
            row,
            quantity: Number(selectedOrders[row.product.id]?.quantity || row.recommendedQuantity),
        }));

        const invalid = orders.find((order) => !Number.isInteger(order.quantity) || order.quantity <= 0);
        if (invalid) {
            toast.error('Enter a valid quantity for each selected product');
            return;
        }

        if (orders.length === 0) {
            toast.error('Select at least one product');
            return;
        }

        setPlacingOrders(true);
        const { data, error } = await supabase.rpc('place_forecast_purchase_orders', {
            p_items: orders.map(({ row, quantity }) => ({
                product_id: row.product.id,
                quantity,
                predicted_days_until_stockout: row.prediction.daysUntilStockout,
                notes: `${predictionSourceLabel(row.prediction)} forecast request. Risk: ${row.prediction.riskLevel}. Expected 7-day sales: ${row.prediction.expectedSalesNext7Days} units. Avg daily demand: ${row.prediction.avgDailyConsumption} units/day.`,
            })),
        });

        if (error) {
            toast.error(`Failed to place order request: ${error.message}`);
        } else {
            toast.success(`Placed ${data.created || 0} request${data.created === 1 ? '' : 's'}${data.skipped ? `, skipped ${data.skipped} pending` : ''}`);
            setSelectedOrders({});
            await load();
        }
        setPlacingOrders(false);
    }

    return (
        <Layout title="Inventory">
            <div className="flex flex-col gap-4 mb-6">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div className="flex gap-1 bg-white border border-gray-200 rounded-lg p-1 w-fit">
                        <button
                            className={`text-sm px-3 py-1.5 rounded-md font-medium ${activeTab === 'catalog' ? 'bg-accent text-white' : 'text-gray-600 hover:bg-gray-100'}`}
                            onClick={() => setActiveTab('catalog')}
                        >
                            Catalog
                        </button>
                        {canEdit && (
                            <button
                                className={`text-sm px-3 py-1.5 rounded-md font-medium ${activeTab === 'forecast' ? 'bg-accent text-white' : 'text-gray-600 hover:bg-gray-100'}`}
                                onClick={() => setActiveTab('forecast')}
                            >
                                Forecast Orders
                            </button>
                        )}
                    </div>
                    <div className="flex gap-2 flex-shrink-0">
                        {activeTab === 'catalog' && canImportProducts && (
                            <button onClick={() => setShowCategoryManagement(true)} className="btn-secondary flex items-center gap-2">
                                Manage Categories
                            </button>
                        )}
                        {activeTab === 'catalog' && canImportProducts && (
                            <button onClick={() => setShowProductImport(true)} className="btn-secondary flex items-center gap-2">
                                <DocumentArrowUpIcon className="w-4 h-4" />
                                Import Products
                            </button>
                        )}
                        {activeTab === 'catalog' && canEdit && (
                            <button
                                onClick={() => {
                                    setNewProduct((current) => ({
                                        ...current,
                                        category: productCategoryOptions.includes(current.category)
                                            ? current.category
                                            : productCategoryOptions[0] || 'Uncategorized',
                                    }));
                                    setShowAdd(true);
                                }}
                                className="btn-primary flex items-center gap-2"
                            >
                                <PlusIcon className="w-4 h-4" />
                                Add Product
                            </button>
                        )}
                        {activeTab === 'forecast' && canRequestOrders && (
                            <button
                                onClick={handlePlaceForecastOrders}
                                disabled={placingOrders || selectedForecastCount === 0}
                                className="btn-primary flex items-center gap-2"
                            >
                                <ShoppingCartIcon className="w-4 h-4" />
                                {placingOrders ? 'Placing...' : selectedForecastCount ? `Place ${selectedForecastCount} Request${selectedForecastCount === 1 ? '' : 's'}` : 'Place Requests'}
                            </button>
                        )}
                    </div>
                </div>

                {activeTab === 'catalog' && (
                    <div className="flex gap-3 flex-1 flex-wrap">
                        <div className="relative flex-1 min-w-48">
                            <MagnifyingGlassIcon className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                            <input
                                className="input-field pl-9"
                                placeholder="Search products or SKU..."
                                value={search}
                                onChange={(event) => setSearch(event.target.value)}
                            />
                        </div>
                        <select
                            className="input-field w-auto"
                            value={category}
                            onChange={(event) => setCategory(event.target.value)}
                        >
                            {filterCategories.map((categoryOption) => <option key={categoryOption}>{categoryOption}</option>)}
                        </select>
                        <select
                            className="input-field w-auto"
                            value={productStatus}
                            onChange={(event) => setProductStatus(event.target.value)}
                        >
                            <option value="active">Active</option>
                            <option value="archived">Archived</option>
                            <option value="all">All Statuses</option>
                        </select>
                    </div>
                )}

                {activeTab === 'forecast' && canEdit && (
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                        <div>
                            <p className="text-sm font-semibold text-gray-800">{forecastOrderRows.length} forecast reorder candidate{forecastOrderRows.length === 1 ? '' : 's'}</p>
                            <p className="text-xs text-gray-500">Critical products are ranked first. Products with pending orders are locked.</p>
                        </div>
                        <button
                            onClick={handleRunForecast}
                            disabled={runningForecast}
                            className="btn-secondary flex items-center gap-2"
                        >
                            {runningForecast ? <div className="spinner !w-4 !h-4" /> : <CpuChipIcon className="w-4 h-4" />}
                            Review Forecast
                        </button>
                    </div>
                )}
            </div>

            {activeTab === 'forecast' && canEdit ? (
                <div className="card p-0 overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead className="bg-gray-50 border-b border-gray-100">
                                <tr>
                                    <th className="table-header">Select</th>
                                    <th className="table-header">Product</th>
                                    <th className="table-header">Stock</th>
                                    <th className="table-header">Next 7 Days</th>
                                    <th className="table-header">Days Left</th>
                                    <th className="table-header">Risk</th>
                                    <th className="table-header">Request Qty</th>
                                    <th className="table-header">Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                {loading ? (
                                    <tr><td colSpan={8} className="text-center py-12"><div className="spinner mx-auto" /></td></tr>
                                ) : forecastOrderRows.length === 0 ? (
                                    <tr>
                                        <td colSpan={8} className="text-center py-12 text-gray-400">
                                            <CpuChipIcon className="w-10 h-10 mx-auto mb-2 opacity-30" />
                                            <p className="text-sm">No forecast reorder candidates.</p>
                                        </td>
                                    </tr>
                                ) : forecastOrderRows.map((row) => {
                                    const selection = selectedOrders[row.product.id];
                                    const selected = Boolean(selection?.selected);
                                    const requestQty = selection?.quantity ?? row.recommendedQuantity;
                                    const disabled = row.pending || !canRequestOrders;

                                    return (
                                        <tr key={row.product.id} className="table-row">
                                            <td className="table-cell">
                                                <input
                                                    type="checkbox"
                                                    className="w-4 h-4 accent-amber-500"
                                                    checked={selected}
                                                    disabled={disabled}
                                                    onChange={(event) => handleToggleForecastOrder(row, event.target.checked)}
                                                />
                                            </td>
                                            <td className="table-cell">
                                                <p className="font-medium text-gray-800">{row.product.name}</p>
                                                <p className="text-xs text-gray-400 font-mono">{row.product.sku}</p>
                                            </td>
                                            <td className="table-cell font-semibold">{row.product.current_stock}</td>
                                            <td className="table-cell">
                                                <p className="font-bold text-gray-800">{formatUnits(row.prediction.expectedSalesNext7Days)} units</p>
                                                <p className="text-[11px] text-gray-400">after 7d: {formatUnits(row.projectedStockAfter7Days)}</p>
                                            </td>
                                            <td className="table-cell font-semibold">
                                                {row.prediction.daysUntilStockout != null ? `${row.prediction.daysUntilStockout} days` : '-'}
                                            </td>
                                            <td className="table-cell">
                                                <span className={row.prediction.riskLevel === 'critical' ? 'badge-critical' : 'badge-low'}>
                                                    {row.prediction.riskLevel === 'critical' ? 'Critical' : 'At Risk'}
                                                </span>
                                                <p className="text-[11px] text-gray-400 mt-1">
                                                    {predictionSourceLabel(row.prediction)}
                                                    {row.prediction.isStale ? ' | Stale' : ''}
                                                </p>
                                            </td>
                                            <td className="table-cell">
                                                <input
                                                    type="number"
                                                    min="1"
                                                    className="input-field w-24 py-1 text-sm"
                                                    value={requestQty}
                                                    disabled={disabled}
                                                    onChange={(event) => handleForecastQuantityChange(row.product.id, Number(event.target.value))}
                                                />
                                            </td>
                                            <td className="table-cell">
                                                {row.pending ? (
                                                    <span className="badge-pending">Pending order</span>
                                                ) : canRequestOrders ? (
                                                    <span className="badge-ok">Ready</span>
                                                ) : (
                                                    <span className="badge-pending">View only</span>
                                                )}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            ) : (
            <div className="card p-0 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead className="bg-gray-50 border-b border-gray-100">
                            <tr>
                                <th className="table-header">Product</th>
                                <th className="table-header">SKU</th>
                                <th className="table-header">Category</th>
                                <th className="table-header">Stock</th>
                                <th className="table-header">Next 7 Days</th>
                                <th className="table-header">Forecast Risk</th>
                                <th className="table-header">Safety Stock</th>
                                <th className="table-header">Unit Price</th>
                                <th className="table-header">Supplier</th>
                                <th className="table-header">Status</th>
                                {canEdit && <th className="table-header">Actions</th>}
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr><td colSpan={canEdit ? 11 : 10} className="text-center py-12"><div className="spinner mx-auto" /></td></tr>
                            ) : products.length === 0 ? (
                                <tr>
                                    <td colSpan={canEdit ? 11 : 10} className="text-center py-12 text-gray-400">
                                        <MagnifyingGlassIcon className="w-10 h-10 mx-auto mb-2 opacity-30" />
                                        <p className="text-sm">No products found.</p>
                                    </td>
                                </tr>
                            ) : products.map((product) => {
                                const stockStatus = getStockStatus(product);
                                const prediction = forecastSignals.get(product.id);
                                return (
                                    <tr key={product.id} className={`table-row ${product.active === false ? 'bg-gray-50/60' : ''}`}>
                                        <td className="table-cell">
                                            <button
                                                type="button"
                                                onClick={() => openProductDetail(product)}
                                                className="font-medium text-gray-800 hover:text-accent text-left"
                                            >
                                                {product.name}
                                            </button>
                                            {product.active === false && (
                                                <p className="text-[11px] text-gray-400 mt-1">Archived</p>
                                            )}
                                        </td>
                                        <td className="table-cell font-mono text-xs text-gray-500">{product.sku}</td>
                                        <td className="table-cell text-gray-600">{product.category}</td>
                                        <td className="table-cell">
                                            <span
                                                className={`font-bold ${
                                                    stockStatus === 'critical'
                                                        ? 'text-red-600'
                                                        : stockStatus === 'low'
                                                            ? 'text-yellow-600'
                                                            : 'text-gray-800'
                                                }`}
                                            >
                                                {product.current_stock}
                                            </span>
                                        </td>
                                        <td className="table-cell">
                                            {prediction ? (
                                                <div>
                                                    <p className="font-bold text-gray-800">
                                                        {formatUnits(prediction.expectedSalesNext7Days)} units
                                                    </p>
                                                    <p className="text-[11px] text-gray-400">
                                                        after 7d: {formatUnits(Math.max(product.current_stock - prediction.expectedSalesNext7Days, 0))}
                                                    </p>
                                                </div>
                                            ) : '-'}
                                        </td>
                                        <td className="table-cell">
                                            {prediction ? (
                                                <div>
                                                    <span className={prediction.riskLevel === 'critical' ? 'badge-critical' : prediction.riskLevel === 'at_risk' ? 'badge-low' : 'badge-ok'}>
                                                        {prediction.riskLevel === 'critical' ? 'Critical' : prediction.riskLevel === 'at_risk' ? 'At Risk' : 'OK'}
                                                    </span>
                                                    <p className="text-[11px] text-gray-400 mt-1">
                                                        {prediction.source === 'forecast' ? 'Model' : 'Sales history'}
                                                        {prediction.daysUntilStockout != null ? ` | ${prediction.daysUntilStockout} days` : ''}
                                                        {prediction.isStale ? ' | Stale' : ''}
                                                    </p>
                                                </div>
                                            ) : '-'}
                                        </td>
                                        <td className="table-cell text-gray-600">{product.reorder_point}</td>
                                        <td className="table-cell">Rs {parseFloat(product.unit_price || 0).toFixed(2)}</td>
                                        <td className="table-cell text-gray-600 text-xs">{product.supplier_name}</td>
                                        <td className="table-cell">{STATUS_BADGE[stockStatus]}</td>
                                        {canEdit && (
                                            <td className="table-cell">
                                                <div className="flex items-center gap-1">
                                                    <button
                                                        type="button"
                                                        title="View details"
                                                        onClick={() => openProductDetail(product)}
                                                        className="p-2 rounded-lg text-gray-500 hover:bg-gray-100"
                                                    >
                                                        <EyeIcon className="w-4 h-4" />
                                                    </button>
                                                    <button
                                                        type="button"
                                                        title="Edit product"
                                                        onClick={() => openEditProduct(product)}
                                                        className="p-2 rounded-lg text-blue-600 hover:bg-blue-50"
                                                    >
                                                        <PencilSquareIcon className="w-4 h-4" />
                                                    </button>
                                                    <button
                                                        type="button"
                                                        title={product.active === false ? 'Restore product' : 'Archive product'}
                                                        disabled={archivingProductId === product.id}
                                                        onClick={() => handleArchiveProduct(product)}
                                                        className="p-2 rounded-lg text-gray-600 hover:bg-gray-100 disabled:opacity-50"
                                                    >
                                                        {archivingProductId === product.id ? (
                                                            <div className="spinner !w-4 !h-4" />
                                                        ) : (
                                                            <ArchiveBoxIcon className="w-4 h-4" />
                                                        )}
                                                    </button>
                                                    <button
                                                        type="button"
                                                        title="Delete product"
                                                        disabled={deletingProductId === product.id}
                                                        onClick={() => handleDeleteProduct(product)}
                                                        className="p-2 rounded-lg text-red-600 hover:bg-red-50 disabled:opacity-50"
                                                    >
                                                        {deletingProductId === product.id ? (
                                                            <div className="spinner !w-4 !h-4" />
                                                        ) : (
                                                            <TrashIcon className="w-4 h-4" />
                                                        )}
                                                    </button>
                                                </div>
                                            </td>
                                        )}
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
                {!loading && (
                    <div className="px-4 py-3 border-t border-gray-50 flex items-center justify-between gap-3 flex-wrap text-xs text-gray-500">
                        <span>
                            Showing {catalogCount === 0 ? 0 : ((safePage - 1) * pageSize) + 1}-{Math.min(safePage * pageSize, catalogCount)} of {catalogCount} products
                        </span>
                        <div className="flex items-center gap-2">
                            <select
                                className="input-field py-1 text-xs w-auto"
                                value={pageSize}
                                onChange={(event) => setPageSize(Number(event.target.value))}
                            >
                                {PAGE_SIZE_OPTIONS.map((option) => (
                                    <option key={option} value={option}>{option} / page</option>
                                ))}
                            </select>
                            <button
                                type="button"
                                className="btn-secondary py-1.5 px-3 text-xs"
                                disabled={safePage <= 1}
                                onClick={() => setPage((current) => Math.max(1, current - 1))}
                            >
                                Previous
                            </button>
                            <span>Page {safePage} of {totalPages}</span>
                            <button
                                type="button"
                                className="btn-secondary py-1.5 px-3 text-xs"
                                disabled={safePage >= totalPages}
                                onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
                            >
                                Next
                            </button>
                        </div>
                    </div>
                )}
            </div>
            )}

            <Dialog open={showAdd} onClose={() => setShowAdd(false)} className="relative z-50">
                <div className="fixed inset-0 bg-black/40" aria-hidden="true" />
                <div className="fixed inset-0 flex items-center justify-center p-4">
                    <Dialog.Panel className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6">
                        <Dialog.Title className="text-lg font-bold text-gray-800 mb-4">Add New Product</Dialog.Title>
                        <form onSubmit={handleAddProduct} className="space-y-3">
                            <div className="grid grid-cols-2 gap-3">
                                <div className="col-span-2">
                                    <label className="block text-xs font-medium text-gray-600 mb-1">Product Name</label>
                                    <input
                                        className="input-field"
                                        required
                                        value={newProduct.name}
                                        onChange={(event) => setNewProduct({ ...newProduct, name: event.target.value })}
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-gray-600 mb-1">SKU</label>
                                    <input
                                        className="input-field"
                                        required
                                        value={newProduct.sku}
                                        onChange={(event) => setNewProduct({ ...newProduct, sku: event.target.value })}
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-gray-600 mb-1">Category</label>
                                    <select
                                        className="input-field"
                                        value={newProduct.category}
                                        onChange={(event) => setNewProduct({ ...newProduct, category: event.target.value })}
                                    >
                                        {productCategoryOptions.map((categoryOption) => <option key={categoryOption}>{categoryOption}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-gray-600 mb-1">Current Stock</label>
                                    <input
                                        type="number"
                                        className="input-field"
                                        min="0"
                                        value={newProduct.current_stock}
                                        onChange={(event) => setNewProduct({ ...newProduct, current_stock: Number(event.target.value) })}
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-gray-600 mb-1">Safety Stock</label>
                                    <input
                                        type="number"
                                        className="input-field"
                                        min="0"
                                        value={newProduct.reorder_point}
                                        onChange={(event) => setNewProduct({ ...newProduct, reorder_point: Number(event.target.value) })}
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-gray-600 mb-1">Suggested Order Qty</label>
                                    <input
                                        type="number"
                                        className="input-field"
                                        min="1"
                                        value={newProduct.reorder_quantity}
                                        onChange={(event) => setNewProduct({ ...newProduct, reorder_quantity: Number(event.target.value) })}
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-gray-600 mb-1">Unit Price ($)</label>
                                    <input
                                        type="number"
                                        step="0.01"
                                        className="input-field"
                                        value={newProduct.unit_price}
                                        onChange={(event) => setNewProduct({ ...newProduct, unit_price: event.target.value })}
                                    />
                                </div>
                                <div className="col-span-2">
                                    <label className="block text-xs font-medium text-gray-600 mb-1">Supplier Name</label>
                                    <input
                                        className="input-field"
                                        value={newProduct.supplier_name}
                                        onChange={(event) => setNewProduct({ ...newProduct, supplier_name: event.target.value })}
                                    />
                                </div>
                            </div>
                            <div className="flex gap-3 pt-2">
                                <button type="button" onClick={() => setShowAdd(false)} className="btn-secondary flex-1">Cancel</button>
                                <button type="submit" disabled={saving} className="btn-primary flex-1">
                                    {saving ? 'Saving...' : 'Add Product'}
                                </button>
                            </div>
                        </form>
                    </Dialog.Panel>
                </div>
            </Dialog>

            <Dialog open={showEdit} onClose={() => setShowEdit(false)} className="relative z-50">
                <div className="fixed inset-0 bg-black/40" aria-hidden="true" />
                <div className="fixed inset-0 flex items-center justify-center p-4">
                    <Dialog.Panel className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6">
                        <Dialog.Title className="text-lg font-bold text-gray-800 mb-1">Edit Product</Dialog.Title>
                        <p className="text-xs text-gray-500 mb-4">SKU and current stock are controlled by setup and stock movement workflows.</p>
                        <form onSubmit={handleEditProduct} className="space-y-3">
                            <div className="grid grid-cols-2 gap-3">
                                <div className="col-span-2">
                                    <label className="block text-xs font-medium text-gray-600 mb-1">Product Name</label>
                                    <input
                                        className="input-field"
                                        required
                                        value={editProduct.name}
                                        onChange={(event) => setEditProduct({ ...editProduct, name: event.target.value })}
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-gray-600 mb-1">SKU</label>
                                    <input className="input-field bg-gray-50" value={editProduct.sku} disabled />
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-gray-600 mb-1">Category</label>
                                    <select
                                        className="input-field"
                                        value={editProduct.category}
                                        onChange={(event) => setEditProduct({ ...editProduct, category: event.target.value })}
                                    >
                                        {productCategoryOptions.map((categoryOption) => <option key={categoryOption}>{categoryOption}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-gray-600 mb-1">Safety Stock</label>
                                    <input
                                        type="number"
                                        className="input-field"
                                        min="0"
                                        value={editProduct.reorder_point}
                                        onChange={(event) => setEditProduct({ ...editProduct, reorder_point: Number(event.target.value) })}
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-gray-600 mb-1">Suggested Order Qty</label>
                                    <input
                                        type="number"
                                        className="input-field"
                                        min="1"
                                        value={editProduct.reorder_quantity}
                                        onChange={(event) => setEditProduct({ ...editProduct, reorder_quantity: Number(event.target.value) })}
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-gray-600 mb-1">Unit Price ($)</label>
                                    <input
                                        type="number"
                                        step="0.01"
                                        min="0"
                                        className="input-field"
                                        value={editProduct.unit_price}
                                        onChange={(event) => setEditProduct({ ...editProduct, unit_price: event.target.value })}
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-gray-600 mb-1">Supplier Name</label>
                                    <input
                                        className="input-field"
                                        value={editProduct.supplier_name}
                                        onChange={(event) => setEditProduct({ ...editProduct, supplier_name: event.target.value })}
                                    />
                                </div>
                            </div>
                            <div className="flex gap-3 pt-2">
                                <button type="button" onClick={() => setShowEdit(false)} className="btn-secondary flex-1">Cancel</button>
                                <button type="submit" disabled={saving} className="btn-primary flex-1">
                                    {saving ? 'Saving...' : 'Save Changes'}
                                </button>
                            </div>
                        </form>
                    </Dialog.Panel>
                </div>
            </Dialog>

            <Dialog open={showCategoryManagement} onClose={() => setShowCategoryManagement(false)} className="relative z-50">
                <div className="fixed inset-0 bg-black/40" aria-hidden="true" />
                <div className="fixed inset-0 flex items-center justify-center p-4">
                    <Dialog.Panel className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl p-6 max-h-[85vh] overflow-y-auto">
                        <Dialog.Title className="text-lg font-bold text-gray-800 mb-4">Manage Categories</Dialog.Title>

                        <form onSubmit={handleAddCategory} className="flex gap-3 mb-5">
                            <input
                                className="input-field flex-1"
                                placeholder="New category"
                                value={newCategoryName}
                                onChange={(event) => setNewCategoryName(event.target.value)}
                            />
                            <button type="submit" disabled={savingCategory} className="btn-primary flex items-center gap-2">
                                <PlusIcon className="w-4 h-4" />
                                Add
                            </button>
                        </form>

                        <div className="overflow-x-auto border border-gray-100 rounded-lg">
                            <table className="w-full">
                                <thead className="bg-gray-50">
                                    <tr>
                                        <th className="table-header">Category</th>
                                        <th className="table-header">Status</th>
                                        <th className="table-header">Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {categories.length === 0 ? (
                                        <tr>
                                            <td colSpan={3} className="text-center py-10 text-gray-400 text-sm">
                                                No categories found.
                                            </td>
                                        </tr>
                                    ) : categories.map((categoryRow) => (
                                        <tr key={categoryRow.id} className="table-row">
                                            <td className="table-cell">
                                                <input
                                                    className="input-field py-1 text-sm max-w-xs"
                                                    value={categoryDrafts[categoryRow.id] ?? categoryRow.name}
                                                    onChange={(event) => setCategoryDrafts((current) => ({
                                                        ...current,
                                                        [categoryRow.id]: event.target.value,
                                                    }))}
                                                />
                                            </td>
                                            <td className="table-cell">
                                                <span className={categoryRow.active ? 'badge-ok' : 'badge-pending'}>
                                                    {categoryRow.active ? 'Active' : 'Inactive'}
                                                </span>
                                            </td>
                                            <td className="table-cell">
                                                <div className="flex gap-2">
                                                    <button
                                                        type="button"
                                                        disabled={savingCategory}
                                                        onClick={() => handleSaveCategory(categoryRow)}
                                                        className="btn-secondary py-1.5 px-3 text-xs"
                                                    >
                                                        Save
                                                    </button>
                                                    <button
                                                        type="button"
                                                        disabled={savingCategory}
                                                        onClick={() => handleToggleCategory(categoryRow)}
                                                        className="btn-secondary py-1.5 px-3 text-xs"
                                                    >
                                                        {categoryRow.active ? 'Deactivate' : 'Activate'}
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        <div className="flex justify-end pt-5">
                            <button type="button" onClick={() => setShowCategoryManagement(false)} className="btn-secondary">
                                Close
                            </button>
                        </div>
                    </Dialog.Panel>
                </div>
            </Dialog>

            <Dialog open={showProductImport} onClose={() => setShowProductImport(false)} className="relative z-50">
                <div className="fixed inset-0 bg-black/40" aria-hidden="true" />
                <div className="fixed inset-0 flex items-center justify-center p-4">
                    <Dialog.Panel className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl p-6 max-h-[85vh] overflow-y-auto">
                        <div className="flex items-start justify-between gap-4 mb-4">
                            <div>
                                <Dialog.Title className="text-lg font-bold text-gray-800">Import Product Master</Dialog.Title>
                                <p className="text-sm text-gray-500 mt-1">
                                    CSV columns: sku, name, category, current_stock, reorder_point, reorder_quantity, unit_price, supplier_name.
                                </p>
                            </div>
                            <span className="text-xs text-gray-400">{productImportFileName || 'No file selected'}</span>
                        </div>

                        <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-5">
                            <div className="space-y-4">
                                <div>
                                    <label className="block text-xs font-medium text-gray-600 mb-1">Import Mode</label>
                                    <select
                                        className="input-field"
                                        value={productImportMode}
                                        onChange={handleProductImportModeChange}
                                    >
                                        {PRODUCT_IMPORT_MODES.map((mode) => (
                                            <option key={mode.value} value={mode.value}>{mode.label}</option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-gray-600 mb-1">Product CSV</label>
                                    <input
                                        ref={productImportInputRef}
                                        type="file"
                                        accept=".csv,text/csv"
                                        className="input-field"
                                        onChange={handleProductImportFileChange}
                                    />
                                </div>
                                <div className="grid grid-cols-2 gap-3">
                                    <div className="bg-gray-50 rounded-lg p-3">
                                        <p className="text-xs text-gray-400">Rows</p>
                                        <p className="text-xl font-bold text-gray-800">{productImportPreview?.rowCount || 0}</p>
                                    </div>
                                    <div className="bg-gray-50 rounded-lg p-3">
                                        <p className="text-xs text-gray-400">Ready</p>
                                        <p className="text-xl font-bold text-gray-800">{productImportPreview?.readyRows?.length || 0}</p>
                                    </div>
                                </div>
                                {productImportPreview?.errors > 0 && (
                                    <div className="flex gap-2 text-sm text-red-700 bg-red-50 rounded-lg p-3">
                                        <ExclamationTriangleIcon className="w-5 h-5 flex-shrink-0" />
                                        <span>{productImportPreview.errors} issue{productImportPreview.errors === 1 ? '' : 's'} must be fixed before import.</span>
                                    </div>
                                )}
                                {productImportPreview?.errors > 0 && (
                                    <button
                                        type="button"
                                        onClick={handleExportProductImportIssues}
                                        className="btn-secondary w-full flex items-center justify-center gap-2"
                                    >
                                        <DocumentArrowUpIcon className="w-4 h-4" />
                                        Export Issue Rows
                                    </button>
                                )}
                                <button
                                    className="btn-primary w-full flex items-center justify-center gap-2"
                                    disabled={!productImportPreview || productImportPreview.readyRows.length === 0 || productImportPreview.errors > 0 || importingProducts}
                                    onClick={handleImportProducts}
                                >
                                    <DocumentArrowUpIcon className="w-4 h-4" />
                                    {importingProducts ? 'Importing...' : 'Import Products'}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setShowProductImport(false)}
                                    className="btn-secondary w-full"
                                >
                                    Cancel
                                </button>
                            </div>

                            <div className="card p-0 overflow-hidden shadow-none border border-gray-100">
                                <div className="overflow-x-auto">
                                    <table className="w-full">
                                        <thead className="bg-gray-50">
                                            <tr>
                                                <th className="table-header">Row</th>
                                                <th className="table-header">Action</th>
                                                <th className="table-header">SKU</th>
                                                <th className="table-header">Name</th>
                                                <th className="table-header">Stock</th>
                                                <th className="table-header">Safety</th>
                                                <th className="table-header">Order Qty</th>
                                                <th className="table-header">Price</th>
                                                <th className="table-header">Status</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {!productImportPreview ? (
                                                <tr>
                                                    <td colSpan={9} className="text-center py-12 text-gray-400 text-sm">
                                                        Select a CSV file to preview products.
                                                    </td>
                                                </tr>
                                            ) : productImportPreview.rows.slice(0, 100).map((row) => (
                                                <tr key={`${row.rowNumber}-${row.sku}`} className="table-row">
                                                    <td className="table-cell text-xs text-gray-500">{row.rowNumber}</td>
                                                    <td className="table-cell">
                                                        <span className={row.action === 'Create' ? 'badge-ok' : 'badge-pending'}>{row.action}</span>
                                                    </td>
                                                    <td className="table-cell font-mono text-xs">{row.sku || '-'}</td>
                                                    <td className="table-cell font-medium text-gray-800">{row.name || '-'}</td>
                                                    <td className="table-cell font-semibold">{row.current_stock ?? '-'}</td>
                                                    <td className="table-cell">{row.reorder_point}</td>
                                                    <td className="table-cell">{row.reorder_quantity}</td>
                                                    <td className="table-cell">Rs {Number(row.unit_price || 0).toFixed(2)}</td>
                                                    <td className="table-cell">
                                                        <span className={!row.valid ? 'badge-critical' : row.importable ? 'badge-ok' : 'badge-pending'}>{row.status}</span>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                                {productImportPreview?.rows.length > 100 && (
                                    <div className="px-4 py-2 border-t border-gray-50 text-xs text-gray-400">
                                        Showing first 100 rows of {productImportPreview.rows.length}.
                                    </div>
                                )}
                            </div>
                        </div>
                    </Dialog.Panel>
                </div>
            </Dialog>

            <Dialog open={Boolean(detailProduct)} onClose={() => setDetailProduct(null)} className="relative z-50">
                <div className="fixed inset-0 bg-black/40" aria-hidden="true" />
                <div className="fixed inset-y-0 right-0 flex w-full justify-end">
                    <Dialog.Panel className="bg-white shadow-2xl w-full max-w-3xl h-full overflow-y-auto">
                        <div className="sticky top-0 bg-white border-b border-gray-100 px-6 py-4 flex items-start justify-between gap-4">
                            <div>
                                <Dialog.Title className="text-lg font-bold text-gray-800">{detailProduct?.name}</Dialog.Title>
                                <p className="text-xs text-gray-500 font-mono mt-1">{detailProduct?.sku}</p>
                            </div>
                            <button type="button" onClick={() => setDetailProduct(null)} className="btn-secondary py-1.5 px-3 text-xs">
                                Close
                            </button>
                        </div>

                        {loadingDetail ? (
                            <div className="py-20"><div className="spinner mx-auto" /></div>
                        ) : (
                            <div className="p-6 space-y-6">
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                    <div className="bg-gray-50 rounded-lg p-3">
                                        <p className="text-xs text-gray-400">Stock</p>
                                        <p className="text-xl font-bold text-gray-800">{detailProduct?.current_stock ?? '-'}</p>
                                    </div>
                                    <div className="bg-gray-50 rounded-lg p-3">
                                        <p className="text-xs text-gray-400">Safety</p>
                                        <p className="text-xl font-bold text-gray-800">{detailProduct?.reorder_point ?? '-'}</p>
                                    </div>
                                    <div className="bg-gray-50 rounded-lg p-3">
                                        <p className="text-xs text-gray-400">Price</p>
                                        <p className="text-xl font-bold text-gray-800">Rs {Number(detailProduct?.unit_price || 0).toFixed(2)}</p>
                                    </div>
                                    <div className="bg-gray-50 rounded-lg p-3">
                                        <p className="text-xs text-gray-400">Status</p>
                                        <p className="text-sm font-semibold text-gray-800">{detailProduct?.active === false ? 'Archived' : 'Active'}</p>
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                                    <div>
                                        <h3 className="font-bold text-gray-800 mb-2">Recent Movements</h3>
                                        <div className="border border-gray-100 rounded-lg overflow-hidden">
                                            {(detailData?.movements || []).length === 0 ? (
                                                <p className="text-sm text-gray-400 p-4">No movements found.</p>
                                            ) : detailData.movements.map((movement) => (
                                                <div key={movement.id} className="px-4 py-3 border-b border-gray-50 last:border-b-0">
                                                    <div className="flex items-center justify-between gap-3">
                                                        <span className="text-sm font-semibold capitalize text-gray-800">{movement.movement_type}</span>
                                                        <span className="text-sm font-bold text-gray-700">{movement.quantity}</span>
                                                    </div>
                                                    <p className="text-xs text-gray-400 mt-1">{formatDateTime(movement.created_at)} | {movement.notes || '-'}</p>
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    <div>
                                        <h3 className="font-bold text-gray-800 mb-2">Recent Sales</h3>
                                        <div className="border border-gray-100 rounded-lg overflow-hidden">
                                            {(detailData?.sales || []).length === 0 ? (
                                                <p className="text-sm text-gray-400 p-4">No sales found.</p>
                                            ) : detailData.sales.map((sale, index) => (
                                                <div key={`${sale.sales?.receipt_number || index}-${index}`} className="px-4 py-3 border-b border-gray-50 last:border-b-0">
                                                    <div className="flex items-center justify-between gap-3">
                                                        <span className="text-sm font-semibold text-gray-800">{sale.sales?.receipt_number || '-'}</span>
                                                        <span className="text-sm font-bold text-gray-700">{sale.quantity} units</span>
                                                    </div>
                                                    <p className="text-xs text-gray-400 mt-1">{formatDateTime(sale.sales?.created_at)} | Rs {Number(sale.line_total || 0).toFixed(2)}</p>
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    <div>
                                        <h3 className="font-bold text-gray-800 mb-2">Purchase Orders</h3>
                                        <div className="border border-gray-100 rounded-lg overflow-hidden">
                                            {(detailData?.orders || []).length === 0 ? (
                                                <p className="text-sm text-gray-400 p-4">No purchase orders found.</p>
                                            ) : detailData.orders.map((order) => (
                                                <div key={order.id} className="px-4 py-3 border-b border-gray-50 last:border-b-0">
                                                    <div className="flex items-center justify-between gap-3">
                                                        <span className="text-sm font-semibold text-gray-800">{order.order_number}</span>
                                                        <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-700 capitalize">{order.status}</span>
                                                    </div>
                                                    <p className="text-xs text-gray-400 mt-1">{formatDateTime(order.created_at)} | Qty {order.quantity_ordered}</p>
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    <div>
                                        <h3 className="font-bold text-gray-800 mb-2">Forecast History</h3>
                                        <div className="border border-gray-100 rounded-lg overflow-hidden">
                                            {(detailData?.forecasts || []).length === 0 ? (
                                                <p className="text-sm text-gray-400 p-4">No forecasts found.</p>
                                            ) : detailData.forecasts.map((forecast) => (
                                                <div key={forecast.id} className="px-4 py-3 border-b border-gray-50 last:border-b-0">
                                                    <div className="flex items-center justify-between gap-3">
                                                        <span className="text-sm font-semibold text-gray-800">{forecast.model_name}</span>
                                                        <span className={forecast.reorder_signal ? 'badge-low' : 'badge-ok'}>
                                                            {forecast.reorder_signal ? 'Reorder' : 'OK'}
                                                        </span>
                                                    </div>
                                                    <p className="text-xs text-gray-400 mt-1">
                                                        {formatDateTime(forecast.generated_at)} | 7d demand {formatUnits(forecast.predicted_demand)}
                                                    </p>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}
                    </Dialog.Panel>
                </div>
            </Dialog>

            <Dialog open={showForecastModal} onClose={() => setShowForecastModal(false)} className="relative z-50">
                <div className="fixed inset-0 bg-black/40" aria-hidden="true" />
                <div className="fixed inset-0 flex items-center justify-center p-4">
                    <Dialog.Panel className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl p-6 max-h-[80vh] overflow-y-auto">
                        <Dialog.Title className="text-lg font-bold text-gray-800 mb-1">
                            Forecast Analysis Results
                        </Dialog.Title>
                        <p className="text-sm text-gray-500 mb-4">
                            {forecastResults?.length || 0} active products forecasted from current sales history.
                        </p>
                        {forecastResults?.length === 0 ? (
                            <p className="text-green-600 font-medium py-4">No active products found to forecast.</p>
                        ) : (
                            <div className="space-y-2 mb-4">
                                {forecastResults?.map(({ product, prediction }) => (
                                    <div key={product.id} className="flex items-center justify-between py-2 border-b border-gray-100">
                                        <div>
                                            <p className="text-sm font-semibold text-gray-800">{product.name}</p>
                                            <p className="text-xs text-gray-500">
                                                Stock: {product.current_stock} | Next 7 days: {formatUnits(prediction.expectedSalesNext7Days)} units | Avg: {prediction.avgDailyConsumption}/day
                                            </p>
                                        </div>
                                        <div className="text-right">
                                            <span className={
                                                prediction.riskLevel === 'critical'
                                                    ? 'badge-critical'
                                                    : prediction.riskLevel === 'at_risk'
                                                        ? 'badge-low'
                                                        : 'badge-ok'
                                            }>
                                                {prediction.riskLevel === 'critical'
                                                    ? 'Critical'
                                                    : prediction.riskLevel === 'at_risk'
                                                        ? 'At Risk'
                                                        : 'OK'}
                                            </span>
                                            <p className="text-[11px] text-gray-400 mt-1">
                                                {predictionSourceLabel(prediction)}
                                                {prediction.isStale ? ' | Stale' : ''}
                                            </p>
                                            <p className="text-xs text-gray-500 mt-1">
                                                {prediction.daysUntilStockout != null
                                                    ? `~${prediction.daysUntilStockout} days left`
                                                    : 'No stockout predicted'}
                                            </p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                        <div className="flex gap-3 pt-2">
                            <button onClick={() => setShowForecastModal(false)} className="btn-secondary flex-1">Cancel</button>
                        </div>
                    </Dialog.Panel>
                </div>
            </Dialog>
        </Layout>
    );
}
