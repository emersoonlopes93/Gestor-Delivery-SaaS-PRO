import React, { useState, useEffect } from 'react';
import { api } from '../../lib/api-client';
import { PurchaseDTO, PurchaseStatus, PaymentStatus, CreatePurchaseDTO } from '@gestor/types';
import { PurchaseModal } from './PurchaseModal';
import { LucideIcon, ShoppingCart, Plus, Search, Package, AlertCircle, CheckCircle2, Clock } from 'lucide-react';
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

  const handleSave = async (data: CreatePurchaseDTO) => {
    try {
      await api.post('/purchasing/purchases', data);
      loadPurchases();
      setIsModalOpen(false);
    } catch (error) {
      console.error('Erro ao registrar compra:', error);
      throw error;
    }
  };

  const statusMap: Record<PurchaseStatus, { label: string, color: string, icon: LucideIcon }> = {
    [PurchaseStatus.DRAFT]: { label: 'Rascunho', color: 'border border-border bg-muted text-muted-foreground', icon: Clock },
    [PurchaseStatus.PENDING]: { label: 'Pendente', color: 'border border-status-warning/30 bg-status-warning/10 text-status-warning', icon: AlertCircle },
    [PurchaseStatus.RECEIVED]: { label: 'Recebido', color: 'border border-status-success/30 bg-status-success/10 text-status-success', icon: CheckCircle2 },
    [PurchaseStatus.CANCELLED]: { label: 'Cancelado', color: 'border border-destructive/30 bg-destructive/10 text-destructive', icon: AlertCircle },
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

  const currentDate = new Date();
  const currentMonth = currentDate.getMonth();
  const currentYear = currentDate.getFullYear();

  const totalCompradoMes = purchases
    .filter(p => {
      const d = new Date(p.purchaseDate);
      return d.getMonth() === currentMonth && d.getFullYear() === currentYear && p.status !== PurchaseStatus.CANCELLED;
    })
    .reduce((sum, p) => sum + Number(p.totalValue), 0);

  const pendingPurchases = purchases.filter(p => p.paymentStatus === PaymentStatus.PENDING || p.paymentStatus === PaymentStatus.PARTIAL && p.status !== PurchaseStatus.CANCELLED);
  const pagamentosPendentes = pendingPurchases.reduce((sum, p) => sum + Number(p.totalValue), 0);
  const uniqueSuppliers = new Set(purchases.map(p => p.supplier?.id)).size;

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
        <div className="bg-card p-6 rounded-2xl shadow-sm border border-border">
          <div className="text-sm font-medium text-muted-foreground mb-1">Total Comprado (Mês)</div>
          <div className="text-2xl font-bold text-foreground">{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalCompradoMes)}</div>
          <div className="text-xs text-muted-foreground mt-1">Referente a compras não canceladas neste mês</div>
        </div>
        <div className="bg-card p-6 rounded-2xl shadow-sm border border-border">
          <div className="text-sm font-medium text-muted-foreground mb-1">Pagamentos Pendentes</div>
          <div className="text-2xl font-bold text-red-600">{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(pagamentosPendentes)}</div>
          <div className="text-xs text-muted-foreground mt-1">{pendingPurchases.length} faturas pendentes ou parciais</div>
        </div>
        <div className="bg-card p-6 rounded-2xl shadow-sm border border-border">
          <div className="text-sm font-medium text-muted-foreground mb-1">Fornecedores Ativos</div>
          <div className="text-2xl font-bold text-primary-600">{uniqueSuppliers}</div>
          <div className="text-xs text-muted-foreground mt-1">Fornecedores que você já comprou</div>
        </div>
      </div>

      <div className="bg-card rounded-2xl shadow-sm border border-border overflow-hidden">
        <div className="p-4 border-b border-border bg-muted">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              placeholder="Buscar por NF ou fornecedor..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 input-premium rounded-xl text-sm outline-none transition-all"
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
                <tr className="bg-muted">
                  <th className="px-6 py-4 text-xs font-bold text-muted-foreground uppercase tracking-wider">Compra / NF</th>
                  <th className="px-6 py-4 text-xs font-bold text-muted-foreground uppercase tracking-wider">Fornecedor</th>
                  <th className="px-6 py-4 text-xs font-bold text-muted-foreground uppercase tracking-wider">Data</th>
                  <th className="px-6 py-4 text-xs font-bold text-muted-foreground uppercase tracking-wider">Total</th>
                  <th className="px-6 py-4 text-xs font-bold text-muted-foreground uppercase tracking-wider">Status</th>
                  <th className="px-6 py-4 text-xs font-bold text-muted-foreground uppercase tracking-wider">Pagamento</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredPurchases.map((purchase) => (
                  <tr key={purchase.id} className="group hover:bg-muted transition-colors">
                    <td className="px-6 py-4">
                      <div className="font-semibold text-foreground flex items-center gap-2">
                        <Package className="h-4 w-4 text-muted-foreground" />
                        #{purchase.number || '---'}
                      </div>
                      <div className="text-[10px] text-muted-foreground font-mono mt-0.5">{purchase.id.slice(0, 8)}</div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm font-medium text-foreground">{purchase.supplier?.name}</div>
                    </td>
                    <td className="px-6 py-4 text-sm text-muted-foreground">
                      {format(new Date(purchase.purchaseDate), 'dd MMM yyyy', { locale: ptBR })}
                    </td>
                    <td className="px-6 py-4 text-sm font-bold text-foreground">
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
                      <div className="flex flex-col items-center justify-center text-muted-foreground">
                        <ShoppingCart className="h-12 w-12 mb-3 opacity-50" />
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
