import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Award, ChevronLeft, Gift, History, Percent, User, Wallet } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { api } from '../lib/api-client';
import { useCustomerStore } from '../store/useCustomerStore';

type CustomerProfilePayload = {
  profile: { name: string; phone: string; email?: string | null; birthDate?: string | null; totalOrders: number; totalSpent: string | number };
  loyalty: { balance: number; badges: string[]; history: Array<{ id: string; points: number; type: string; description?: string | null; createdAt: string }> };
  wallet: {
    cashbackBalance: number;
    promotionalCredits: number;
    cashbackHistory: Array<{ id: string; amount: number; type: string; description?: string | null; createdAt: string }>;
    transactions: Array<{ id: string; amount: number; type: string; source: string; description?: string | null; createdAt: string }>;
  };
  coupons: Array<{ id: string; code: string; type: string; value: number; expiresAt?: string | null }>;
  orders: Array<{ id: string; orderNumber: string; total: number; status: string; createdAt: string }>;
};

function money(value: number) {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function CustomerProfilePage() {
  const { tenantSlug } = useParams<{ tenantSlug: string }>();
  const { isLoggedIn, logout } = useCustomerStore();
  const navigate = useNavigate();

  const { data, isLoading } = useQuery({
    queryKey: ['customer-profile', tenantSlug],
    queryFn: async () => (await api.get<CustomerProfilePayload>('/public/customer-profile')).data,
    enabled: isLoggedIn,
  });

  if (!isLoggedIn) {
    return (
      <div className="min-h-screen bg-gray-50 px-4 py-12 text-center">
        <User className="w-14 h-14 mx-auto text-gray-300" />
        <h1 className="mt-4 text-xl font-black text-gray-900">Entre para ver sua carteira</h1>
        <Link to={`/${tenantSlug}`} className="inline-block mt-6 rounded-xl bg-primary-600 px-6 py-3 font-bold text-white">
          Voltar para a loja
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 px-4 py-8">
      <div className="mx-auto max-w-3xl space-y-6">
        <header className="flex items-center justify-between">
          <Link to={`/${tenantSlug}`} className="flex items-center gap-2 text-sm font-bold text-gray-500">
            <ChevronLeft className="w-4 h-4" />
            Loja
          </Link>
          <button
            onClick={() => {
              logout();
              navigate(`/${tenantSlug}`);
            }}
            className="text-sm font-bold text-red-500"
          >
            Sair
          </button>
        </header>

        {isLoading || !data ? (
          <div className="h-48 rounded-2xl bg-white animate-pulse" />
        ) : (
          <>
            <section className="rounded-2xl bg-white p-6 shadow-sm border border-gray-100">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-black uppercase tracking-widest text-gray-400">Meu Perfil</p>
                  <h1 className="mt-2 text-2xl font-black text-gray-900">{data.profile.name}</h1>
                  <p className="text-gray-500">{data.profile.phone}</p>
                </div>
                <div className="rounded-xl bg-primary-50 p-3 text-primary-700">
                  <User className="h-6 w-6" />
                </div>
              </div>
            </section>

            <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <Metric icon={Award} label="Meus Pontos" value={data.loyalty.balance} />
              <Metric icon={Wallet} label="Meu Cashback" value={money(data.wallet.cashbackBalance)} />
              <Metric icon={Gift} label="Creditos" value={money(data.wallet.promotionalCredits)} />
            </section>

            <section className="rounded-2xl bg-white p-6 shadow-sm border border-gray-100">
              <h2 className="flex items-center gap-2 text-lg font-black text-gray-900">
                <Award className="h-5 w-5 text-primary-600" />
                Conquistas
              </h2>
              <div className="mt-4 flex flex-wrap gap-2">
                {data.loyalty.badges.map((badge) => (
                  <span key={badge} className="rounded-full bg-primary-50 px-3 py-1 text-sm font-bold text-primary-700">
                    {badge}
                  </span>
                ))}
              </div>
            </section>

            <section className="rounded-2xl bg-white p-6 shadow-sm border border-gray-100">
              <h2 className="flex items-center gap-2 text-lg font-black text-gray-900">
                <Percent className="h-5 w-5 text-primary-600" />
                Cupons
              </h2>
              <div className="mt-4 grid gap-3">
                {data.coupons.slice(0, 6).map((coupon) => (
                  <div key={coupon.id} className="flex items-center justify-between rounded-xl border border-dashed border-gray-200 p-4">
                    <span className="font-black">{coupon.code}</span>
                    <span className="text-sm font-bold text-primary-700">
                      {coupon.type === 'percentage' ? `${coupon.value}%` : money(coupon.value)}
                    </span>
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-2xl bg-white p-6 shadow-sm border border-gray-100">
              <h2 className="flex items-center gap-2 text-lg font-black text-gray-900">
                <History className="h-5 w-5 text-primary-600" />
                Historico
              </h2>
              <div className="mt-4 divide-y divide-gray-100">
                {data.orders.slice(0, 5).map((order) => (
                  <div key={order.id} className="flex items-center justify-between py-3">
                    <div>
                      <p className="font-bold">{order.orderNumber}</p>
                      <p className="text-xs text-gray-500">{new Date(order.createdAt).toLocaleDateString('pt-BR')}</p>
                    </div>
                    <span className="font-black text-primary-700">{money(order.total)}</span>
                  </div>
                ))}
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  );
}

function Metric({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string | number }) {
  return (
    <div className="rounded-2xl bg-white p-5 shadow-sm border border-gray-100">
      <Icon className="h-5 w-5 text-primary-600" />
      <p className="mt-3 text-xs font-black uppercase tracking-widest text-gray-400">{label}</p>
      <p className="mt-1 text-xl font-black text-gray-900">{value}</p>
    </div>
  );
}
