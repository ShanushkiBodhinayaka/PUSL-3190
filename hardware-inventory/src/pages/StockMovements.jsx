import React, { useEffect, useState, useCallback } from 'react';
import Layout from '../components/Layout';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import toast from 'react-hot-toast';
import { format } from 'date-fns';
import { PlusIcon, FunnelIcon } from '@heroicons/react/24/outline';

const MOVEMENT_COLORS = {
    sale: 'bg-red-100 text-red-700',
    restock: 'bg-green-100 text-green-700',
    adjustment: 'bg-blue-100 text-blue-700',
    damage: 'bg-orange-100 text-orange-700',
};

export default function StockMovements() {
    const { user } = useAuth();
    const [movements, setMovements] = useState([]);
    const [products, setProducts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState('all');

    const [form, setForm] = useState({
        product_id: '',
        movement_type: 'sale',
        quantity: '',
        notes: '',
    });
    const [saving, setSaving] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        const [{ data: prods }, { data: movs }] = await Promise.all([
            supabase.from('products').select('id, name, sku').order('name'),
            supabase
                .from('stock_movements')
                .select('*, products(name, sku)')
                .order('created_at', { ascending: false })
                .limit(50),
        ]);
        setProducts(prods || []);
        setMovements(movs || []);
        setLoading(false);
    }, []);

    useEffect(() => { load(); }, [load]);

    async function handleSubmit(e) {
        e.preventDefault();
        if (!form.product_id) { toast.error('Please select a product'); return; }
        const qty = parseInt(form.quantity);
        if (!qty || qty <= 0) { toast.error('Enter a valid quantity'); return; }
        setSaving(true);

        const { error } = await supabase.from('stock_movements').insert([{
            product_id: form.product_id,
            movement_type: form.movement_type,
            quantity: qty,
            notes: form.notes || null,
            created_by: user?.id,
        }]);

        if (error) {
            toast.error('Failed to record movement: ' + error.message);
        } else {
            // Update current_stock on product
            const product = products.find((p) => p.id === form.product_id);
            if (product) {
                const { data: prod } = await supabase.from('products').select('current_stock').eq('id', form.product_id).single();
                if (prod) {
                    let newStock = prod.current_stock;
                    if (form.movement_type === 'sale' || form.movement_type === 'damage') {
                        newStock = Math.max(0, newStock - qty);
                    } else {
                        newStock = newStock + qty;
                    }
                    await supabase.from('products').update({ current_stock: newStock }).eq('id', form.product_id);
                }
            }
            toast.success('Movement recorded!');
            setForm({ product_id: '', movement_type: 'sale', quantity: '', notes: '' });
            load();
        }
        setSaving(false);
    }

    const filtered = filter === 'all' ? movements : movements.filter((m) => m.movement_type === filter);

    return (
        <Layout title="Stock Movements">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Record Movement Form */}
                <div className="card">
                    <h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2">
                        <PlusIcon className="w-5 h-5 text-accent" />
                        Record Movement
                    </h3>
                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">Product</label>
                            <select
                                className="input-field"
                                value={form.product_id}
                                onChange={(e) => setForm({ ...form, product_id: e.target.value })}
                                required
                            >
                                <option value="">Select a product…</option>
                                {products.map((p) => (
                                    <option key={p.id} value={p.id}>{p.name} ({p.sku})</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">Movement Type</label>
                            <select
                                className="input-field"
                                value={form.movement_type}
                                onChange={(e) => setForm({ ...form, movement_type: e.target.value })}
                            >
                                <option value="sale">Sale (reduces stock)</option>
                                <option value="restock">Restock (adds stock)</option>
                                <option value="adjustment">Adjustment</option>
                                <option value="damage">Damage (reduces stock)</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">Quantity</label>
                            <input
                                type="number"
                                min="1"
                                className="input-field"
                                placeholder="e.g. 10"
                                value={form.quantity}
                                onChange={(e) => setForm({ ...form, quantity: e.target.value })}
                                required
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">Notes (optional)</label>
                            <textarea
                                className="input-field resize-none"
                                rows={2}
                                placeholder="Contractor name, order ref…"
                                value={form.notes}
                                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                            />
                        </div>
                        <button type="submit" disabled={saving} className="btn-primary w-full">
                            {saving ? 'Recording…' : 'Record Movement'}
                        </button>
                    </form>
                </div>

                {/* Movements Table */}
                <div className="lg:col-span-2 card p-0 overflow-hidden">
                    <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
                        <h3 className="font-bold text-gray-800 flex items-center gap-2 px-2">
                            <FunnelIcon className="w-4 h-4 text-gray-400" />
                            Recent Movements
                        </h3>
                        <div className="flex gap-1">
                            {['all', 'sale', 'restock', 'adjustment', 'damage'].map((f) => (
                                <button
                                    key={f}
                                    onClick={() => setFilter(f)}
                                    className={`text-xs px-3 py-1 rounded-lg capitalize transition-colors ${filter === f ? 'bg-accent text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                        }`}
                                >
                                    {f}
                                </button>
                            ))}
                        </div>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead className="bg-gray-50">
                                <tr>
                                    <th className="table-header">Product</th>
                                    <th className="table-header">Type</th>
                                    <th className="table-header">Quantity</th>
                                    <th className="table-header">Notes</th>
                                    <th className="table-header">Date</th>
                                </tr>
                            </thead>
                            <tbody>
                                {loading ? (
                                    <tr><td colSpan={5} className="text-center py-10">
                                        <div className="spinner mx-auto" />
                                    </td></tr>
                                ) : filtered.length === 0 ? (
                                    <tr><td colSpan={5} className="text-center py-10 text-gray-400 text-sm">
                                        No movements recorded yet.
                                    </td></tr>
                                ) : filtered.map((m) => (
                                    <tr key={m.id} className="table-row">
                                        <td className="table-cell">
                                            <p className="font-medium text-gray-800 text-sm">{m.products?.name}</p>
                                            <p className="text-xs text-gray-400">{m.products?.sku}</p>
                                        </td>
                                        <td className="table-cell">
                                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${MOVEMENT_COLORS[m.movement_type]}`}>
                                                {m.movement_type}
                                            </span>
                                        </td>
                                        <td className="table-cell">
                                            <span className={`font-bold ${m.movement_type === 'sale' || m.movement_type === 'damage'
                                                    ? 'text-red-600' : 'text-green-600'
                                                }`}>
                                                {m.movement_type === 'sale' || m.movement_type === 'damage' ? '-' : '+'}{m.quantity}
                                            </span>
                                        </td>
                                        <td className="table-cell text-xs text-gray-500 max-w-xs truncate">{m.notes || '—'}</td>
                                        <td className="table-cell text-xs text-gray-500">
                                            {format(new Date(m.created_at), 'MMM d, h:mm a')}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </Layout>
    );
}
