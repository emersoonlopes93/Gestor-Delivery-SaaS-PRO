import { useAuthStore } from '../../stores/auth.store';

/**
 * Dashboard page — base placeholder for Phase 1.
 * Will be expanded with real operational widgets in Phase 2+.
 */
export function DashboardPage() {
  const { user } = useAuthStore();

  return (
    <div className="p-6">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-gray-500 mt-1">
          Bem-vindo, <span className="font-medium text-gray-700">{user?.name}</span>
        </p>
      </div>

      {/* Info cards placeholder */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        {[
          { label: 'Pedidos Hoje', value: '—', icon: '📦' },
          { label: 'Faturamento', value: '—', icon: '💰' },
          { label: 'Ticket Médio', value: '—', icon: '📊' },
          { label: 'Em Preparo', value: '—', icon: '🍕' },
        ].map((card) => (
          <div
            key={card.label}
            className="bg-white rounded-xl border border-gray-200 p-6 hover:shadow-md transition-shadow"
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-2xl">{card.icon}</span>
            </div>
            <p className="text-2xl font-bold text-gray-900">{card.value}</p>
            <p className="text-sm text-gray-500 mt-1">{card.label}</p>
          </div>
        ))}
      </div>

      {/* Session info */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          Sessão Atual
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-gray-500">Usuário:</span>{' '}
            <span className="font-medium">{user?.email}</span>
          </div>
          <div>
            <span className="text-gray-500">Tenant ID:</span>{' '}
            <span className="font-mono text-xs">{user?.tenantId}</span>
          </div>
          <div>
            <span className="text-gray-500">Perfis:</span>{' '}
            <span className="font-medium">
              {user?.roles.join(', ') || 'Nenhum'}
            </span>
          </div>
          <div>
            <span className="text-gray-500">Permissões:</span>{' '}
            <span className="font-medium">{user?.permissions.length || 0}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
