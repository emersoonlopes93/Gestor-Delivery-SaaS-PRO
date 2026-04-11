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
}

export function CustomersListPage() {
  const [customers, setCustomers] = useState<CustomerListItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadCustomers();
  }, []);

  const loadCustomers = async () => {
    try {
      setIsLoading(true);
      const res = await api.get('/crm/customers');
      setCustomers(res.data as CustomerListItem[]);
    } catch (err) {
      console.error(err);
      alert('Erro ao carregar clientes');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-900">👥 Clientes (CRM)</h1>
      </div>

      <div className="bg-white rounded-lg shadow border border-gray-200">
        <table className="w-full text-left text-sm">
          <thead className="bg-gray-50 border-b border-gray-200 text-gray-600">
            <tr>
              <th className="p-4 font-semibold">Nome</th>
              <th className="p-4 font-semibold">Telefone</th>
              <th className="p-4 font-semibold text-center">Pedidos</th>
              <th className="p-4 font-semibold text-right">Gasto T.</th>
              <th className="p-4 font-semibold text-right">Cashback</th>
              <th className="p-4 font-semibold text-right">Último Pedido</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {isLoading ? (
              <tr>
                <td colSpan={6} className="p-4 text-center text-gray-500">
                  Carregando...
                </td>
              </tr>
            ) : customers.length === 0 ? (
              <tr>
                <td colSpan={6} className="p-4 text-center text-gray-500">
                  Nenhum cliente cadastrado ainda.
                </td>
              </tr>
            ) : (
              customers.map((c) => (
                <tr key={c.id} className="hover:bg-gray-50 transition-colors">
                  <td className="p-4 font-medium text-gray-900">{c.name}</td>
                  <td className="p-4 text-gray-600">{c.phone}</td>
                  <td className="p-4 text-center">
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">
                      {c.totalOrders}
                    </span>
                  </td>
                  <td className="p-4 text-right font-medium text-gray-900">
                    {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(c.totalSpent)}
                  </td>
                  <td className="p-4 text-right text-green-600 font-medium">
                    {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(c.cashbackBalance)}
                  </td>
                  <td className="p-4 text-right text-gray-500">
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
