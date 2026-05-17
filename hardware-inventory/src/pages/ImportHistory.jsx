import React, { useCallback, useEffect, useState } from 'react';
import { ArrowPathIcon, DocumentArrowUpIcon } from '@heroicons/react/24/outline';
import { format } from 'date-fns';
import Layout from '../components/Layout';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';

function money(value) {
    return `$${Number(value || 0).toFixed(2)}`;
}

export default function ImportHistory() {
    const { role } = useAuth();
    const [salesImports, setSalesImports] = useState([]);
    const [productImports, setProductImports] = useState([]);
    const [loading, setLoading] = useState(true);

    const load = useCallback(async () => {
        setLoading(true);
        const [{ data: salesRows }, { data: productRows }] = await Promise.all([
            supabase
                .from('sales_import_batches')
                .select('*, profiles(full_name)')
                .order('imported_at', { ascending: false })
                .limit(50),
            role === 'sales_operator'
                ? Promise.resolve({ data: [] })
                : supabase
                    .from('product_import_batches')
                    .select('*, profiles(full_name)')
                    .order('imported_at', { ascending: false })
                    .limit(50),
        ]);

        setSalesImports(salesRows || []);
        setProductImports(productRows || []);
        setLoading(false);
    }, [role]);

    useEffect(() => {
        load();
    }, [load]);

    return (
        <Layout title="Import History">
            <div className="flex justify-end mb-4">
                <button onClick={load} disabled={loading} className="btn-secondary flex items-center gap-2">
                    <ArrowPathIcon className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                    Refresh
                </button>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                <div className="card p-0 overflow-hidden">
                    <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2">
                        <DocumentArrowUpIcon className="w-5 h-5 text-accent" />
                        <h3 className="font-bold text-gray-800">Sales Imports</h3>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead className="bg-gray-50">
                                <tr>
                                    <th className="table-header">File</th>
                                    <th className="table-header">Rows</th>
                                    <th className="table-header">Units</th>
                                    <th className="table-header">Amount</th>
                                    <th className="table-header">Imported</th>
                                </tr>
                            </thead>
                            <tbody>
                                {loading ? (
                                    <tr><td colSpan={5} className="text-center py-10"><div className="spinner mx-auto" /></td></tr>
                                ) : salesImports.length === 0 ? (
                                    <tr><td colSpan={5} className="text-center py-10 text-sm text-gray-400">No sales imports found.</td></tr>
                                ) : salesImports.map((row) => (
                                    <tr key={row.id} className="table-row">
                                        <td className="table-cell">
                                            <p className="font-medium text-gray-800">{row.file_name}</p>
                                            <p className="text-xs text-gray-400">{row.profiles?.full_name || 'Unknown user'}</p>
                                        </td>
                                        <td className="table-cell font-semibold">{row.total_rows}</td>
                                        <td className="table-cell font-semibold">{row.total_units}</td>
                                        <td className="table-cell">{money(row.total_amount)}</td>
                                        <td className="table-cell text-xs text-gray-500">{format(new Date(row.imported_at), 'MMM d, yyyy h:mm a')}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>

                <div className="card p-0 overflow-hidden">
                    <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2">
                        <DocumentArrowUpIcon className="w-5 h-5 text-accent" />
                        <h3 className="font-bold text-gray-800">Product Imports</h3>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead className="bg-gray-50">
                                <tr>
                                    <th className="table-header">Mode</th>
                                    <th className="table-header">Rows</th>
                                    <th className="table-header">Created</th>
                                    <th className="table-header">Updated</th>
                                    <th className="table-header">Skipped</th>
                                    <th className="table-header">Imported</th>
                                </tr>
                            </thead>
                            <tbody>
                                {loading ? (
                                    <tr><td colSpan={6} className="text-center py-10"><div className="spinner mx-auto" /></td></tr>
                                ) : productImports.length === 0 ? (
                                    <tr><td colSpan={6} className="text-center py-10 text-sm text-gray-400">No product imports found.</td></tr>
                                ) : productImports.map((row) => (
                                    <tr key={row.id} className="table-row">
                                        <td className="table-cell">
                                            <p className="font-medium text-gray-800">{row.mode.replace(/_/g, ' ')}</p>
                                            <p className="text-xs text-gray-400">{row.profiles?.full_name || 'Unknown user'}</p>
                                        </td>
                                        <td className="table-cell font-semibold">{row.total_rows}</td>
                                        <td className="table-cell">{row.created_count}</td>
                                        <td className="table-cell">{row.updated_count}</td>
                                        <td className="table-cell">{row.skipped_count}</td>
                                        <td className="table-cell text-xs text-gray-500">{format(new Date(row.imported_at), 'MMM d, yyyy h:mm a')}</td>
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
