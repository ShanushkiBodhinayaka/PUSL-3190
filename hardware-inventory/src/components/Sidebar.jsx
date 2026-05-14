import React from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import {
    HomeIcon,
    CalculatorIcon,
    CubeIcon,
    ArrowsRightLeftIcon,
    ShoppingCartIcon,
    CheckBadgeIcon,
    ChartBarIcon,
    UsersIcon,
    WrenchScrewdriverIcon,
} from '@heroicons/react/24/outline';
import { ROUTE_ROLES } from '../lib/roles';

const NAV_ITEMS = [
    { to: '/dashboard', label: 'Dashboard', icon: HomeIcon, roles: ROUTE_ROLES.dashboard },
    { to: '/pos', label: 'POS', icon: CalculatorIcon, roles: ROUTE_ROLES.pos },
    { to: '/inventory', label: 'Inventory', icon: CubeIcon, roles: ROUTE_ROLES.inventory },
    { to: '/stock-movements', label: 'Stock Movements', icon: ArrowsRightLeftIcon, roles: ROUTE_ROLES.stockMovements },
    { to: '/purchase-orders', label: 'Purchase Orders', icon: ShoppingCartIcon, roles: ROUTE_ROLES.purchaseOrders },
    { to: '/order-approval', label: 'Order Approval', icon: CheckBadgeIcon, roles: ROUTE_ROLES.orderApproval },
    { to: '/reports', label: 'Reports', icon: ChartBarIcon, roles: ROUTE_ROLES.reports },
    { to: '/users', label: 'User Management', icon: UsersIcon, roles: ROUTE_ROLES.users },
];

export default function Sidebar() {
    const { role } = useAuth();

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
                        {label}
                    </NavLink>
                ))}
            </nav>

            <div className="px-3 py-4 border-t border-white/10">
                <p className="text-xs text-gray-500 px-4">Hardware Store v1.0</p>
            </div>
        </aside>
    );
}
