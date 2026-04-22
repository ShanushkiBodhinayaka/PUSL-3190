import React, { useEffect, useState, useCallback } from 'react';
import Layout from '../components/Layout';
import { supabase } from '../lib/supabase';
import { format } from 'date-fns';
import { UsersIcon, PaperAirplaneIcon } from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';

const ROLES = ['admin', 'warehouse_manager', 'cashier', 'approval_manager', 'worker'];

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

export default function UserManagement() {
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [inviteEmail, setInviteEmail] = useState('');
    const [inviteRole, setInviteRole] = useState('worker');
    const [inviting, setInviting] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        const { data, error } = await supabase
            .from('profiles')
            .select('*')
            .order('created_at', { ascending: false });
        if (error) toast.error('Failed to load users');
        else setUsers(data || []);
        setLoading(false);
    }, []);

    useEffect(() => { load(); }, [load]);

    async function handleRoleChange(userId, newRole) {
        const { error } = await supabase
            .from('profiles')
            .update({ role: newRole })
            .eq('id', userId);
        if (error) toast.error('Failed to update role');
        else {
            toast.success('Role updated!');
            load();
        }
    }

    async function handleInvite(e) {
        e.preventDefault();
        if (!inviteEmail) return;
        setInviting(true);
        const { error } = await supabase.auth.admin?.inviteUserByEmail
            ? supabase.auth.admin.inviteUserByEmail(inviteEmail, {
                data: { role: inviteRole },
            })
            : { error: { message: 'Invite via Supabase Dashboard: Authentication > Users > Invite User' } };

        if (error) {
            // Supabase client-side SDK doesn't expose admin.inviteUserByEmail
            // Show instructions instead
            toast.error(
                'To invite: Go to Supabase Dashboard → Authentication → Users → Invite User.',
                { duration: 6000 }
            );
        } else {
            toast.success(`Invitation sent to ${inviteEmail}`);
            setInviteEmail('');
        }
        setInviting(false);
    }

    return (
        <Layout title="User Management">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Invite Panel */}
                <div className="card">
                    <h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2">
                        <PaperAirplaneIcon className="w-5 h-5 text-accent" />
                        Invite New User
                    </h3>
                    <form onSubmit={handleInvite} className="space-y-4">
                        <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">Email Address</label>
                            <input
                                type="email"
                                className="input-field"
                                placeholder="user@company.com"
                                value={inviteEmail}
                                onChange={(e) => setInviteEmail(e.target.value)}
                                required
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">Assign Role</label>
                            <select className="input-field" value={inviteRole} onChange={(e) => setInviteRole(e.target.value)}>
                                {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                            </select>
                        </div>
                        <button type="submit" disabled={inviting} className="btn-primary w-full">
                            {inviting ? 'Sending…' : 'Send Invitation'}
                        </button>
                    </form>
                    <div className="mt-4 p-3 bg-amber-50 rounded-lg border border-amber-100">
                        <p className="text-xs text-amber-700">
                            <strong>Note:</strong> To invite users, use Supabase Dashboard → Authentication → Users → Invite User,
                            and set their role in the profiles table.
                        </p>
                    </div>
                </div>

                {/* Users Table */}
                <div className="lg:col-span-2 card p-0 overflow-hidden">
                    <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2">
                        <UsersIcon className="w-5 h-5 text-gray-400" />
                        <h3 className="font-bold text-gray-800">All Users ({users.length})</h3>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead className="bg-gray-50">
                                <tr>
                                    <th className="table-header">Name</th>
                                    <th className="table-header">User ID</th>
                                    <th className="table-header">Current Role</th>
                                    <th className="table-header">Joined</th>
                                    <th className="table-header">Change Role</th>
                                </tr>
                            </thead>
                            <tbody>
                                {loading ? (
                                    <tr><td colSpan={5} className="text-center py-10"><div className="spinner mx-auto" /></td></tr>
                                ) : users.length === 0 ? (
                                    <tr><td colSpan={5} className="text-center py-10 text-gray-400 text-sm">
                                        No users found.
                                    </td></tr>
                                ) : users.map((u) => (
                                    <tr key={u.id} className="table-row">
                                        <td className="table-cell">
                                            <div className="flex items-center gap-2">
                                                <div className="w-7 h-7 rounded-full bg-accent flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                                                    {u.full_name?.[0]?.toUpperCase() || '?'}
                                                </div>
                                                <span className="font-medium text-gray-800">{u.full_name || 'Unnamed User'}</span>
                                            </div>
                                        </td>
                                        <td className="table-cell font-mono text-xs text-gray-400 max-w-[120px] truncate">{u.id}</td>
                                        <td className="table-cell">
                                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${ROLE_COLORS[u.role] || ''}`}>
                                                {ROLE_LABELS[u.role] || u.role}
                                            </span>
                                        </td>
                                        <td className="table-cell text-xs text-gray-500">
                                            {u.created_at ? format(new Date(u.created_at), 'MMM d, yyyy') : '—'}
                                        </td>
                                        <td className="table-cell">
                                            <select
                                                className="input-field text-xs py-1 w-auto"
                                                value={u.role || 'worker'}
                                                onChange={(e) => handleRoleChange(u.id, e.target.value)}
                                            >
                                                {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                                            </select>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </Layout>
    );
}
