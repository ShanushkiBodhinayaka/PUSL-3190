import React, { useCallback, useEffect, useState } from 'react';
import { Dialog } from '@headlessui/react';
import { PlusIcon, ShoppingCartIcon } from '@heroicons/react/24/outline';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import Layout from '../components/Layout';
import { useAuth } from '../contexts/AuthContext';
import { canCreatePurchaseOrders } from '../lib/roles';
import { supabase } from '../lib/supabase';

const STATUSES = ['all', 'pending', 'approved', 'rejected', 'ordered', 'received'];

const STATUS_BADGE = {
    pending: <span className="badge-pending">Pending</span>,
    approved: <span className="badge-approved">Approved</span>,
    rejected: <span className="badge-rejected">Rejected</span>,
    ordered: <span className="badge-ordered">Ordered</span>,
    received: <span className="badge-received">Received</span>,
};

export default function PurchaseOrders() {
    const { role } = useAuth();
    const canCreate = canCreatePurchaseOrders(role);

    const [orders, setOrders] = useState([]);
    const [products, setProducts] = useState([]);
    const [status, setStatus] = useState('all');
    const [loading, setLoading] = useState(true);
    const [showCreate, setShowCreate] = useState(false);
    const [saving, setSaving] = useState(false);
    const [newOrder, setNewOrder] = useState({ product_id: '', quantity_ordered: '', notes: '' });

    const load = useCallback(async () => {
        setLoading(true);
        const { data: orderRows } = await supabase
            .from('purchase_orders')
            .select('*, products(name, sku, current_stock, reorder_point)')
            .order('created_at', { ascending: false });
        setOrders(orderRows || []);

        const { data: productRows } = await supabase
            .from('products')
            .select('id, name, sku, reorder_quantity')
            .order('name');
        setProducts(productRows || []);
        setLoading(false);
    }, []);

    useEffect(() => {
        load();
    }, [load]);

    const filtered = status === 'all' ? orders : orders.filter((order) => order.status === status);

    async function handleCreate(event) {
        event.preventDefault();
        if (!newOrder.product_id || !newOrder.quantity_ordered) {
            toast.error('Select a product and quantity');
            return;
        }

        setSaving(true);
        const { error } = await supabase.from('purchase_orders').insert([{
            order_number: `PO-MAN-${Date.now()}`,
            product_id: newOrder.product_id,
            quantity_ordered: parseInt(newOrder.quantity_ordered, 10),
            triggered_by: 'manual',
            status: 'pending',
            notes: newOrder.notes || null,
        }]);

        if (error) {
            toast.error(`Failed to create order: ${error.message}`);
        } else {
            toast.success('Purchase order created');
            setShowCreate(false);
            setNewOrder({ product_id: '', quantity_ordered: '', notes: '' });
            await load();
        }
        setSaving(false);
    }

    return (
        <Layout title="Purchase Orders">
            <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
                <div className="flex gap-1 flex-wrap">
                    {STATUSES.map((statusOption) => (
                        <button
                            key={statusOption}
                            onClick={() => setStatus(statusOption)}
                            className={`text-xs px-3 py-1.5 rounded-lg capitalize transition-colors font-medium ${
                                status === statusOption
                                    ? 'bg-accent text-white'
                                    : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-200'
                            }`}
                        >
                            {statusOption}
                        </button>
                    ))}
                </div>
                {canCreate && (
                    <button onClick={() => setShowCreate(true)} className="btn-primary flex items-center gap-2">
                        <PlusIcon className="w-4 h-4" />
                        New Order
                    </button>
                )}
            </div>

            <div className="card p-0 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead className="bg-gray-50 border-b border-gray-100">
                            <tr>
                                <th className="table-header">Order #</th>
                                <th className="table-header">Product</th>
                                <th className="table-header">Qty</th>
                                <th className="table-header">Triggered By</th>
                                <th className="table-header">Days to Stockout</th>
                                <th className="table-header">Status</th>
                                <th className="table-header">Created</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr><td colSpan={7} className="text-center py-10"><div className="spinner mx-auto" /></td></tr>
                            ) : filtered.length === 0 ? (
                                <tr>
                                    <td colSpan={7} className="text-center py-10 text-gray-400">
                                        <ShoppingCartIcon className="w-10 h-10 mx-auto mb-2 opacity-30" />
                                        <p className="text-sm">No orders found.</p>
                                    </td>
                                </tr>
                            ) : filtered.map((order) => (
                                <tr key={order.id} className="table-row">
                                    <td className="table-cell font-mono text-xs text-gray-500">{order.order_number}</td>
                                    <td className="table-cell">
                                        <p className="font-medium text-gray-800">{order.products?.name}</p>
                                        <p className="text-xs text-gray-400">{order.products?.sku}</p>
                                    </td>
                                    <td className="table-cell font-bold">{order.quantity_ordered}</td>
                                    <td className="table-cell text-sm">
                                        {order.triggered_by === 'ai_prediction' ? 'Forecast Recommendation' : 'Manual'}
                                    </td>
                                    <td className="table-cell">
                                        {order.predicted_days_until_stockout != null ? (
                                            <span
                                                className={
                                                    order.predicted_days_until_stockout < 7
                                                        ? 'text-red-600 font-bold'
                                                        : order.predicted_days_until_stockout < 14
                                                            ? 'text-yellow-600 font-semibold'
                                                            : 'text-green-600'
                                                }
                                            >
                                                {order.predicted_days_until_stockout} days
                                            </span>
                                        ) : '-'}
                                    </td>
                                    <td className="table-cell">{STATUS_BADGE[order.status]}</td>
                                    <td className="table-cell text-xs text-gray-500">
                                        {order.created_at ? format(new Date(order.created_at), 'MMM d, yyyy') : '-'}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                {!loading && (
                    <div className="px-4 py-2 border-t border-gray-50 text-xs text-gray-400">
                        {filtered.length} orders
                    </div>
                )}
            </div>

            <Dialog open={showCreate} onClose={() => setShowCreate(false)} className="relative z-50">
                <div className="fixed inset-0 bg-black/40" />
                <div className="fixed inset-0 flex items-center justify-center p-4">
                    <Dialog.Panel className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
                        <Dialog.Title className="text-lg font-bold text-gray-800 mb-4">Create Purchase Order</Dialog.Title>
                        <form onSubmit={handleCreate} className="space-y-4">
                            <div>
                                <label className="block text-xs font-medium text-gray-600 mb-1">Product</label>
                                <select
                                    className="input-field"
                                    required
                                    value={newOrder.product_id}
                                    onChange={(event) => {
                                        const product = products.find((row) => row.id === event.target.value);
                                        setNewOrder({
                                            ...newOrder,
                                            product_id: event.target.value,
                                            quantity_ordered: product?.reorder_quantity || '',
                                        });
                                    }}
                                >
                                    <option value="">Select product...</option>
                                    {products.map((product) => (
                                        <option key={product.id} value={product.id}>{product.name} ({product.sku})</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-gray-600 mb-1">Quantity</label>
                                <input
                                    type="number"
                                    min="1"
                                    className="input-field"
                                    required
                                    value={newOrder.quantity_ordered}
                                    onChange={(event) => setNewOrder({ ...newOrder, quantity_ordered: event.target.value })}
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-gray-600 mb-1">Notes</label>
                                <textarea
                                    className="input-field resize-none"
                                    rows={2}
                                    value={newOrder.notes}
                                    onChange={(event) => setNewOrder({ ...newOrder, notes: event.target.value })}
                                />
                            </div>
                            <div className="flex gap-3">
                                <button type="button" onClick={() => setShowCreate(false)} className="btn-secondary flex-1">Cancel</button>
                                <button type="submit" disabled={saving} className="btn-primary flex-1">
                                    {saving ? 'Creating...' : 'Create Order'}
                                </button>
                            </div>
                        </form>
                    </Dialog.Panel>
                </div>
            </Dialog>
        </Layout>
    );
}
