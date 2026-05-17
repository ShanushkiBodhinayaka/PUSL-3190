import React from 'react';
import { getStockStatus } from '../lib/predictions';
import { CubeIcon } from '@heroicons/react/24/outline';

const STATUS_STYLES = {
    ok: { badge: 'badge-ok', label: 'OK' },
    low: { badge: 'badge-low', label: 'Low' },
    critical: { badge: 'badge-critical', label: 'Critical' },
    out_of_stock: { badge: 'badge-critical', label: 'Out of Stock' },
};

const STOCK_BAR_COLOR = {
    ok: 'bg-green-400',
    low: 'bg-yellow-400',
    critical: 'bg-red-500',
    out_of_stock: 'bg-red-700',
};

export default function StockCard({ product }) {
    const status = getStockStatus(product);
    const { badge, label } = STATUS_STYLES[status] || STATUS_STYLES.ok;
    const barColor = STOCK_BAR_COLOR[status];
    const percentage = Math.min(
        100,
        Math.round((product.current_stock / (product.reorder_point * 3)) * 100)
    );

    return (
        <div className="card hover:shadow-md transition-shadow">
            <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-amber-50 rounded-lg flex items-center justify-center">
                        <CubeIcon className="w-5 h-5 text-amber-600" />
                    </div>
                    <div>
                        <p className="font-semibold text-gray-800 text-sm leading-tight">{product.name}</p>
                        <p className="text-xs text-gray-400 mt-0.5">{product.sku}</p>
                    </div>
                </div>
                <span className={badge}>{label}</span>
            </div>

            {/* Stock bar */}
            <div className="mb-3">
                <div className="flex justify-between text-xs text-gray-500 mb-1">
                    <span>Stock: <strong className="text-gray-700">{product.current_stock}</strong></span>
                    <span>Safety stock {product.reorder_point}</span>
                </div>
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div
                        className={`h-2 rounded-full ${barColor} transition-all`}
                        style={{ width: `${percentage}%` }}
                    />
                </div>
            </div>

            <div className="flex justify-between text-xs text-gray-500">
                <span>{product.category}</span>
                <span className="font-medium text-gray-700">
                    ${parseFloat(product.unit_price || 0).toFixed(2)}
                </span>
            </div>
        </div>
    );
}
