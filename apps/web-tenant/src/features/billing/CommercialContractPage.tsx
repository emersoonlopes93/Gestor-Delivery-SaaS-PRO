import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCircle2, CircleAlert, Loader2 } from 'lucide-react';
import type { PublicCommercialPricingDTO } from '@gestor/types';
import { api, ApiError } from '../../lib/api-client';

type CommercialSubscriptionResponse = {
  subscriptionId: string;
  status: string;
  created: boolean;
  requiresPaymentMethod: boolean;
  canProceedToOnboarding: boolean;
};

export function CommercialContractPage() {
  const navigate = useNavigate();
  const [catalog, setCatalog] = useState<PublicCommercialPricingDTO | null>(null);
  const [planId, setPlanId] = useState('');
  const [accepted, setAccepted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const plan = useMemo(() => catalog?.plans.find((item) => item.id === planId) ?? null, [catalog, planId]);

  useEffect(() => {
    void (async () => {
      try {
        const response = await api.get<PublicCommercialPricingDTO>('/saas/pricing');
        setCatalog(response.data);
        setPlanId(response.data.plans[0]?.id ?? '');
      } catch {
        setError('Não foi possível carregar as ofertas comerciais. Tente novamente.');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const submit = async () => {
    if (!catalog || !plan || !accepted) return;
    setSubmitting(true);
    setError(null);
    try {
      const response = await api.post<CommercialSubscriptionResponse>('/billing/commercial-subscription', {
        planId: plan.id,
        termsVersion: catalog.termsVersion,
        acceptedCommercialTerms: true,
      });
      navigate(response.data.canProceedToOnboarding ? '/onboarding' : '/billing', { replace: true });
    } catch (cause: unknown) {
      setError(cause instanceof ApiError ? cause.message : 'Não foi possível concluir a adesão.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <div className="flex min-h-64 items-center justify-center"><Loader2 className="animate-spin text-primary" /></div>;

  return <main className="mx-auto max-w-3xl space-y-6 p-4 sm:p-8">
    <header><p className="text-sm font-semibold text-primary">Adesão comercial</p><h1 className="mt-1 text-3xl font-bold">Escolha a oferta da sua loja</h1><p className="mt-2 text-muted-foreground">A faixa é calculada pelo faturamento elegível. Esta etapa não confirma cobrança nem pagamento.</p></header>
    {error && <div role="alert" className="flex gap-2 rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive"><CircleAlert className="h-5 w-5 shrink-0" />{error}</div>}
    {!catalog?.plans.length ? <div className="rounded-xl border p-5 text-muted-foreground">Nenhuma oferta está disponível para contratação online neste momento.</div> : <>
      <div className="space-y-3">{catalog.plans.map((item) => <label key={item.id} className={`block cursor-pointer rounded-xl border p-5 ${planId === item.id ? 'border-primary bg-primary/5' : 'border-border'}`}>
        <span className="flex gap-3"><input type="radio" name="plan" checked={planId === item.id} onChange={() => setPlanId(item.id)} /><span><strong>{item.name}</strong>{item.description && <span className="mt-1 block text-sm text-muted-foreground">{item.description}</span>}</span></span>
        <span className="mt-4 block space-y-2 text-sm">{item.revenueTiers.map((tier) => <span className="flex justify-between" key={tier.id}><span>{tier.label ?? 'Faixa de faturamento'}</span><strong>{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: item.currency }).format(Number(tier.price))}</strong></span>)}</span>
        {item.requiresPaymentMethod && <span className="mt-4 block rounded-lg bg-amber-500/10 p-3 text-xs text-amber-700">Esta oferta exige forma de pagamento. A cobrança automática ainda não está disponível neste ambiente.</span>}
      </label>)}</div>
      <label className="flex items-start gap-3 rounded-xl border p-4 text-sm"><input type="checkbox" checked={accepted} onChange={(event) => setAccepted(event.target.checked)} className="mt-0.5 h-5 w-5" /><span>Li as condições comerciais da oferta. A mensalidade será definida pela faixa de faturamento elegível; o texto jurídico definitivo ainda será formalizado.</span></label>
      <button type="button" onClick={() => void submit()} disabled={!accepted || !plan || submitting} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-5 py-3 font-semibold text-primary-foreground disabled:opacity-50">{submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}Confirmar adesão</button>
    </>}
  </main>;
}
