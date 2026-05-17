import React, { useCallback, useEffect, useState } from 'react';
import { format } from 'date-fns';
import { FunnelIcon, MagnifyingGlassIcon, PlusIcon } from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';
import Layout from '../components/Layout';
import ProductSearchInput from '../components/ProductSearchInput';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';

const MOVEMENT_OPTIONS = [
    { value: 'sale', label: 'Sale (reduces stock)' },
    { value: 'restock', label: 'Restock (adds stock)' },
    { value: 'adjustment', label: 'Adjustment' },
    { value: 'damage', label: 'Damage (reduces stock)' },
];

const MOVEMENT_COLORS = {
    sale: 'bg-red-100 text-red-700',
    restock: 'bg-green-100 text-green-700',
    adjustment: 'bg-blue-100 text-blue-700',
    damage: 'bg-orange-100 text-orange-700',
};

function allowedMovementTypes(role) {
    if (role === 'sales_operator') return ['sale'];
    if (role === 'staff') return ['damage'];
    return ['sale', 'restock', 'adjustment', 'damage'];
}

export default function StockMovements() {
    const { role } = useAuth();
    const allowedTypes = allowedMovementTypes(role);
    const [movements, setMovements] = useState([]);
    const [products, setProducts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState('all');
    const [movementLimit, setMovementLimit] = useState(50);
    const [saving, setSaving] = useState(false);
    const [movementSearch, setMovementSearch] = useState('');
    const [form, setForm] = useState({
        product_id: '',
        movement_type: 'sale',
        quantity: '',
        notes: '',
    });

    const load = useCallback(async () => {
        setLoading(true);
        const [{ data: productRows }, { data: movementRows }] = await Promise.all([
            supabase
                .from('products')
                .select('id, name, sku, category, current_stock, reorder_point')
                .eq('active', true)
                .order('name'),
            supabase
                .from('stock_movements')
                .select('*, products(name, sku), profiles(full_name, role)')
                .order('created_at', { ascending: false })
                .limit(movementLimit),
        ]);
        setProducts(productRows || []);
        setMovements(movementRows || []);
        setLoading(false);
    }, [movementLimit]);

    useEffect(() => {
        load();
    }, [load]);

    useEffect(() => {
        if (!allowedTypes.includes(form.movement_type)) {
            setForm((current) => ({ ...current, movement_type: allowedTypes[0] || 'sale' }));
        }
    }, [allowedTypes, form.movement_type]);

    const selectedProduct = products.find((product) => product.id === form.product_id);

    async function handleSubmit(event) {
        event.preventDefault();
        if (!form.product_id) {
            toast.error('Please select a product');
            return;
        }

        const qty = parseInt(form.quantity, 10);
        if (!qty || qty <= 0) {
            toast.error('Enter a valid quantity');
            return;
        }

        if (['sale', 'damage'].includes(form.movement_type) && selectedProduct?.current_stock < qty) {
            toast.error(`Only ${selectedProduct.current_stock} units are available for ${selectedProduct.name}`);
            return;
        }

        setSaving(true);
        const { data, error } = await supabase.rpc('record_stock_movement', {
            p_product_id: form.product_id,
            p_movement_type: form.movement_type,
            p_quantity: qty,
            p_notes: form.notes || null,
        });

        if (error) {
            toast.error(`Failed to record movement: ${error.message}`);
        } else {
            toast.success(`Movement recorded. Current stock: ${data.current_stock}`);
            setForm({ product_id: '', movement_type: allowedTypes[0] || 'sale', quantity: '', notes: '' });
            await load();
        }
        setSaving(false);
    }

    const filtered = movements.filter((movement) => {
        const matchesType = filter === 'all' || movement.movement_type === filter;
        const query = movementSearch.trim().toLowerCase();
        if (!query) return matchesType;

        const haystack = [
            movement.products?.name,
            movement.products?.sku,
            movement.notes,
            movement.profiles?.full_name,
            movement.movement_type,
        ]
            .filter(Boolean)
            .join(' ')
            .toLowerCase();
        return matchesType && haystack.includes(query);
    });

    return (
        <Layout title="Stock Movements">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="card">
                    <h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2">
                        <PlusIcon className="w-5 h-5 text-accent" />
                        Record Movement
                    </h3>
                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">Product</label>
                            <ProductSearchInput
                                id="stock-movement-product"
                                products={products}
                                selectedProductId={form.product_id}
                                onSelectProduct={(productId) => setForm((current) => ({ ...current, product_id: productId }))}
                                required
                                renderSelectedProduct={(product) => (
                                    <div className="mt-2 rounded-lg border border-gray-100 bg-gray-50 px-3 py-2 text-xs text-gray-500">
                                        <div className="flex items-center justify-between gap-3">
                                            <span className="font-medium text-gray-700">{product.name}</span>
                                            <span className="font-mono text-gray-500">{product.sku}</span>
                                        </div>
                                        <div className="mt-1 grid grid-cols-3 gap-2">
                                            <span>Stock: <strong className="text-gray-700">{product.current_stock}</strong></span>
                                            <span>Safety: <strong className="text-gray-700">{product.reorder_point}</strong></span>
                                            <span className="truncate">{product.category || 'Uncategorized'}</span>
                                        </div>
                                    </div>
                                )}
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">Movement Type</label>
                            <select
                                className="input-field"
                                value={form.movement_type}
                                onChange={(event) => setForm({ ...form, movement_type: event.target.value })}
                            >
                                {MOVEMENT_OPTIONS
                                    .filter((option) => allowedTypes.includes(option.value))
                                    .map((option) => (
                                        <option key={option.value} value={option.value}>{option.label}</option>
                                    ))}
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
                                onChange={(event) => setForm({ ...form, quantity: event.target.value })}
                                required
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">Notes (optional)</label>
                            <textarea
                                className="input-field resize-none"
                                rows={2}
                                placeholder="Contractor name, order ref..."
                                value={form.notes}
                                onChange={(event) => setForm({ ...form, notes: event.target.value })}
                            />
                        </div>
                        <button type="submit" disabled={saving} className="btn-primary w-full">
                            {saving ? 'Recording...' : 'Record Movement'}
                        </button>
                    </form>
                </div>

                <div className="lg:col-span-2 card p-0 overflow-hidden">
                    <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 gap-3 flex-wrap">
                        <h3 className="font-bold text-gray-800 flex items-center gap-2 px-2">
                            <FunnelIcon className="w-4 h-4 text-gray-400" />
                            Recent Movements
                        </h3>
                        <div className="relative flex-1 min-w-48 max-w-xs">
                            <MagnifyingGlassIcon className="w-4 h-4 text-gray-400 absolute left-3 top-2.5" />
                            <input
                                className="input-field pl-9 py-1.5"
                                placeholder="Search SKU, product, user..."
                                value={movementSearch}
                                onChange={(event) => setMovementSearch(event.target.value)}
                            />
                        </div>
                        <div className="flex gap-1 flex-wrap">
                            {['all', 'sale', 'restock', 'adjustment', 'damage'].map((movementType) => (
                                <button
                                    key={movementType}
                                    onClick={() => setFilter(movementType)}
                                    className={`text-xs px-3 py-1 rounded-lg capitalize transition-colors ${
                                        filter === movementType
                                            ? 'bg-accent text-white'
                                            : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                    }`}
                                >
                                    {movementType}
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
                                    <th className="table-header">By</th>
                                    <th className="table-header">Date</th>
                                </tr>
                            </thead>
                            <tbody>
                                {loading ? (
                                    <tr><td colSpan={6} className="text-center py-10"><div className="spinner mx-auto" /></td></tr>
                                ) : filtered.length === 0 ? (
                                    <tr><td colSpan={6} className="text-center py-10 text-gray-400 text-sm">No movements found.</td></tr>
                                ) : filtered.map((movement) => (
                                    <tr key={movement.id} className="table-row">
                                        <td className="table-cell">
                                            <p className="font-medium text-gray-800 text-sm">{movement.products?.name}</p>
                                            <p className="text-xs text-gray-400">{movement.products?.sku}</p>
                                        </td>
                                        <td className="table-cell">
                                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${MOVEMENT_COLORS[movement.movement_type]}`}>
                                                {movement.movement_type}
                                            </span>
                                        </td>
                                        <td className="table-cell">
                                            <span
                                                className={`font-bold ${
                                                    movement.movement_type === 'sale' || movement.movement_type === 'damage'
                                                        ? 'text-red-600'
                                                        : 'text-green-600'
                                                }`}
                                            >
                                                {movement.movement_type === 'sale' || movement.movement_type === 'damage' ? '-' : '+'}
                                                {movement.quantity}
                                            </span>
                                        </td>
                                        <td className="table-cell text-xs text-gray-500 max-w-xs truncate">{movement.notes || '-'}</td>
                                        <td className="table-cell">
                                            <p className="text-xs font-medium text-gray-600">{movement.profiles?.full_name || 'System'}</p>
                                            {movement.profiles?.role && (
                                                <p className="text-xs text-gray-400 capitalize">{movement.profiles.role.replaceAll('_', ' ')}</p>
                                            )}
                                        </td>
                                        <td className="table-cell text-xs text-gray-500">
                                            {format(new Date(movement.created_at), 'MMM d, h:mm a')}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    {!loading && (
                        <div className="px-4 py-3 border-t border-gray-50 flex items-center justify-between gap-3">
                            <p className="text-xs text-gray-400">
                                Showing {filtered.length} of {movements.length} loaded movements
                            </p>
                            {movements.length >= movementLimit && (
                                <button
                                    type="button"
                                    onClick={() => setMovementLimit((current) => current + 50)}
                                    className="btn-secondary py-1.5 px-3 text-xs"
                                >
                                    Load more
                                </button>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </Layout>
    );
}
