import React, { useEffect, useState, useCallback } from 'react';
import Layout from '../components/Layout';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { getStockStatus, runPredictionsForAllProducts } from '../lib/predictions';
import { MagnifyingGlassIcon, PlusIcon, CpuChipIcon } from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';
import { Dialog } from '@headlessui/react';

const CATEGORIES = ['All', 'Fasteners', 'Power Tools', 'Plumbing', 'Paint', 'Lumber', 'Concrete', 'Electrical', 'Safety'];

const STATUS_BADGE = {
    ok: <span className="badge-ok">OK</span>,
    low: <span className="badge-low">Low</span>,
    critical: <span className="badge-critical">Critical</span>,
    out_of_stock: <span className="badge-critical">Out of Stock</span>,
};

export default function Inventory() {
    const { role } = useAuth();
    const canEdit = ['admin', 'warehouse_manager'].includes(role);

    const [products, setProducts] = useState([]);
    const [search, setSearch] = useState('');
    const [category, setCategory] = useState('All');
    const [loading, setLoading] = useState(true);

    // New product modal
    const [showAdd, setShowAdd] = useState(false);
    const [newProd, setNewProd] = useState({
        name: '', sku: '', category: 'Fasteners', current_stock: 0,
        reorder_point: 10, reorder_quantity: 50, unit_price: '', supplier_name: '',
    });
    const [saving, setSaving] = useState(false);

    // AI Prediction modal
    const [showAIModal, setShowAIModal] = useState(false);
    const [aiResults, setAIResults] = useState(null);
    const [runningAI, setRunningAI] = useState(false);
    const [generatingOrders, setGeneratingOrders] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        const { data, error } = await supabase
            .from('products')
            .select('*')
            .order('name');
        if (error) toast.error('Failed to load products');
        else setProducts(data || []);
        setLoading(false);
    }, []);

    useEffect(() => { load(); }, [load]);

    const filtered = products.filter((p) => {
        const matchSearch = p.name.toLowerCase().includes(search.toLowerCase()) ||
            p.sku.toLowerCase().includes(search.toLowerCase());
        const matchCat = category === 'All' || p.category === category;
        return matchSearch && matchCat;
    });

    async function handleAddProduct(e) {
        e.preventDefault();
        setSaving(true);
        const { error } = await supabase.from('products').insert([newProd]);
        if (error) {
            toast.error('Failed to add product: ' + error.message);
        } else {
            toast.success('Product added!');
            setShowAdd(false);
            setNewProd({
                name: '', sku: '', category: 'Fasteners', current_stock: 0,
                reorder_point: 10, reorder_quantity: 50, unit_price: '', supplier_name: ''
            });
            load();
        }
        setSaving(false);
    }

    async function handleRunAI() {
        setRunningAI(true);
        try {
            // Just run analysis without generating orders yet — show modal first
            const { data: prods } = await supabase.from('products').select('*');
            const thirtyDaysAgo = new Date();
            thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
            const { data: movs } = await supabase
                .from('stock_movements')
                .select('*')
                .eq('movement_type', 'sale')
                .gte('created_at', thirtyDaysAgo.toISOString());

            const { analyzeStock } = await import('../lib/predictions');
            const results = (prods || []).map((p) => ({
                product: p,
                prediction: analyzeStock(p, movs || []),
            })).filter((r) => r.prediction.shouldReorder);

            setAIResults(results);
            setShowAIModal(true);
        } catch (err) {
            toast.error('AI analysis failed: ' + err.message);
        }
        setRunningAI(false);
    }

    async function handleGenerateOrders() {
        setGeneratingOrders(true);
        try {
            const result = await runPredictionsForAllProducts();
            toast.success(`✅ Generated ${result.generated.length} purchase orders!`);
            setShowAIModal(false);
        } catch (err) {
            toast.error('Failed to generate orders: ' + err.message);
        }
        setGeneratingOrders(false);
    }

    return (
        <Layout title="Inventory">
            {/* Header row */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
                <div className="flex gap-3 flex-1 flex-wrap">
                    <div className="relative flex-1 min-w-48">
                        <MagnifyingGlassIcon className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                        <input
                            className="input-field pl-9"
                            placeholder="Search products or SKU…"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                        />
                    </div>
                    <select
                        className="input-field w-auto"
                        value={category}
                        onChange={(e) => setCategory(e.target.value)}
                    >
                        {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
                    </select>
                </div>
                <div className="flex gap-2 flex-shrink-0">
                    {canEdit && (
                        <button
                            onClick={handleRunAI}
                            disabled={runningAI}
                            className="btn-secondary flex items-center gap-2"
                        >
                            {runningAI ? <div className="spinner !w-4 !h-4" /> : <CpuChipIcon className="w-4 h-4" />}
                            Run AI Prediction
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

            {/* Table */}
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
                                <tr><td colSpan={8} className="text-center py-12">
                                    <div className="spinner mx-auto" />
                                </td></tr>
                            ) : filtered.length === 0 ? (
                                <tr><td colSpan={8} className="text-center py-12 text-gray-400">
                                    <MagnifyingGlassIcon className="w-10 h-10 mx-auto mb-2 opacity-30" />
                                    <p className="text-sm">No products found.</p>
                                </td></tr>
                            ) : filtered.map((p) => {
                                const status = getStockStatus(p);
                                return (
                                    <tr key={p.id} className="table-row">
                                        <td className="table-cell font-medium text-gray-800">{p.name}</td>
                                        <td className="table-cell font-mono text-xs text-gray-500">{p.sku}</td>
                                        <td className="table-cell text-gray-600">{p.category}</td>
                                        <td className="table-cell">
                                            <span className={`font-bold ${status === 'critical' ? 'text-red-600' :
                                                    status === 'low' ? 'text-yellow-600' : 'text-gray-800'
                                                }`}>
                                                {p.current_stock}
                                            </span>
                                        </td>
                                        <td className="table-cell text-gray-600">{p.reorder_point}</td>
                                        <td className="table-cell">${parseFloat(p.unit_price || 0).toFixed(2)}</td>
                                        <td className="table-cell text-gray-600 text-xs">{p.supplier_name}</td>
                                        <td className="table-cell">{STATUS_BADGE[status]}</td>
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

            {/* Add Product Modal */}
            <Dialog open={showAdd} onClose={() => setShowAdd(false)} className="relative z-50">
                <div className="fixed inset-0 bg-black/40" aria-hidden="true" />
                <div className="fixed inset-0 flex items-center justify-center p-4">
                    <Dialog.Panel className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6">
                        <Dialog.Title className="text-lg font-bold text-gray-800 mb-4">Add New Product</Dialog.Title>
                        <form onSubmit={handleAddProduct} className="space-y-3">
                            <div className="grid grid-cols-2 gap-3">
                                <div className="col-span-2">
                                    <label className="block text-xs font-medium text-gray-600 mb-1">Product Name</label>
                                    <input className="input-field" required value={newProd.name}
                                        onChange={(e) => setNewProd({ ...newProd, name: e.target.value })} />
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-gray-600 mb-1">SKU</label>
                                    <input className="input-field" required value={newProd.sku}
                                        onChange={(e) => setNewProd({ ...newProd, sku: e.target.value })} />
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-gray-600 mb-1">Category</label>
                                    <select className="input-field" value={newProd.category}
                                        onChange={(e) => setNewProd({ ...newProd, category: e.target.value })}>
                                        {CATEGORIES.slice(1).map((c) => <option key={c}>{c}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-gray-600 mb-1">Current Stock</label>
                                    <input type="number" className="input-field" min="0" value={newProd.current_stock}
                                        onChange={(e) => setNewProd({ ...newProd, current_stock: +e.target.value })} />
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-gray-600 mb-1">Reorder Point</label>
                                    <input type="number" className="input-field" min="0" value={newProd.reorder_point}
                                        onChange={(e) => setNewProd({ ...newProd, reorder_point: +e.target.value })} />
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-gray-600 mb-1">Reorder Qty</label>
                                    <input type="number" className="input-field" min="1" value={newProd.reorder_quantity}
                                        onChange={(e) => setNewProd({ ...newProd, reorder_quantity: +e.target.value })} />
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-gray-600 mb-1">Unit Price ($)</label>
                                    <input type="number" step="0.01" className="input-field" value={newProd.unit_price}
                                        onChange={(e) => setNewProd({ ...newProd, unit_price: e.target.value })} />
                                </div>
                                <div className="col-span-2">
                                    <label className="block text-xs font-medium text-gray-600 mb-1">Supplier Name</label>
                                    <input className="input-field" value={newProd.supplier_name}
                                        onChange={(e) => setNewProd({ ...newProd, supplier_name: e.target.value })} />
                                </div>
                            </div>
                            <div className="flex gap-3 pt-2">
                                <button type="button" onClick={() => setShowAdd(false)} className="btn-secondary flex-1">Cancel</button>
                                <button type="submit" disabled={saving} className="btn-primary flex-1">
                                    {saving ? 'Saving…' : 'Add Product'}
                                </button>
                            </div>
                        </form>
                    </Dialog.Panel>
                </div>
            </Dialog>

            {/* AI Prediction Modal */}
            <Dialog open={showAIModal} onClose={() => setShowAIModal(false)} className="relative z-50">
                <div className="fixed inset-0 bg-black/40" aria-hidden="true" />
                <div className="fixed inset-0 flex items-center justify-center p-4">
                    <Dialog.Panel className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl p-6 max-h-[80vh] overflow-y-auto">
                        <Dialog.Title className="text-lg font-bold text-gray-800 mb-1">
                            🤖 AI Stock Analysis Results
                        </Dialog.Title>
                        <p className="text-sm text-gray-500 mb-4">
                            {aiResults?.length || 0} products flagged for reorder.
                        </p>
                        {aiResults?.length === 0 ? (
                            <p className="text-green-600 font-medium py-4">✅ All stock levels are healthy. No orders needed.</p>
                        ) : (
                            <div className="space-y-2 mb-4">
                                {aiResults?.map(({ product, prediction }) => (
                                    <div key={product.id} className="flex items-center justify-between py-2 border-b border-gray-100">
                                        <div>
                                            <p className="text-sm font-semibold text-gray-800">{product.name}</p>
                                            <p className="text-xs text-gray-500">
                                                Stock: {product.current_stock} | Avg: {prediction.avgDailyConsumption}/day
                                            </p>
                                        </div>
                                        <div className="text-right">
                                            <span className={prediction.riskLevel === 'critical' ? 'badge-critical' : 'badge-low'}>
                                                {prediction.riskLevel === 'critical' ? '🔴 Critical' : '🟡 At Risk'}
                                            </span>
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
                            <button onClick={() => setShowAIModal(false)} className="btn-secondary flex-1">
                                Cancel
                            </button>
                            {aiResults?.length > 0 && (
                                <button onClick={handleGenerateOrders} disabled={generatingOrders} className="btn-primary flex-1">
                                    {generatingOrders
                                        ? 'Generating…'
                                        : `Generate ${aiResults.length} Purchase Orders`}
                                </button>
                            )}
                        </div>
                    </Dialog.Panel>
                </div>
            </Dialog>
        </Layout>
    );
}
