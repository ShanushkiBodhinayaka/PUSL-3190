import { canCreatePurchaseOrders, canManageInventory } from './roles';

describe('role helpers', () => {
    it('allows only inventory admins and managers to manage inventory', () => {
        expect(canManageInventory('admin')).toBe(true);
        expect(canManageInventory('inventory_manager')).toBe(true);
        expect(canManageInventory('staff')).toBe(false);
    });

    it('allows the correct roles to create purchase orders', () => {
        expect(canCreatePurchaseOrders('admin')).toBe(true);
        expect(canCreatePurchaseOrders('inventory_manager')).toBe(true);
        expect(canCreatePurchaseOrders('procurement_manager')).toBe(true);
        expect(canCreatePurchaseOrders('sales_operator')).toBe(false);
    });
});
