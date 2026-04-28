import { useEffect, useState } from 'react';
import { api } from '../../lib/api-client';
import { CreditCard, Users, TrendingUp, Plus } from 'lucide-react';

interface Plan {
  id: string;
  name: string;
  slug: string;
  price: number;
  billingCycle: string;
  features: Record<string, boolean> | null;
  isActive: boolean;
  createdAt: string;
  _count?: { subscriptions: number };
}

interface Subscription {
  id: string;
  tenantId: string;
  status: string;
  trialEndsAt: string | null;
  currentPeriodStartsAt: string;
  currentPeriodEndsAt: string;
  plan: { name: string; price: number };
  tenant: { name: string; slug: string };
}

export function BillingPage() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get<any>('/billing/plans')
      .then((res) => {
        const data = Array.isArray(res.data) ? res.data : res.data?.items || [];
        setPlans(data);
      })
      .catch((err) => {
        console.error('Erro ao carregar planos:', err);
      })
      .finally(() => setLoading(false));
  }, []);

  const statusColor = (status: string) => {
    switch (status) {
      case 'active': return 'bg-green-100 text-green-800';
      case 'trial': return 'bg-blue-100 text-blue-800';
      case 'overdue': return 'bg-yellow-100 text-yellow-800';
      case 'canceled': return 'bg-red-100 text-red-800';
      case 'suspended': return 'bg-gray-100 text-gray-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Planos & Billing</h1>
          <p className="text-gray-500 mt-1">Gerencie os planos SaaS da plataforma</p>
        </div>
      </div>

      {/* Plans Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
        {plans.length === 0 ? (
          <div className="col-span-full text-center py-12 bg-white rounded-xl border border-gray-200">
            <CreditCard className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500 font-medium">Nenhum plano cadastrado</p>
            <p className="text-gray-400 text-sm mt-1">
              Os planos são criados via API. Use POST /billing/plans para criar.
            </p>
          </div>
        ) : (
          plans.map((plan) => (
            <div
              key={plan.id}
              className="bg-white rounded-xl border border-gray-200 p-6 hover:shadow-md transition-shadow"
            >
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h3 className="text-lg font-bold text-gray-900">{plan.name}</h3>
                  <p className="text-xs text-gray-400 font-mono">{plan.slug}</p>
                </div>
                <span
                  className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                    plan.isActive ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                  }`}
                >
                  {plan.isActive ? 'Ativo' : 'Inativo'}
                </span>
              </div>

              <div className="flex items-baseline gap-1 mb-4">
                <span className="text-3xl font-black text-gray-900">
                  {Number(plan.price).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                </span>
                <span className="text-sm text-gray-500">
                  /{plan.billingCycle === 'monthly' ? 'mês' : 'ano'}
                </span>
              </div>

              {plan.features && typeof plan.features === 'object' && (
                <div className="border-t border-gray-100 pt-4 mt-4">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                    Features
                  </p>
                  <div className="space-y-1">
                    {Object.entries(plan.features).map(([key, value]) => (
                      <div key={key} className="flex items-center justify-between text-sm">
                        <span className="text-gray-600">{key}</span>
                        <span className={value ? 'text-green-600' : 'text-red-400'}>
                          {value ? '✓' : '✗'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="border-t border-gray-100 pt-3 mt-4 text-xs text-gray-400">
                Criado em {new Date(plan.createdAt).toLocaleDateString('pt-BR')}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Info card */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-2 flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-primary-600" />
          Informações sobre Billing
        </h2>
        <div className="text-sm text-gray-600 space-y-2">
          <p>
            Os planos são gerenciados pela API REST. Use os endpoints abaixo para administrar:
          </p>
          <ul className="list-disc list-inside space-y-1 text-gray-500 text-xs">
            <li><code className="bg-gray-100 px-1 rounded">GET /billing/plans</code> — Listar planos</li>
            <li><code className="bg-gray-100 px-1 rounded">POST /billing/plans</code> — Criar plano</li>
            <li><code className="bg-gray-100 px-1 rounded">PUT /billing/plans/:id</code> — Atualizar plano</li>
            <li><code className="bg-gray-100 px-1 rounded">POST /billing/subscription</code> — Criar assinatura para tenant</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
