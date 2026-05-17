import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
    findProductForSearchInput,
    formatProductOption,
    getProductSearchOptions,
} from '../lib/productSearch';

export default function ProductSearchInput({
    id,
    products,
    selectedProductId,
    onSelectProduct,
    placeholder = 'Search by SKU or product name...',
    disabledProductIds = new Set(),
    getDisabledReason,
    onBlockedSelect,
    renderSelectedProduct,
    required = false,
}) {
    const inputId = id || 'product-search';
    const listId = `${inputId}-options`;
    const disabledIds = useMemo(() => new Set(disabledProductIds), [disabledProductIds]);
    const [searchText, setSearchText] = useState('');
    const previousSelectedProductId = useRef(selectedProductId);

    const selectedProduct = products.find((product) => product.id === selectedProductId);
    const productOptions = useMemo(
        () => getProductSearchOptions(products, searchText),
        [products, searchText]
    );

    useEffect(() => {
        if (selectedProduct) {
            setSearchText(formatProductOption(selectedProduct));
        } else if (previousSelectedProductId.current) {
            setSearchText('');
        }
        previousSelectedProductId.current = selectedProductId;
    }, [selectedProduct, selectedProductId]);

    function selectProduct(product) {
        if (product && disabledIds.has(product.id)) {
            const reason = getDisabledReason?.(product);
            onBlockedSelect?.(product, reason);
            onSelectProduct('');
            return;
        }
        onSelectProduct(product?.id || '', product || null);
    }

    function handleChange(event) {
        const value = event.target.value;
        setSearchText(value);
        selectProduct(findProductForSearchInput(products, value));
    }

    function handleBlur() {
        if (selectedProductId || !searchText.trim()) return;

        const matches = getProductSearchOptions(products, searchText, 2);
        if (matches.length === 1) {
            const [product] = matches;
            if (!disabledIds.has(product.id)) {
                setSearchText(formatProductOption(product));
                onSelectProduct(product.id, product);
                return;
            }
            const reason = getDisabledReason?.(product);
            onBlockedSelect?.(product, reason);
        }
    }

    return (
        <div>
            <input
                list={listId}
                className="input-field"
                value={searchText}
                onChange={handleChange}
                onBlur={handleBlur}
                placeholder={placeholder}
                required={required}
            />
            <datalist id={listId}>
                {productOptions.map((product) => {
                    const disabledReason = disabledIds.has(product.id) ? getDisabledReason?.(product) : null;
                    return (
                        <option
                            key={product.id}
                            value={formatProductOption(product)}
                            label={disabledReason || undefined}
                        />
                    );
                })}
            </datalist>
            {selectedProduct && renderSelectedProduct?.(selectedProduct)}
        </div>
    );
}
