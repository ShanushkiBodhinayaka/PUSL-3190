import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';

import { AuthProvider } from './contexts/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';

import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import POS from './pages/POS';
import Inventory from './pages/Inventory';
import StockMovements from './pages/StockMovements';
import PurchaseOrders from './pages/PurchaseOrders';
import OrderApproval from './pages/OrderApproval';
import Reports from './pages/Reports';
import UserManagement from './pages/UserManagement';
import { ROUTE_ROLES } from './lib/roles';

// Simple 403 page
function Unauthorized() {
    return (
        <div className="min-h-screen flex items-center justify-center bg-background">
            <div className="text-center">
                <p className="text-5xl font-bold text-gray-200 mb-3">403</p>
                <p className="text-gray-600 font-semibold mb-1">Access Denied</p>
                <p className="text-gray-400 text-sm mb-6">You don't have permission to view this page.</p>
                <a href="/dashboard" className="btn-primary">Go to Dashboard</a>
            </div>
        </div>
    );
}

export default function App() {
    return (
        <AuthProvider>
            <BrowserRouter>
                <Toaster
                    position="top-right"
                    toastOptions={{
                        duration: 4000,
                        style: {
                            borderRadius: '10px',
                            background: '#1a1a2e',
                            color: '#fff',
                            fontSize: '14px',
                        },
                        success: { iconTheme: { primary: '#f59e0b', secondary: '#fff' } },
                    }}
                />
                <Routes>
                    {/* Public */}
                    <Route path="/login" element={<Login />} />
                    <Route path="/unauthorized" element={<Unauthorized />} />

                    {/* All roles */}
                    <Route path="/dashboard" element={
                        <ProtectedRoute allowedRoles={ROUTE_ROLES.dashboard}>
                            <Dashboard />
                        </ProtectedRoute>
                    } />

                    {/* Point of Sale */}
                    <Route path="/pos" element={
                        <ProtectedRoute allowedRoles={ROUTE_ROLES.pos}>
                            <POS />
                        </ProtectedRoute>
                    } />

                    {/* Inventory */}
                    <Route path="/inventory" element={
                        <ProtectedRoute allowedRoles={ROUTE_ROLES.inventory}>
                            <Inventory />
                        </ProtectedRoute>
                    } />

                    {/* Stock Movements */}
                    <Route path="/stock-movements" element={
                        <ProtectedRoute allowedRoles={ROUTE_ROLES.stockMovements}>
                            <StockMovements />
                        </ProtectedRoute>
                    } />

                    {/* Purchase Orders — all roles can read */}
                    <Route path="/purchase-orders" element={
                        <ProtectedRoute allowedRoles={ROUTE_ROLES.purchaseOrders}>
                            <PurchaseOrders />
                        </ProtectedRoute>
                    } />

                    {/* Order Approval — managers only */}
                    <Route path="/order-approval" element={
                        <ProtectedRoute allowedRoles={ROUTE_ROLES.orderApproval}>
                            <OrderApproval />
                        </ProtectedRoute>
                    } />

                    {/* Reports */}
                    <Route path="/reports" element={
                        <ProtectedRoute allowedRoles={ROUTE_ROLES.reports}>
                            <Reports />
                        </ProtectedRoute>
                    } />

                    {/* User Management — admin only */}
                    <Route path="/users" element={
                        <ProtectedRoute allowedRoles={ROUTE_ROLES.users}>
                            <UserManagement />
                        </ProtectedRoute>
                    } />

                    {/* Catch-all → redirect to dashboard */}
                    <Route path="*" element={<Navigate to="/dashboard" replace />} />
                </Routes>
            </BrowserRouter>
        </AuthProvider>
    );
}
