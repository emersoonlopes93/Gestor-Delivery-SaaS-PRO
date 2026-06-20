import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { AlertTriangle, ArrowLeft, BadgeCheck, Layers3, ShieldCheck, type LucideIcon } from 'lucide-react';
import { api, ApiError } from '../../lib/api-client';
import { adminTenantsApi, type TenantEntitlements, type TenantFeatureKey, type TenantFeatureOverride } from './admin-tenants-api';
import type { Tenant } from '@gestor/types';

interface TenantDetail extends Tenant {
  billingSubscriptions?: Array<{
    id: string;
    status: string;
    trialEndsAt: string | null;
    billingPlan?: { name: string; slug: string } | null;
  }>;
  subscription?: { id: string; status: string; plan?: { name: string } | null } | null;
}

type FeatureRow = {
  featureKey: TenantFeatureKey;
  label: string;
  description: string;
  flag: keyof NonNullable<TenantEntitlements['flags']>;
};

const FEATURE_ROWS: FeatureRow[] = [
  { featureKey: 'ai_agent', label: 'IA avançada', description: 'Assistente IA e automações conversacionais', flag: 'canUseAiAgent' },
  { featureKey: 'campaigns', label: 'Campanhas', description: 'Disparo e automação de campanhas', flag: 'canUseCampaigns' },
  { featureKey: 'ifood_integration', label: 'iFood', description: 'Integrações e pedidos do marketplace iFood', flag: 'canUseIfoodIntegration' },
  { featureKey: 'advanced_reports', label: 'Relatórios avançados', description: 'BI, análises e relatórios gerenciais', flag: 'canUseAdvancedReports' },
  { featureKey: 'custom_domain', label: 'Domínio próprio', description: 'Domínio personalizado da operação', flag: 'canUseCustomDomain' },
  { featureKey: 'priority_support', label: 'Suporte prioritário', description: 'Acesso preferencial a suporte', flag: 'canUsePrioritySupport' },
];

type OverrideDraft = {
  featureKey: TenantFeatureKey;
  mode: 'set' | 'remove';
  enabled: boolean;
  reason: string;
  expiresAt: string;
};

