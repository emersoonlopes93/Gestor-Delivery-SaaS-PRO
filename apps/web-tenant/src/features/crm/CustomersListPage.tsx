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
                  <td className="p-4 font-medium text-gray-900 dark:text-gray-100">{c.name}</td>
                  <td className="p-4 text-gray-600 dark:text-gray-400">{c.phone}</td>
                  <td className="p-4 text-center">
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">
                      {c.totalOrders}
                    </span>
                  </td>
                  <td className="p-4 text-right font-medium text-gray-900 dark:text-gray-100">
                    {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(c.totalSpent)}
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
    </div>
  );
}
