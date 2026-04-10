import { ReactNode } from 'react';
import { useAuthStore } from '../stores/auth.store';
import { hasPermission } from '@gestor/auth';

interface PermissionGateProps {
  permission: string;
  children: ReactNode;
  fallback?: ReactNode;
}

/**
 * Conditionally renders children only if the current user has the specified permission.
 * Useful for hiding UI elements based on RBAC.
 */
export function PermissionGate({
  permission,
  children,
  fallback,
}: PermissionGateProps) {
  const { user } = useAuthStore();

  if (!user) return null;

  if (!hasPermission(user.permissions, permission)) {
    return fallback ? (
      <>{fallback}</>
    ) : (
      <div className="p-6 text-center">
        <div className="text-4xl mb-4">🔒</div>
        <h2 className="text-xl font-semibold text-gray-700">Acesso Restrito</h2>
        <p className="text-gray-500 mt-2">
          Você não possui permissão para acessar esta área.
        </p>
      </div>
    );
  }

  return <>{children}</>;
}
