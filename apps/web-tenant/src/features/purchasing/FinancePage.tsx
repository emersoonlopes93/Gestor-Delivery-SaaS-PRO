import { useState, useEffect } from 'react';
import { api } from '../../lib/api-client';
import { Wallet, ArrowUpCircle, ArrowDownCircle, Plus, Calendar, MoreVertical, Banknote, Building, Download, Share2 } from 'lucide-react';
import { format } from 'date-fns';
import { FinancialTransactionDTO } from '@gestor/types';

import { TransactionModal } from './TransactionModal';

interface DashboardMetrics {
  financial: {
    cashBalance: number;
    totalIncome: number;
    totalExpenses: number;
  };
  commercial: {
    totalRevenue: number;
    totalOrders: number;
    averageTicket: number;
  };
  costs: {
    estimatedCMV: number;
    estimatedGrossMargin: number;
    grossMarginPercentage: number;
  };
}

export function FinancePage() {
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [transactions, setTransactions] = useState<FinancialTransactionDTO[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setIsLoading(true);
      const today = format(new Date(), 'yyyy-MM-dd');
      // Fetch metrics and transactions in parallel
      const [metricsRes, transRes] = await Promise.all([
        api.get<DashboardMetrics>(`/analytics/dashboard?startDate=${today}&endDate=${today}`),
        api.get<FinancialTransactionDTO[]>('/finance/transactions')
      ]);

      if (metricsRes.success) setMetrics(metricsRes.data);
      if (transRes.success) setTransactions(transRes.data);
    } catch (error) {
      console.error('Erro ao carregar dados:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleExport = () => {
    if (transactions.length === 0) return;

    const headers = ["Categoria", "Descrição", "Tipo", "Valor", "Status", "Data"];
    const rows = transactions.map(t => [
      t.category,
      t.description || '',
      t.type === 'income' ? 'Entrada' : 'Saída',
      t.amount,
      t.status,
      t.paymentDate ? format(new Date(t.paymentDate), 'dd/MM/yyyy') : format(new Date(t.createdAt), 'dd/MM/yyyy')
    ]);
    
    const csvContent = "data:text/csv;charset=utf-8," 
      + headers.join(",") + "\n"
      + rows.map(e => e.join(",")).join("\n");

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `financeiro_${format(new Date(), 'yyyy-MM-dd')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="p-6 max-w-7xl mx-auto text-left">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-bold text-foreground tracking-tight flex items-center gap-3">
            <Wallet className="h-8 w-8 text-primary-600" />
            Gestão Financeira
          </h1>
          <p className="text-muted-foreground mt-1">Controle seu fluxo de caixa, DRE e saúde financeira do negócio.</p>
        </div>
        <div className="flex items-center gap-3">
          <button 
            onClick={handleExport}
            disabled={transactions.length === 0}
            className="p-2.5 bg-card border border-border rounded-xl text-muted-foreground hover:bg-muted disabled:opacity-50 transition-all font-semibold text-sm flex items-center gap-2 shadow-sm"
          >
            <Download className="h-4 w-4" /> Exportar
          </button>
          <button 
            onClick={() => setIsModalOpen(true)}
            className="bg-primary-600 hover:bg-primary-700 text-white px-5 py-2.5 rounded-xl font-bold transition-all shadow-lg shadow-primary-500/25 flex items-center gap-2"
          >
            <Plus className="h-5 w-5" /> Novo Lançamento
          </button>
        </div>
      </div>

      <TransactionModal 
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSave={loadData}
      />

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <div className="bg-card p-6 rounded-2xl shadow-sm border border-border relative overflow-hidden group">
          <div className="absolute right-0 top-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
            <Building className="h-16 w-16" />
          </div>
          <div className="text-xs font-bold text-muted-foreground uppercase mb-1">Saldo em Contas</div>
          <div className="text-2xl font-black text-foreground">R$ {metrics?.financial?.cashBalance?.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) || '0,00'}</div>
          <div className="mt-3 flex items-center gap-2 text-xs">
            <span className="text-green-600 font-bold bg-green-50 px-2 py-0.5 rounded-full">↑ 4.2%</span>
            <span className="text-gray-400">vs última semana</span>
          </div>
        </div>

        <div className="bg-card p-6 rounded-2xl shadow-sm border border-border">
          <div className="text-xs font-bold text-muted-foreground uppercase mb-1">Entradas (Mês)</div>
          <div className="text-2xl font-black text-green-600">R$ {metrics?.financial?.totalIncome?.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) || '0,00'}</div>
          <div className="mt-3 text-xs text-muted-foreground">Vendas: R$ {metrics?.commercial?.totalRevenue?.toLocaleString('pt-BR')}</div>
        </div>

        <div className="bg-card p-6 rounded-2xl shadow-sm border border-border">
          <div className="text-xs font-bold text-muted-foreground uppercase mb-1">Saídas (Mês)</div>
          <div className="text-2xl font-black text-red-600">R$ {metrics?.financial?.totalExpenses?.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) || '0,00'}</div>
          <div className="mt-3 text-xs text-muted-foreground">CMV Estimado: R$ {metrics?.costs?.estimatedCMV?.toLocaleString('pt-BR')}</div>
        </div>

        <div className="bg-primary p-6 rounded-2xl shadow-sm border-none">
          <div className="text-xs font-bold text-primary-200 uppercase mb-1">Lucro Operacional</div>
          <div className="text-2xl font-black text-white">R$ {( (metrics?.financial?.totalIncome || 0) - (metrics?.financial?.totalExpenses || 0) ).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
          <div className="mt-3 text-xs text-primary-200">
            Margem: {metrics?.financial && metrics.financial.totalIncome > 0 
              ? (((metrics.financial.totalIncome - metrics.financial.totalExpenses) / metrics.financial.totalIncome) * 100).toFixed(1) 
              : 0}%
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-6">
          {/* DRE Simplificada */}
          <div className="bg-card rounded-2xl shadow-sm border border-border p-6">
            <h3 className="font-bold text-foreground mb-6 flex items-center gap-2">
              <Plus className="h-5 w-5 text-primary-600" /> DRE Gerencial (Mês Atual)
            </h3>
            <div className="space-y-3">
              <div className="flex justify-between items-center text-sm border-b border-border pb-2">
                <span className="text-muted-foreground font-medium">1. Receita Operacional Bruta</span>
                <span className="font-bold text-foreground">R$ {metrics?.commercial?.totalRevenue?.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
              </div>
              <div className="flex justify-between items-center text-sm border-b border-border pb-2">
                <span className="text-muted-foreground font-medium ml-4">(-) CMV (Custo de Mercadoria Vendida)</span>
                <span className="font-bold text-red-600">- R$ {metrics?.costs?.estimatedCMV?.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
              </div>
              <div className="flex justify-between items-center text-sm bg-muted p-2 rounded-lg mb-2">
                <span className="text-foreground font-bold">= MARGEM BRUTA</span>
                <span className="font-black text-primary-700">R$ {metrics?.costs?.estimatedGrossMargin?.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} ({metrics?.costs?.grossMarginPercentage?.toFixed(1)}%)</span>
              </div>
              <div className="flex justify-between items-center text-sm border-b border-border pb-2">
                <span className="text-muted-foreground font-medium ml-4">(-) Despesas Operacionais (Fixas/Variáveis)</span>
                <span className="font-bold text-red-600">- R$ {metrics?.financial?.totalExpenses?.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
              </div>
              <div className="flex justify-between items-center text-sm bg-primary-600 p-3 rounded-xl">
                <span className="text-white font-black uppercase tracking-wider">(=) NOID / LUCRO LÍQUIDO</span>
                <span className="font-black text-white text-lg">R$ {( (metrics?.costs?.estimatedGrossMargin || 0) - (metrics?.financial?.totalExpenses || 0) ).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
              </div>
            </div>
          </div>

          <div className="bg-card rounded-2xl shadow-sm border border-border overflow-hidden">
            <div className="p-6 border-b border-gray-50 flex items-center justify-between">
              <h3 className="font-bold text-foreground flex items-center gap-2">
                <Calendar className="h-5 w-5 text-primary-600" /> Últimos Lançamentos
              </h3>
            </div>
            <div className="divide-y divide-border">
              {isLoading ? (
                <div className="p-10 text-center text-muted-foreground">Carregando lançamentos...</div>
              ) : transactions.length === 0 ? (
                <div className="p-10 text-center text-muted-foreground">Nenhum lançamento encontrado.</div>
              ) : (
                transactions.slice(0, 10).map((t) => (
                  <div key={t.id} className="p-4 hover:bg-muted transition-all flex items-center justify-between group">
                    <div className="flex items-center gap-4">
                      <div className={`p-2.5 rounded-xl ${t.type === 'expense' ? 'bg-red-50 text-red-500' : 'bg-green-50 text-green-500'}`}>
                        {t.type === 'expense' ? <ArrowDownCircle className="h-5 w-5" /> : <ArrowUpCircle className="h-5 w-5" />}
                      </div>
                      <div>
                        <div className="font-bold text-foreground text-sm">{t.description || t.category}</div>
                        <div className="text-xs text-muted-foreground flex items-center gap-2 mt-0.5">
                          <span className="font-medium text-muted-foreground capitalize">{t.category}</span>
                          <span>•</span>
                          <span>{format(new Date(t.paymentDate || t.createdAt), 'dd/MM/yyyy')}</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-6">
                      <div className="text-right">
                        <div className={`text-sm font-bold ${t.type === 'expense' ? 'text-red-600' : 'text-green-600'}`}>
                          {t.type === 'expense' ? '-' : '+'} R$ { Number(t.amount).toLocaleString('pt-BR', { minimumFractionDigits: 2 }) }
                        </div>
                        <div className={`text-[10px] uppercase font-bold tracking-wider ${t.status === 'paid' ? 'text-emerald-500' : 'text-amber-500'}`}>
                          {t.status === 'paid' ? 'Pago' : 'Pendente'}
                        </div>
                      </div>
                      <button className="opacity-0 group-hover:opacity-100 p-1.5 hover:bg-muted rounded-lg transition-all">
                        <MoreVertical className="h-4 w-4 text-muted-foreground" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 p-6">
            <h3 className="font-bold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
              <Building className="h-5 w-5 text-primary-600" /> Minhas Contas
            </h3>
            <div className="space-y-4">
              <div className="p-4 bg-primary-50/30 rounded-2xl border border-primary-100/50 flex items-center gap-4">
                <div className="p-3 bg-card rounded-xl shadow-sm text-primary-600">
                  <Banknote className="h-5 w-5" />
                </div>
                <div className="flex-1">
                  <div className="text-xs font-bold text-primary-700 uppercase tracking-wider">Caixa Interno</div>
                  <div className="text-lg font-black text-foreground">R$ {metrics?.financial?.cashBalance?.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) || '0,00'}</div>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-card rounded-2xl shadow-sm border border-border p-6">
            <h3 className="font-bold text-foreground mb-4 flex items-center gap-2">
              <Share2 className="h-5 w-5 text-primary-600" /> Contas a Pagar (Próximos)
            </h3>
            <div className="space-y-3">
              {transactions.filter(t => t.type === 'expense' && t.status !== 'paid').length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhuma conta pendente.</p>
              ) : (
                transactions
                  .filter(t => t.type === 'expense' && t.status !== 'paid')
                  .slice(0, 5)
                  .map(t => (
                    <div key={t.id} className="flex justify-between items-center text-sm p-1">
                      <div className="text-muted-foreground truncate mr-2">{t.description || t.category}</div>
                      <div className="font-bold text-foreground whitespace-nowrap">R$ {Number(t.amount).toLocaleString('pt-BR')}</div>
                    </div>
                  ))
              )}
              <div className="pt-3 mt-3 border-t border-border flex justify-between text-xs font-bold uppercase text-destructive">
                <span>Total a Vencer</span>
                <span>R$ {transactions.filter(t => t.type === 'expense' && t.status !== 'paid').reduce((acc, t) => acc + Number(t.amount), 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
