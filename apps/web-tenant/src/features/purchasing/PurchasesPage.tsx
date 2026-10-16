import React, { useState, useEffect } from 'react';
import { api } from '../../lib/api-client';
import { PurchaseDTO, PurchaseStatus, PaymentStatus, CreatePurchaseDTO, FinancialAccountDTO } from '@gestor/types';
import { PurchaseModal } from './PurchaseModal';
import { LucideIcon, ShoppingCart, Plus, Search, Package, AlertCircle, CheckCircle2, Clock, Ban, CreditCard } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { ContextualNavigation } from '../navigation/NavigationHub';
import { PageHeader } from '../../components/ui/PageHeader';
import { Modal } from '../../components/Modal';
import { usePermissions } from '../../hooks/use-tenant-auth';

export function PurchasesPage() {
  const [purchases, setPurchases] = useState<PurchaseDTO[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [accounts, setAccounts] = useState<FinancialAccountDTO[]>([]);
  const [purchaseToPay, setPurchaseToPay] = useState<PurchaseDTO | null>(null);
  const [payAccountId, setPayAccountId] = useState('');
  const [actionPending, setActionPending] = useState(false);
  const { has } = usePermissions();
  const canManage = has('purchasing.manage');

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

  const openPay = async (purchase: PurchaseDTO) => {
    try {
      const response = await api.get<FinancialAccountDTO[]>('/finance/accounts');
      if (response.success) setAccounts(response.data.filter((account) => account.active));
      setPayAccountId('');
      setPurchaseToPay(purchase);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : 'Nao foi possivel carregar as contas financeiras.');
    }
  };

  const handlePay = async () => {
    if (!purchaseToPay || !payAccountId || actionPending) return;
    setActionPending(true);
    try {
      await api.post(`/purchasing/purchases/${purchaseToPay.id}/pay`, { accountId: payAccountId });
      setPurchaseToPay(null);
      await loadPurchases();
    } catch (error) {
      window.alert(error instanceof Error ? error.message : 'Nao foi possivel pagar a compra.');
    } finally {
      setActionPending(false);
    }
  };

  const handleCancel = async (purchase: PurchaseDTO) => {
    if (actionPending || !window.confirm('Cancelar esta compra integralmente e reverter seus efeitos?')) return;
    setActionPending(true);
    try {
      await api.post(`/purchasing/purchases/${purchase.id}/cancel`);
      await loadPurchases();
    } catch (error) {
      window.alert(error instanceof Error ? error.message : 'Cancelamento bloqueado; verifique a reconciliacao de estoque.');
    } finally {
      setActionPending(false);
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

  const pendingPurchases = purchases.filter((purchase) =>
    (purchase.paymentStatus === PaymentStatus.PENDING || purchase.paymentStatus === PaymentStatus.PARTIAL)
    && purchase.status !== PurchaseStatus.CANCELLED,
  );
  const pagamentosPendentes = pendingPurchases.reduce((sum, p) => sum + Number(p.totalValue), 0);
  const uniqueSuppliers = new Set(purchases.map(p => p.supplier?.id)).size;

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 pb-24 text-left md:p-6">
      <PageHeader
        title="Compras e entradas"
        description="Registre o recebimento de insumos e acompanhe as compras da operação."
        icon={ShoppingCart}
        action={canManage ? <button
          onClick={() => setIsModalOpen(true)}
          className="hidden items-center justify-center gap-2 rounded-xl bg-primary px-5 py-2.5 font-semibold text-primary-foreground shadow-sm transition-all hover:bg-primary/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 md:flex"
        >
          <Plus className="h-5 w-5" />
          Nova Compra
        </button> : undefined}
      />

      {canManage && <div className="fixed inset-x-4 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-30 md:hidden">
        <button
          type="button"
          onClick={() => setIsModalOpen(true)}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-5 py-3 font-semibold text-primary-foreground shadow-lg shadow-primary/25 transition-colors hover:bg-primary/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
        >
          <Plus className="h-5 w-5" aria-hidden />
          Nova Compra
        </button>
      </div>}

      <ContextualNavigation itemIds={['inventory.home', 'management.purchases', 'management.suppliers']} />

      <section aria-label="Resumo das compras" className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="grid divide-y divide-border md:grid-cols-3 md:divide-x md:divide-y-0">
        <div className="p-4">
          <div className="text-sm font-medium text-muted-foreground mb-1">Total Comprado (Mês)</div>
          <div className="text-2xl font-bold text-foreground">{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalCompradoMes)}</div>
          <div className="text-xs text-muted-foreground mt-1">Referente a compras não canceladas neste mês</div>
        </div>
        <div className="p-4">
          <div className="text-sm font-medium text-muted-foreground mb-1">Pagamentos Pendentes</div>
          <div className="text-2xl font-bold text-red-600">{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(pagamentosPendentes)}</div>
          <div className="text-xs text-muted-foreground mt-1">{pendingPurchases.length} faturas pendentes ou parciais</div>
        </div>
        <div className="p-4">
          <div className="text-sm font-medium text-muted-foreground mb-1">Fornecedores Ativos</div>
          <div className="text-2xl font-bold text-primary-600">{uniqueSuppliers}</div>
          <div className="text-xs text-muted-foreground mt-1">Fornecedores que você já comprou</div>
        </div>
        </div>
      </section>

      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="p-4 border-b border-border bg-muted">
          <div className="relative max-w-md">
            <label className="sr-only" htmlFor="purchases-search">Buscar compras</label>
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" aria-hidden />
            <input
              id="purchases-search"
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
                  {canManage && <th className="px-6 py-4 text-xs font-bold text-muted-foreground uppercase tracking-wider">Acoes</th>}
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
                    {canManage && (
                      <td className="px-6 py-4">
                        {purchase.status !== PurchaseStatus.CANCELLED && (
                          <div className="flex gap-2">
                            {purchase.paymentStatus === PaymentStatus.PENDING && (
                              <button
                                type="button"
                                onClick={() => void openPay(purchase)}
                                disabled={actionPending}
                                className="rounded-lg border border-border p-2 text-primary transition-colors hover:bg-primary/10 disabled:opacity-50"
                                aria-label={`Pagar compra ${purchase.number || purchase.id}`}
                              >
                                <CreditCard className="h-4 w-4" aria-hidden />
                              </button>
                            )}
                            {purchase.paymentStatus !== PaymentStatus.PARTIAL && (
                              <button
                                type="button"
                                onClick={() => void handleCancel(purchase)}
                                disabled={actionPending}
                                className="rounded-lg border border-border p-2 text-destructive transition-colors hover:bg-destructive/10 disabled:opacity-50"
                                aria-label={`Cancelar compra ${purchase.number || purchase.id}`}
                              >
                                <Ban className="h-4 w-4" aria-hidden />
                              </button>
                            )}
                          </div>
                        )}
                      </td>
                    )}
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
                    <td colSpan={canManage ? 7 : 6} className="px-6 py-12 text-center">
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
      <Modal
        isOpen={Boolean(purchaseToPay)}
        onClose={() => !actionPending && setPurchaseToPay(null)}
        title="Pagar compra"
        footer={(
          <>
            <button type="button" onClick={() => setPurchaseToPay(null)} disabled={actionPending} className="rounded-xl px-4 py-2 text-sm font-semibold text-muted-foreground hover:bg-muted disabled:opacity-50">
              Voltar
            </button>
            <button type="button" onClick={() => void handlePay()} disabled={!payAccountId || actionPending} className="rounded-xl bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50">
              {actionPending ? 'Pagando...' : 'Confirmar pagamento'}
            </button>
          </>
        )}
      >
        <p className="mb-4 text-sm text-muted-foreground">O valor integral sera debitado uma unica vez da conta selecionada.</p>
        <label className="mb-1 block text-sm font-semibold text-foreground" htmlFor="purchase-pay-account">Conta financeira ativa</label>
        <select id="purchase-pay-account" value={payAccountId} onChange={(event) => setPayAccountId(event.target.value)} className="input-premium">
          <option value="">Selecione uma conta</option>
          {accounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}
        </select>
      </Modal>
    </div>
  );
}
