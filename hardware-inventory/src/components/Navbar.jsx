import React from 'react';
import { useAuth } from '../contexts/AuthContext';
import {
    ArrowRightOnRectangleIcon,
    BellIcon,
} from '@heroicons/react/24/outline';

const ROLE_LABELS = {
    admin: 'Admin',
    warehouse_manager: 'Warehouse Manager',
    cashier: 'Cashier',
    approval_manager: 'Approval Manager',
    worker: 'Worker',
};

const ROLE_COLORS = {
    admin: 'bg-purple-100 text-purple-800',
    warehouse_manager: 'bg-blue-100 text-blue-800',
    cashier: 'bg-green-100 text-green-800',
    approval_manager: 'bg-orange-100 text-orange-800',
    worker: 'bg-gray-100 text-gray-800',
};

export default function Navbar({ title }) {
    const { profile, role, signOut } = useAuth();

    return (
        <header className="h-16 bg-white border-b border-gray-100 flex items-center justify-between px-6 shadow-sm">
            <h1 className="text-lg font-semibold text-gray-800">{title}</h1>

            <div className="flex items-center gap-4">
                {/* Notification bell */}
                <button className="relative p-2 rounded-lg text-gray-500 hover:bg-gray-100 transition-colors">
                    <BellIcon className="w-5 h-5" />
                </button>

                {/* User info */}
                <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-accent flex items-center justify-center text-white text-sm font-bold">
                        {profile?.full_name?.[0]?.toUpperCase() || 'U'}
                    </div>
                    <div className="hidden md:block">
                        <p className="text-sm font-medium text-gray-700">
                            {profile?.full_name || 'User'}
                        </p>
                        <span
                            className={`text-xs px-2 py-0.5 rounded-full font-medium ${ROLE_COLORS[role] || ROLE_COLORS.worker
                                }`}
                        >
                            {ROLE_LABELS[role] || role}
                        </span>
                    </div>
                </div>

                {/* Logout */}
                <button
                    onClick={signOut}
                    className="flex items-center gap-2 text-sm text-gray-500 hover:text-red-500 transition-colors p-2 rounded-lg hover:bg-red-50"
                    title="Sign out"
                >
                    <ArrowRightOnRectangleIcon className="w-5 h-5" />
                    <span className="hidden md:inline">Logout</span>
                </button>
            </div>
        </header>
    );
}
