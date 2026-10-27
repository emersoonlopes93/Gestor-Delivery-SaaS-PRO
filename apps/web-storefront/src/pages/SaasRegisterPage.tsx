import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { CheckCircle, CircleAlert, CreditCard, Lock, Mail, Phone, Store, User } from 'lucide-react';
import type { PublicCommercialPlanDTO, PublicCommercialPricingDTO, TenantLoginResponse } from '@gestor/types';
import { api } from '../lib/api-client';
import { maskPhone, unmask } from '@gestor/utils';

const API_BASE = (import.meta.env.VITE_API_URL || import.meta.env.VITE_API_BASE_URL || '/api/v1').replace(/\/$/, '');

type CommercialSubscriptionResponse = {
  subscriptionId: string;
  status: string;
  created: boolean;
  requiresPaymentMethod: boolean;
  canProceedToOnboarding: boolean;
};

type RegistrationSession = Pick<TenantLoginResponse, 'accessToken' | 'refreshToken' | 'user'>;

function formatCurrency(value: string, currency: string) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency }).format(Number(value));
}

function formatRevenueRange(plan: PublicCommercialPlanDTO, minRevenue: string, maxRevenue: string | null) {
  const min = formatCurrency(minRevenue, plan.currency);
  return maxRevenue === null ? `Acima de ${min}` : `${min} até ${formatCurrency(maxRevenue, plan.currency)}`;
}

