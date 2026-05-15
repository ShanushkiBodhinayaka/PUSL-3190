export function getPostLoginRoute(role) {
    return role === 'approval_manager' ? '/order-approval' : '/dashboard';
}
