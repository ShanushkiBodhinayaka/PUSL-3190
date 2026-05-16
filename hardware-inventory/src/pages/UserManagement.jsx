import React, { useCallback, useEffect, useState } from 'react';
import { format } from 'date-fns';
import { PaperAirplaneIcon, UsersIcon } from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';
import Layout from '../components/Layout';
import { supabase } from '../lib/supabase';
import { ROLE_COLORS, ROLE_LABELS, ROLES } from '../lib/roles';

export default function UserManagement() {
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [inviteFullName, setInviteFullName] = useState('');
    const [inviteEmail, setInviteEmail] = useState('');
    const [inviteRole, setInviteRole] = useState('staff');
    const [inviting, setInviting] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        const { data, error } = await supabase
            .from('profiles')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) {
            toast.error('Failed to load users');
        } else {
            setUsers(data || []);
        }
        setLoading(false);
    }, []);

    useEffect(() => {
        load();

        const channel = supabase
            .channel('profiles-changes')
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'profiles' },
                () => {
                    load();
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [load]);

    async function handleRoleChange(userId, newRole) {
        const { error } = await supabase
            .from('profiles')
            .update({ role: newRole })
            .eq('id', userId);

        if (error) {
            toast.error(`Failed to update role: ${error.message}`);
        } else {
            toast.success('Role updated');
            await load();
        }
    }

    async function handleInvite(event) {
        event.preventDefault();
        if (!inviteEmail) return;

        setInviting(true);
        const { error } = await supabase.functions.invoke('invite-user', {
            body: {
                email: inviteEmail,
                fullName: inviteFullName.trim() || null,
                role: inviteRole,
            },
        });

        if (error) {
            toast.error(error.message || 'Failed to send invitation');
        } else {
            toast.success(`Invitation sent to ${inviteEmail}`);
            setInviteFullName('');
            setInviteEmail('');
            setInviteRole('staff');
            await load();
        }

        setInviting(false);
    }

    return (
        <Layout title="User Management">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="card">
                    <h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2">
                        <PaperAirplaneIcon className="w-5 h-5 text-accent" />
                        Invite New User
                    </h3>
                    <form onSubmit={handleInvite} className="space-y-4">
                        <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">Full Name</label>
                            <input
                                className="input-field"
                                placeholder="Alex Contractor"
                                value={inviteFullName}
                                onChange={(event) => setInviteFullName(event.target.value)}
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">Email Address</label>
                            <input
                                type="email"
                                className="input-field"
                                placeholder="user@company.com"
                                value={inviteEmail}
                                onChange={(event) => setInviteEmail(event.target.value)}
                                required
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">Assign Role</label>
                            <select
                                className="input-field"
                                value={inviteRole}
                                onChange={(event) => setInviteRole(event.target.value)}
                            >
                                {ROLES.map((role) => (
                                    <option key={role} value={role}>{ROLE_LABELS[role]}</option>
                                ))}
                            </select>
                        </div>
                        <button type="submit" disabled={inviting} className="btn-primary w-full">
                            {inviting ? 'Sending...' : 'Send Invitation'}
                        </button>
                    </form>
                </div>

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
                                    <tr><td colSpan={5} className="text-center py-10 text-gray-400 text-sm">No users found.</td></tr>
                                ) : users.map((user) => (
                                    <tr key={user.id} className="table-row">
                                        <td className="table-cell">
                                            <div className="flex items-center gap-2">
                                                <div className="w-7 h-7 rounded-full bg-accent flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                                                    {user.full_name?.[0]?.toUpperCase() || '?'}
                                                </div>
                                                <span className="font-medium text-gray-800">{user.full_name || 'Unnamed User'}</span>
                                            </div>
                                        </td>
                                        <td className="table-cell font-mono text-xs text-gray-400 max-w-[120px] truncate">{user.id}</td>
                                        <td className="table-cell">
                                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${ROLE_COLORS[user.role] || ''}`}>
                                                {ROLE_LABELS[user.role] || user.role}
                                            </span>
                                        </td>
                                        <td className="table-cell text-xs text-gray-500">
                                            {user.created_at ? format(new Date(user.created_at), 'MMM d, yyyy') : '-'}
                                        </td>
                                        <td className="table-cell">
                                            <select
                                                className="input-field text-xs py-1 w-auto"
                                                value={user.role || 'staff'}
                                                onChange={(event) => handleRoleChange(user.id, event.target.value)}
                                            >
                                                {ROLES.map((role) => (
                                                    <option key={role} value={role}>{ROLE_LABELS[role]}</option>
                                                ))}
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
