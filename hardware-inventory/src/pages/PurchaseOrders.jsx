import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Dialog } from '@headlessui/react';
import { MagnifyingGlassIcon, PlusIcon, ShoppingCartIcon } from '@heroicons/react/24/outline';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import Layout from '../components/Layout';
import ProductSearchInput from '../components/ProductSearchInput';
import { useAuth } from '../contexts/AuthContext';
import { canCreatePurchaseOrders } from '../lib/roles';
import { supabase } from '../lib/supabase';

const STATUSES = ['all', 'pending', 'approved', 'rejected', 'received'];

const STATUS_BADGE = {
    pending: <span className="badge-pending">Pending</span>,
    approved: <span className="badge-approved">Approved</span>,
    rejected: <span className="badge-rejected">Rejected</span>,
    received: <span className="badge-received">Received</span>,
};

export default function PurchaseOrders() {
    const { role } = useAuth();
    const canCreate = canCreatePurchaseOrders(role);
    const canReceive = ['admin', 'inventory_manager'].includes(role);

    const [orders, setOrders] = useState([]);
    const [products, setProducts] = useState([]);
    const [status, setStatus] = useState('all');
    const [loading, setLoading] = useState(true);
    const [showCreate, setShowCreate] = useState(false);
    const [orderSearch, setOrderSearch] = useState('');
    const [saving, setSaving] = useState(false);
    const [receivingOrderId, setReceivingOrderId] = useState(null);
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
            .select('id, name, sku, category, current_stock, reorder_point, reorder_quantity, supplier_name')
            .eq('active', true)
            .order('name');
        setProducts(productRows || []);
        setLoading(false);
    }, []);

    useEffect(() => {
        load();
    }, [load]);

    const filtered = orders.filter((order) => {
        const matchesStatus = status === 'all' || order.status === status;
        const query = orderSearch.trim().toLowerCase();
        if (!query) return matchesStatus;

        const haystack = [
            order.order_number,
            order.products?.name,
            order.products?.sku,
            order.triggered_by,
            order.status,
            order.notes,
        ]
            .filter(Boolean)
            .join(' ')
            .toLowerCase();
        return matchesStatus && haystack.includes(query);
    });
    const pendingProductIds = useMemo(
        () => new Set(orders.filter((order) => order.status === 'pending').map((order) => order.product_id)),
        [orders]
    );
    const selectedProduct = products.find((product) => product.id === newOrder.product_id);

    async function handleCreate(event) {
        event.preventDefault();
        if (!newOrder.product_id || !newOrder.quantity_ordered) {
            toast.error('Select a product and quantity');
            return;
        }

        const qty = parseInt(newOrder.quantity_ordered, 10);
        if (!qty || qty <= 0) {
            toast.error('Enter a valid quantity');
            return;
        }

        if (pendingProductIds.has(newOrder.product_id)) {
            toast.error('This product already has a pending purchase order');
            return;
        }

        setSaving(true);
        const { error } = await supabase.from('purchase_orders').insert([{
            order_number: `PO-MAN-${Date.now()}`,
            product_id: newOrder.product_id,
            quantity_ordered: qty,
            triggered_by: 'manual',
            status: 'pending',
            notes: newOrder.notes || null,
        }]);

        if (error) {
            const duplicatePending = error.code === '23505' || error.message?.includes('purchase_orders_one_pending_per_product');
            toast.error(duplicatePending
                ? 'This product already has a pending purchase order'
                : `Failed to create order: ${error.message}`);
        } else {
            toast.success('Purchase order created');
            setShowCreate(false);
            setNewOrder({ product_id: '', quantity_ordered: '', notes: '' });
            await load();
        }
        setSaving(false);
    }

    async function handleReceive(order) {
        const confirmed = window.confirm(`Receive ${order.quantity_ordered} units for ${order.products?.name || 'this product'}?`);
        if (!confirmed) return;

        setReceivingOrderId(order.id);
        const { data, error } = await supabase.rpc('receive_purchase_order', {
            p_order_id: order.id,
            p_notes: `Received from ${order.order_number}`,
        });

        if (error) {
            toast.error(`Failed to receive order: ${error.message}`);
        } else {
            toast.success(`Received order. Current stock: ${data.current_stock}`);
            await load();
        }
        setReceivingOrderId(null);
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
                <div className="relative flex-1 min-w-56 max-w-sm">
                    <MagnifyingGlassIcon className="w-4 h-4 text-gray-400 absolute left-3 top-2.5" />
                    <input
                        className="input-field pl-9"
                        placeholder="Search order, SKU, product..."
                        value={orderSearch}
                        onChange={(event) => setOrderSearch(event.target.value)}
                    />
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
                                {canReceive && <th className="table-header">Actions</th>}
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr><td colSpan={canReceive ? 8 : 7} className="text-center py-10"><div className="spinner mx-auto" /></td></tr>
                            ) : filtered.length === 0 ? (
                                <tr>
                                    <td colSpan={canReceive ? 8 : 7} className="text-center py-10 text-gray-400">
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
                                    {canReceive && (
                                        <td className="table-cell">
                                            {order.status === 'approved' ? (
                                                <button
                                                    type="button"
                                                    disabled={receivingOrderId === order.id}
                                                    onClick={() => handleReceive(order)}
                                                    className="btn-secondary py-1.5 px-3 text-xs"
                                                >
                                                    {receivingOrderId === order.id ? 'Receiving...' : 'Receive'}
                                                </button>
                                            ) : (
                                                <span className="text-xs text-gray-400">-</span>
                                            )}
                                        </td>
                                    )}
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
                                <ProductSearchInput
                                    id="purchase-order-product"
                                    products={products}
                                    selectedProductId={newOrder.product_id}
                                    disabledProductIds={pendingProductIds}
                                    getDisabledReason={() => 'Pending order already exists'}
                                    onBlockedSelect={(product) => {
                                        toast.error(`${product.name} already has a pending purchase order`);
                                        setNewOrder((current) => ({ ...current, product_id: '', quantity_ordered: '' }));
                                    }}
                                    onSelectProduct={(productId, product) => {
                                        setNewOrder((current) => ({
                                            ...current,
                                            product_id: productId,
                                            quantity_ordered: product?.reorder_quantity || '',
                                        }));
                                    }}
                                    required
                                    renderSelectedProduct={(product) => (
                                        <div className="mt-2 rounded-lg border border-gray-100 bg-gray-50 px-3 py-2 text-xs text-gray-500">
                                            <div className="flex items-center justify-between gap-3">
                                                <span className="font-medium text-gray-700">{product.name}</span>
                                                <span className="font-mono text-gray-500">{product.sku}</span>
                                            </div>
                                            <div className="mt-1 grid grid-cols-2 gap-2">
                                                <span>Stock: <strong className="text-gray-700">{product.current_stock}</strong></span>
                                                <span>Safety: <strong className="text-gray-700">{product.reorder_point}</strong></span>
                                                <span>Reorder: <strong className="text-gray-700">{product.reorder_quantity}</strong></span>
                                                <span className="truncate">{product.supplier_name || 'No supplier'}</span>
                                            </div>
                                        </div>
                                    )}
                                />
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
                                {selectedProduct && Number(newOrder.quantity_ordered || 0) < selectedProduct.reorder_quantity && (
                                    <p className="mt-1 text-xs text-yellow-700">
                                        Suggested reorder quantity is {selectedProduct.reorder_quantity}.
                                    </p>
                                )}
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
