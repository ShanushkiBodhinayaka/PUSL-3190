import { getPostLoginRoute } from './navigation';

describe('getPostLoginRoute', () => {
    it('routes approval managers to the approval queue', () => {
        expect(getPostLoginRoute('approval_manager')).toBe('/order-approval');
    });

    it('routes other roles to the dashboard', () => {
        expect(getPostLoginRoute('admin')).toBe('/dashboard');
        expect(getPostLoginRoute('staff')).toBe('/dashboard');
    });
});
