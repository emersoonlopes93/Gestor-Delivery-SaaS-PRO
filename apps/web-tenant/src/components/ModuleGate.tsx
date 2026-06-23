import { ReactNode, useEffect } from 'react';
import { useAuthStore } from '../stores/auth.store';

interface ModuleGateProps {
  module: string;
  children: ReactNode;
  fallback?: ReactNode;
}

/**
 * Conditionally renders children only if the current tenant has the specified module enabled.
 * Useful for hiding UI elements based on BillingPlan/Addons.
 */
export function ModuleGate({
  module,
  children,
  fallback,
}: ModuleGateProps) {
  const { user } = useAuthStore();

  useEffect(() => {
    if (!user) {
      console.warn('[ModuleGate] User not loaded yet', { module });
    } else if (user.enabledModules && !user.enabledModules.includes(module)) {
      console.error('[ModuleGate] Module access denied', {
        required: module,
        enabledModules: user.enabledModules,
      });
    }
  }, [user, module]);

  if (!user) {
    return (
      <div className="p-6 text-center flex flex-col items-center justify-center min-h-[400px]">
        <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin mb-4"></div>
        <h2 className="text-xl font-semibold text-gray-700 dark:text-gray-300">Carregando...</h2>
        <p className="text-gray-500 dark:text-gray-400 mt-2">
          Verificando permissões de acesso.
        </p>
      </div>
    );
  }

  // Se enabledModules for undefined, assume-se que é uma sessão legada ou não possui módulos ativos.
  const hasAccess = Array.isArray(user.enabledModules) && user.enabledModules.includes(module);

  if (!hasAccess) {
    return fallback !== undefined ? (
      <>{fallback}</>
    ) : (
      <div className="p-6 text-center flex flex-col items-center justify-center min-h-[400px]">
        <div className="text-5xl mb-4 opacity-50">🔒</div>
        <h2 className="text-xl font-semibold text-gray-700 dark:text-gray-300">Recurso indisponível no seu plano</h2>
        <p className="text-gray-500 dark:text-gray-400 mt-2">
          Você precisa de um plano superior ou contratar este módulo para acessar esta área.
        </p>
        <p className="text-xs text-gray-400 mt-4">
          Módulo exigido: <code className="bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded">{module}</code>
        </p>
      </div>
    );
  }

  return <>{children}</>;
}
