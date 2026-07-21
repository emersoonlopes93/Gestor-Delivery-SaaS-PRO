import { useState, useEffect } from 'react';
import { api } from '@/lib/api-client';

interface CustomerListItem {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  totalOrders: number;
  totalSpent: number;
  lastOrderDate: string | null;
  loyaltyPoints: number;
  cashbackBalance: number;
  rfm?: {
    recency: number;
    frequency: number;
    monetary: number;
    segment: 'champion' | 'loyal' | 'at_risk' | 'hibernating' | 'new';
  };
}

interface CustomerProfile extends CustomerListItem {
  notes: string | null;
  addresses: Array<{
    id: string;
    label: string | null;
    street: string;
    number: string;
    complement: string | null;
    neighborhood: string;
    city: string;
    state: string;
    zipCode: string;
    reference: string | null;
    isDefault: boolean;
  }>;
  orders: Array<{
    id: string;
    orderNumber: string;
    status: string;
    fulfillmentType: string;
    total: number;
    createdAt: string;
  }>;
}

const SEGMENT_STYLING = {
  champion: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  loyal: 'bg-green-100 text-green-800 border-green-200',
  at_risk: 'bg-orange-100 text-orange-800 border-orange-200',
  hibernating: 'bg-red-100 text-red-800 border-red-200',
  new: 'bg-blue-100 text-blue-800 border-blue-200',
};

const SEGMENT_LABELS = {
  champion: 'Campeão',
  loyal: 'Fiel',
  at_risk: 'Em Risco',
  hibernating: 'Hibernando',
  new: 'Novo',
};

