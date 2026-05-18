import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { format, subDays } from 'date-fns';
import { ChartBarIcon } from '@heroicons/react/24/outline';
import {
    Area,
    AreaChart,
    Bar,
    BarChart,
    CartesianGrid,
    Cell,
    Pie,
    PieChart,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from 'recharts';
import Layout from '../components/Layout';
import { getStockStatus } from '../lib/predictions';
import { supabase } from '../lib/supabase';

const STOCK_HEALTH_COLORS = {
    'OK': '#10b981',
    'Low': '#f59e0b',
    'Critical': '#ef4444',
    'Out of Stock': '#6b7280',
};

const PO_STATUS_COLORS = {
    pending: '#f59e0b',
    approved: '#3b82f6',
    received: '#10b981',
    rejected: '#ef4444',
};

export default function Reports() {
    const [products, setProducts] = useState([]);
    const [topProducts, setTopProducts] = useState([]);
    const [allOrders, setAllOrders] = useState([]);
    const [salesMovements, setSalesMovements] = useState([]);
    const [importBatches, setImportBatches] = useState([]);
    const [loading, setLoading] = useState(true);

    const load = useCallback(async () => {
        setLoading(true);
        const thirtyDaysAgo = subDays(new Date(), 30).toISOString();

        const [
            { data: movements },
            { data: orders },
            { data: productRows },
            { data: batches },
        ] = await Promise.all([
            supabase
                .from('stock_movements')
                .select('product_id, quantity, created_at, products(name, sku, category)')
                .eq('movement_type', 'sale')
                .gte('created_at', thirtyDaysAgo),
            supabase
                .from('purchase_orders')
                .select('*, products(name, sku)')
                .order('created_at', { ascending: false }),
            supabase
                .from('products')
                .select('id, current_stock, reorder_point')
                .eq('active', true),
            supabase
                .from('sales_import_batches')
                .select('total_amount, total_units, imported_at')
                .gte('imported_at', thirtyDaysAgo)
                .order('imported_at', { ascending: true }),
        ]);

        const consumed = {};
        (movements || []).forEach((movement) => {
            const productId = movement.product_id;
            const current = consumed[productId] || {
                id: productId,
                name: movement.products?.name || productId,
                qty: 0,
            };
            consumed[productId] = { ...current, qty: current.qty + movement.quantity };
        });

        const sortedTopProducts = Object.values(consumed)
            .sort((a, b) => b.qty - a.qty)
            .slice(0, 10)
            .map(({ name, qty }) => ({
                name: name.length > 22 ? `${name.slice(0, 22)}…` : name,
                qty,
            }));

        setTopProducts(sortedTopProducts);
        setSalesMovements(movements || []);
        setAllOrders(orders || []);
        setProducts(productRows || []);
        setImportBatches(batches || []);
        setLoading(false);
    }, []);

    useEffect(() => {
        load();
    }, [load]);

    const revenueTrend = useMemo(() => {
        const rows = [];
        for (let i = 29; i >= 0; i--) {
            const dayDate = subDays(new Date(), i);
            const dayKey = format(dayDate, 'yyyy-MM-dd');
            const dayBatches = importBatches.filter(
                (batch) => format(new Date(batch.imported_at), 'yyyy-MM-dd') === dayKey
            );
            rows.push({
                day: format(dayDate, 'MMM d'),
                revenue: dayBatches.reduce((sum, b) => sum + Number(b.total_amount || 0), 0),
            });
        }
        return rows;
    }, [importBatches]);

    const stockHealth = useMemo(() => {
        const counts = { 'OK': 0, 'Low': 0, 'Critical': 0, 'Out of Stock': 0 };
        products.forEach((product) => {
            const status = getStockStatus(product);
            if (status === 'ok') counts['OK']++;
            else if (status === 'low') counts['Low']++;
            else if (status === 'critical') counts['Critical']++;
            else counts['Out of Stock']++;
        });
        return Object.entries(counts)
            .filter(([, count]) => count > 0)
            .map(([name, value]) => ({ name, value }));
    }, [products]);

    const categoryData = useMemo(() => {
        const cats = {};
        salesMovements.forEach((movement) => {
            const cat = movement.products?.category || 'Uncategorized';
            cats[cat] = (cats[cat] || 0) + movement.quantity;
        });
        return Object.entries(cats)
            .map(([name, qty]) => ({ name, qty }))
            .sort((a, b) => b.qty - a.qty);
    }, [salesMovements]);

    const poStatusData = useMemo(() => {
        const counts = {};
        allOrders.forEach((order) => {
            counts[order.status] = (counts[order.status] || 0) + 1;
        });
        return Object.entries(counts).map(([name, value]) => ({ name, value }));
    }, [allOrders]);

    const totalRevenue = importBatches.reduce((sum, b) => sum + Number(b.total_amount || 0), 0);
    const totalUnits = importBatches.reduce((sum, b) => sum + Number(b.total_units || 0), 0);

    const statusColor = {
        pending: 'badge-pending',
        approved: 'badge-approved',
        rejected: 'badge-rejected',
        received: 'badge-received',
    };

    if (loading) {
        return <Layout title="Reports"><div className="flex justify-center py-16"><div className="spinner" /></div></Layout>;
    }

    return (
        <Layout title="Reports">
            <div className="space-y-6">

                {/* Revenue Trend */}
                <div className="card">
                    <div className="flex items-start justify-between mb-4 flex-wrap gap-3">
                        <div>
                            <h3 className="font-bold text-gray-800 flex items-center gap-2">
                                <ChartBarIcon className="w-5 h-5 text-accent" />
                                Revenue Trend — Last 30 Days
                            </h3>
                            <p className="text-sm text-gray-500 mt-0.5">Daily sales revenue from import batches</p>
                        </div>
                        <div className="flex gap-6 text-right">
                            <div>
                                <p className="text-xs text-gray-400">Total Revenue</p>
                                <p className="text-lg font-bold text-gray-800">
                                    Rs {totalRevenue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </p>
                            </div>
                            <div>
                                <p className="text-xs text-gray-400">Total Units</p>
                                <p className="text-lg font-bold text-gray-800">{totalUnits.toLocaleString()}</p>
                            </div>
                        </div>
                    </div>
                    <ResponsiveContainer width="100%" height={240}>
                        <AreaChart data={revenueTrend}>
                            <defs>
                                <linearGradient id="revenueGradient" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.3} />
                                    <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
                                </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                            <XAxis dataKey="day" tick={{ fontSize: 11 }} interval={4} />
                            <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `Rs ${v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}`} />
                            <Tooltip formatter={(value) => [`Rs ${Number(value).toFixed(2)}`, 'Revenue']} />
                            <Area
                                type="monotone"
                                dataKey="revenue"
                                stroke="#f59e0b"
                                strokeWidth={2}
                                fill="url(#revenueGradient)"
                                name="Revenue"
                            />
                        </AreaChart>
                    </ResponsiveContainer>
                </div>

                {/* Stock Health + PO Status */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <div className="card">
                        <h3 className="font-bold text-gray-800 mb-1">Stock Health Snapshot</h3>
                        <p className="text-sm text-gray-500 mb-4">{products.length} active products</p>
                        {stockHealth.length === 0 ? (
                            <p className="text-sm text-gray-400">No product data.</p>
                        ) : (
                            <div className="flex items-center gap-6">
                                <PieChart width={160} height={160}>
                                    <Pie
                                        data={stockHealth}
                                        cx={80}
                                        cy={80}
                                        innerRadius={45}
                                        outerRadius={72}
                                        paddingAngle={3}
                                        dataKey="value"
                                    >
                                        {stockHealth.map((entry) => (
                                            <Cell key={entry.name} fill={STOCK_HEALTH_COLORS[entry.name]} />
                                        ))}
                                    </Pie>
                                    <Tooltip />
                                </PieChart>
                                <div className="space-y-3 flex-1">
                                    {stockHealth.map((entry) => (
                                        <div key={entry.name} className="flex items-center gap-2">
                                            <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: STOCK_HEALTH_COLORS[entry.name] }} />
                                            <span className="text-sm text-gray-600">{entry.name}</span>
                                            <span className="text-sm font-bold text-gray-800 ml-auto">{entry.value}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="card">
                        <h3 className="font-bold text-gray-800 mb-1">Purchase Order Status</h3>
                        <p className="text-sm text-gray-500 mb-4">{allOrders.length} total orders</p>
                        {poStatusData.length === 0 ? (
                            <p className="text-sm text-gray-400">No orders yet.</p>
                        ) : (
                            <div className="flex items-center gap-6">
                                <PieChart width={160} height={160}>
                                    <Pie
                                        data={poStatusData}
                                        cx={80}
                                        cy={80}
                                        innerRadius={45}
                                        outerRadius={72}
                                        paddingAngle={3}
                                        dataKey="value"
                                    >
                                        {poStatusData.map((entry) => (
                                            <Cell key={entry.name} fill={PO_STATUS_COLORS[entry.name] || '#6b7280'} />
                                        ))}
                                    </Pie>
                                    <Tooltip />
                                </PieChart>
                                <div className="space-y-3 flex-1">
                                    {poStatusData.map((entry) => (
                                        <div key={entry.name} className="flex items-center gap-2">
                                            <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: PO_STATUS_COLORS[entry.name] || '#6b7280' }} />
                                            <span className="text-sm text-gray-600 capitalize">{entry.name}</span>
                                            <span className="text-sm font-bold text-gray-800 ml-auto">{entry.value}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* Sales by Category + Top 10 */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <div className="card">
                        <h3 className="font-bold text-gray-800 mb-4">Sales by Category (Last 30 Days)</h3>
                        {categoryData.length === 0 ? (
                            <p className="text-sm text-gray-400">No sales data.</p>
                        ) : (
                            <ResponsiveContainer width="100%" height={260}>
                                <BarChart data={categoryData} layout="vertical">
                                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                                    <XAxis type="number" tick={{ fontSize: 11 }} />
                                    <YAxis dataKey="name" type="category" width={90} tick={{ fontSize: 11 }} />
                                    <Tooltip formatter={(v) => [v, 'Units Sold']} />
                                    <Bar dataKey="qty" fill="#3b82f6" radius={[0, 4, 4, 0]} name="Units Sold" />
                                </BarChart>
                            </ResponsiveContainer>
                        )}
                    </div>

                    <div className="card">
                        <h3 className="font-bold text-gray-800 mb-4">Top 10 Most Sold Products (Last 30 Days)</h3>
                        {topProducts.length === 0 ? (
                            <p className="text-sm text-gray-400">No sales data.</p>
                        ) : (
                            <ResponsiveContainer width="100%" height={260}>
                                <BarChart data={topProducts} layout="vertical">
                                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                                    <XAxis type="number" tick={{ fontSize: 11 }} />
                                    <YAxis dataKey="name" type="category" width={110} tick={{ fontSize: 11 }} />
                                    <Tooltip formatter={(v) => [v, 'Units Sold']} />
                                    <Bar dataKey="qty" fill="#f59e0b" radius={[0, 4, 4, 0]} name="Units Sold" />
                                </BarChart>
                            </ResponsiveContainer>
                        )}
                    </div>
                </div>

                {/* PO History Table */}
                <div className="card p-0 overflow-hidden">
                    <div className="px-4 py-3 border-b border-gray-100">
                        <h3 className="font-bold text-gray-800">Purchase Order History</h3>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead className="bg-gray-50">
                                <tr>
                                    <th className="table-header">Order #</th>
                                    <th className="table-header">Product</th>
                                    <th className="table-header">Qty</th>
                                    <th className="table-header">Triggered By</th>
                                    <th className="table-header">Status</th>
                                    <th className="table-header">Days to Stockout</th>
                                    <th className="table-header">Date</th>
                                </tr>
                            </thead>
                            <tbody>
                                {allOrders.length === 0 ? (
                                    <tr><td colSpan={7} className="text-center py-8 text-gray-400 text-sm">No orders yet.</td></tr>
                                ) : allOrders.map((order) => (
                                    <tr key={order.id} className="table-row">
                                        <td className="table-cell font-mono text-xs text-gray-500">{order.order_number}</td>
                                        <td className="table-cell text-sm font-medium text-gray-700">{order.products?.name}</td>
                                        <td className="table-cell font-bold">{order.quantity_ordered}</td>
                                        <td className="table-cell text-sm">
                                            {order.triggered_by === 'ai_prediction' ? 'Forecast' : 'Manual'}
                                        </td>
                                        <td className="table-cell">
                                            <span className={statusColor[order.status] || 'badge-pending'}>{order.status}</span>
                                        </td>
                                        <td className="table-cell text-sm">
                                            {order.predicted_days_until_stockout ?? '-'}
                                        </td>
                                        <td className="table-cell text-xs text-gray-500">
                                            {order.created_at ? format(new Date(order.created_at), 'MMM d, yyyy') : '-'}
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