export function TenantAccessPage() {
  const { tenantId } = useParams<{ tenantId: string }>();
  const navigate = useNavigate();
  const [tenant, setTenant] = useState<TenantDetail | null>(null);
  const [entitlements, setEntitlements] = useState<TenantEntitlements | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [draft, setDraft] = useState<OverrideDraft | null>(null);

  useEffect(() => {
    if (!tenantId) return;

    let cancelled = false;
    setLoading(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    Promise.all([
      adminTenantsApi.getTenant(tenantId),
      adminTenantsApi.getEntitlements(tenantId),
    ])
      .then(([tenantResponse, entitlementsResponse]) => {
        if (cancelled) return;
        setTenant(tenantResponse as TenantDetail);
        setEntitlements(entitlementsResponse);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        const message = error instanceof ApiError ? error.message : 'Falha ao carregar acessos do tenant.';
        setErrorMessage(message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [tenantId]);

  const openSetModal = (featureKey: TenantFeatureKey, enabled: boolean, override?: TenantFeatureOverride) => {
    setDraft({
      featureKey,
      mode: 'set',
      enabled,
      reason: override?.reason ?? '',
      expiresAt: override?.expiresAt ? toLocalInputValue(override.expiresAt) : '',
    });
  };

  const openRemoveModal = (featureKey: TenantFeatureKey, override?: TenantFeatureOverride) => {
    setDraft({
      featureKey,
      mode: 'remove',
      enabled: override?.enabled ?? false,
      reason: '',
      expiresAt: '',
    });
  };

  const handleSave = async () => {
    if (!tenantId || !draft) return;

    const reason = draft.reason.trim();
    if (!reason) {
      setErrorMessage('Motivo é obrigatório.');
      return;
    }

    setSaving(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      if (draft.mode === 'remove') {
        await adminTenantsApi.deleteFeatureOverride(tenantId, draft.featureKey, reason);
        setSuccessMessage('Override removido com sucesso.');
      } else {
        await adminTenantsApi.upsertFeatureOverride(tenantId, draft.featureKey, {
          enabled: draft.enabled,
          reason,
          expiresAt: draft.expiresAt ? new Date(draft.expiresAt).toISOString() : null,
        });
        setSuccessMessage('Override atualizado com sucesso.');
      }

      const updated = await Promise.all([
        adminTenantsApi.getTenant(tenantId),
        adminTenantsApi.getEntitlements(tenantId),
      ]);
      setTenant(updated[0] as TenantDetail);
      setEntitlements(updated[1]);
      setDraft(null);
    } catch (error) {
      const message = error instanceof ApiError ? error.message : 'Falha ao salvar override.';
      setErrorMessage(message);
    } finally {
      setSaving(false);
    }
  };

  const handleChangeStatus = async (status: 'active' | 'inactive' | 'suspended' | 'trial') => {
    if (!tenantId || !tenant) return;
    const reason = window.prompt(`Motivo para alterar o status para ${status.toUpperCase()}:`)?.trim();
    if (!reason) return;

    try {
      await api.patch(`/admin/tenants/${tenantId}/status`, { status, reason });
      const updated = await Promise.all([
        adminTenantsApi.getTenant(tenantId),
        adminTenantsApi.getEntitlements(tenantId),
      ]);
      setTenant(updated[0] as TenantDetail);
      setEntitlements(updated[1]);
    } catch (error) {
      const message = error instanceof ApiError ? error.message : 'Falha ao alterar status comercial.';
      setErrorMessage(message);
    }
  };

  const handleTrialPro = async () => {
    if (!tenantId) return;
    if (!window.confirm('Ativar Trial Pro assistido para este tenant?')) return;
    try {
      await api.post(`/admin/billing/tenants/${tenantId}/trial-pro/activate`, {});
      const updated = await Promise.all([
        adminTenantsApi.getTenant(tenantId),
        adminTenantsApi.getEntitlements(tenantId),
      ]);
      setTenant(updated[0] as TenantDetail);
      setEntitlements(updated[1]);
    } catch (error) {
      const message = error instanceof ApiError ? error.message : 'Falha ao ativar Trial Pro.';
      setErrorMessage(message);
    }
  };

  const handleCreateBillingV2 = async () => {
    if (!tenantId) return;
    if (!window.confirm('Criar assinatura Billing V2 para este tenant?')) return;
    try {
      await api.post(`/admin/tenants/${tenantId}/billing-v2-subscription`, {});
      const updated = await Promise.all([
        adminTenantsApi.getTenant(tenantId),
        adminTenantsApi.getEntitlements(tenantId),
      ]);
      setTenant(updated[0] as TenantDetail);
      setEntitlements(updated[1]);
    } catch (error) {
      const message = error instanceof ApiError ? error.message : 'Falha ao criar Billing V2.';
      setErrorMessage(message);
    }
  };

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[60vh]">
        <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-primary" />
      </div>
    );
  }

  if (!tenant || !entitlements) {
    return (
      <div className="p-6">
        <button onClick={() => navigate('/tenants')} className="mb-4 flex items-center text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="mr-1 h-4 w-4" />
          Voltar para Lojas
        </button>
        <div className="rounded-xl border border-border bg-card p-8 text-center">
          <AlertTriangle className="mx-auto mb-4 h-12 w-12 text-amber-500" />
          <h2 className="text-xl font-bold text-foreground">Tenant não encontrado</h2>
          <p className="mt-2 text-muted-foreground">Não foi possível carregar os acessos deste tenant.</p>
        </div>
      </div>
    );
  }

  const subscription = tenant.billingSubscriptions?.[0];
  const currentOverrideMap = new Map(entitlements.featureOverrides.map((item) => [item.featureKey, item]));

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <button onClick={() => navigate(`/tenants/${tenantId}`)} className="mb-2 flex items-center text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="mr-1 h-4 w-4" />
            Voltar para detalhes
          </button>
          <h1 className="text-2xl font-black text-foreground">{tenant.name}</h1>
          <p className="mt-1 font-mono text-sm text-muted-foreground">{tenant.slug}</p>
          <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
            Controle operacional de recursos e liberações manuais por tenant, com auditoria e motivo obrigatório.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={handleTrialPro} className="rounded-lg border border-border bg-card px-4 py-2 text-sm font-bold text-foreground hover:bg-muted/50">
            Ativar Trial Pro
          </button>
          <button onClick={handleCreateBillingV2} className="rounded-lg border border-border bg-card px-4 py-2 text-sm font-bold text-foreground hover:bg-muted/50">
            Criar Billing V2
          </button>
        </div>
      </div>

      {errorMessage && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/30 dark:bg-red-500/10 dark:text-red-300">
          {errorMessage}
        </div>
      )}

      {successMessage && (
        <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700 dark:border-green-900/30 dark:bg-green-500/10 dark:text-green-300">
          {successMessage}
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-[1.15fr_1fr]">
        <section className="rounded-xl border border-border bg-card p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-black text-foreground">Status comercial</h2>
              <p className="text-sm text-muted-foreground">O status abaixo continua derivado do billing, sem alterar cobranças por este painel.</p>
            </div>
            <StatusBadge status={entitlements.commercialStatus} />
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <InfoCard icon={ShieldCheck} label="Status atual" value={entitlements.commercialStatus} />
            <InfoCard icon={Layers3} label="Assinatura" value={subscription?.status ?? 'sem assinatura'} />
            <InfoCard icon={BadgeCheck} label="Trial disponível" value={entitlements.trialAvailable ? 'sim' : 'não'} />
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <button onClick={() => handleChangeStatus('active')} className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-sm font-bold text-emerald-700 hover:bg-emerald-500/15">
              Ativar loja
            </button>
            <button onClick={() => handleChangeStatus('trial')} className="rounded-lg border border-primary/20 bg-primary/10 px-3 py-2 text-sm font-bold text-primary hover:bg-primary/15">
              Marcar trial
            </button>
            <button onClick={() => handleChangeStatus('suspended')} className="rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-sm font-bold text-amber-700 hover:bg-amber-500/15">
              Suspender
            </button>
            <button onClick={() => handleChangeStatus('inactive')} className="rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm font-bold text-red-700 hover:bg-red-500/15">
              Inativar
            </button>
          </div>
        </section>

        <section className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-black text-foreground">Resumo operacional</h2>
              <p className="text-sm text-muted-foreground">Originado do cálculo central de entitlements com override manual por recurso.</p>
            </div>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <SummaryMetric label="IA liberada" value={entitlements.flags.canUseAiAgent ? 'sim' : 'não'} />
            <SummaryMetric label="Campanhas" value={entitlements.flags.canUseCampaigns ? 'sim' : 'não'} />
            <SummaryMetric label="iFood" value={entitlements.flags.canUseIfoodIntegration ? 'sim' : 'não'} />
            <SummaryMetric label="Relatórios avançados" value={entitlements.flags.canUseAdvancedReports ? 'sim' : 'não'} />
            <SummaryMetric label="Domínio próprio" value={entitlements.flags.canUseCustomDomain ? 'sim' : 'não'} />
            <SummaryMetric label="Suporte prioritário" value={entitlements.flags.canUsePrioritySupport ? 'sim' : 'não'} />
          </div>
        </section>
      </div>

      <section className="rounded-xl border border-border bg-card">
        <div className="border-b border-border px-5 py-4">
          <h2 className="text-lg font-black text-foreground">Recursos e overrides</h2>
          <p className="text-sm text-muted-foreground">Ative, desative ou remova liberações manuais com motivo obrigatório e expiração opcional.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-[980px] w-full text-sm">
            <thead className="bg-muted/40 text-left text-xs uppercase tracking-widest text-muted-foreground">
              <tr>
                <th className="px-5 py-3">Recurso</th>
                <th className="px-5 py-3">Status atual</th>
                <th className="px-5 py-3">Origem</th>
                <th className="px-5 py-3">Válido até</th>
                <th className="px-5 py-3">Motivo</th>
                <th className="px-5 py-3">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {FEATURE_ROWS.map((feature) => {
                const override = currentOverrideMap.get(feature.featureKey);
                const currentValue = Boolean(entitlements.flags[feature.flag]);
                return (
                  <tr key={feature.featureKey} className="align-top">
                    <td className="px-5 py-4">
                      <div className="font-bold text-foreground">{feature.label}</div>
                      <div className="mt-1 max-w-md text-xs text-muted-foreground">{feature.description}</div>
                    </td>
                    <td className="px-5 py-4">
                      <StatusBadgePill value={currentValue} />
                    </td>
                    <td className="px-5 py-4 text-sm text-muted-foreground">
                      {describeFeatureOrigin(feature.featureKey, entitlements, override)}
                    </td>
                    <td className="px-5 py-4 text-sm text-muted-foreground">
                      {override?.expiresAt ? new Date(override.expiresAt).toLocaleString('pt-BR') : 'sem expiração'}
                    </td>
                    <td className="px-5 py-4 text-sm text-muted-foreground">
                      {override?.reason ?? 'sem override manual'}
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex flex-wrap gap-2">
                        <button
                          onClick={() => openSetModal(feature.featureKey, !currentValue, override)}
                          className="rounded-md border border-border bg-background px-3 py-2 text-xs font-bold text-foreground hover:bg-muted/50"
                        >
                          {currentValue ? 'Desativar override' : 'Ativar override'}
                        </button>
                        {override ? (
                          <button
                            onClick={() => openRemoveModal(feature.featureKey, override)}
                            className="rounded-md border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs font-bold text-red-700 hover:bg-red-500/15"
                          >
                            Remover
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {draft ? (
        <OverrideModal
          draft={draft}
          onClose={() => setDraft(null)}
          onChange={setDraft}
          onSave={handleSave}
          saving={saving}
        />
      ) : null}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const normalized = status.toLowerCase();
  const color =
    ['active', 'paid', 'invoiced'].includes(normalized) ? 'bg-emerald-500/10 text-emerald-700 border-emerald-500/20' :
    ['trial', 'trialing'].includes(normalized) ? 'bg-primary/10 text-primary border-primary/20' :
    ['past_due', 'suspended', 'failed', 'inactive'].includes(normalized) ? 'bg-red-500/10 text-red-700 border-red-500/20' :
    'bg-muted text-muted-foreground border-border';

  return <span className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-black uppercase tracking-widest ${color}`}>{status}</span>;
}

function StatusBadgePill({ value }: { value: boolean }) {
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-black uppercase tracking-widest ${value ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-700' : 'border-red-500/20 bg-red-500/10 text-red-700'}`}>
      {value ? 'ativo' : 'inativo'}
    </span>
  );
}

function SummaryMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-background p-3">
      <div className="text-xs font-bold uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className="mt-1 text-sm font-black text-foreground">{value}</div>
    </div>
  );
}

function InfoCard({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-background p-3">
      <div className="mb-2 flex items-center justify-between">
        <div className="text-xs font-bold uppercase tracking-widest text-muted-foreground">{label}</div>
        <Icon className="h-4 w-4 text-primary" />
      </div>
      <div className="text-lg font-black text-foreground">{value}</div>
    </div>
  );
}

function OverrideModal(props: {
  draft: OverrideDraft;
  onClose: () => void;
  onChange: (draft: OverrideDraft) => void;
  onSave: () => void;
  saving: boolean;
}) {
  const isRemove = props.draft.mode === 'remove';
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="w-full max-w-xl rounded-2xl border border-border bg-card shadow-2xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div>
            <div className="text-xs font-black uppercase tracking-widest text-muted-foreground">Override manual</div>
            <h3 className="text-lg font-black text-foreground">{featureLabel(props.draft.featureKey)}</h3>
          </div>
          <button onClick={props.onClose} className="rounded-full border border-border px-3 py-2 text-xs font-bold text-muted-foreground hover:text-foreground">Fechar</button>
        </div>

        <div className="space-y-4 px-5 py-4">
          <div className="rounded-lg border border-amber-500/20 bg-amber-500/10 p-3 text-sm text-amber-800 dark:text-amber-300">
            Essa liberação manual pode afetar a experiência do tenant. Motivo é obrigatório.
          </div>

          {!isRemove ? (
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => props.onChange({ ...props.draft, enabled: true })}
                className={`rounded-lg border px-4 py-3 text-sm font-black ${props.draft.enabled ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700' : 'border-border bg-background text-foreground'}`}
              >
                Ativar
              </button>
              <button
                onClick={() => props.onChange({ ...props.draft, enabled: false })}
                className={`rounded-lg border px-4 py-3 text-sm font-black ${!props.draft.enabled ? 'border-red-500/30 bg-red-500/10 text-red-700' : 'border-border bg-background text-foreground'}`}
              >
                Desativar
              </button>
            </div>
          ) : null}

          <label className="block space-y-2">
            <span className="text-xs font-black uppercase tracking-widest text-muted-foreground">Motivo</span>
            <textarea
              value={props.draft.reason}
              onChange={(event) => props.onChange({ ...props.draft, reason: event.target.value })}
              rows={4}
              className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
              placeholder="Explique por que essa liberação/bloqueio manual é necessária."
            />
          </label>

          {!isRemove ? (
            <label className="block space-y-2">
              <span className="text-xs font-black uppercase tracking-widest text-muted-foreground">Expiração opcional</span>
              <input
                type="datetime-local"
                value={props.draft.expiresAt}
                onChange={(event) => props.onChange({ ...props.draft, expiresAt: event.target.value })}
                className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
              />
            </label>
          ) : null}
        </div>

        <div className="flex flex-col gap-3 border-t border-border px-5 py-4 sm:flex-row sm:justify-end">
          <button onClick={props.onClose} className="rounded-lg border border-border bg-background px-4 py-2 text-sm font-bold text-foreground hover:bg-muted/50">
            Cancelar
          </button>
          <button
            onClick={props.onSave}
            disabled={props.saving}
            className={`rounded-lg px-4 py-2 text-sm font-black text-white ${isRemove ? 'bg-red-600 hover:bg-red-700' : 'bg-primary hover:bg-primary/90'} disabled:cursor-not-allowed disabled:opacity-60`}
          >
            {props.saving ? 'Salvando...' : isRemove ? 'Remover override' : 'Salvar override'}
          </button>
        </div>
      </div>
    </div>
  );
}

function featureLabel(featureKey: TenantFeatureKey): string {
  const map: Record<TenantFeatureKey, string> = {
    ai_agent: 'IA avançada',
    campaigns: 'Campanhas',
    ifood_integration: 'iFood',
    advanced_reports: 'Relatórios avançados',
    custom_domain: 'Domínio próprio',
    priority_support: 'Suporte prioritário',
  };
  return map[featureKey];
}

function describeFeatureOrigin(featureKey: TenantFeatureKey, entitlements: TenantEntitlements, override?: TenantFeatureOverride): string {
  if (override?.isActiveNow) return 'override manual';
  if (featureKey === 'ai_agent') {
    return entitlements.ai.source === 'addon'
      ? 'add-on'
      : entitlements.ai.source === 'trial'
        ? 'trial'
        : entitlements.ai.source === 'paid_included'
          ? 'plano'
          : entitlements.ai.source === 'free_quota'
            ? 'free_controlled'
            : 'bloqueado';
  }

  if (entitlements.commercialStatus.startsWith('trial')) return 'trial';
  if (entitlements.commercialStatus.startsWith('paid')) return 'plano';
  return 'free_controlled';
}

function toLocalInputValue(dateValue: string): string {
  const date = new Date(dateValue);
  const pad = (value: number) => String(value).padStart(2, '0');
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
  ].join('-') + `T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
