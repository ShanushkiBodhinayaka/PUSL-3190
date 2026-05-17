import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { format, subDays } from 'date-fns';
import { ChartBarIcon } from '@heroicons/react/24/outline';
import {
    Bar,
    BarChart,
    CartesianGrid,
    Legend,
    Line,
    LineChart,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from 'recharts';
import Layout from '../components/Layout';
import { supabase } from '../lib/supabase';

export default function Reports() {
    const [topProducts, setTopProducts] = useState([]);
    const [allOrders, setAllOrders] = useState([]);
    const [salesMovements, setSalesMovements] = useState([]);
    const [productOptions, setProductOptions] = useState([]);
    const [selectedProductIds, setSelectedProductIds] = useState([]);
    const [loading, setLoading] = useState(true);

    const load = useCallback(async () => {
        setLoading(true);
        const thirtyDaysAgo = subDays(new Date(), 30).toISOString();

        const [{ data: movements }, { data: orders }] = await Promise.all([
            supabase
                .from('stock_movements')
                .select('product_id, quantity, created_at, products(name, sku)')
                .eq('movement_type', 'sale')
                .gte('created_at', thirtyDaysAgo),
            supabase
                .from('purchase_orders')
                .select('*, products(name, sku)')
                .order('created_at', { ascending: false }),
        ]);

        const consumed = {};
        (movements || []).forEach((movement) => {
            const productId = movement.product_id;
            const current = consumed[productId] || {
                id: productId,
                name: movement.products?.name || productId,
                sku: movement.products?.sku || '',
                qty: 0,
            };
            consumed[productId] = {
                ...current,
                qty: current.qty + movement.quantity,
            };
        });

        const sortedOptions = Object.values(consumed).sort((a, b) => b.qty - a.qty);
        const sortedTopProducts = sortedOptions.slice(0, 10).map(({ name, qty }) => ({
                name: name.length > 20 ? `${name.slice(0, 20)}...` : name,
                qty,
            }));
        setTopProducts(sortedTopProducts);
        setProductOptions(sortedOptions);
        setSelectedProductIds((current) => {
            const availableIds = new Set(sortedOptions.map((product) => product.id));
            const preserved = current.filter((id) => availableIds.has(id));
            return preserved.length > 0 ? preserved : sortedOptions.slice(0, 3).map((product) => product.id);
        });
        setSalesMovements(movements || []);
        setAllOrders(orders || []);
        setLoading(false);
    }, []);

    useEffect(() => {
        load();
    }, [load]);

    const lineColors = ['#f59e0b', '#3b82f6', '#10b981', '#8b5cf6', '#ef4444', '#14b8a6'];

    const selectedProducts = useMemo(
        () => productOptions.filter((product) => selectedProductIds.includes(product.id)),
        [productOptions, selectedProductIds]
    );

    const dailySalesTrend = useMemo(() => {
        const trendRows = [];
        for (let i = 6; i >= 0; i -= 1) {
            const dayDate = subDays(new Date(), i);
            const dayKey = format(dayDate, 'yyyy-MM-dd');
            const row = { day: format(dayDate, 'MMM d') };

            selectedProductIds.forEach((productId) => {
                row[productId] = salesMovements
                    .filter((movement) =>
                        movement.product_id === productId &&
                        format(new Date(movement.created_at), 'yyyy-MM-dd') === dayKey
                    )
                    .reduce((sum, movement) => sum + movement.quantity, 0);
            });

            trendRows.push(row);
        }
        return trendRows;
    }, [salesMovements, selectedProductIds]);

    function toggleProduct(productId) {
        setSelectedProductIds((current) => (
            current.includes(productId)
                ? current.filter((id) => id !== productId)
                : [...current, productId]
        ));
    }

    const statusColor = {
        pending: 'badge-pending',
        approved: 'badge-approved',
        rejected: 'badge-rejected',
        ordered: 'badge-ordered',
        received: 'badge-received',
    };

    if (loading) {
        return <Layout title="Reports"><div className="flex justify-center py-16"><div className="spinner" /></div></Layout>;
    }

    return (
        <Layout title="Reports">
            <div className="space-y-6">
                <div className="card">
                    <h3 className="font-bold text-gray-800 mb-2 flex items-center gap-2">
                        <ChartBarIcon className="w-5 h-5 text-accent" />
                        Daily Sales Trend - Last 7 Days
                    </h3>
                    <div className="flex items-start justify-between gap-4 mb-4 flex-wrap">
                        <p className="text-sm text-gray-500">
                            Select products to compare actual units sold per day over the last week.
                        </p>
                        <button
                            type="button"
                            className="btn-secondary py-1.5 px-3 text-xs"
                            onClick={() => setSelectedProductIds(productOptions.slice(0, 3).map((product) => product.id))}
                        >
                            Top 3
                        </button>
                    </div>
                    {productOptions.length > 0 && (
                        <div className="flex flex-wrap gap-2 mb-4">
                            {productOptions.slice(0, 12).map((product) => (
                                <label
                                    key={product.id}
                                    className={`inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs cursor-pointer transition-colors ${
                                        selectedProductIds.includes(product.id)
                                            ? 'bg-amber-50 border-amber-200 text-amber-800'
                                            : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                                    }`}
                                >
                                    <input
                                        type="checkbox"
                                        className="accent-amber-500"
                                        checked={selectedProductIds.includes(product.id)}
                                        onChange={() => toggleProduct(product.id)}
                                    />
                                    <span>{product.name}</span>
                                    {product.sku && <span className="font-mono text-gray-400">{product.sku}</span>}
                                </label>
                            ))}
                        </div>
                    )}
                    {dailySalesTrend.length === 0 || selectedProducts.length === 0 ? (
                        <p className="text-gray-400 text-sm">No sales data available.</p>
                    ) : (
                        <ResponsiveContainer width="100%" height={260}>
                            <LineChart data={dailySalesTrend}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                                <XAxis dataKey="day" tick={{ fontSize: 12 }} />
                                <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
                                <Tooltip />
                                <Legend />
                                {selectedProducts.map((product, index) => (
                                    <Line
                                        key={product.id}
                                        type="monotone"
                                        dataKey={product.id}
                                        name={shortLabel(product.name)}
                                        stroke={lineColors[index % lineColors.length]}
                                        strokeWidth={2}
                                        dot={{ r: 4 }}
                                        activeDot={{ r: 6 }}
                                    />
                                ))}
                            </LineChart>
                        </ResponsiveContainer>
                    )}
                </div>

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

function shortLabel(name) {
    return name.split(' ').slice(0, 2).join(' ');
}
