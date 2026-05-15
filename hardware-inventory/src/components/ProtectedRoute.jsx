import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export default function ProtectedRoute({ children, allowedRoles }) {
    const { user, role, loading } = useAuth();

    const demoBypassEnabled = true;

    if (demoBypassEnabled) {
        return children;
    }

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-background">
                <div className="text-center">
                    <div className="spinner mx-auto mb-4" />
                    <p className="text-gray-500 text-sm">Loading...</p>
                </div>
            </div>
        );
    }

    if (!user) {
        return <Navigate to="/login" replace />;
    }

    if (!role) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-background">
                <div className="text-center max-w-md px-4">
                    <p className="text-lg font-semibold text-gray-700 mb-2">Account setup incomplete</p>
                    <p className="text-sm text-gray-500">
                        Your account is missing a role assignment. Contact an administrator to finish setup.
                    </p>
                </div>
            </div>
        );
    }

    if (allowedRoles && !allowedRoles.includes(role)) {
        return <Navigate to="/unauthorized" replace />;
    }

    return children;
}
