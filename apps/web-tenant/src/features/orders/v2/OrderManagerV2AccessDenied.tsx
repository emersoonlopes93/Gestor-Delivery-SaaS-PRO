import { Link } from 'react-router-dom';
import { hasPermission } from '@gestor/auth';
import { useTenantCapabilities } from '../../../hooks/useTenantCapabilities';
import { useAuthStore } from '../../../stores/auth.store';

export function OrderManagerV2AccessDenied() {
  const user = useAuthStore((state) => state.user);
  const { getFeatureDecision } = useTenantCapabilities();
  const decision = getFeatureDecision('order_manager_v2');
  const missingPermission = decision?.reason === 'missing_permission';
  const canManagePermissions = hasPermission(user?.permissions ?? [], 'users.roles');

  return (
    <main className="mx-auto flex min-h-[360px] max-w-2xl flex-col items-center justify-center p-6 text-center">
      <div className="mb-4 text-5xl opacity-60" aria-hidden="true">🔒</div>
      <h1 className="text-2xl font-bold text-foreground">
        {missingPermission ? 'Você não tem acesso ao Gestor de Pedidos' : 'Gestor de Pedidos indisponível'}
      </h1>
      <p className="mt-3 max-w-lg text-muted-foreground">
        {missingPermission
          ? 'Seu perfil atual não possui permissão para utilizar o Gestor de Pedidos desta loja.'
          : 'O Gestor de Pedidos não está habilitado para esta loja neste momento.'}
      </p>
      {missingPermission ? (
        <p className="mt-2 max-w-lg text-sm text-muted-foreground">
          Se você administra esta loja, revise as permissões do perfil.
        </p>
      ) : null}
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <Link to="/orders/board" className="border border-border px-4 py-2 text-sm font-semibold text-foreground hover:bg-muted">
          Voltar ao Gestor atual
        </Link>
        {canManagePermissions ? (
          <Link to="/management/employees" className="bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90">
            Gerenciar permissões
          </Link>
        ) : null}
      </div>
      <details className="mt-8 max-w-lg text-left text-xs text-muted-foreground">
        <summary className="cursor-pointer font-semibold text-foreground">Detalhes técnicos</summary>
        <dl className="mt-3 space-y-1">
          <div><dt className="inline font-semibold">Feature: </dt><dd className="inline font-mono">order_manager_v2</dd></div>
          <div><dt className="inline font-semibold">Permissão necessária: </dt><dd className="inline font-mono">orders.use_kanban</dd></div>
          <div><dt className="inline font-semibold">Motivo: </dt><dd className="inline font-mono">{decision?.reason ?? 'unknown'}</dd></div>
        </dl>
      </details>
    </main>
  );
}
