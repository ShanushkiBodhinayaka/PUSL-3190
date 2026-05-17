import React, { useEffect, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import {
    HomeIcon,
    DocumentArrowUpIcon,
    ClipboardDocumentListIcon,
    CubeIcon,
    ArrowsRightLeftIcon,
    ShoppingCartIcon,
    CheckBadgeIcon,
    ChartBarIcon,
    UsersIcon,
    WrenchScrewdriverIcon,
} from '@heroicons/react/24/outline';
import { ROUTE_ROLES } from '../lib/roles';
import { supabase } from '../lib/supabase';

const NAV_ITEMS = [
    { to: '/dashboard', label: 'Dashboard', icon: HomeIcon, roles: ROUTE_ROLES.dashboard },
    { to: '/sales-import', label: 'Sales Import', icon: DocumentArrowUpIcon, roles: ROUTE_ROLES.salesImport },
    { to: '/import-history', label: 'Import History', icon: ClipboardDocumentListIcon, roles: ROUTE_ROLES.importHistory },
    { to: '/inventory', label: 'Inventory', icon: CubeIcon, roles: ROUTE_ROLES.inventory },
    { to: '/stock-movements', label: 'Stock Movements', icon: ArrowsRightLeftIcon, roles: ROUTE_ROLES.stockMovements },
    { to: '/purchase-orders', label: 'Purchase Orders', icon: ShoppingCartIcon, roles: ROUTE_ROLES.purchaseOrders },
    { to: '/order-approval', label: 'Order Approval', icon: CheckBadgeIcon, roles: ROUTE_ROLES.orderApproval },
    { to: '/reports', label: 'Reports', icon: ChartBarIcon, roles: ROUTE_ROLES.reports },
    { to: '/users', label: 'User Management', icon: UsersIcon, roles: ROUTE_ROLES.users },
];

export default function Sidebar() {
    const { role } = useAuth();
    const [badges, setBadges] = useState({});

    useEffect(() => {
        let cancelled = false;

        async function loadBadges() {
            const nextBadges = {};

            if (['admin', 'approval_manager'].includes(role)) {
                const { count } = await supabase
                    .from('purchase_orders')
                    .select('id', { count: 'exact', head: true })
                    .eq('status', 'pending');
                if (count) nextBadges['/order-approval'] = count;
            }

            if (['admin', 'inventory_manager'].includes(role)) {
                const { count } = await supabase
                    .from('purchase_orders')
                    .select('id', { count: 'exact', head: true })
                    .in('status', ['approved', 'ordered']);
                if (count) nextBadges['/purchase-orders'] = count;
            }

            if (['admin', 'inventory_manager', 'staff'].includes(role)) {
                const { data } = await supabase
                    .from('products')
                    .select('id,current_stock,reorder_point')
                    .eq('active', true);
                const lowCount = (data || []).filter((product) => product.current_stock <= product.reorder_point).length;
                if (lowCount) nextBadges['/inventory'] = lowCount;
            }

            if (!cancelled) setBadges(nextBadges);
        }

        if (role) loadBadges();
        return () => {
            cancelled = true;
        };
    }, [role]);

    const visibleItems = NAV_ITEMS.filter(
        (item) => item.roles.includes(role)
    );

    return (
        <aside className="w-64 min-h-screen bg-sidebar flex flex-col shadow-xl">
            {/* Logo */}
            <div className="flex items-center gap-3 px-6 py-5 border-b border-white/10">
                <div className="w-9 h-9 bg-accent rounded-lg flex items-center justify-center">
                    <WrenchScrewdriverIcon className="w-5 h-5 text-white" />
                </div>
                <div>
                    <p className="text-white font-bold text-sm leading-tight">HardwareHub</p>
                    <p className="text-gray-400 text-xs">Inventory System</p>
                </div>
            </div>

            {/* Nav links */}
            <nav className="flex-1 px-3 py-4 space-y-1">
                {visibleItems.map(({ to, label, icon: Icon }) => (
                    <NavLink
                        key={to}
                        to={to}
                        className={({ isActive }) =>
                            `sidebar-link ${isActive ? 'active' : ''}`
                        }
                    >
                        <Icon className="w-5 h-5 flex-shrink-0" />
                        <span className="flex-1">{label}</span>
                        {badges[to] ? (
                            <span className="min-w-5 h-5 px-1.5 rounded-full bg-accent text-white text-[11px] font-bold flex items-center justify-center">
                                {badges[to] > 99 ? '99+' : badges[to]}
                            </span>
                        ) : null}
                    </NavLink>
                ))}
            </nav>

            <div className="px-3 py-4 border-t border-white/10">
                <p className="text-xs text-gray-500 px-4">Hardware Store v1.0</p>
            </div>
        </aside>
    );
}
