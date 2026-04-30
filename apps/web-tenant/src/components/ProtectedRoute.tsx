import { ReactNode, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../stores/auth.store';
import { api } from '../lib/api-client';

interface ProtectedRouteProps {
  children: ReactNode;
}

import type { TenantUserSession } from '@gestor/types';

/**
 * Wraps routes that require authentication.
 * Redirects to /login if not authenticated.
 * Loads user session on mount.
 */
export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { isAuthenticated, isLoading, setUser, clearUser, setLoading } =
    useAuthStore();
  const navigate = useNavigate();

  useEffect(() => {
    const token = localStorage.getItem('accessToken');
    if (!token) {
      clearUser();
      navigate('/login');
      return;
    }

    // Load session
    api
      .get<TenantUserSession>('/auth/tenant/me')
      .then((res) => {
        setUser(res.data);
      })
      .catch(() => {
        clearUser();
        navigate('/login');
      });
  }, []);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900/50">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  return <>{children}</>;
}
