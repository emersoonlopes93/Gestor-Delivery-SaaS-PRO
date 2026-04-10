import { useAuthStore } from '../stores/auth.store';
import { hasPermission, hasAnyPermission, hasAllPermissions } from '@gestor/auth';

/**
 * Hook to access current tenant user and authentication state.
 */
export function useTenantAuth() {
  const { user, isAuthenticated, isLoading, clearUser } = useAuthStore();

  return {
    user,
    isAuthenticated,
    isLoading,
    logout: clearUser,
  };
}

/**
 * Hook to get the current tenant user data directly.
 */
export function useCurrentTenantUser() {
  const { user } = useAuthStore();
  if (!user) {
    throw new Error('useCurrentTenantUser must be used within an authenticated route');
  }
  return user;
}

/**
 * Hook to check permissions for the current tenant user.
 */
export function usePermissions() {
  const { user } = useAuthStore();
  const permissions = user?.permissions || [];

  return {
    permissions,
    has: (permission: string) => hasPermission(permissions, permission),
    hasAny: (perms: string[]) => hasAnyPermission(permissions, perms),
    hasAll: (perms: string[]) => hasAllPermissions(permissions, perms),
  };
}
