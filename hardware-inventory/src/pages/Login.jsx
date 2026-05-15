import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { WrenchScrewdriverIcon } from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';
import { useAuth } from '../contexts/AuthContext';
import { getPostLoginRoute } from '../lib/navigation';

export default function Login() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const { signIn, user, role, loading } = useAuth();
    const navigate = useNavigate();

    useEffect(() => {
        if (!loading && user && role) {
            navigate(getPostLoginRoute(role), { replace: true });
        }
    }, [loading, navigate, role, user]);

    async function handleSubmit(event) {
        event.preventDefault();
        setSubmitting(true);

        try {
            await signIn(email, password);
        } catch (error) {
            toast.error(error.message || 'Login failed. Check your credentials.');
        } finally {
            setSubmitting(false);
        }
    }

    return (
        <div className="min-h-screen bg-gradient-to-br from-sidebar via-sidebar-hover to-gray-900 flex items-center justify-center p-4">
            <div className="w-full max-w-md">
                <div className="text-center mb-8">
                    <div className="w-16 h-16 bg-accent rounded-2xl mx-auto flex items-center justify-center mb-4 shadow-lg">
                        <WrenchScrewdriverIcon className="w-8 h-8 text-white" />
                    </div>
                    <h1 className="text-3xl font-bold text-white">HardwareHub</h1>
                    <p className="text-gray-400 mt-1 text-sm">Inventory Management System</p>
                </div>

                <div className="bg-white rounded-2xl shadow-2xl p-8">
                    <h2 className="text-xl font-bold text-gray-800 mb-6">Sign In</h2>
                    <form onSubmit={handleSubmit} className="space-y-5">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                Email Address
                            </label>
                            <input
                                type="email"
                                className="input-field"
                                placeholder="you@company.com"
                                value={email}
                                onChange={(event) => setEmail(event.target.value)}
                                required
                                autoComplete="email"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                Password
                            </label>
                            <input
                                type="password"
                                className="input-field"
                                placeholder="Password"
                                value={password}
                                onChange={(event) => setPassword(event.target.value)}
                                required
                                autoComplete="current-password"
                            />
                        </div>
                        <button
                            type="submit"
                            disabled={submitting}
                            className="btn-primary w-full flex items-center justify-center gap-2 py-3 text-base"
                        >
                            {submitting ? (
                                <>
                                    <div className="spinner !w-4 !h-4" />
                                    Signing in...
                                </>
                            ) : (
                                'Sign In'
                            )}
                        </button>
                    </form>

                    <p className="text-center text-xs text-gray-400 mt-6">
                        Contact your administrator to request access.
                    </p>
                </div>
            </div>
        </div>
    );
}
