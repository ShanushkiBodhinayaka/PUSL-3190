import React from 'react';
import { render, screen } from '@testing-library/react';
import ProtectedRoute from './ProtectedRoute';
import { useAuth } from '../contexts/AuthContext';

jest.mock('../contexts/AuthContext', () => ({
    useAuth: jest.fn(),
}));

jest.mock('react-router-dom', () => ({
    Navigate: ({ to }) => <div data-testid="navigate">{to}</div>,
}), { virtual: true });

describe('ProtectedRoute', () => {
    it('shows a loading state while auth is resolving', () => {
        useAuth.mockReturnValue({ loading: true, user: null, role: null });
        render(<ProtectedRoute allowedRoles={['admin']}><div>child</div></ProtectedRoute>);
        expect(screen.getByText('Loading...')).toBeInTheDocument();
    });

    it('redirects unauthenticated users to login', () => {
        useAuth.mockReturnValue({ loading: false, user: null, role: null });
        render(<ProtectedRoute allowedRoles={['admin']}><div>child</div></ProtectedRoute>);
        expect(screen.getByTestId('navigate')).toHaveTextContent('/login');
    });

    it('shows a setup message when the user has no role', () => {
        useAuth.mockReturnValue({ loading: false, user: { id: '1' }, role: null });
        render(<ProtectedRoute allowedRoles={['admin']}><div>child</div></ProtectedRoute>);
        expect(screen.getByText('Account setup incomplete')).toBeInTheDocument();
    });

    it('redirects users without permission', () => {
        useAuth.mockReturnValue({ loading: false, user: { id: '1' }, role: 'staff' });
        render(<ProtectedRoute allowedRoles={['admin']}><div>child</div></ProtectedRoute>);
        expect(screen.getByTestId('navigate')).toHaveTextContent('/unauthorized');
    });

    it('renders children for allowed users', () => {
        useAuth.mockReturnValue({ loading: false, user: { id: '1' }, role: 'admin' });
        render(<ProtectedRoute allowedRoles={['admin']}><div>Allowed</div></ProtectedRoute>);
        expect(screen.getByText('Allowed')).toBeInTheDocument();
    });
});
