import React, { useEffect, useState } from 'react';
import Layout from '../components/Layout';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { getStockStatus } from '../lib/predictions';
import {
    CubeIcon,
    ExclamationTriangleIcon,
    ShoppingCartIcon,
    ArrowsRightLeftIcon,
    ClockIcon,
} from '@heroicons/react/24/outline';
import { format } from 'date-fns';

function StatCard({ icon: Icon, label, value, color = 'bg-amber-50 text-amber-600' }) {
    return (
        <div className="stat-card">
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${color}`}>
                <Icon className="w-6 h-6" />
            </div>
            <div>
                <p className="text-2xl font-bold text-gray-800">{value ?? '—'}</p>
                <p className="text-sm text-gray-500">{label}</p>
            </div>
        </div>
    );
}

export default function Dashboard() {
    const { role, profile } = useAuth();
    const [stats, setStats] = useState({});
    const [movements, setMovements] = useState([]);
    const [lowStock, setLowStock] = useState([]);
    const [pendingOrders, setPendingOrders] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        async function load() {
            setLoading(true);
            const [
                { data: products },
                { data: recentMovements },
                { data: orders },
            ] = await Promise.all([
                supabase.from('products').select('*'),
                supabase
                    .from('stock_movements')
                    .select('*, products(name)')
                    .order('created_at', { ascending: false })
                    .limit(8),
                supabase
                    .from('purchase_orders')
                    .select('*, products(name)')
                    .eq('status', 'pending'),
            ]);

            const low = (products || []).filter(
                (p) => getStockStatus(p) === 'low' || getStockStatus(p) === 'critical'
            );

            setStats({
                totalProducts: products?.length || 0,
                lowStockCount: low.length,
                pendingOrdersCount: orders?.length || 0,
            });
            setLowStock(low.slice(0, 5));
            setMovements(recentMovements || []);
            setPendingOrders(orders || []);
            setLoading(false);
        }
        load();
    }, []);

    const greeting = () => {
        const hour = new Date().getHours();
        if (hour < 12) return 'Good morning';
        if (hour < 17) return 'Good afternoon';
        return 'Good evening';
    };

    const MOVEMENT_TYPE_COLOR = {
        sale: 'bg-red-100 text-red-700',
        restock: 'bg-green-100 text-green-700',
        adjustment: 'bg-blue-100 text-blue-700',
        damage: 'bg-orange-100 text-orange-700',
    };

    if (loading) {
        return (
            <Layout title="Dashboard">
                <div className="flex items-center justify-center h-64">
                    <div className="spinner" />
                </div>
            </Layout>
        );
    }

    return (
        <Layout title="Dashboard">
            {/* Greeting */}
            <div className="mb-6">
                <h2 className="text-2xl font-bold text-gray-800">
                    {greeting()}, {profile?.full_name?.split(' ')[0] || 'there'} 👋
                </h2>
                <p className="text-gray-500 text-sm mt-1">
                    {format(new Date(), 'EEEE, MMMM d, yyyy')} — Here's your inventory overview.
                </p>
            </div>

            {/* Stats row — visible based on role */}
            {(role === 'admin' || role === 'warehouse_manager' || role === 'approval_manager') && (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
                    {role === 'admin' && (
                        <StatCard
                            icon={CubeIcon}
                            label="Total Products"
                            value={stats.totalProducts}
                            color="bg-blue-50 text-blue-600"
                        />
                    )}
                    <StatCard
                        icon={ExclamationTriangleIcon}
                        label="Low Stock Items"
                        value={stats.lowStockCount}
                        color="bg-yellow-50 text-yellow-600"
                    />
                    <StatCard
                        icon={ShoppingCartIcon}
                        label="Pending Orders"
                        value={stats.pendingOrdersCount}
                        color="bg-purple-50 text-purple-600"
                    />
                </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Low Stock Alerts */}
                {(role !== 'cashier') && (
                    <div className="card">
                        <div className="flex items-center gap-2 mb-4">
                            <ExclamationTriangleIcon className="w-5 h-5 text-yellow-500" />
                            <h3 className="font-semibold text-gray-800">Low Stock Alerts</h3>
                        </div>
                        {lowStock.length === 0 ? (
                            <div className="text-center py-8 text-gray-400">
                                <CubeIcon className="w-10 h-10 mx-auto mb-2 opacity-30" />
                                <p className="text-sm">All stock levels are healthy!</p>
                            </div>
                        ) : (
                            <div className="space-y-2">
                                {lowStock.map((p) => {
                                    const s = getStockStatus(p);
                                    return (
                                        <div key={p.id} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                                            <div>
                                                <p className="text-sm font-medium text-gray-700">{p.name}</p>
                                                <p className="text-xs text-gray-400">{p.sku}</p>
                                            </div>
                                            <div className="text-right">
                                                <p className="text-sm font-bold text-gray-700">{p.current_stock} units</p>
                                                <span className={s === 'critical' ? 'badge-critical' : 'badge-low'}>
                                                    {s === 'critical' ? 'Critical' : 'Low'}
                                                </span>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                )}

                {/* Recent Movements */}
                <div className="card">
                    <div className="flex items-center gap-2 mb-4">
                        <ArrowsRightLeftIcon className="w-5 h-5 text-blue-500" />
                        <h3 className="font-semibold text-gray-800">Recent Stock Movements</h3>
                    </div>
                    {movements.length === 0 ? (
                        <div className="text-center py-8 text-gray-400">
                            <ClockIcon className="w-10 h-10 mx-auto mb-2 opacity-30" />
                            <p className="text-sm">No recent movements recorded.</p>
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {movements.map((m) => (
                                <div key={m.id} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                                    <div>
                                        <p className="text-sm font-medium text-gray-700">{m.products?.name}</p>
                                        <p className="text-xs text-gray-400">
                                            {format(new Date(m.created_at), 'MMM d, h:mm a')}
                                        </p>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${MOVEMENT_TYPE_COLOR[m.movement_type]}`}>
                                            {m.movement_type}
                                        </span>
                                        <span className="text-sm font-bold text-gray-700">
                                            {m.movement_type === 'sale' || m.movement_type === 'damage' ? '-' : '+'}{m.quantity}
                                        </span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Pending Orders (for approval_manager / admin) */}
                {(role === 'approval_manager' || role === 'admin') && (
                    <div className="card lg:col-span-2">
                        <div className="flex items-center gap-2 mb-4">
                            <ShoppingCartIcon className="w-5 h-5 text-purple-500" />
                            <h3 className="font-semibold text-gray-800">
                                Pending Orders Awaiting Approval ({pendingOrders.length})
                            </h3>
                        </div>
                        {pendingOrders.length === 0 ? (
                            <div className="text-center py-8 text-gray-400">
                                <p className="text-sm">No orders awaiting approval.</p>
                            </div>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full">
                                    <thead>
                                        <tr className="border-b border-gray-100">
                                            <th className="table-header">Order #</th>
                                            <th className="table-header">Product</th>
                                            <th className="table-header">Qty</th>
                                            <th className="table-header">Triggered By</th>
                                            <th className="table-header">Days to Stockout</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {pendingOrders.map((o) => (
                                            <tr key={o.id} className="table-row">
                                                <td className="table-cell font-mono text-xs">{o.order_number}</td>
                                                <td className="table-cell">{o.products?.name}</td>
                                                <td className="table-cell font-semibold">{o.quantity_ordered}</td>
                                                <td className="table-cell capitalize">
                                                    {o.triggered_by === 'ai_prediction' ? '🤖 AI' : '✋ Manual'}
                                                </td>
                                                <td className="table-cell">
                                                    <span className={
                                                        o.predicted_days_until_stockout < 7 ? 'text-red-600 font-bold' :
                                                            o.predicted_days_until_stockout < 14 ? 'text-yellow-600 font-semibold' :
                                                                'text-green-600'
                                                    }>
                                                        {o.predicted_days_until_stockout ?? '—'} days
                                                    </span>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                )}

                {/* Cashier: quick notes */}
                {role === 'cashier' && (
                    <div className="card">
                        <h3 className="font-semibold text-gray-800 mb-2">Quick Tips</h3>
                        <ul className="text-sm text-gray-600 space-y-2 list-disc pl-4">
                            <li>Use <strong>Stock Movements</strong> to record sales.</li>
                            <li>Select the product, set type to <strong>Sale</strong>, enter quantity.</li>
                            <li>Check <strong>Purchase Orders</strong> to see restock status.</li>
                        </ul>
                    </div>
                )}

                {/* Worker widget */}
                {role === 'worker' && (
                    <div className="card">
                        <h3 className="font-semibold text-gray-800 mb-3">Items to Restock</h3>
                        {lowStock.length === 0 ? (
                            <p className="text-sm text-gray-400">No urgent restocks needed.</p>
                        ) : (
                            <ul className="space-y-2">
                                {lowStock.map((p) => (
                                    <li key={p.id} className="flex justify-between text-sm">
                                        <span className="text-gray-700">{p.name}</span>
                                        <span className="font-bold text-gray-800">{p.current_stock} left</span>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                )}
            </div>
        </Layout>
    );
}
