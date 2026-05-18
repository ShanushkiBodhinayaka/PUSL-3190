export const ROLES = [
    'admin',
    'inventory_manager',
    'sales_operator',
    'approval_manager',
    'staff',
];

export const ROLE_LABELS = {
    admin: 'Admin',
    inventory_manager: 'Inventory Manager',
    sales_operator: 'Sales Operator',
    approval_manager: 'Approval Manager',
    staff: 'Staff',
};

export const ROLE_COLORS = {
    admin: 'bg-purple-100 text-purple-800',
    inventory_manager: 'bg-blue-100 text-blue-800',
    sales_operator: 'bg-green-100 text-green-800',
    approval_manager: 'bg-orange-100 text-orange-800',
    staff: 'bg-gray-100 text-gray-800',
};

export const ROUTE_ROLES = {
    dashboard: ROLES,
    salesImport: ['admin', 'sales_operator'],
    importHistory: ['admin', 'sales_operator'],
    inventory: ['admin', 'inventory_manager', 'staff'],
    stockMovements: ['admin', 'inventory_manager', 'staff'],
    purchaseOrders: ['admin', 'inventory_manager', 'approval_manager', 'staff'],
    orderApproval: ['admin', 'approval_manager'],
    reports: ['admin', 'inventory_manager', 'approval_manager'],
    users: ['admin'],
};

export const canManageInventory = (role) => ['admin', 'inventory_manager'].includes(role);

export const canCreatePurchaseOrders = (role) =>
    ['admin', 'inventory_manager'].includes(role);
