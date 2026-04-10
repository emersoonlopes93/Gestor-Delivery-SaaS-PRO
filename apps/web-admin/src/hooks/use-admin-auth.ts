import { useAuthStore } from '../stores/auth.store';
import { hasPermission, hasAnyPermission, hasAllPermissions } from '@gestor/auth';

/**
 * Hook to access current admin user and authentication state.
 */
export function useAdminAuth() {
  const { user, isAuthenticated, isLoading, clearUser } = useAuthStore();

  return {
    user,
    isAuthenticated,
    isLoading,
    logout: clearUser,
  };
}

/**
 * Hook to get the current admin user data directly.
 */
export function useCurrentAdminUser() {
  const { user } = useAuthStore();
  if (!user) {
    throw new Error('useCurrentAdminUser must be used within an authenticated route');
  }
  return user;
}

/**
 * Hook to check admin permissions.
 */
export function useAdminPermissions() {
  const { user } = useAuthStore();
  const permissions = user?.permissions || [];

  return {
    permissions,
    has: (permission: string) => hasPermission(permissions, permission),
    hasAny: (perms: string[]) => hasAnyPermission(permissions, perms),
    hasAll: (perms: string[]) => hasAllPermissions(permissions, perms),
  };
}
