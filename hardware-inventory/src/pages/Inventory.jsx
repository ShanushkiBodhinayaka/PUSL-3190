import React, { useCallback, useEffect, useState } from 'react';
import { Dialog } from '@headlessui/react';
import { CpuChipIcon, MagnifyingGlassIcon, PlusIcon } from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';
import Layout from '../components/Layout';
import { useAuth } from '../contexts/AuthContext';
import {
    analyzeStock,
    buildForecastPrediction,
    getStockStatus,
    runPredictionsForAllProducts,
} from '../lib/predictions';
import { canManageInventory } from '../lib/roles';
import { supabase } from '../lib/supabase';

const CATEGORIES = ['All', 'Fasteners', 'Power Tools', 'Plumbing', 'Paint', 'Lumber', 'Concrete', 'Electrical', 'Safety'];

const STATUS_BADGE = {
    ok: <span className="badge-ok">OK</span>,
    low: <span className="badge-low">Low</span>,
    critical: <span className="badge-critical">Critical</span>,
    out_of_stock: <span className="badge-critical">Out of Stock</span>,
};

export default function Inventory() {
    const { role } = useAuth();
    const canEdit = canManageInventory(role);

    const [products, setProducts] = useState([]);
    const [search, setSearch] = useState('');
    const [category, setCategory] = useState('All');
    const [loading, setLoading] = useState(true);
    const [showAdd, setShowAdd] = useState(false);
    const [saving, setSaving] = useState(false);
    const [showForecastModal, setShowForecastModal] = useState(false);
    const [forecastResults, setForecastResults] = useState(null);
    const [runningForecast, setRunningForecast] = useState(false);
    const [generatingOrders, setGeneratingOrders] = useState(false);
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
        const { data, error } = await supabase.from('products').select('*').order('name');
        if (error) toast.error('Failed to load products');
        else setProducts(data || []);
        setLoading(false);
    }, []);

    useEffect(() => {
        load();
    }, [load]);

    const filtered = products.filter((product) => {
        const matchSearch =
            product.name.toLowerCase().includes(search.toLowerCase()) ||
            product.sku.toLowerCase().includes(search.toLowerCase());
        const matchCategory = category === 'All' || product.category === category;
        return matchSearch && matchCategory;
    });

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

    async function handleRunForecast() {
        setRunningForecast(true);
        try {
            const [{ data: productsData }, { data: forecastRows }] = await Promise.all([
                supabase.from('products').select('*'),
                supabase.from('demand_forecasts').select('*').order('generated_at', { ascending: false }),
            ]);
            const thirtyDaysAgo = new Date();
            thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

            const { data: movementData } = await supabase
                .from('stock_movements')
                .select('*')
                .eq('movement_type', 'sale')
                .gte('created_at', thirtyDaysAgo.toISOString());

            const latestForecasts = new Map();
            for (const forecast of forecastRows || []) {
                if (!latestForecasts.has(forecast.product_id)) {
                    latestForecasts.set(forecast.product_id, forecast);
                }
            }

            const results = (productsData || [])
                .map((product) => {
                    const forecast = latestForecasts.get(product.id);
                    return {
                        product,
                        prediction: forecast
                            ? buildForecastPrediction(product, forecast)
                            : analyzeStock(product, movementData || []),
                    };
                })
                .filter((result) => result.prediction.shouldReorder);

            setForecastResults(results);
            setShowForecastModal(true);
        } catch (error) {
            toast.error(`Forecast analysis failed: ${error.message}`);
        }
        setRunningForecast(false);
    }

    async function handleGenerateOrders() {
        setGeneratingOrders(true);
        try {
            const result = await runPredictionsForAllProducts();
            toast.success(`Generated ${result.generated.length} purchase orders`);
            setShowForecastModal(false);
        } catch (error) {
            toast.error(`Failed to generate orders: ${error.message}`);
        }
        setGeneratingOrders(false);
    }

    return (
        <Layout title="Inventory">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
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
                        {CATEGORIES.map((categoryOption) => <option key={categoryOption}>{categoryOption}</option>)}
                    </select>
                </div>
                <div className="flex gap-2 flex-shrink-0">
                    {canEdit && (
                        <button
                            onClick={handleRunForecast}
                            disabled={runningForecast}
                            className="btn-secondary flex items-center gap-2"
                        >
                            {runningForecast ? <div className="spinner !w-4 !h-4" /> : <CpuChipIcon className="w-4 h-4" />}
                            Run Forecast
                        </button>
                    )}
                    {canEdit && (
                        <button onClick={() => setShowAdd(true)} className="btn-primary flex items-center gap-2">
                            <PlusIcon className="w-4 h-4" />
                            Add Product
                        </button>
                    )}
                </div>
            </div>

            <div className="card p-0 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead className="bg-gray-50 border-b border-gray-100">
                            <tr>
                                <th className="table-header">Product</th>
                                <th className="table-header">SKU</th>
                                <th className="table-header">Category</th>
                                <th className="table-header">Stock</th>
                                <th className="table-header">Reorder At</th>
                                <th className="table-header">Unit Price</th>
                                <th className="table-header">Supplier</th>
                                <th className="table-header">Status</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr><td colSpan={8} className="text-center py-12"><div className="spinner mx-auto" /></td></tr>
                            ) : filtered.length === 0 ? (
                                <tr>
                                    <td colSpan={8} className="text-center py-12 text-gray-400">
                                        <MagnifyingGlassIcon className="w-10 h-10 mx-auto mb-2 opacity-30" />
                                        <p className="text-sm">No products found.</p>
                                    </td>
                                </tr>
                            ) : filtered.map((product) => {
                                const stockStatus = getStockStatus(product);
                                return (
                                    <tr key={product.id} className="table-row">
                                        <td className="table-cell font-medium text-gray-800">{product.name}</td>
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
                                        <td className="table-cell text-gray-600">{product.reorder_point}</td>
                                        <td className="table-cell">${parseFloat(product.unit_price || 0).toFixed(2)}</td>
                                        <td className="table-cell text-gray-600 text-xs">{product.supplier_name}</td>
                                        <td className="table-cell">{STATUS_BADGE[stockStatus]}</td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
                {!loading && (
                    <div className="px-4 py-2 border-t border-gray-50 text-xs text-gray-400">
                        {filtered.length} of {products.length} products
                    </div>
                )}
            </div>

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
                                        {CATEGORIES.slice(1).map((categoryOption) => <option key={categoryOption}>{categoryOption}</option>)}
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
                                    <label className="block text-xs font-medium text-gray-600 mb-1">Reorder Point</label>
                                    <input
                                        type="number"
                                        className="input-field"
                                        min="0"
                                        value={newProduct.reorder_point}
                                        onChange={(event) => setNewProduct({ ...newProduct, reorder_point: Number(event.target.value) })}
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-gray-600 mb-1">Reorder Qty</label>
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

            <Dialog open={showForecastModal} onClose={() => setShowForecastModal(false)} className="relative z-50">
                <div className="fixed inset-0 bg-black/40" aria-hidden="true" />
                <div className="fixed inset-0 flex items-center justify-center p-4">
                    <Dialog.Panel className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl p-6 max-h-[80vh] overflow-y-auto">
                        <Dialog.Title className="text-lg font-bold text-gray-800 mb-1">
                            Forecast Analysis Results
                        </Dialog.Title>
                        <p className="text-sm text-gray-500 mb-4">
                            {forecastResults?.length || 0} products flagged for reorder.
                        </p>
                        {forecastResults?.length === 0 ? (
                            <p className="text-green-600 font-medium py-4">All stock levels are healthy. No orders needed.</p>
                        ) : (
                            <div className="space-y-2 mb-4">
                                {forecastResults?.map(({ product, prediction }) => (
                                    <div key={product.id} className="flex items-center justify-between py-2 border-b border-gray-100">
                                        <div>
                                            <p className="text-sm font-semibold text-gray-800">{product.name}</p>
                                            <p className="text-xs text-gray-500">
                                                Stock: {product.current_stock} | Avg: {prediction.avgDailyConsumption}/day
                                            </p>
                                        </div>
                                        <div className="text-right">
                                            <span className={prediction.riskLevel === 'critical' ? 'badge-critical' : 'badge-low'}>
                                                {prediction.riskLevel === 'critical' ? 'Critical' : 'At Risk'}
                                            </span>
                                            <p className="text-[11px] text-gray-400 mt-1">
                                                {prediction.source === 'forecast'
                                                    ? `Model: ${prediction.modelName}`
                                                    : 'Fallback: baseline rule'}
                                            </p>
                                            <p className="text-xs text-gray-500 mt-1">
                                                {prediction.daysUntilStockout != null
                                                    ? `~${prediction.daysUntilStockout} days left`
                                                    : 'Below reorder point'}
                                            </p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                        <div className="flex gap-3 pt-2">
                            <button onClick={() => setShowForecastModal(false)} className="btn-secondary flex-1">Cancel</button>
                            {forecastResults?.length > 0 && (
                                <button onClick={handleGenerateOrders} disabled={generatingOrders} className="btn-primary flex-1">
                                    {generatingOrders ? 'Generating...' : `Generate ${forecastResults.length} Purchase Orders`}
                                </button>
                            )}
                        </div>
                    </Dialog.Panel>
                </div>
            </Dialog>
        </Layout>
    );
}
