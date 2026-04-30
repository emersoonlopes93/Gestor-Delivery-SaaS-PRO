import React, { useState, useEffect } from 'react';
import { api } from '../../lib/api-client';
import { PurchaseDTO, PurchaseStatus, PaymentStatus } from '@gestor/types';
import { PurchaseModal } from './PurchaseModal';
import { ShoppingCart, Plus, Search, Package, AlertCircle, CheckCircle2, Clock } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export function PurchasesPage() {
  const [purchases, setPurchases] = useState<PurchaseDTO[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    loadPurchases();
  }, []);

  const loadPurchases = async () => {
    setIsLoading(true);
    try {
      const response = await api.get<PurchaseDTO[]>('/purchasing/purchases');
      if (response.success) {
        setPurchases(response.data);
      }
    } catch (error) {
      console.error('Erro ao carregar compras:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async (data: any) => {
    try {
      await api.post('/purchasing/purchases', data);
      loadPurchases();
      setIsModalOpen(false);
    } catch (error) {
      console.error('Erro ao registrar compra:', error);
      throw error;
    }
  };

  const statusMap: Record<PurchaseStatus, { label: string, color: string, icon: any }> = {
    [PurchaseStatus.DRAFT]: { label: 'Rascunho', color: 'bg-gray-100 text-gray-700 dark:text-gray-300', icon: Clock },
    [PurchaseStatus.PENDING]: { label: 'Pendente', color: 'bg-yellow-100 text-yellow-700', icon: AlertCircle },
    [PurchaseStatus.RECEIVED]: { label: 'Recebido', color: 'bg-green-100 text-green-700', icon: CheckCircle2 },
    [PurchaseStatus.CANCELLED]: { label: 'Cancelado', color: 'bg-red-100 text-red-700', icon: AlertCircle },
  };

  const paymentStatusMap: Record<PaymentStatus, { label: string, color: string }> = {
    [PaymentStatus.PENDING]: { label: 'Pendente', color: 'text-red-600' },
    [PaymentStatus.PARTIAL]: { label: 'Parcial', color: 'text-yellow-600' },
    [PaymentStatus.PAID]: { label: 'Pago', color: 'text-green-600' },
    [PaymentStatus.CANCELLED]: { label: 'Cancelado', color: 'text-gray-400' },
  };

  const filteredPurchases = purchases.filter(p => 
    p.number?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.supplier?.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="p-6 max-w-7xl mx-auto text-left">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 tracking-tight flex items-center gap-3">
            <ShoppingCart className="h-8 w-8 text-primary-600" />
            Compras e Entradas
          </h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">Registre entradas de insumos e controle seus custos de aquisição.</p>
        </div>
        <button
          onClick={() => setIsModalOpen(true)}
          className="bg-primary-600 hover:bg-primary-700 text-white px-5 py-2.5 rounded-xl font-semibold transition-all shadow-sm flex items-center gap-2 group"
        >
          <Plus className="h-5 w-5 transition-transform group-hover:rotate-90" />
          Nova Compra
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="bg-white dark:bg-gray-900 p-6 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800">
          <div className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">Total Comprado (Mês)</div>
          <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">R$ 0,00</div>
          <div className="text-xs text-green-600 mt-1">↑ 12% vs mês anterior</div>
        </div>
        <div className="bg-white dark:bg-gray-900 p-6 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800">
          <div className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">Pagamentos Pendentes</div>
          <div className="text-2xl font-bold text-red-600">R$ 0,00</div>
          <div className="text-xs text-gray-400 mt-1">3 faturas vencendo esta semana</div>
        </div>
        <div className="bg-white dark:bg-gray-900 p-6 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800">
          <div className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">Principais Insumos</div>
          <div className="text-2xl font-bold text-primary-600">8</div>
          <div className="text-xs text-gray-400 mt-1">Variação de custo monitorada</div>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 overflow-hidden">
        <div className="p-4 border-b border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/50/50">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              placeholder="Buscar por NF ou fornecedor..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl text-sm focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 outline-none transition-all"
            />
          </div>
        </div>

        {isLoading ? (
          <div className="flex justify-center items-center h-64">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50 dark:bg-gray-900/50/50">
                  <th className="px-6 py-4 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Compra / NF</th>
                  <th className="px-6 py-4 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Fornecedor</th>
                  <th className="px-6 py-4 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Data</th>
                  <th className="px-6 py-4 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Total</th>
                  <th className="px-6 py-4 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Status</th>
                  <th className="px-6 py-4 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Pagamento</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {filteredPurchases.map((purchase) => (
                  <tr key={purchase.id} className="group hover:bg-gray-50 dark:hover:bg-gray-800 dark:bg-gray-900/50/80 transition-colors">
                    <td className="px-6 py-4">
                      <div className="font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                        <Package className="h-4 w-4 text-gray-400" />
                        #{purchase.number || '---'}
                      </div>
                      <div className="text-[10px] text-gray-400 font-mono mt-0.5">{purchase.id.slice(0, 8)}</div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm font-medium text-gray-700 dark:text-gray-300">{purchase.supplier?.name}</div>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400">
                      {format(new Date(purchase.purchaseDate), 'dd MMM yyyy', { locale: ptBR })}
                    </td>
                    <td className="px-6 py-4 text-sm font-bold text-gray-900 dark:text-gray-100">
                      {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(purchase.totalValue)}
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium ${statusMap[purchase.status].color}`}>
                        {React.createElement(statusMap[purchase.status].icon, { className: 'h-3 w-3' })}
                        {statusMap[purchase.status].label}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className={`text-xs font-bold ${paymentStatusMap[purchase.paymentStatus].color}`}>
                        {paymentStatusMap[purchase.paymentStatus].label}
                      </div>
                    </td>
                  </tr>
                ))}
                {filteredPurchases.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-6 py-12 text-center">
                      <div className="flex flex-col items-center justify-center text-gray-400">
                        <ShoppingCart className="h-12 w-12 mb-3 opacity-20" />
                        <p>Nenhuma compra registrada.</p>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <PurchaseModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSave={handleSave}
      />
    </div>
  );
}
