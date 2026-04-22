import React, { useState, useEffect } from 'react';
import { api } from '../../lib/api-client';
import { Wallet, ArrowUpCircle, ArrowDownCircle, Search, Filter, Plus, Calendar, MoreVertical, CreditCard, Banknote, Building, Download, Share2 } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export function FinancePage() {
  const [metrics, setMetrics] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadMetrics();
  }, []);

  const loadMetrics = async () => {
    setIsLoading(true);
    try {
      const response = await api.get<any>('/analytics/financial-metrics');
      if (response.success) {
        setMetrics(response.data);
      }
    } catch (error) {
      console.error('Erro ao carregar métricas financeiras:', error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto text-left">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 tracking-tight flex items-center gap-3">
            <Wallet className="h-8 w-8 text-primary-600" />
            Gestão Financeira
          </h1>
          <p className="text-gray-500 mt-1">Controle seu fluxo de caixa, DRE e saúde financeira do negócio.</p>
        </div>
        <div className="flex items-center gap-3">
          <button className="p-2.5 bg-white border border-gray-200 rounded-xl text-gray-600 hover:bg-gray-50 transition-all font-semibold text-sm flex items-center gap-2 shadow-sm">
            <Download className="h-4 w-4" /> Exportar
          </button>
          <button className="bg-primary-600 hover:bg-primary-700 text-white px-5 py-2.5 rounded-xl font-bold transition-all shadow-lg shadow-primary-500/25 flex items-center gap-2">
            <Plus className="h-5 w-5" /> Novo Lançamento
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 relative overflow-hidden group">
          <div className="absolute right-0 top-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
            <Building className="h-16 w-16" />
          </div>
          <div className="text-xs font-bold text-gray-400 uppercase mb-1">Saldo em Contas</div>
          <div className="text-2xl font-black text-gray-900">R$ {metrics?.cashBalance?.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) || '0,00'}</div>
          <div className="mt-3 flex items-center gap-2 text-xs">
            <span className="text-green-600 font-bold bg-green-50 px-2 py-0.5 rounded-full">↑ 4.2%</span>
            <span className="text-gray-400">vs última semana</span>
          </div>
        </div>

        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
          <div className="text-xs font-bold text-gray-400 uppercase mb-1">Entradas (Mês)</div>
          <div className="text-2xl font-black text-green-600">R$ {metrics?.totalIncome?.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) || '0,00'}</div>
          <div className="mt-3 text-xs text-gray-400">Previsto: R$ 0,00</div>
        </div>

        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
          <div className="text-xs font-bold text-gray-400 uppercase mb-1">Saídas (Mês)</div>
          <div className="text-2xl font-black text-red-600">R$ {metrics?.totalExpenses?.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) || '0,00'}</div>
          <div className="mt-3 text-xs text-gray-400">Previsto: R$ 0,00</div>
        </div>

        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 bg-primary-600 border-none">
          <div className="text-xs font-bold text-primary-200 uppercase mb-1">Lucro Operacional</div>
          <div className="text-2xl font-black text-white">R$ {( (metrics?.totalIncome || 0) - (metrics?.totalExpenses || 0) ).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
          <div className="mt-3 text-xs text-primary-200">Margem: {metrics?.totalIncome > 0 ? (( (metrics?.totalIncome - metrics?.totalExpenses) / metrics?.totalIncome ) * 100).toFixed(1) : 0}%</div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="p-6 border-b border-gray-50 flex items-center justify-between">
              <h3 className="font-bold text-gray-900 flex items-center gap-2">
                <Calendar className="h-5 w-5 text-primary-600" /> Últimos Lançamentos
              </h3>
              <div className="flex gap-2">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
                  <input type="text" placeholder="Filtrar..." className="pl-9 pr-3 py-1.5 bg-gray-50 border-none rounded-lg text-xs outline-none focus:ring-1 focus:ring-primary-500/20" />
                </div>
              </div>
            </div>
            <div className="divide-y divide-gray-50">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="p-4 hover:bg-gray-50/50 transition-all flex items-center justify-between group">
                  <div className="flex items-center gap-4">
                    <div className={`p-2.5 rounded-xl ${i % 2 === 0 ? 'bg-red-50 text-red-500' : 'bg-green-50 text-green-500'}`}>
                      {i % 2 === 0 ? <ArrowDownCircle className="h-5 w-5" /> : <ArrowUpCircle className="h-5 w-5" />}
                    </div>
                    <div>
                      <div className="font-bold text-gray-900 text-sm">{i % 2 === 0 ? 'Fornecedor de Carnes' : 'Venda do Dia - Loja'}</div>
                      <div className="text-xs text-gray-400 flex items-center gap-2 mt-0.5">
                        <span className="font-medium text-gray-500">Alimentação</span>
                        <span>•</span>
                        <span>{format(new Date(), 'dd/MM/yyyy')}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-6">
                    <div className="text-right">
                      <div className={`text-sm font-bold ${i % 2 === 0 ? 'text-red-600' : 'text-green-600'}`}>
                        {i % 2 === 0 ? '-' : '+'} R$ { (Math.random() * 1000).toFixed(2) }
                      </div>
                      <div className="text-[10px] text-gray-400 uppercase font-bold tracking-wider">Pago</div>
                    </div>
                    <button className="opacity-0 group-hover:opacity-100 p-1.5 hover:bg-gray-200 rounded-lg transition-all">
                      <MoreVertical className="h-4 w-4 text-gray-400" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
            <h3 className="font-bold text-gray-900 mb-4 flex items-center gap-2">
              <Building className="h-5 w-5 text-primary-600" /> Minhas Contas
            </h3>
            <div className="space-y-4">
              <div className="p-4 bg-primary-50/30 rounded-2xl border border-primary-100/50 flex items-center gap-4">
                <div className="p-3 bg-white rounded-xl shadow-sm text-primary-600">
                  <Banknote className="h-5 w-5" />
                </div>
                <div className="flex-1">
                  <div className="text-xs font-bold text-primary-700 uppercase tracking-wider">Caixa Interno</div>
                  <div className="text-lg font-black text-gray-900">R$ {metrics?.cashBalance?.toLocaleString('pt-BR') || '0,00'}</div>
                </div>
              </div>
              <div className="p-4 bg-gray-50 rounded-2xl border border-gray-100 flex items-center gap-4 opacity-60 grayscale">
                <div className="p-3 bg-white rounded-xl shadow-sm text-gray-400">
                  <CreditCard className="h-5 w-5" />
                </div>
                <div className="flex-1">
                  <div className="text-xs font-bold text-gray-500 uppercase tracking-wider">Banco Itaú</div>
                  <div className="text-lg font-black text-gray-900">R$ 0,00</div>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
            <h3 className="font-bold text-gray-900 mb-4 flex items-center gap-2">
              <Share2 className="h-5 w-5 text-primary-600" /> Contas a Pagar (7d)
            </h3>
            <div className="space-y-3">
              {[1, 2].map(i => (
                <div key={i} className="flex justify-between items-center text-sm p-1">
                  <div className="text-gray-600">Suelan Fornecedor</div>
                  <div className="font-bold text-gray-900">R$ 450,00</div>
                </div>
              ))}
              <div className="pt-3 mt-3 border-t border-gray-50 flex justify-between text-xs font-bold uppercase text-red-600">
                <span>Total a Vencer</span>
                <span>R$ 900,00</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
