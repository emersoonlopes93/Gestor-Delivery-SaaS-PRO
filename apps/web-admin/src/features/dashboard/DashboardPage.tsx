import { useAuthStore } from '../../stores/auth.store';

export function DashboardPage() {
  const { user } = useAuthStore();

  return (
    <div className="p-6">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">SaaS Admin Dashboard</h1>
        <p className="text-gray-500 mt-1">
          Bem-vindo, <span className="font-medium text-gray-700">{user?.name}</span>
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
        {[
          { label: 'Tenants Ativos', value: '—', icon: '🏪' },
          { label: 'Receita MRR', value: '—', icon: '💰' },
          { label: 'Tickets Suporte', value: '—', icon: '🎫' },
        ].map((card) => (
          <div
            key={card.label}
            className="bg-white rounded-xl border border-gray-200 p-6 hover:shadow-md transition-shadow"
          >
            <span className="text-2xl">{card.icon}</span>
            <p className="text-2xl font-bold text-gray-900 mt-2">{card.value}</p>
            <p className="text-sm text-gray-500 mt-1">{card.label}</p>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Sessão Admin</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-gray-500">E-mail:</span>{' '}
            <span className="font-medium">{user?.email}</span>
          </div>
          <div>
            <span className="text-gray-500">Perfis:</span>{' '}
            <span className="font-medium">{user?.roles.join(', ') || 'N/A'}</span>
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
