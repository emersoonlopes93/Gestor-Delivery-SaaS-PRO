import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2 } from 'lucide-react';
import { api } from '../lib/api-client';

interface RevenueTier {
  id: string;
  minRevenue: number;
  maxRevenue: number | null;
  price: number;
  label: string | null;
}

interface PricingData {
  plan: {
    id: string;
    name: string;
    currency: string;
  };
  tiers: RevenueTier[];
}

export function SaasPricingPage() {
  const [data, setData] = useState<PricingData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchPricing() {
      try {
        const response = await api.get<PricingData>('/saas/pricing');
        if (response && 'data' in response) {
          setData(response.data as PricingData);
        }
      } catch (error) {
        console.error('Error fetching pricing:', error);
      } finally {
        setLoading(false);
      }
    }
    fetchPricing();
  }, []);

  return (
    <div className="py-24 bg-white min-h-screen">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <h1 className="text-4xl font-extrabold text-slate-900 mb-4">Preço Justo, Focado no Seu Crescimento</h1>
          <p className="text-xl text-slate-600">
            Diferente de outras plataformas, nós não cobramos por funcionalidade. Você tem acesso a <strong>TODOS OS MÓDULOS</strong> do sistema. Nossa cobrança é baseada apenas no seu sucesso: o quanto você fatura pelo sistema.
          </p>
        </div>

        {loading ? (
          <div className="flex justify-center p-20">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
          </div>
        ) : !data || data.tiers.length === 0 ? (
          <div className="text-center p-20 bg-slate-50 rounded-2xl border border-slate-200">
            <p className="text-lg text-slate-500">Tabela de preços indisponível no momento.</p>
          </div>
        ) : (
          <div className="bg-slate-50 rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="grid md:grid-cols-2">
              {/* Left Side: Pricing Table */}
              <div className="p-8 md:p-12 border-b md:border-b-0 md:border-r border-slate-200">
                <h3 className="text-2xl font-bold text-slate-900 mb-6">Plano Único PRO</h3>
                <p className="text-slate-600 mb-8">
                  Sua mensalidade é calculada no fim do ciclo com base na faixa de faturamento processado na plataforma.
                </p>
                
                <div className="space-y-4">
                  {data.tiers.map((tier) => (
                    <div key={tier.id} className="flex justify-between items-center p-4 bg-white rounded-xl border border-slate-200 shadow-sm">
                      <div>
                        <span className="block font-medium text-slate-900">{tier.label || 'Faixa'}</span>
                        <span className="text-sm text-slate-500">
                          {tier.maxRevenue 
                            ? `Até R$ ${tier.maxRevenue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` 
                            : `Acima de R$ ${tier.minRevenue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`}
                        </span>
                      </div>
                      <div className="text-right">
                        <span className="block font-bold text-indigo-600 text-lg">
                          R$ {tier.price.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}<span className="text-sm font-normal text-slate-500">/mês</span>
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Right Side: Features List */}
              <div className="p-8 md:p-12 bg-indigo-900 text-white">
                <h3 className="text-2xl font-bold mb-8">O que está incluso?</h3>
                <ul className="space-y-5">
                  {[
                    'Atendimento com IA no WhatsApp',
                    'Smart Inbox Multi-atendente',
                    'Cardápio Digital Responsivo',
                    'Gestão KDS em Kanban',
                    'Agendamento Inteligente',
                    'Cupons e Programas de Cashback',
                    'Relatórios Avançados de Vendas',
                    'Controle de Fila de Entrega'
                  ].map((feature, i) => (
                    <li key={i} className="flex items-start">
                      <CheckCircle2 className="w-6 h-6 text-indigo-400 mr-3 flex-shrink-0" />
                      <span className="text-indigo-50 font-medium">{feature}</span>
                    </li>
                  ))}
                </ul>
                <div className="mt-12 pt-8 border-t border-indigo-800">
                  <Link
                    to="/cadastro"
                    className="block w-full text-center px-8 py-4 bg-white text-indigo-900 text-lg font-bold rounded-xl hover:bg-slate-100 transition-colors"
                  >
                    Começar Teste Grátis
                  </Link>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
