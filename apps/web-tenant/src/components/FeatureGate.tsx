import type { ReactNode } from 'react';
import { useTenantCapabilities } from '../hooks/useTenantCapabilities';

type FeatureGateProps = {
  featureKey: string;
  children: ReactNode;
  fallback?: ReactNode;
};

export function FeatureGate({ featureKey, children, fallback }: FeatureGateProps) {
  const { isLoading, isFeatureEnabled, getFeatureDecision } = useTenantCapabilities();

  if (isLoading) {
    return (
      <div className="p-6 text-center flex flex-col items-center justify-center min-h-[360px]">
        <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin mb-4" />
        <h2 className="text-xl font-semibold text-gray-700 dark:text-gray-300">Carregando...</h2>
        <p className="text-gray-500 dark:text-gray-400 mt-2">
          Verificando disponibilidade da funcionalidade.
        </p>
      </div>
    );
  }

  if (isFeatureEnabled(featureKey)) {
    return <>{children}</>;
  }

  if (fallback) {
    return <>{fallback}</>;
  }

  const decision = getFeatureDecision(featureKey);

  return (
    <div className="p-6 text-center flex flex-col items-center justify-center min-h-[360px]">
      <div className="text-5xl mb-4 opacity-50">🔒</div>
      <h2 className="text-xl font-semibold text-gray-700 dark:text-gray-300">Funcionalidade indisponivel</h2>
      <p className="text-gray-500 dark:text-gray-400 mt-2 max-w-lg">
        Esta area nao esta habilitada para o seu tenant neste momento.
      </p>
      <p className="text-xs text-gray-400 mt-4">
        Feature: <code className="bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded">{featureKey}</code>
      </p>
      {decision?.reason ? (
        <p className="text-xs text-gray-400 mt-2">
          Motivo: <code className="bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded">{decision.reason}</code>
        </p>
      ) : null}
    </div>
  );
}
