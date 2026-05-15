import React from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import ProtectedRoute from './components/ProtectedRoute';
import { AuthProvider } from './contexts/AuthContext';
import { ROUTE_ROLES } from './lib/roles';
import Dashboard from './pages/Dashboard';
import Inventory from './pages/Inventory';
import Login from './pages/Login';
import OrderApproval from './pages/OrderApproval';
import POS from './pages/POS';
import PurchaseOrders from './pages/PurchaseOrders';
import Reports from './pages/Reports';
import StockMovements from './pages/StockMovements';
import UserManagement from './pages/UserManagement';

function Unauthorized() {
    return (
        <div className="min-h-screen flex items-center justify-center bg-background">
            <div className="text-center">
                <p className="text-5xl font-bold text-gray-200 mb-3">403</p>
                <p className="text-gray-600 font-semibold mb-1">Access Denied</p>
                <p className="text-gray-400 text-sm mb-6">You do not have permission to view this page.</p>
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
                    <Route path="/login" element={<Login />} />
                    <Route path="/unauthorized" element={<Unauthorized />} />

                    <Route
                        path="/dashboard"
                        element={
                            <ProtectedRoute allowedRoles={ROUTE_ROLES.dashboard}>
                                <Dashboard />
                            </ProtectedRoute>
                        }
                    />
                    <Route
                        path="/pos"
                        element={
                            <ProtectedRoute allowedRoles={ROUTE_ROLES.pos}>
                                <POS />
                            </ProtectedRoute>
                        }
                    />
                    <Route
                        path="/inventory"
                        element={
                            <ProtectedRoute allowedRoles={ROUTE_ROLES.inventory}>
                                <Inventory />
                            </ProtectedRoute>
                        }
                    />
                    <Route
                        path="/stock-movements"
                        element={
                            <ProtectedRoute allowedRoles={ROUTE_ROLES.stockMovements}>
                                <StockMovements />
                            </ProtectedRoute>
                        }
                    />
                    <Route
                        path="/purchase-orders"
                        element={
                            <ProtectedRoute allowedRoles={ROUTE_ROLES.purchaseOrders}>
                                <PurchaseOrders />
                            </ProtectedRoute>
                        }
                    />
                    <Route
                        path="/order-approval"
                        element={
                            <ProtectedRoute allowedRoles={ROUTE_ROLES.orderApproval}>
                                <OrderApproval />
                            </ProtectedRoute>
                        }
                    />
                    <Route
                        path="/reports"
                        element={
                            <ProtectedRoute allowedRoles={ROUTE_ROLES.reports}>
                                <Reports />
                            </ProtectedRoute>
                        }
                    />
                    <Route
                        path="/users"
                        element={
                            <ProtectedRoute allowedRoles={ROUTE_ROLES.users}>
                                <UserManagement />
                            </ProtectedRoute>
                        }
                    />

                    <Route path="*" element={<Navigate to="/dashboard" replace />} />
                </Routes>
            </BrowserRouter>
        </AuthProvider>
    );
}
