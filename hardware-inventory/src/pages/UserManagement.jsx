import React, { useCallback, useEffect, useState } from 'react';
import { format } from 'date-fns';
import { TrashIcon, UsersIcon } from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';
import Layout from '../components/Layout';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { ROLE_COLORS, ROLE_LABELS, ROLES } from '../lib/roles';

async function getFunctionErrorMessage(error) {
    const fallback = error?.message || 'Failed to perform action';
    try {
        const context = error?.context;
        if (context && typeof context.json === 'function') {
            const body = await context.json();
            return body?.error || body?.message || fallback;
        }
    } catch (_parseError) {
        return fallback;
    }
    return fallback;
}

export default function UserManagement() {
    const { user: currentUser } = useAuth();
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [deletingUserId, setDeletingUserId] = useState(null);

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
            .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, () => load())
            .subscribe();

        return () => { supabase.removeChannel(channel); };
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

    async function handleDeleteUser(targetUser) {
        if (targetUser.id === currentUser?.id) {
            toast.error('You cannot delete your own account while signed in');
            return;
        }

        const confirmed = window.confirm(
            `Delete ${targetUser.full_name || 'this user'}? This removes their login account and profile.`
        );
        if (!confirmed) return;

        setDeletingUserId(targetUser.id);
        const { error } = await supabase.functions.invoke('delete-user', {
            body: { userId: targetUser.id },
        });

        if (error) {
            toast.error(await getFunctionErrorMessage(error));
        } else {
            toast.success(`${targetUser.full_name || 'User'} deleted`);
            await load();
        }
        setDeletingUserId(null);
    }

    return (
        <Layout title="User Management">
            <div className="card p-0 overflow-hidden">
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
                                <th className="table-header">Delete</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr><td colSpan={6} className="text-center py-10"><div className="spinner mx-auto" /></td></tr>
                            ) : users.length === 0 ? (
                                <tr><td colSpan={6} className="text-center py-10 text-gray-400 text-sm">No users found.</td></tr>
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
                                    <td className="table-cell">
                                        <button
                                            type="button"
                                            title={user.id === currentUser?.id ? 'You cannot delete your own account' : 'Delete user'}
                                            disabled={deletingUserId === user.id || user.id === currentUser?.id}
                                            onClick={() => handleDeleteUser(user)}
                                            className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-red-600 hover:bg-red-50 disabled:text-gray-300 disabled:hover:bg-transparent transition-colors"
                                        >
                                            {deletingUserId === user.id ? (
                                                <span className="spinner w-4 h-4" />
                                            ) : (
                                                <TrashIcon className="w-4 h-4" />
                                            )}
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </Layout>
    );
}
