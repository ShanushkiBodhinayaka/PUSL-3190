import React, { useEffect, useState, useCallback } from 'react';
import Layout from '../components/Layout';
import { supabase } from '../lib/supabase';
import { format, subDays } from 'date-fns';
import {
    LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
    Tooltip, Legend, ResponsiveContainer
} from 'recharts';
import { ChartBarIcon } from '@heroicons/react/24/outline';

export default function Reports() {
    const [topProducts, setTopProducts] = useState([]);
    const [allOrders, setAllOrders] = useState([]);
    const [stockTrend, setStockTrend] = useState([]);
    const [loading, setLoading] = useState(true);

    const load = useCallback(async () => {
        setLoading(true);
        const thirtyDaysAgo = subDays(new Date(), 30).toISOString();

        const [{ data: movements }, { data: orders }, { data: products }] = await Promise.all([
            supabase
                .from('stock_movements')
                .select('*, products(name)')
                .eq('movement_type', 'sale')
                .gte('created_at', thirtyDaysAgo),
            supabase
                .from('purchase_orders')
                .select('*, products(name, sku)')
                .order('created_at', { ascending: false }),
            supabase.from('products').select('id, name, current_stock').limit(6).order('name'),
        ]);

        // Top 10 consumed products
        const consumed = {};
        (movements || []).forEach((m) => {
            const name = m.products?.name || m.product_id;
            consumed[name] = (consumed[name] || 0) + m.quantity;
        });
        const sorted = Object.entries(consumed)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10)
            .map(([name, qty]) => ({ name: name.length > 20 ? name.slice(0, 20) + '…' : name, qty }));
        setTopProducts(sorted);

        // Stock trend (last 7 days — using current stock as snapshot)
        const days = [];
        for (let i = 6; i >= 0; i--) {
            const day = format(subDays(new Date(), i), 'MMM d');
            const entry = { day };
            (products || []).slice(0, 3).forEach((p) => {
                // Approximate trend: add back sales from that day
                const daySales = (movements || [])
                    .filter((m) => m.product_id === p.id && format(new Date(m.created_at), 'MMM d') === day)
                    .reduce((s, m) => s + m.quantity, 0);
                entry[p.name.split(' ')[0]] = Math.max(0, p.current_stock + daySales * (i + 1));
            });
            days.push(entry);
        }
        setStockTrend(days);
        setAllOrders(orders || []);
        setLoading(false);
    }, []);

    useEffect(() => { load(); }, [load]);

    const LINE_COLORS = ['#f59e0b', '#3b82f6', '#10b981'];

    const topProductKeys = stockTrend.length > 0
        ? Object.keys(stockTrend[0]).filter((k) => k !== 'day')
        : [];

    const STATUS_COLOR = {
        pending: 'badge-pending', approved: 'badge-approved',
        rejected: 'badge-rejected', ordered: 'badge-ordered', received: 'badge-received',
    };

    if (loading) {
        return <Layout title="Reports"><div className="flex justify-center py-16"><div className="spinner" /></div></Layout>;
    }

    return (
        <Layout title="Reports">
            <div className="space-y-6">
                {/* Stock Trend Line Chart */}
                <div className="card">
                    <h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2">
                        <ChartBarIcon className="w-5 h-5 text-accent" />
                        Stock Levels — Last 7 Days (Top 3 Products)
                    </h3>
                    {stockTrend.length === 0 ? (
                        <p className="text-gray-400 text-sm">No stock data available.</p>
                    ) : (
                        <ResponsiveContainer width="100%" height={260}>
                            <LineChart data={stockTrend}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                                <XAxis dataKey="day" tick={{ fontSize: 12 }} />
                                <YAxis tick={{ fontSize: 12 }} />
                                <Tooltip />
                                <Legend />
                                {topProductKeys.map((key, i) => (
                                    <Line
                                        key={key}
                                        type="monotone"
                                        dataKey={key}
                                        stroke={LINE_COLORS[i % LINE_COLORS.length]}
                                        strokeWidth={2}
                                        dot={{ r: 4 }}
                                        activeDot={{ r: 6 }}
                                    />
                                ))}
                            </LineChart>
                        </ResponsiveContainer>
                    )}
                </div>

                {/* Top 10 Consumed — Bar Chart */}
                <div className="card">
                    <h3 className="font-bold text-gray-800 mb-4">Top 10 Most Sold Products (Last 30 Days)</h3>
                    {topProducts.length === 0 ? (
                        <p className="text-gray-400 text-sm">No sales data available for the last 30 days.</p>
                    ) : (
                        <ResponsiveContainer width="100%" height={260}>
                            <BarChart data={topProducts} layout="vertical">
                                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                                <XAxis type="number" tick={{ fontSize: 12 }} />
                                <YAxis dataKey="name" type="category" width={120} tick={{ fontSize: 11 }} />
                                <Tooltip />
                                <Bar dataKey="qty" fill="#f59e0b" radius={[0, 4, 4, 0]} name="Units Sold" />
                            </BarChart>
                        </ResponsiveContainer>
                    )}
                </div>

                {/* All Purchase Orders History */}
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
                                ) : allOrders.map((o) => (
                                    <tr key={o.id} className="table-row">
                                        <td className="table-cell font-mono text-xs text-gray-500">{o.order_number}</td>
                                        <td className="table-cell text-sm font-medium text-gray-700">{o.products?.name}</td>
                                        <td className="table-cell font-bold">{o.quantity_ordered}</td>
                                        <td className="table-cell text-sm">
                                            {o.triggered_by === 'ai_prediction' ? '🤖 AI' : '✋ Manual'}
                                        </td>
                                        <td className="table-cell">
                                            <span className={STATUS_COLOR[o.status] || 'badge-pending'}>{o.status}</span>
                                        </td>
                                        <td className="table-cell text-sm">
                                            {o.predicted_days_until_stockout ?? '—'}
                                        </td>
                                        <td className="table-cell text-xs text-gray-500">
                                            {o.created_at ? format(new Date(o.created_at), 'MMM d, yyyy') : '—'}
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
