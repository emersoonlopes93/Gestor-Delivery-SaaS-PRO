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
        <h2 className="text-xl font-semibold text-foreground">Acesso Restrito</h2>
        <p className="text-muted-foreground mt-2">
          Permissão necessária: <code className="text-sm bg-muted text-foreground px-2 py-1 rounded">{permission}</code>
        </p>
      </div>
    );
  }

  return <>{children}</>;
}
