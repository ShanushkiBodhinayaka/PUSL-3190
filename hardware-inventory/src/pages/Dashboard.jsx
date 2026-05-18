import React, { useEffect, useState } from 'react';
import { format } from 'date-fns';
import {
    ArrowsRightLeftIcon,
    CheckCircleIcon,
    ClockIcon,
    CpuChipIcon,
    CubeIcon,
    DocumentArrowUpIcon,
    ExclamationTriangleIcon,
    ShoppingCartIcon,
} from '@heroicons/react/24/outline';
import Layout from '../components/Layout';
import { useAuth } from '../contexts/AuthContext';
import { getStockStatus } from '../lib/predictions';
import { supabase } from '../lib/supabase';

function StatCard({ icon: Icon, label, value, color = 'bg-amber-50 text-amber-600' }) {
    return (
        <div className="stat-card">
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${color}`}>
                <Icon className="w-6 h-6" />
            </div>
            <div>
                <p className="text-2xl font-bold text-gray-800">{value ?? '-'}</p>
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
            const results = await Promise.allSettled([
                supabase.from('products').select('*').eq('active', true),
                supabase
                    .from('stock_movements')
                    .select('*, products(name)')
                    .order('created_at', { ascending: false })
                    .limit(8),
                supabase
                    .from('purchase_orders')
                    .select('*, products(name)')
                    .eq('status', 'pending'),
                supabase
                    .from('purchase_orders')
                    .select('id', { count: 'exact', head: true })
                    .eq('status', 'approved'),
                supabase
                    .from('sales')
                    .select('id', { count: 'exact', head: true })
                    .gte('created_at', new Date(new Date().setHours(0, 0, 0, 0)).toISOString()),
                supabase
                    .from('sales_import_batches')
                    .select('id', { count: 'exact', head: true })
                    .gte('imported_at', new Date(new Date().setHours(0, 0, 0, 0)).toISOString()),
                supabase
                    .from('demand_forecasts')
                    .select('product_id,reorder_signal,generated_at')
                    .eq('reorder_signal', true)
                    .order('generated_at', { ascending: false })
                    .limit(200),
            ]);

            const val = (i, key) => results[i].status === 'fulfilled' ? results[i].value[key] : null;
            const products = val(0, 'data');
            const recentMovements = val(1, 'data');
            const orders = val(2, 'data');
            const receivableOrders = val(3, 'count');
            const salesToday = val(4, 'count');
            const importsToday = val(5, 'count');
            const forecastRows = val(6, 'data');

            const low = (products || []).filter(
                (product) => getStockStatus(product) === 'low' || getStockStatus(product) === 'critical'
            );

            setStats({
                totalProducts: products?.length || 0,
                lowStockCount: low.length,
                pendingOrdersCount: orders?.length || 0,
                receivableOrdersCount: receivableOrders || 0,
                salesTodayCount: salesToday || 0,
                importsTodayCount: importsToday || 0,
                forecastCriticalCount: new Set((forecastRows || []).map((row) => row.product_id)).size,
            });
            setLowStock(low.slice(0, 5));
            setMovements(recentMovements || []);
            setPendingOrders(orders || []);
            setLoading(false);
        }

        load();
    }, []);

    function greeting() {
        const hour = new Date().getHours();
        if (hour < 12) return 'Good morning';
        if (hour < 17) return 'Good afternoon';
        return 'Good evening';
    }

    const movementTypeColor = {
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
            <div className="mb-6">
                <h2 className="text-2xl font-bold text-gray-800">
                    {greeting()}, {profile?.full_name?.split(' ')[0] || 'there'}
                </h2>
                <p className="text-gray-500 text-sm mt-1">
                    {format(new Date(), 'EEEE, MMMM d, yyyy')} - Here is your inventory overview.
                </p>
            </div>

            {(role === 'admin' || role === 'inventory_manager' || role === 'approval_manager') && (
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-6 gap-4 mb-6">
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
                    <StatCard
                        icon={CheckCircleIcon}
                        label="Ready to Receive"
                        value={stats.receivableOrdersCount}
                        color="bg-green-50 text-green-600"
                    />
                    <StatCard
                        icon={DocumentArrowUpIcon}
                        label="Sales Today"
                        value={stats.salesTodayCount}
                        color="bg-blue-50 text-blue-600"
                    />
                    <StatCard
                        icon={CpuChipIcon}
                        label="Forecast Reorders"
                        value={stats.forecastCriticalCount}
                        color="bg-red-50 text-red-600"
                    />
                </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {role !== 'sales_operator' && (
                    <div className="card">
                        <div className="flex items-center gap-2 mb-4">
                            <ExclamationTriangleIcon className="w-5 h-5 text-yellow-500" />
                            <h3 className="font-semibold text-gray-800">Low Stock Alerts</h3>
                        </div>
                        {lowStock.length === 0 ? (
                            <div className="text-center py-8 text-gray-400">
                                <CubeIcon className="w-10 h-10 mx-auto mb-2 opacity-30" />
                                <p className="text-sm">All stock levels are healthy.</p>
                            </div>
                        ) : (
                            <div className="space-y-2">
                                {lowStock.map((product) => {
                                    const stockStatus = getStockStatus(product);
                                    return (
                                        <div key={product.id} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                                            <div>
                                                <p className="text-sm font-medium text-gray-700">{product.name}</p>
                                                <p className="text-xs text-gray-400">{product.sku}</p>
                                            </div>
                                            <div className="text-right">
                                                <p className="text-sm font-bold text-gray-700">{product.current_stock} units</p>
                                                <span className={stockStatus === 'critical' ? 'badge-critical' : 'badge-low'}>
                                                    {stockStatus === 'critical' ? 'Critical' : 'Low'}
                                                </span>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                )}

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
                            {movements.map((movement) => (
                                <div key={movement.id} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                                    <div>
                                        <p className="text-sm font-medium text-gray-700">{movement.products?.name}</p>
                                        <p className="text-xs text-gray-400">
                                            {format(new Date(movement.created_at), 'MMM d, h:mm a')}
                                        </p>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${movementTypeColor[movement.movement_type]}`}>
                                            {movement.movement_type}
                                        </span>
                                        <span className="text-sm font-bold text-gray-700">
                                            {movement.movement_type === 'sale' || movement.movement_type === 'damage' ? '-' : '+'}
                                            {movement.quantity}
                                        </span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

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
                                        {pendingOrders.map((order) => (
                                            <tr key={order.id} className="table-row">
                                                <td className="table-cell font-mono text-xs">{order.order_number}</td>
                                                <td className="table-cell">{order.products?.name}</td>
                                                <td className="table-cell font-semibold">{order.quantity_ordered}</td>
                                                <td className="table-cell capitalize">
                                                    {order.triggered_by === 'ai_prediction' ? 'Forecast Recommendation' : 'Manual'}
                                                </td>
                                                <td className="table-cell">
                                                    <span
                                                        className={
                                                            order.predicted_days_until_stockout < 7
                                                                ? 'text-red-600 font-bold'
                                                                : order.predicted_days_until_stockout < 14
                                                                    ? 'text-yellow-600 font-semibold'
                                                                    : 'text-green-600'
                                                        }
                                                    >
                                                        {order.predicted_days_until_stockout ?? '-'} days
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


{role === 'staff' && (
                    <div className="card">
                        <h3 className="font-semibold text-gray-800 mb-3">Items to Restock</h3>
                        {lowStock.length === 0 ? (
                            <p className="text-sm text-gray-400">No urgent restocks needed.</p>
                        ) : (
                            <ul className="space-y-2">
                                {lowStock.map((product) => (
                                    <li key={product.id} className="flex justify-between text-sm">
                                        <span className="text-gray-700">{product.name}</span>
                                        <span className="font-bold text-gray-800">{product.current_stock} left</span>
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
