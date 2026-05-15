import React from 'react';
import { format } from 'date-fns';
import { ShoppingCartIcon } from '@heroicons/react/24/outline';

const STATUS_STYLES = {
    pending: 'badge-pending',
    approved: 'badge-approved',
    rejected: 'badge-rejected',
    ordered: 'badge-ordered',
    received: 'badge-received',
};

export default function OrderCard({ order, productName }) {
    const statusClass = STATUS_STYLES[order.status] || 'badge-pending';

    return (
        <div className="card hover:shadow-md transition-shadow">
            <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-blue-50 rounded-lg flex items-center justify-center">
                        <ShoppingCartIcon className="w-5 h-5 text-blue-600" />
                    </div>
                    <div>
                        <p className="font-semibold text-gray-800 text-sm">{order.order_number}</p>
                        <p className="text-xs text-gray-500 mt-0.5">{productName}</p>
                    </div>
                </div>
                <span className={statusClass}>{order.status}</span>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs text-gray-500 mt-2">
                <div>
                    <p className="text-gray-400">Quantity</p>
                    <p className="font-semibold text-gray-700">{order.quantity_ordered} units</p>
                </div>
                <div>
                    <p className="text-gray-400">Triggered By</p>
                    <p className="font-semibold text-gray-700 capitalize">
                        {order.triggered_by === 'ai_prediction' ? 'Forecast Recommendation' : 'Manual'}
                    </p>
                </div>
                {order.predicted_days_until_stockout !== null && (
                    <div>
                        <p className="text-gray-400">Days Until Stockout</p>
                        <p className={`font-semibold ${order.predicted_days_until_stockout < 7 ? 'text-red-600' :
                                order.predicted_days_until_stockout < 14 ? 'text-yellow-600' :
                                    'text-green-600'
                            }`}>
                            {order.predicted_days_until_stockout ?? '—'} days
                        </p>
                    </div>
                )}
                <div>
                    <p className="text-gray-400">Created</p>
                    <p className="font-semibold text-gray-700">
                        {order.created_at
                            ? format(new Date(order.created_at), 'MMM d, yyyy')
                            : '—'}
                    </p>
                </div>
            </div>
        </div>
    );
}
