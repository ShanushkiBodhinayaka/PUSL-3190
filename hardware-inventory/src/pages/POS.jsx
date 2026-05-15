import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    MagnifyingGlassIcon,
    MinusIcon,
    PlusIcon,
    ShoppingCartIcon,
    TrashIcon,
} from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';
import Layout from '../components/Layout';
import { supabase } from '../lib/supabase';

const PAYMENT_METHODS = ['cash', 'card', 'bank_transfer', 'mobile_payment', 'other'];
const PAYMENT_STATUSES = ['paid', 'pending'];

function money(value) {
    return `$${Number(value || 0).toFixed(2)}`;
}

export default function POS() {
    const [products, setProducts] = useState([]);
    const [search, setSearch] = useState('');
    const [cart, setCart] = useState([]);
    const [customerName, setCustomerName] = useState('');
    const [discountAmount, setDiscountAmount] = useState('');
    const [paymentMethod, setPaymentMethod] = useState('cash');
    const [paymentStatus, setPaymentStatus] = useState('paid');
    const [loading, setLoading] = useState(true);
    const [checkingOut, setCheckingOut] = useState(false);
    const [lastReceipt, setLastReceipt] = useState(null);

    const loadProducts = useCallback(async () => {
        setLoading(true);
        const { data, error } = await supabase
            .from('products')
            .select('id, name, sku, current_stock, unit_price')
            .order('name');

        if (error) {
            toast.error('Failed to load products');
        } else {
            setProducts(data || []);
        }
        setLoading(false);
    }, []);

    useEffect(() => {
        loadProducts();
    }, [loadProducts]);

    const filteredProducts = useMemo(() => {
        const term = search.trim().toLowerCase();
        if (!term) return products.slice(0, 12);
        return products
            .filter((product) =>
                product.name.toLowerCase().includes(term) ||
                product.sku.toLowerCase().includes(term)
            )
            .slice(0, 20);
    }, [products, search]);

    const subtotal = useMemo(
        () => cart.reduce((sum, item) => sum + item.quantity * Number(item.unit_price || 0), 0),
        [cart]
    );
    const discount = Math.min(Number(discountAmount || 0), subtotal);
    const total = Math.max(0, subtotal - discount);

    function addToCart(product) {
        if (product.current_stock <= 0) {
            toast.error('This item is out of stock');
            return;
        }

        setCart((items) => {
            const existing = items.find((item) => item.product_id === product.id);
            if (existing) {
                if (existing.quantity >= product.current_stock) {
                    toast.error('Not enough stock available');
                    return items;
                }
                return items.map((item) =>
                    item.product_id === product.id
                        ? { ...item, quantity: item.quantity + 1 }
                        : item
                );
            }

            return [
                ...items,
                {
                    product_id: product.id,
                    name: product.name,
                    sku: product.sku,
                    current_stock: product.current_stock,
                    unit_price: Number(product.unit_price || 0),
                    quantity: 1,
                },
            ];
        });
    }

    function setQuantity(productId, quantity) {
        setCart((items) =>
            items.flatMap((item) => {
                if (item.product_id !== productId) return [item];
                const nextQuantity = Math.min(Math.max(Number(quantity) || 0, 0), item.current_stock);
                return nextQuantity > 0 ? [{ ...item, quantity: nextQuantity }] : [];
            })
        );
    }

    function handleSearchKeyDown(event) {
        if (event.key !== 'Enter') return;
        event.preventDefault();

        const term = search.trim().toLowerCase();
        const exactMatch = products.find((product) => product.sku.toLowerCase() === term);
        if (exactMatch) {
            addToCart(exactMatch);
            setSearch('');
        }
    }

    async function handleCheckout() {
        if (cart.length === 0) {
            toast.error('Add at least one item to the cart');
            return;
        }

        const invalidItem = cart.find((item) => item.quantity > item.current_stock);
        if (invalidItem) {
            toast.error(`${invalidItem.name} only has ${invalidItem.current_stock} in stock`);
            return;
        }

        setCheckingOut(true);

        try {
            const { data, error } = await supabase.rpc('complete_sale', {
                p_customer_name: customerName.trim() || null,
                p_discount_amount: discount,
                p_payment_method: paymentMethod,
                p_payment_status: paymentStatus,
                p_items: cart.map((item) => ({
                    product_id: item.product_id,
                    quantity: item.quantity,
                })),
            });

            if (error) throw error;

            setLastReceipt({
                receiptNumber: data.receipt_number,
                total: data.total_amount,
            });
            setCart([]);
            setCustomerName('');
            setDiscountAmount('');
            setPaymentMethod('cash');
            setPaymentStatus('paid');
            setSearch('');
            toast.success(`Sale completed: ${data.receipt_number}`);
            await loadProducts();
        } catch (error) {
            toast.error(`Checkout failed: ${error.message}`);
        } finally {
            setCheckingOut(false);
        }
    }

    return (
        <Layout title="Point of Sale">
            <div className="grid grid-cols-1 xl:grid-cols-[1fr_420px] gap-6">
                <div className="space-y-4">
                    <div className="card">
                        <div className="relative">
                            <MagnifyingGlassIcon className="w-5 h-5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                            <input
                                className="input-field pl-10 text-base"
                                placeholder="Search or scan SKU..."
                                value={search}
                                onChange={(event) => setSearch(event.target.value)}
                                onKeyDown={handleSearchKeyDown}
                                autoFocus
                            />
                        </div>
                        {lastReceipt && (
                            <p className="text-sm text-green-700 mt-3">
                                Last sale: <span className="font-semibold">{lastReceipt.receiptNumber}</span> for {money(lastReceipt.total)}
                            </p>
                        )}
                    </div>

                    <div className="card p-0 overflow-hidden">
                        <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                            <h3 className="font-bold text-gray-800">Products</h3>
                            <span className="text-xs text-gray-400">{filteredProducts.length} shown</span>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full">
                                <thead className="bg-gray-50">
                                    <tr>
                                        <th className="table-header">Product</th>
                                        <th className="table-header">SKU</th>
                                        <th className="table-header">Stock</th>
                                        <th className="table-header">Price</th>
                                        <th className="table-header">Action</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {loading ? (
                                        <tr><td colSpan={5} className="text-center py-12"><div className="spinner mx-auto" /></td></tr>
                                    ) : filteredProducts.length === 0 ? (
                                        <tr><td colSpan={5} className="text-center py-12 text-gray-400 text-sm">No products found.</td></tr>
                                    ) : filteredProducts.map((product) => (
                                        <tr key={product.id} className="table-row">
                                            <td className="table-cell font-medium text-gray-800">{product.name}</td>
                                            <td className="table-cell font-mono text-xs text-gray-500">{product.sku}</td>
                                            <td className="table-cell">
                                                <span className={product.current_stock <= 0 ? 'text-red-600 font-bold' : 'font-semibold text-gray-800'}>
                                                    {product.current_stock}
                                                </span>
                                            </td>
                                            <td className="table-cell">{money(product.unit_price)}</td>
                                            <td className="table-cell">
                                                <button
                                                    className="btn-secondary py-1.5 px-3 text-xs flex items-center gap-1"
                                                    onClick={() => addToCart(product)}
                                                    disabled={product.current_stock <= 0}
                                                >
                                                    <PlusIcon className="w-4 h-4" />
                                                    Add
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>

                <div className="card h-fit">
                    <div className="flex items-center gap-2 mb-4">
                        <ShoppingCartIcon className="w-5 h-5 text-accent" />
                        <h3 className="font-bold text-gray-800">Current Sale</h3>
                    </div>

                    <div className="space-y-3 mb-4 max-h-80 overflow-y-auto pr-1">
                        {cart.length === 0 ? (
                            <div className="text-center py-10 text-gray-400">
                                <ShoppingCartIcon className="w-10 h-10 mx-auto mb-2 opacity-30" />
                                <p className="text-sm">Cart is empty.</p>
                            </div>
                        ) : cart.map((item) => (
                            <div key={item.product_id} className="border border-gray-100 rounded-lg p-3">
                                <div className="flex items-start justify-between gap-3">
                                    <div>
                                        <p className="text-sm font-semibold text-gray-800">{item.name}</p>
                                        <p className="text-xs text-gray-400">{item.sku} | {money(item.unit_price)}</p>
                                    </div>
                                    <button
                                        className="text-gray-400 hover:text-red-500"
                                        onClick={() => setQuantity(item.product_id, 0)}
                                        title="Remove item"
                                    >
                                        <TrashIcon className="w-4 h-4" />
                                    </button>
                                </div>
                                <div className="flex items-center justify-between mt-3">
                                    <div className="flex items-center gap-2">
                                        <button
                                            className="btn-secondary p-1"
                                            onClick={() => setQuantity(item.product_id, item.quantity - 1)}
                                            title="Decrease quantity"
                                        >
                                            <MinusIcon className="w-4 h-4" />
                                        </button>
                                        <input
                                            type="number"
                                            min="1"
                                            max={item.current_stock}
                                            className="input-field w-16 text-center py-1"
                                            value={item.quantity}
                                            onChange={(event) => setQuantity(item.product_id, event.target.value)}
                                        />
                                        <button
                                            className="btn-secondary p-1"
                                            onClick={() => setQuantity(item.product_id, item.quantity + 1)}
                                            title="Increase quantity"
                                        >
                                            <PlusIcon className="w-4 h-4" />
                                        </button>
                                    </div>
                                    <p className="font-bold text-gray-800">{money(item.quantity * item.unit_price)}</p>
                                </div>
                            </div>
                        ))}
                    </div>

                    <div className="space-y-3 border-t border-gray-100 pt-4">
                        <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">Customer Name</label>
                            <input
                                className="input-field"
                                placeholder="Optional"
                                value={customerName}
                                onChange={(event) => setCustomerName(event.target.value)}
                            />
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="block text-xs font-medium text-gray-600 mb-1">Payment Method</label>
                                <select
                                    className="input-field"
                                    value={paymentMethod}
                                    onChange={(event) => setPaymentMethod(event.target.value)}
                                >
                                    {PAYMENT_METHODS.map((method) => (
                                        <option key={method} value={method}>{method.replace('_', ' ')}</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-gray-600 mb-1">Payment Status</label>
                                <select
                                    className="input-field"
                                    value={paymentStatus}
                                    onChange={(event) => setPaymentStatus(event.target.value)}
                                >
                                    {PAYMENT_STATUSES.map((status) => (
                                        <option key={status} value={status}>{status}</option>
                                    ))}
                                </select>
                            </div>
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">Discount Amount</label>
                            <input
                                type="number"
                                min="0"
                                step="0.01"
                                className="input-field"
                                value={discountAmount}
                                onChange={(event) => setDiscountAmount(event.target.value)}
                            />
                        </div>
                    </div>

                    <div className="border-t border-gray-100 mt-4 pt-4 space-y-2">
                        <div className="flex justify-between text-sm">
                            <span className="text-gray-500">Subtotal</span>
                            <span className="font-semibold">{money(subtotal)}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                            <span className="text-gray-500">Discount</span>
                            <span className="font-semibold">{money(discount)}</span>
                        </div>
                        <div className="flex justify-between text-lg">
                            <span className="font-bold text-gray-800">Total</span>
                            <span className="font-bold text-gray-900">{money(total)}</span>
                        </div>
                    </div>

                    <button
                        className="btn-primary w-full mt-5 py-3"
                        onClick={handleCheckout}
                        disabled={checkingOut || cart.length === 0}
                    >
                        {checkingOut ? 'Completing Sale...' : 'Complete Sale'}
                    </button>
                </div>
            </div>
        </Layout>
    );
}
