import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Award, Bell, BellRing, ChevronLeft, Gift, History, Percent, Target, User, Wallet } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { api, logoutCustomerSession, switchCustomerTenant } from '../lib/api-client';
import { useCustomerStore } from '../store/useCustomerStore';
import { usePushNotifications } from '../hooks/usePushNotifications';
import { useEffect } from 'react';

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
  orders: Array<{ id: string; orderNumber: string; total: number; status: string; createdAt: string; couponId?: string | null; cashbackUsed?: number }>;
};

function money(value: number) {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function CustomerProfilePage() {
  const { tenantSlug } = useParams<{ tenantSlug: string }>();
  const { isLoggedIn, customer, tenantSlug: customerTenantSlug } = useCustomerStore();
  const navigate = useNavigate();
  const { isSupported: pushSupported, isSubscribed, subscribeUser } = usePushNotifications();

  useEffect(() => {
    if (!tenantSlug) return;
    void switchCustomerTenant(tenantSlug);
  }, [tenantSlug]);

  const { data, isLoading } = useQuery({
    queryKey: ['customer-profile', tenantSlug],
    queryFn: async () => (await api.get<CustomerProfilePayload>('/public/customer-profile')).data,
    enabled: isLoggedIn && customerTenantSlug === tenantSlug,
  });

  const usedCouponOrders = data?.orders.filter((order) => order.couponId) ?? [];
  const activeCoupons =
    data?.coupons.filter((coupon) => !coupon.expiresAt || new Date(coupon.expiresAt) >= new Date()) ?? [];
  const expiredCoupons =
    data?.coupons.filter((coupon) => coupon.expiresAt && new Date(coupon.expiresAt) < new Date()) ?? [];
  const nextAchievement = getNextAchievement(data?.profile.totalOrders ?? 0, data?.loyalty.badges ?? []);

  if (!isLoggedIn || customerTenantSlug !== tenantSlug) {
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
              void logoutCustomerSession();
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
              {pushSupported && customer ? (
                <button
                  type="button"
                  onClick={() => subscribeUser(customer.tenantId, customer.id, 'customer')}
                  disabled={isSubscribed}
                  className="mt-5 inline-flex h-11 items-center gap-2 rounded-xl bg-gray-950 px-4 text-sm font-black text-white disabled:bg-gray-200 disabled:text-gray-500"
                >
                  {isSubscribed ? <BellRing className="h-4 w-4" /> : <Bell className="h-4 w-4" />}
                  {isSubscribed ? 'Notificacoes ativas' : 'Ativar notificacoes'}
                </button>
              ) : null}
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
                {data.loyalty.badges.length ? data.loyalty.badges.map((badge) => (
                  <span key={badge} className="rounded-full bg-primary-50 px-3 py-1 text-sm font-bold text-primary-700">
                    {badge}
                  </span>
                )) : <span className="text-sm font-bold text-gray-500">Sua primeira conquista chega no primeiro pedido.</span>}
              </div>
              <div className="mt-5 rounded-xl bg-gray-50 p-4">
                <p className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-gray-400">
                  <Target className="h-4 w-4" />
                  Proximo objetivo
                </p>
                <p className="mt-2 font-bold text-gray-800">{nextAchievement}</p>
              </div>
            </section>

            <section className="rounded-2xl bg-white p-6 shadow-sm border border-gray-100">
              <h2 className="flex items-center gap-2 text-lg font-black text-gray-900">
                <Percent className="h-5 w-5 text-primary-600" />
                Cupons
              </h2>
              <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                <MiniMetric label="Disponiveis" value={activeCoupons.length} />
                <MiniMetric label="Utilizados" value={usedCouponOrders.length} />
                <MiniMetric label="Expirados" value={expiredCoupons.length} />
              </div>
              <div className="mt-4 grid gap-3">
                {activeCoupons.slice(0, 6).map((coupon) => (
                  <div key={coupon.id} className="flex items-center justify-between rounded-xl border border-dashed border-gray-200 p-4">
                    <span className="font-black">{coupon.code}</span>
                    <span className="text-sm font-bold text-primary-700">
                      {coupon.type === 'percentage' ? `${coupon.value}%` : money(coupon.value)}
                    </span>
                  </div>
                ))}
                {activeCoupons.length === 0 ? <p className="text-sm font-bold text-gray-500">Nenhum cupom disponivel agora.</p> : null}
              </div>
            </section>

            <section className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <HistoryPanel
                title="Pontos"
                rows={data.loyalty.history.slice(0, 5).map((item) => ({
                  id: item.id,
                  label: item.description || item.type,
                  detail: new Date(item.createdAt).toLocaleDateString('pt-BR'),
                  value: `${item.points > 0 ? '+' : ''}${item.points} pts`,
                }))}
              />
              <HistoryPanel
                title="Carteira"
                rows={[...data.wallet.cashbackHistory, ...data.wallet.transactions].slice(0, 5).map((item) => ({
                  id: item.id,
                  label: item.description || item.type,
                  detail: new Date(item.createdAt).toLocaleDateString('pt-BR'),
                  value: money(item.amount),
                }))}
              />
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

function MiniMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl bg-gray-50 p-3">
      <p className="text-lg font-black text-gray-900">{value}</p>
      <p className="mt-1 text-[10px] font-black uppercase tracking-widest text-gray-400">{label}</p>
    </div>
  );
}

function HistoryPanel({ title, rows }: { title: string; rows: Array<{ id: string; label: string; detail: string; value: string }> }) {
  return (
    <section className="rounded-2xl bg-white p-6 shadow-sm border border-gray-100">
      <h2 className="flex items-center gap-2 text-lg font-black text-gray-900">
        <History className="h-5 w-5 text-primary-600" />
        {title}
      </h2>
      <div className="mt-4 divide-y divide-gray-100">
        {rows.length ? rows.map((row) => (
          <div key={row.id} className="flex items-center justify-between gap-3 py-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-bold text-gray-900">{row.label}</p>
              <p className="text-xs text-gray-500">{row.detail}</p>
            </div>
            <span className="shrink-0 text-sm font-black text-primary-700">{row.value}</span>
          </div>
        )) : <p className="text-sm font-bold text-gray-500">Sem movimentacoes ainda.</p>}
      </div>
    </section>
  );
}

function getNextAchievement(totalOrders: number, badges: string[]) {
  if (!badges.includes('Primeira Compra')) return 'Faca seu primeiro pedido para liberar a primeira conquista.';
  if (totalOrders < 5) return `Faltam ${5 - totalOrders} pedido(s) para 5 Pedidos.`;
  if (totalOrders < 10) return `Faltam ${10 - totalOrders} pedido(s) para 10 Pedidos.`;
  if (!badges.includes('Cliente VIP')) return 'Aumente sua frequencia e ticket medio para virar Cliente VIP.';
  return 'Voce ja liberou as principais conquistas.';
}
