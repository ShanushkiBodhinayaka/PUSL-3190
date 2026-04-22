import React, { useEffect, useState, useCallback } from 'react';
import Layout from '../components/Layout';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { format } from 'date-fns';
import { CheckCircleIcon, XCircleIcon, PencilSquareIcon } from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';
import { Dialog } from '@headlessui/react';

export default function OrderApproval() {
    const { user } = useAuth();
    const [orders, setOrders] = useState([]);
    const [loading, setLoading] = useState(true);

    // Reject modal
    const [rejectTarget, setRejectTarget] = useState(null);
    const [rejectNote, setRejectNote] = useState('');
    const [saving, setSaving] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        const { data, error } = await supabase
            .from('purchase_orders')
            .select('*, products(name, sku, current_stock, reorder_point, unit_price, supplier_name)')
            .eq('status', 'pending')
            .order('created_at', { ascending: false });
        if (error) toast.error('Failed to load orders');
        else setOrders(data || []);
        setLoading(false);
    }, []);

    // Realtime listener
    useEffect(() => {
        load();
        const channel = supabase
            .channel('purchase_orders_changes')
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'purchase_orders' },
                () => load()
            )
            .subscribe();
        return () => supabase.removeChannel(channel);
    }, [load]);

    async function handleApprove(order) {
        setSaving(true);
        const { error } = await supabase
            .from('purchase_orders')
            .update({
                status: 'approved',
                approved_by: user?.id,
                approved_at: new Date().toISOString(),
            })
            .eq('id', order.id);
        if (error) toast.error('Failed to approve: ' + error.message);
        else {
            toast.success(`✅ Order ${order.order_number} approved!`);
            load();
        }
        setSaving(false);
    }

    async function handleReject() {
        if (!rejectTarget) return;
        setSaving(true);
        const { error } = await supabase
            .from('purchase_orders')
            .update({
                status: 'rejected',
                notes: rejectNote || 'Rejected by manager',
                approved_by: user?.id,
                approved_at: new Date().toISOString(),
            })
            .eq('id', rejectTarget.id);
        if (error) toast.error('Failed to reject: ' + error.message);
        else {
            toast.success(`Order ${rejectTarget.order_number} rejected.`);
            setRejectTarget(null);
            setRejectNote('');
            load();
        }
        setSaving(false);
    }

    async function handleAddNote(order, note) {
        if (!note) return;
        const { error } = await supabase
            .from('purchase_orders')
            .update({ notes: note })
            .eq('id', order.id);
        if (!error) toast.success('Note updated');
    }

    const getStockBar = (p) => {
        if (!p) return null;
        const pct = Math.min(100, Math.round((p.current_stock / Math.max(p.reorder_point * 3, 1)) * 100));
        const color = p.current_stock <= p.reorder_point / 2 ? 'bg-red-500' :
            p.current_stock <= p.reorder_point ? 'bg-yellow-400' : 'bg-green-400';
        return { pct, color };
    };

    return (
        <Layout title="Order Approval">
            <div className="mb-4 flex items-center gap-2">
                <span className="badge-pending text-sm px-3 py-1">{orders.length} Pending</span>
                <p className="text-sm text-gray-500">Orders update in real-time.</p>
            </div>

            {loading ? (
                <div className="flex justify-center py-16"><div className="spinner" /></div>
            ) : orders.length === 0 ? (
                <div className="card text-center py-16">
                    <CheckCircleIcon className="w-12 h-12 text-green-400 mx-auto mb-3" />
                    <p className="text-gray-600 font-medium">All caught up! No pending orders.</p>
                </div>
            ) : (
                <div className="space-y-4">
                    {orders.map((order) => {
                        const bar = getStockBar(order.products);
                        return (
                            <div key={order.id} className="card border-l-4 border-l-accent fade-in">
                                <div className="flex flex-col lg:flex-row lg:items-center gap-4">
                                    {/* Order info */}
                                    <div className="flex-1">
                                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                                            <p className="font-bold text-gray-800">{order.products?.name}</p>
                                            <span className="text-xs text-gray-400 font-mono">{order.order_number}</span>
                                            <span className="badge-pending">Pending</span>
                                        </div>
                                        <p className="text-xs text-gray-500 mb-3">
                                            {order.triggered_by === 'ai_prediction' ? '🤖 AI Prediction' : '✋ Manual'} •{' '}
                                            SKU: {order.products?.sku} •{' '}
                                            Supplier: {order.products?.supplier_name || 'N/A'}
                                        </p>

                                        {/* AI details */}
                                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
                                            <div className="bg-gray-50 rounded-lg p-2">
                                                <p className="text-xs text-gray-400">Quantity Ordered</p>
                                                <p className="font-bold text-gray-800">{order.quantity_ordered} units</p>
                                            </div>
                                            <div className="bg-gray-50 rounded-lg p-2">
                                                <p className="text-xs text-gray-400">Current Stock</p>
                                                <p className={`font-bold ${order.products?.current_stock <= (order.products?.reorder_point / 2) ? 'text-red-600' :
                                                        order.products?.current_stock <= order.products?.reorder_point ? 'text-yellow-600' : 'text-green-700'
                                                    }`}>
                                                    {order.products?.current_stock ?? '—'} units
                                                </p>
                                            </div>
                                            <div className="bg-gray-50 rounded-lg p-2">
                                                <p className="text-xs text-gray-400">Days to Stockout</p>
                                                <p className={`font-bold ${order.predicted_days_until_stockout < 7 ? 'text-red-600' :
                                                        order.predicted_days_until_stockout < 14 ? 'text-yellow-600' : 'text-green-700'
                                                    }`}>
                                                    {order.predicted_days_until_stockout ?? '—'} days
                                                </p>
                                            </div>
                                            <div className="bg-gray-50 rounded-lg p-2">
                                                <p className="text-xs text-gray-400">Unit Price</p>
                                                <p className="font-bold text-gray-800">
                                                    ${parseFloat(order.products?.unit_price || 0).toFixed(2)}
                                                </p>
                                            </div>
                                        </div>

                                        {/* Stock bar */}
                                        {bar && (
                                            <div>
                                                <div className="flex justify-between text-xs text-gray-500 mb-1">
                                                    <span>Stock level</span>
                                                    <span>Reorder at {order.products?.reorder_point}</span>
                                                </div>
                                                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                                                    <div className={`h-2 rounded-full ${bar.color}`} style={{ width: `${bar.pct}%` }} />
                                                </div>
                                            </div>
                                        )}

                                        {order.notes && (
                                            <p className="text-xs text-gray-500 mt-2 italic">📝 {order.notes}</p>
                                        )}
                                        <p className="text-xs text-gray-400 mt-2">
                                            Created: {format(new Date(order.created_at), 'MMM d, yyyy h:mm a')}
                                        </p>
                                    </div>

                                    {/* Action buttons */}
                                    <div className="flex flex-row lg:flex-col gap-2 flex-shrink-0">
                                        <button
                                            disabled={saving}
                                            onClick={() => handleApprove(order)}
                                            className="btn-success flex items-center gap-2 flex-1 lg:flex-auto justify-center"
                                        >
                                            <CheckCircleIcon className="w-4 h-4" />
                                            Approve
                                        </button>
                                        <button
                                            onClick={() => { setRejectTarget(order); setRejectNote(''); }}
                                            className="btn-danger flex items-center gap-2 flex-1 lg:flex-auto justify-center"
                                        >
                                            <XCircleIcon className="w-4 h-4" />
                                            Reject
                                        </button>
                                        <RequestChangesButton order={order} onSave={handleAddNote} />
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Reject Modal */}
            <Dialog open={!!rejectTarget} onClose={() => setRejectTarget(null)} className="relative z-50">
                <div className="fixed inset-0 bg-black/40" />
                <div className="fixed inset-0 flex items-center justify-center p-4">
                    <Dialog.Panel className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
                        <Dialog.Title className="text-lg font-bold text-gray-800 mb-1">Reject Order</Dialog.Title>
                        <p className="text-sm text-gray-500 mb-4">
                            Rejecting: <strong>{rejectTarget?.order_number}</strong>
                        </p>
                        <textarea
                            className="input-field resize-none mb-4"
                            rows={3}
                            placeholder="Enter rejection reason (optional)…"
                            value={rejectNote}
                            onChange={(e) => setRejectNote(e.target.value)}
                        />
                        <div className="flex gap-3">
                            <button onClick={() => setRejectTarget(null)} className="btn-secondary flex-1">Cancel</button>
                            <button onClick={handleReject} disabled={saving} className="btn-danger flex-1">
                                {saving ? 'Rejecting…' : 'Confirm Reject'}
                            </button>
                        </div>
                    </Dialog.Panel>
                </div>
            </Dialog>
        </Layout>
    );
}

function RequestChangesButton({ order, onSave }) {
    const [show, setShow] = useState(false);
    const [note, setNote] = useState(order.notes || '');
    const [saving, setSaving] = useState(false);

    async function save() {
        setSaving(true);
        await onSave(order, note);
        setSaving(false);
        setShow(false);
    }

    if (!show) {
        return (
            <button
                onClick={() => setShow(true)}
                className="btn-secondary flex items-center gap-2 flex-1 lg:flex-auto justify-center text-sm"
            >
                <PencilSquareIcon className="w-4 h-4" />
                Note
            </button>
        );
    }

    return (
        <div className="flex flex-col gap-1">
            <textarea
                className="input-field resize-none text-xs"
                rows={2}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                autoFocus
            />
            <div className="flex gap-1">
                <button onClick={() => setShow(false)} className="btn-secondary flex-1 text-xs">Cancel</button>
                <button onClick={save} disabled={saving} className="btn-primary flex-1 text-xs">
                    {saving ? '…' : 'Save'}
                </button>
            </div>
        </div>
    );
}