export function SaasRegisterPage() {
  const [searchParams] = useSearchParams();
  const [formData, setFormData] = useState({ ownerName: '', shopName: '', phone: '', email: '', password: '', confirmPassword: '' });
  const [catalog, setCatalog] = useState<PublicCommercialPricingDTO | null>(null);
  const [selectedPlanId, setSelectedPlanId] = useState('');
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [session, setSession] = useState<RegistrationSession | null>(null);
  const [subscription, setSubscription] = useState<CommercialSubscriptionResponse | null>(null);
  const [loadingCatalog, setLoadingCatalog] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const response = await api.get<PublicCommercialPricingDTO>('/saas/pricing');
        setCatalog(response.data);
        const requestedPlanId = searchParams.get('plan');
        const requestedPlanIsAvailable = response.data.plans.some((plan) => plan.id === requestedPlanId);
        setSelectedPlanId(requestedPlanIsAvailable ? requestedPlanId ?? '' : response.data.plans[0]?.id ?? '');
      } catch {
        setError('Não foi possível carregar as ofertas comerciais agora. Tente novamente em instantes.');
      } finally {
        setLoadingCatalog(false);
      }
    })();
  }, [searchParams]);

  const selectedPlan = useMemo(
    () => catalog?.plans.find((plan) => plan.id === selectedPlanId) ?? null,
    [catalog, selectedPlanId],
  );

  const subscribe = async (registrationSession: RegistrationSession) => {
    if (!selectedPlan || !catalog) throw new Error('Selecione uma oferta disponível antes de continuar.');
    const response = await fetch(`${API_BASE}/billing/commercial-subscription`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${registrationSession.accessToken}` },
      body: JSON.stringify({ planId: selectedPlan.id, termsVersion: catalog.termsVersion, acceptedCommercialTerms: true }),
    });
    const body = await response.json().catch(() => null) as { data?: CommercialSubscriptionResponse; error?: { message?: string } } | null;
    if (!response.ok || !body?.data) throw new Error(body?.error?.message ?? 'Sua conta foi criada, mas não foi possível registrar a adesão. Você pode tentar novamente sem criar outra conta.');
    return body.data;
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    if (!selectedPlan || !catalog) return setError('Nenhuma oferta comercial está disponível para contratação neste momento.');
    if (!acceptedTerms) return setError('Confirme que você leu as condições comerciais para continuar.');
    if (formData.password !== formData.confirmPassword) return setError('As senhas não conferem.');
    setLoading(true);
    try {
      const registration = await api.post<TenantLoginResponse>('/auth/tenant/register', {
        ownerName: formData.ownerName, shopName: formData.shopName, email: formData.email,
        password: formData.password, phone: unmask(formData.phone), commercialSignup: true,
      });
      const registrationSession = registration.data;
      setSession(registrationSession);
      setSubscription(await subscribe(registrationSession));
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível criar sua conta.');
    } finally {
      setLoading(false);
    }
  };

  const retrySubscription = async () => {
    if (!session) return;
    setLoading(true);
    setError(null);
    try { setSubscription(await subscribe(session)); }
    catch (cause: unknown) { setError(cause instanceof Error ? cause.message : 'Não foi possível concluir a adesão.'); }
    finally { setLoading(false); }
  };

  const goToTenantLogin = () => {
    const tenantUrl = import.meta.env.VITE_TENANT_URL || 'http://localhost:5173';
    const returnTo = subscription?.canProceedToOnboarding ? '/onboarding' : '/billing/contract';
    window.location.assign(`${tenantUrl}/login?${new URLSearchParams({ email: formData.email, returnTo }).toString()}`);
  };

  if (subscription) {
    const pendingPayment = !subscription.canProceedToOnboarding;
    return <main className="min-h-screen bg-[var(--storefront-background)] px-4 py-12 text-[var(--storefront-foreground)]"><section className="mx-auto max-w-lg rounded-2xl border border-[var(--storefront-border)] bg-[var(--storefront-card)] p-8 text-center shadow-xl">
      {pendingPayment ? <CreditCard className="mx-auto mb-5 h-11 w-11 text-amber-500" /> : <CheckCircle className="mx-auto mb-5 h-11 w-11 text-emerald-500" />}
      <h1 className="text-2xl font-bold">{pendingPayment ? 'Adesão registrada' : 'Conta e adesão confirmadas'}</h1>
      <p className="mt-3 text-sm text-[var(--storefront-muted-foreground)]">{pendingPayment ? 'A forma de pagamento é obrigatória para esta oferta e a cobrança automática ainda não está disponível. Acesse o painel para acompanhar o próximo passo comercial.' : 'Sua assinatura foi registrada com sucesso. Entre no painel para continuar a configuração inicial da sua loja.'}</p>
      <button type="button" onClick={goToTenantLogin} className="mt-7 w-full rounded-xl bg-[var(--storefront-primary)] px-4 py-3 font-semibold text-white">Entrar no painel</button>
    </section></main>;
  }

  const fields: Array<{ name: keyof typeof formData; label: string; Icon: typeof User; type: string }> = [
    { name: 'ownerName', label: 'Seu nome', Icon: User, type: 'text' }, { name: 'shopName', label: 'Nome da loja', Icon: Store, type: 'text' },
    { name: 'phone', label: 'WhatsApp', Icon: Phone, type: 'tel' }, { name: 'email', label: 'E-mail', Icon: Mail, type: 'email' },
    { name: 'password', label: 'Senha', Icon: Lock, type: 'password' }, { name: 'confirmPassword', label: 'Confirmar senha', Icon: Lock, type: 'password' },
  ];

  return <main className="min-h-screen bg-[var(--storefront-background)] px-4 py-10 text-[var(--storefront-foreground)] sm:px-6"><section className="mx-auto grid max-w-6xl gap-8 lg:grid-cols-[1.1fr_0.9fr]">
    <div className="rounded-2xl border border-[var(--storefront-border)] bg-[var(--storefront-card)] p-6 shadow-xl sm:p-9">
      <p className="text-sm font-semibold text-[var(--storefront-primary)]">PedeHub para sua operação</p><h1 className="mt-2 text-3xl font-bold">Crie sua loja e conheça sua mensalidade</h1>
      <p className="mt-3 text-sm text-[var(--storefront-muted-foreground)]">A faixa é calculada automaticamente conforme o faturamento elegível da loja. Você não escolhe uma faixa nem paga percentual sobre a venda.</p>
      {error && <div role="alert" className="mt-5 flex gap-2 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-600"><CircleAlert className="h-5 w-5 shrink-0" />{error}</div>}
      <form className="mt-7 space-y-4" onSubmit={handleSubmit}>
        {fields.map(({ name, label, Icon, type }) => <label key={name} className="block text-sm font-medium">{label}<span className="relative mt-1 block"><Icon className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-[var(--storefront-muted-foreground)]" /><input required name={name} type={type} value={formData[name]} onChange={(event) => setFormData((current) => ({ ...current, [name]: name === 'phone' ? maskPhone(event.target.value) : event.target.value }))} className="min-h-11 w-full rounded-xl border border-[var(--storefront-border)] bg-[var(--storefront-background)] py-3 pl-10 pr-3" /></span></label>)}
        <label className="flex items-start gap-3 rounded-xl border border-[var(--storefront-border)] p-4 text-sm"><input type="checkbox" checked={acceptedTerms} onChange={(event) => setAcceptedTerms(event.target.checked)} className="mt-0.5 h-5 w-5" /><span>Li as condições comerciais desta oferta e entendo que a mensalidade é definida pela faixa de faturamento elegível. O conteúdo jurídico definitivo ainda será formalizado.</span></label>
        <button type="submit" disabled={loading || loadingCatalog || !selectedPlan || !acceptedTerms} className="min-h-11 w-full rounded-xl bg-[var(--storefront-primary)] px-4 py-3 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">{loading ? 'Criando conta e registrando adesão...' : 'Criar conta e aderir à oferta'}</button>
      </form>
      {session && !subscription && <button type="button" onClick={retrySubscription} disabled={loading} className="mt-4 w-full rounded-xl border border-[var(--storefront-primary)] px-4 py-3 text-sm font-semibold text-[var(--storefront-primary)]">Tentar concluir adesão novamente</button>}
      <p className="mt-5 text-center text-sm text-[var(--storefront-muted-foreground)]">Já possui uma conta? <Link to="/login" className="font-semibold text-[var(--storefront-primary)]">Faça login</Link></p>
    </div>
    <aside className="rounded-2xl border border-[var(--storefront-border)] bg-[var(--storefront-card)] p-6 sm:p-8"><h2 className="text-xl font-bold">Oferta comercial vigente</h2>
      {loadingCatalog && <p className="mt-4 text-sm text-[var(--storefront-muted-foreground)]">Carregando ofertas...</p>}
      {!loadingCatalog && !catalog?.plans.length && <p className="mt-4 text-sm text-[var(--storefront-muted-foreground)]">Nenhuma oferta está disponível para contratação online neste momento.</p>}
      <div className="mt-5 space-y-4">{catalog?.plans.map((plan) => <label key={plan.id} className={`block cursor-pointer rounded-xl border p-4 ${selectedPlanId === plan.id ? 'border-[var(--storefront-primary)] bg-[var(--storefront-primary)]/5' : 'border-[var(--storefront-border)]'}`}>
        <span className="flex items-start gap-3"><input type="radio" name="plan" value={plan.id} checked={selectedPlanId === plan.id} onChange={() => setSelectedPlanId(plan.id)} className="mt-1" /><span><strong>{plan.name}</strong>{plan.description && <span className="mt-1 block text-sm text-[var(--storefront-muted-foreground)]">{plan.description}</span>}<span className="mt-2 block text-xs text-[var(--storefront-muted-foreground)]">Ciclo {plan.cycleInterval === 'monthly' ? 'mensal' : 'anual'}{plan.trialDays > 0 && !plan.requiresPaymentMethod ? ` · ${plan.trialDays} dias de teste configurados` : ''}</span></span></span>
        <span className="mt-4 block space-y-2">{plan.revenueTiers.map((tier) => <span key={tier.id} className="flex justify-between gap-3 text-sm"><span>{tier.label ?? formatRevenueRange(plan, tier.minRevenue, tier.maxRevenue)}</span><strong>{formatCurrency(tier.price, plan.currency)}</strong></span>)}</span>
        {plan.requiresPaymentMethod && <span className="mt-4 block rounded-lg bg-amber-500/10 p-3 text-xs text-amber-700">Esta oferta exige forma de pagamento. A cobrança automática ainda não está disponível; a adesão ficará pendente de acompanhamento comercial.</span>}
      </label>)}</div>
    </aside>
  </section></main>;
}
