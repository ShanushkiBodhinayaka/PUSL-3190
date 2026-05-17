import { findProductForSearchInput, getProductSearchOptions, matchesProductSearch } from './productSearch';

const products = [
    { id: '1', sku: 'DEMO-00073', name: 'Galvanized Screws Pack 73', category: 'Fasteners' },
    { id: '2', sku: 'PVC-00963', name: 'PVC Elbow Fitting 963', category: 'Plumbing' },
];

describe('product search helpers', () => {
    it('matches products by partial SKU and name', () => {
        expect(matchesProductSearch(products[0], '00073')).toBe(true);
        expect(matchesProductSearch(products[1], 'elbow')).toBe(true);
        expect(matchesProductSearch(products[1], 'fasteners')).toBe(false);
    });

    it('finds an exact product from typed SKU or datalist label', () => {
        expect(findProductForSearchInput(products, 'DEMO-00073')).toEqual(products[0]);
        expect(findProductForSearchInput(products, 'PVC-00963 - PVC Elbow Fitting 963')).toEqual(products[1]);
        expect(findProductForSearchInput(products, 'missing')).toBeNull();
    });

    it('limits filtered product options', () => {
        expect(getProductSearchOptions(products, 'p', 1)).toHaveLength(1);
    });
});
