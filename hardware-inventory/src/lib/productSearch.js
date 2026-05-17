export function formatProductOption(product) {
    if (!product) return '';
    return `${product.sku} - ${product.name}`;
}

export function matchesProductSearch(product, query) {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return true;

    return [
        product.name,
        product.sku,
        formatProductOption(product),
        product.category,
        product.supplier_name,
    ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(normalized));
}

export function findProductForSearchInput(products, value) {
    const normalized = value.trim().toLowerCase();
    if (!normalized) return null;

    return products.find((product) => (
        product.id === value
        || product.sku.toLowerCase() === normalized
        || product.name.toLowerCase() === normalized
        || formatProductOption(product).toLowerCase() === normalized
    )) || null;
}

export function getProductSearchOptions(products, query, limit = 75) {
    return products
        .filter((product) => matchesProductSearch(product, query))
        .slice(0, limit);
}
