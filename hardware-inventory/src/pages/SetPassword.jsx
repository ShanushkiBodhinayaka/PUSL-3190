import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { supabase } from '../lib/supabase';

export default function SetPassword() {
    const navigate = useNavigate();
    const [password, setPassword] = useState('');
    const [confirm, setConfirm] = useState('');
    const [ready, setReady] = useState(false);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        // Supabase picks up the token from the URL hash and fires this before we can call getSession
        const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
            if (session) setReady(true);
        });
        // fallback if the token was already consumed before this component mounted
        supabase.auth.getSession().then(({ data: { session } }) => {
            if (session) setReady(true);
        });
        return () => subscription.unsubscribe();
    }, []);

    async function handleSubmit(e) {
        e.preventDefault();
        if (password.length < 6) {
            toast.error('Password must be at least 6 characters');
            return;
        }
        if (password !== confirm) {
            toast.error('Passwords do not match');
            return;
        }
        setSaving(true);
        const { error } = await supabase.auth.updateUser({ password });
        if (error) {
            toast.error(error.message);
        } else {
            toast.success('Password set! Taking you to the dashboard...');
            navigate('/dashboard');
        }
        setSaving(false);
    }

    if (!ready) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-background">
                <div className="text-center">
                    <div className="spinner mx-auto mb-4" />
                    <p className="text-sm text-gray-500">Verifying your invitation link...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen flex items-center justify-center bg-background">
            <div className="bg-white rounded-2xl shadow-lg p-8 w-full max-w-sm">
                <h1 className="text-xl font-bold text-gray-800 mb-1">Set your password</h1>
                <p className="text-sm text-gray-500 mb-6">Choose a password to complete your account setup.</p>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Password</label>
                        <input
                            type="password"
                            className="input-field"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            required
                            minLength={6}
                            placeholder="At least 6 characters"
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Confirm Password</label>
                        <input
                            type="password"
                            className="input-field"
                            value={confirm}
                            onChange={(e) => setConfirm(e.target.value)}
                            required
                            placeholder="Repeat your password"
                        />
                    </div>
                    <button type="submit" disabled={saving} className="btn-primary w-full">
                        {saving ? 'Setting password...' : 'Set Password & Sign In'}
                    </button>
                </form>
            </div>
        </div>
    );
}
