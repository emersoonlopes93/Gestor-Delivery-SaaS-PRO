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
  const { isAuthenticated, isLoading, setUser, clearUser } =
    useAuthStore();
  const navigate = useNavigate();

  useEffect(() => {
    // Intercepta impersonate_token se fornecido na URL
    const urlParams = new URLSearchParams(window.location.search);
    const impersonateToken = urlParams.get('impersonate_token');
    if (impersonateToken) {
      localStorage.setItem('accessToken', impersonateToken);
      // Remove o query param da URL sem causar reload
      const url = new URL(window.location.href);
      url.searchParams.delete('impersonate_token');
      window.history.replaceState({}, '', url.pathname + url.search);
    }

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
  }, [clearUser, navigate, setUser]);

  if (isLoading) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center bg-background text-foreground safe-inset">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  return <>{children}</>;
}
