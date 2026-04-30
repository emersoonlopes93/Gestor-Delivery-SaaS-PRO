import { ReactNode, useEffect } from 'react';
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

  useEffect(() => {
    if (!user) {
      console.warn('[PermissionGate] User not loaded yet', { permission });
    } else if (!hasPermission(user.permissions, permission)) {
      console.error('[PermissionGate] Permission denied', {
        required: permission,
        userPermissions: user.permissions,
      });
    }
  }, [user, permission]);

  if (!user) {
    return (
      <div className="p-6 text-center">
        <div className="text-4xl mb-4 animate-spin">??</div>
        <h2 className="text-xl font-semibold text-gray-700 dark:text-gray-300">Carregando...</h2>
        <p className="text-gray-500 dark:text-gray-400 mt-2">
          Verificando permissões de acesso.
        </p>
      </div>
    );
  }

  if (!hasPermission(user.permissions, permission)) {
    return fallback ? (
      <>{fallback}</>
    ) : (
      <div className="p-6 text-center">
        <div className="text-4xl mb-4">??</div>
        <h2 className="text-xl font-semibold text-gray-700 dark:text-gray-300">Acesso Restrito</h2>
        <p className="text-gray-500 dark:text-gray-400 mt-2">
          Você não possui permissão para acessar esta área.
        </p>
        <p className="text-xs text-gray-400 mt-1">
          Permissão necessária: <code className="bg-gray-100 px-1 py-0.5 rounded">{permission}</code>
        </p>
      </div>
    );
  }

  return <>{children}</>;
}
