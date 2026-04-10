import { ReactNode } from 'react';
import { useAuthStore } from '../stores/auth.store';
import { hasPermission } from '@gestor/auth';

interface PermissionGateProps {
  permission: string;
  children: ReactNode;
  fallback?: ReactNode;
}

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
          Permissão necessária: <code className="text-sm bg-gray-100 px-2 py-1 rounded">{permission}</code>
        </p>
      </div>
    );
  }

  return <>{children}</>;
}
