import { ReactNode, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import type { AdminUserSession } from '@gestor/types';
import { useAuthStore } from '../stores/auth.store';
import { api } from '../lib/api-client';

interface ProtectedRouteProps {
  children: ReactNode;
}

export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { isAuthenticated, isLoading, setUser, clearUser } = useAuthStore();
  const navigate = useNavigate();

  useEffect(() => {
    const token = localStorage.getItem('admin_accessToken');
    if (!token) {
      clearUser();
      navigate('/login');
      return;
    }

    api
      .get<AdminUserSession>('/auth/admin/me')
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
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  if (!isAuthenticated) return null;

  return <>{children}</>;
}
