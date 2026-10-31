import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2 } from 'lucide-react';
import { api } from '../lib/api-client';
import type { PublicCommercialPricingDTO } from '@gestor/types';
import { commercialPlanCta } from './commercial-pricing-presentation';

export function SaasPricingPage() {
  const [data, setData] = useState<PublicCommercialPricingDTO | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      try {
        const response = await api.get<PublicCommercialPricingDTO>('/saas/pricing');
        setData(response.data);
      } catch (error) {
        console.error('Error fetching pricing:', error);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <div className="min-h-screen bg-white py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto mb-16 max-w-3xl text-center">
          <h1 className="mb-4 text-4xl font-extrabold text-slate-900">Preço justo, focado no seu crescimento</h1>
          <p className="text-xl text-slate-600">A mensalidade acompanha a faixa de faturamento elegível da sua loja. Cada oferta abaixo tem suas próprias faixas e módulos.</p>
        </div>

        {loading ? (
          <div className="flex justify-center p-20"><div className="h-12 w-12 animate-spin rounded-full border-b-2 border-indigo-600" /></div>
        ) : !data || data.plans.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-20 text-center"><p className="text-lg text-slate-500">Tabela de preços indisponível no momento.</p></div>
        ) : (
          <div className="grid gap-6 lg:grid-cols-2">
            {data.plans.map((plan) => (
              <section key={plan.id} className="overflow-hidden rounded-3xl border border-slate-200 bg-slate-50 shadow-sm">
                <div className="p-8 md:p-10">
                  <h2 className="text-2xl font-bold text-slate-900">{plan.name}</h2>
                  {plan.description && <p className="mt-2 text-slate-600">{plan.description}</p>}
                  <p className="mt-5 text-sm text-slate-600">Mensalidade por faixa de faturamento elegível, no ciclo {plan.cycleInterval === 'monthly' ? 'mensal' : 'anual'}.</p>
                  <div className="mt-6 space-y-3">
                    {plan.revenueTiers.map((tier) => (
                      <div key={tier.id} className="flex items-center justify-between gap-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                        <div>
                          <span className="block font-medium text-slate-900">{tier.label || 'Faixa de faturamento'}</span>
                          <span className="text-sm text-slate-500">{tier.maxRevenue ? `Até R$ ${Number(tier.maxRevenue).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : `Acima de R$ ${Number(tier.minRevenue).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`}</span>
                        </div>
                        <strong className="text-right text-lg text-indigo-600">R$ {Number(tier.price).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}<span className="text-sm font-normal text-slate-500">/{plan.cycleInterval === 'monthly' ? 'mês' : 'ano'}</span></strong>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="bg-indigo-900 p-8 text-white md:p-10">
                  <h3 className="text-lg font-bold">Módulos incluídos nesta oferta</h3>
                  <ul className="mt-5 space-y-3">{plan.includedModules.map((feature) => <li key={feature} className="flex items-start"><CheckCircle2 className="mr-3 h-5 w-5 shrink-0 text-indigo-400" /><span className="font-medium text-indigo-50">{feature}</span></li>)}</ul>
                  {plan.requiresPaymentMethod && <p className="mt-6 rounded-xl border border-amber-300/30 bg-amber-300/10 p-3 text-sm text-amber-100">Esta oferta exige forma de pagamento. A cobrança automática ainda não está disponível; a adesão seguirá para acompanhamento comercial.</p>}
                  <Link to={`/cadastro?plan=${encodeURIComponent(plan.id)}`} className="mt-8 block w-full rounded-xl bg-white px-8 py-4 text-center text-lg font-bold text-indigo-900 transition-colors hover:bg-slate-100">{commercialPlanCta(plan)}</Link>
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