export function CustomersListPage() {
  const [customers, setCustomers] = useState<CustomerListItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [profile, setProfile] = useState<CustomerProfile | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [isProfileLoading, setIsProfileLoading] = useState(false);

  useEffect(() => {
    loadCustomers();
  }, []);

  const loadCustomers = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const res = await api.get<CustomerListItem[]>('/crm/customers');
      if (res.success) {
        setCustomers(res.data);
      }
    } catch (err) {
      console.error(err);
      setError('Erro ao carregar clientes. Verifique sua conexão.');
    } finally {
      setIsLoading(false);
    }
  };

  const loadProfile = async (customerId: string) => {
    try {
      setSelectedCustomerId(customerId);
      setProfile(null);
      setProfileError(null);
      setIsProfileLoading(true);
      const res = await api.get<CustomerProfile>(`/crm/customers/${customerId}`);
      if (res.success) {
        setProfile(res.data);
      }
    } catch (err) {
      console.error(err);
      setProfileError('Não foi possível carregar o perfil operacional deste cliente.');
    } finally {
      setIsProfileLoading(false);
    }
  };

  const closeProfile = () => {
    setSelectedCustomerId(null);
    setProfile(null);
    setProfileError(null);
  };

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">👥 Clientes (CRM)</h1>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 text-red-600 rounded-xl flex items-center justify-between">
          <span>{error}</span>
          <button onClick={loadCustomers} className="text-sm font-bold underline cursor-pointer">Tentar novamente</button>
        </div>
      )}

      <div className="bg-white dark:bg-gray-900 rounded-lg shadow border border-gray-200 dark:border-gray-800">
        <table className="w-full text-left text-sm">
          <thead className="bg-gray-50 dark:bg-gray-900/50 border-b border-gray-200 dark:border-gray-800 text-gray-600 dark:text-gray-400">
            <tr>
              <th className="p-4 font-semibold">Nome</th>
              <th className="p-4 font-semibold">Telefone</th>
              <th className="p-4 font-semibold text-center">Pedidos</th>
              <th className="p-4 font-semibold text-right">Gasto T.</th>
              <th className="p-4 font-semibold text-center">Segmento</th>
              <th className="p-4 font-semibold text-right">Último Pedido</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
            {isLoading ? (
              <tr>
                <td colSpan={6} className="p-4 text-center text-gray-500 dark:text-gray-400">
                  Carregando...
                </td>
              </tr>
            ) : customers.length === 0 ? (
              <tr>
                <td colSpan={6} className="p-4 text-center text-gray-500 dark:text-gray-400">
                  Nenhum cliente cadastrado ainda.
                </td>
              </tr>
            ) : (
              customers.map((c) => (
                <tr key={c.id} className="hover:bg-gray-50 dark:hover:bg-gray-800 dark:bg-gray-900/50 transition-colors">
                  <td className="p-4 font-medium text-gray-900 dark:text-gray-100">
                    <button
                      type="button"
                      onClick={() => void loadProfile(c.id)}
                      className="text-left underline-offset-2 hover:text-primary hover:underline"
                    >
                      {c.name}
                    </button>
                  </td>
                  <td className="p-4 text-gray-600 dark:text-gray-400">{c.phone}</td>
                  <td className="p-4 text-center">
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">
                      {c.totalOrders}
                    </span>
                  </td>
                  <td className="p-4 text-right font-medium text-gray-900 dark:text-gray-100">
                    {formatCurrency(c.totalSpent)}
                  </td>
                  <td className="p-4 text-center">
                    {c.rfm?.segment ? (
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border ${SEGMENT_STYLING[c.rfm.segment]}`}>
                        {SEGMENT_LABELS[c.rfm.segment]}
                      </span>
                    ) : (
                      <span className="text-gray-300">-</span>
                    )}
                  </td>
                  <td className="p-4 text-right text-gray-500 dark:text-gray-400">
                    {c.lastOrderDate ? new Date(c.lastOrderDate).toLocaleDateString('pt-BR') : '-'}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {selectedCustomerId && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/40" role="dialog" aria-modal="true" aria-label="Perfil do cliente">
          <div className="h-full w-full max-w-xl overflow-y-auto bg-white p-6 shadow-2xl dark:bg-gray-900">
            <div className="mb-6 flex items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">Perfil operacional do cliente</h2>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Dados, histórico e endereços deste tenant.</p>
              </div>
              <button type="button" onClick={closeProfile} className="rounded border px-3 py-1 text-sm font-semibold">Fechar</button>
            </div>

            {isProfileLoading && <p className="text-sm text-gray-500">Carregando perfil...</p>}
            {profileError && <p className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">{profileError}</p>}

            {profile && (
              <div className="space-y-6">
                <section className="rounded-lg border border-gray-200 p-4 dark:border-gray-700">
                  <h3 className="font-semibold text-gray-900 dark:text-gray-100">{profile.name}</h3>
                  <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">{profile.phone}</p>
                  <p className="text-sm text-gray-600 dark:text-gray-300">{profile.email || 'E-mail não informado'}</p>
                  {profile.notes && <p className="mt-3 rounded bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-100">Observações internas: {profile.notes}</p>}
                </section>

                <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <ProfileMetric label="Pedidos" value={String(profile.totalOrders)} />
                  <ProfileMetric label="Total gasto" value={formatCurrency(profile.totalSpent)} />
                  <ProfileMetric label="Ticket médio" value={formatCurrency(profile.totalOrders > 0 ? profile.totalSpent / profile.totalOrders : 0)} />
                  <ProfileMetric label="Último pedido" value={profile.lastOrderDate ? new Date(profile.lastOrderDate).toLocaleDateString('pt-BR') : 'Sem pedidos'} />
                </section>

                <section>
                  <h3 className="mb-3 font-semibold text-gray-900 dark:text-gray-100">Endereços</h3>
                  {profile.addresses.length === 0 ? <p className="text-sm text-gray-500">Nenhum endereço cadastrado.</p> : (
                    <div className="space-y-2">
                      {profile.addresses.map((address) => (
                        <div key={address.id} className="rounded border border-gray-200 p-3 text-sm dark:border-gray-700">
                          <p className="font-medium">{address.label || 'Endereço'}{address.isDefault ? ' · padrão' : ''}</p>
                          <p>{address.street}, {address.number}{address.complement ? ` - ${address.complement}` : ''}</p>
                          <p>{address.neighborhood} · {address.city}/{address.state}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </section>

                <section>
                  <h3 className="mb-3 font-semibold text-gray-900 dark:text-gray-100">Histórico recente de pedidos</h3>
                  {profile.orders.length === 0 ? <p className="text-sm text-gray-500">Nenhum pedido encontrado.</p> : (
                    <div className="space-y-2">
                      {profile.orders.map((order) => (
                        <div key={order.id} className="flex items-center justify-between rounded border border-gray-200 p-3 text-sm dark:border-gray-700">
                          <div><p className="font-medium">{order.orderNumber}</p><p className="text-gray-500">{new Date(order.createdAt).toLocaleString('pt-BR')} · {order.fulfillmentType} · {order.status}</p></div>
                          <strong>{formatCurrency(order.total)}</strong>
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function ProfileMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-gray-200 p-3 dark:border-gray-700">
      <p className="text-xs text-gray-500">{label}</p>
      <p className="mt-1 text-sm font-bold text-gray-900 dark:text-gray-100">{value}</p>
    </div>
  );
}
