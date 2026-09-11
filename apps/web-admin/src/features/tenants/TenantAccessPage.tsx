import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, RefreshCw, ShieldAlert, SlidersHorizontal } from 'lucide-react';
import type {
  AdminTenantFeatureItem,
  FeaturePresetPreviewResponse,
  FeatureTenantOverrideMode,
} from '@gestor/types';
import { ApiError } from '../../lib/api-client';
import { adminTenantsApi } from './admin-tenants-api';

type TenantFeaturePreset = {
  key: string;
  name: string;
  description: string;
  enabledCount: number;
  disabledCount: number;
};

type OverrideModalState = {
  feature: AdminTenantFeatureItem;
  mode: FeatureTenantOverrideMode;
  reason: string;
  expiresAt: string;
};

type PresetModalState = {
  presetKey: string;
  presetName: string;
  reason: string;
  confirmation: string;
  preview: FeaturePresetPreviewResponse | null;
};

const STATUS_META: Record<string, { label: string; className: string }> = {
  enabled: { label: 'Ativa', className: 'border-emerald-200 bg-emerald-500/10 text-emerald-700' },
  disabled: { label: 'Desligada', className: 'border-red-200 bg-red-500/10 text-red-700' },
  beta: { label: 'Beta', className: 'border-amber-200 bg-amber-500/10 text-amber-700' },
  internal: { label: 'Interna', className: 'border-slate-200 bg-slate-500/10 text-slate-700' },
  coming_soon: { label: 'Em breve', className: 'border-sky-200 bg-sky-500/10 text-sky-700' },
};

const REASON_LABELS: Record<string, string> = {
  essential: 'Essencial',
  unknown_feature: 'Feature desconhecida',
  global_disabled: 'Desligada globalmente',
  global_beta: 'Beta global',
  global_internal: 'Uso interno',
  coming_soon: 'Em breve',
  plan_not_allowed: 'Plano/modulo nao libera',
  tenant_disabled: 'Desligada para este tenant',
  tenant_enabled_override: 'Ligada por override do tenant',
  tenant_opt_in_required: 'Aguardando ativacao para esta loja',
  missing_permission: 'Permissao ausente',
  env_disabled: 'Fallback env desligado',
  enabled: 'Ativa',
};

const ACCESS_META = {
  available: { label: 'Disponivel', className: 'border-emerald-200 bg-emerald-500/10 text-emerald-700' },
  unavailable: { label: 'Indisponivel', className: 'border-red-200 bg-red-500/10 text-red-700' },
  attention: { label: 'Requer configuracao', className: 'border-amber-200 bg-amber-500/10 text-amber-700' },
} as const;

function Badge(props: { label: string; className: string }) {
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-black uppercase tracking-wide ${props.className}`}>
      {props.label}
    </span>
  );
}

function accessPresentation(feature: AdminTenantFeatureItem): { label: string; className: string } {
  if (feature.effectiveEnabled) {
    return ACCESS_META.available;
  }

  if (feature.reason === 'tenant_disabled' || feature.reason === 'tenant_opt_in_required') {
    return ACCESS_META.attention;
  }

  return ACCESS_META.unavailable;
}

function friendlyExplanation(feature: AdminTenantFeatureItem): string {
  if (feature.effectiveEnabled) {
    return 'Este recurso esta disponivel para esta loja nas condicoes atuais.';
  }

  switch (feature.reason) {
    case 'tenant_disabled':
      return 'O acesso foi desativado especificamente para esta loja e pode ser ajustado abaixo.';
    case 'tenant_opt_in_required':
      return 'Este recurso exige ativacao explicita para esta loja antes de ficar disponivel.';
    case 'missing_permission':
      return 'O recurso esta liberado, mas o perfil atual nao possui a permissao necessaria para usa-lo.';
    case 'plan_not_allowed':
      return 'O plano ou modulo atual desta loja nao inclui este recurso.';
    case 'global_disabled':
      return 'O recurso esta desligado para toda a plataforma; nenhuma acao por loja esta disponivel.';
    case 'global_internal':
      return 'Este recurso e restrito ao uso interno da plataforma.';
    case 'coming_soon':
      return 'Este recurso ainda esta em preparacao e nao pode ser liberado para esta loja.';
    default:
      return 'Este recurso nao esta disponivel para esta loja nas condicoes atuais.';
  }
}

function canAdjustTenantAccess(feature: AdminTenantFeatureItem): boolean {
  return !feature.essential
    && feature.canDisable
    && (feature.reason === 'tenant_disabled' || feature.reason === 'tenant_opt_in_required');
}

function OverrideButton(props: {
  feature: AdminTenantFeatureItem;
  compact?: boolean;
  onOpen: (state: OverrideModalState) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => props.onOpen({
        feature: props.feature,
        mode: props.feature.tenantOverride,
        reason: props.feature.overrideReason ?? '',
        expiresAt: toLocalDateInput(props.feature.overrideExpiresAt),
      })}
      className={props.compact
        ? 'inline-flex items-center gap-2 rounded-xl border border-border px-3 py-2 text-xs font-black text-foreground transition hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary'
        : 'mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-border px-4 py-3 text-sm font-black text-foreground transition hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary'}
    >
      <SlidersHorizontal className="h-4 w-4" />
      Ajustar acesso
    </button>
  );
}

export function TenantAccessPage() {
  const { tenantId } = useParams<{ tenantId: string }>();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [tenantName, setTenantName] = useState('');
  const [tenantSlug, setTenantSlug] = useState('');
  const [features, setFeatures] = useState<AdminTenantFeatureItem[]>([]);
  const [presets, setPresets] = useState<TenantFeaturePreset[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');
  const [overrideModal, setOverrideModal] = useState<OverrideModalState | null>(null);
  const [presetModal, setPresetModal] = useState<PresetModalState | null>(null);

  const loadData = useCallback(async () => {
    if (!tenantId) {
      return;
    }

    setLoading(true);
    setErrorMessage(null);

    try {
      const [tenantFeatures, presetList] = await Promise.all([
        adminTenantsApi.getFeatures(tenantId),
        adminTenantsApi.listPresets(),
      ]);
      setTenantName(tenantFeatures.tenant.name);
      setTenantSlug(tenantFeatures.tenant.slug);
      setFeatures(tenantFeatures.features);
      setPresets(presetList);
    } catch (error) {
      const message = error instanceof ApiError ? error.message : 'Nao foi possivel carregar as features do tenant.';
      setErrorMessage(message);
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    void loadData();
  }, [loadData, tenantId]);

  const categories = useMemo(() => {
    return Array.from(new Set(features.map((item) => item.category))).sort((a, b) => a.localeCompare(b));
  }, [features]);

  const filteredFeatures = useMemo(() => {
    const query = search.trim().toLowerCase();
    return features.filter((feature) => {
      if (category !== 'all' && feature.category !== category) {
        return false;
      }

      if (!query) {
        return true;
      }

      return [
        feature.name,
        feature.featureKey,
        feature.description ?? '',
        feature.reason,
        feature.category,
        feature.moduleKey ?? '',
      ].some((value) => value.toLowerCase().includes(query));
    });
  }, [category, features, search]);

  const stats = useMemo(() => {
    return {
      total: features.length,
      enabled: features.filter((item) => item.effectiveEnabled).length,
      overridden: features.filter((item) => item.tenantOverride !== 'inherit').length,
      blocked: features.filter((item) => !item.effectiveEnabled).length,
    };
  }, [features]);

  const saveOverride = async () => {
    if (!tenantId || !overrideModal) {
      return;
    }

    if (overrideModal.mode !== 'inherit' && !overrideModal.reason.trim()) {
      setErrorMessage('Motivo e obrigatorio para ativar ou desativar uma feature no tenant.');
      return;
    }

    setSaving(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const updated = await adminTenantsApi.updateFeatureOverride(tenantId, overrideModal.feature.featureKey, {
        mode: overrideModal.mode,
        reason: overrideModal.mode === 'inherit' ? undefined : overrideModal.reason.trim(),
        expiresAt: overrideModal.mode === 'inherit' || !overrideModal.expiresAt
          ? null
          : new Date(overrideModal.expiresAt).toISOString(),
      });

      setFeatures((current) => current.map((item) => (item.featureKey === updated.featureKey ? updated : item)));
      setSuccessMessage(`Feature ${updated.name} atualizada para ${overrideLabel(updated.tenantOverride)}.`);
      setOverrideModal(null);
    } catch (error) {
      const message = error instanceof ApiError ? error.message : 'Nao foi possivel salvar o override.';
      setErrorMessage(message);
    } finally {
      setSaving(false);
    }
  };

  const openPresetPreview = async (preset: TenantFeaturePreset) => {
    if (!tenantId) {
      return;
    }

    setSaving(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const preview = await adminTenantsApi.previewPreset(tenantId, preset.key);
      setPresetModal({
        presetKey: preset.key,
        presetName: preset.name,
        reason: '',
        confirmation: '',
        preview,
      });
    } catch (error) {
      const message = error instanceof ApiError ? error.message : 'Nao foi possivel gerar o preview do preset.';
      setErrorMessage(message);
    } finally {
      setSaving(false);
    }
  };

  const applyPreset = async () => {
    if (!tenantId || !presetModal) {
      return;
    }

    if (!presetModal.reason.trim()) {
      setErrorMessage('Motivo e obrigatorio para aplicar o preset.');
      return;
    }

    if (presetModal.confirmation.trim().toUpperCase() !== 'APLICAR TENANT') {
      setErrorMessage('Digite APLICAR TENANT para confirmar.');
      return;
    }

    setSaving(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      await adminTenantsApi.applyPreset(tenantId, presetModal.presetKey, {
        reason: presetModal.reason.trim(),
        confirmation: presetModal.confirmation.trim(),
      });
      await loadData();
      setSuccessMessage(`Preset ${presetModal.presetName} aplicado ao tenant com sucesso.`);
      setPresetModal(null);
    } catch (error) {
      const message = error instanceof ApiError ? error.message : 'Nao foi possivel aplicar o preset.';
      setErrorMessage(message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center p-6">
        <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-primary" />
      </div>
    );
  }

  if (!tenantId) {
    return null;
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <button
            onClick={() => navigate(`/tenants/${tenantId}`)}
            className="mb-2 inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground transition hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            Voltar para detalhes
          </button>
          <p className="text-sm font-black uppercase tracking-widest text-primary">P16.4C</p>
          <h1 className="text-3xl font-black tracking-tight text-foreground">Features do tenant</h1>
          <p className="mt-2 max-w-3xl text-base font-semibold text-muted-foreground">
            Governanca por tenant usando o catalogo oficial, com status efetivo, motivo de bloqueio e presets MVP com preview.
          </p>
          <div className="mt-3 space-y-1 text-sm text-muted-foreground">
            <div><span className="font-black text-foreground">{tenantName}</span></div>
            <div className="font-mono">{tenantSlug}</div>
          </div>
        </div>

        <button
          type="button"
          onClick={() => void loadData()}
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-border bg-card px-4 py-3 text-sm font-black text-foreground transition-colors hover:bg-muted"
        >
          <RefreshCw className="h-4 w-4" />
          Atualizar
        </button>
      </div>

      {successMessage ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-700">
          {successMessage}
        </div>
      ) : null}

      {errorMessage ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">
          {errorMessage}
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard label="Catalogo total" value={String(stats.total)} />
        <SummaryCard label="Ativas efetivas" value={String(stats.enabled)} accent="text-emerald-600" />
        <SummaryCard label="Overrides no tenant" value={String(stats.overridden)} accent="text-primary" />
        <SummaryCard label="Bloqueadas" value={String(stats.blocked)} accent="text-amber-600" />
      </div>

      <section className="rounded-2xl border border-border bg-card p-5">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="text-xl font-black text-foreground">Presets MVP</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Gere o dry-run antes de aplicar. O preset nunca reativa feature que esteja desligada globalmente.
            </p>
          </div>
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          {presets.map((preset) => (
            <div key={preset.key} className="rounded-2xl border border-border bg-background p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-black text-foreground">{preset.name}</h3>
                  <p className="mt-1 text-xs font-mono text-muted-foreground">{preset.key}</p>
                </div>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void openPresetPreview(preset)}
                  className="inline-flex items-center gap-2 rounded-xl border border-border px-3 py-2 text-xs font-black text-foreground transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <SlidersHorizontal className="h-4 w-4" />
                  Pre-visualizar
                </button>
              </div>
              <p className="mt-3 text-sm text-muted-foreground">{preset.description}</p>
              <div className="mt-4 flex flex-wrap gap-2 text-xs font-black uppercase tracking-wide">
                <Badge label={`${preset.enabledCount} liga`} className="border-emerald-200 bg-emerald-500/10 text-emerald-700" />
                <Badge label={`${preset.disabledCount} desliga`} className="border-red-200 bg-red-500/10 text-red-700" />
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-border bg-card p-4">
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr),220px]">
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar por nome, chave, categoria ou motivo..."
            className="h-11 rounded-xl border border-input bg-background px-3 text-sm outline-none transition focus:ring-2 focus:ring-primary"
          />
          <select
            value={category}
            onChange={(event) => setCategory(event.target.value)}
            className="h-11 rounded-xl border border-input bg-background px-3 text-sm outline-none transition focus:ring-2 focus:ring-primary"
          >
            <option value="all">Todas categorias</option>
            {categories.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </div>
      </section>

      <div className="hidden overflow-hidden rounded-2xl border border-border bg-card lg:block">
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-muted/60 text-[11px] font-black uppercase tracking-widest text-muted-foreground">
              <tr>
                <th className="px-5 py-4">Feature</th>
                <th className="px-5 py-4">Status do recurso</th>
                <th className="px-5 py-4">Acesso para esta loja</th>
                <th className="px-5 py-4">Explicacao</th>
                <th className="px-5 py-4 text-right">Acao</th>
              </tr>
            </thead>
            <tbody>
              {filteredFeatures.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-5 py-10 text-center text-sm font-semibold text-muted-foreground">
                    Nenhuma feature encontrada com os filtros atuais.
                  </td>
                </tr>
              ) : (
                filteredFeatures.map((feature) => (
                  <tr key={feature.featureKey} className="border-t border-border align-top">
                    <td className="px-5 py-4">
                      <div className="font-black text-foreground">{feature.name}</div>
                      <div className="mt-1 text-xs font-mono text-muted-foreground">{feature.featureKey}</div>
                      {feature.description ? <p className="mt-2 max-w-md text-xs text-muted-foreground">{feature.description}</p> : null}
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex flex-wrap gap-2">
                        <Badge
                          label={STATUS_META[feature.globalStatus]?.label ?? feature.globalStatus}
                          className={STATUS_META[feature.globalStatus]?.className ?? 'border-border bg-muted text-muted-foreground'}
                        />
                        {feature.essential ? (
                          <Badge label="Essencial" className="border-slate-200 bg-slate-500/10 text-slate-700" />
                        ) : null}
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <Badge
                        label={accessPresentation(feature).label}
                        className={accessPresentation(feature).className}
                      />
                    </td>
                    <td className="px-5 py-4 text-xs text-muted-foreground">
                      <p className="max-w-md font-semibold leading-5 text-foreground">{friendlyExplanation(feature)}</p>
                      <details className="mt-3 rounded-lg border border-border bg-muted/30 px-3 py-2">
                        <summary className="cursor-pointer text-xs font-black text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-primary">Detalhes tecnicos</summary>
                        <dl className="mt-2 grid gap-1 text-xs text-muted-foreground">
                          <div><dt className="inline font-semibold text-foreground">Motivo: </dt><dd className="inline">{REASON_LABELS[feature.reason] ?? feature.reason}</dd></div>
                          <div><dt className="inline font-semibold text-foreground">Override: </dt><dd className="inline">{overrideLabel(feature.tenantOverride)}</dd></div>
                          <div><dt className="inline font-semibold text-foreground">Modulo: </dt><dd className="inline">{feature.moduleKey ?? 'sem modulo dedicado'}</dd></div>
                          <div><dt className="inline font-semibold text-foreground">RBAC: </dt><dd className="inline">{feature.requiredPermission?.join(', ') || 'sem permissao extra'}</dd></div>
                          <div><dt className="inline font-semibold text-foreground">Fonte: </dt><dd className="inline">{feature.source ?? 'sem fonte detalhada'}</dd></div>
                        </dl>
                      </details>
                    </td>
                    <td className="px-5 py-4 text-right">
                      {canAdjustTenantAccess(feature) ? <OverrideButton feature={feature} onOpen={setOverrideModal} compact /> : <span className="text-xs font-semibold text-muted-foreground">Nenhuma acao disponivel</span>}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid gap-4 lg:hidden">
        {filteredFeatures.map((feature) => (
          <div key={feature.featureKey} className="rounded-2xl border border-border bg-card p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="font-black text-foreground">{feature.name}</h3>
                <p className="mt-1 text-xs font-mono text-muted-foreground">{feature.featureKey}</p>
              </div>
              <Badge
                label={accessPresentation(feature).label}
                className={accessPresentation(feature).className}
              />
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <Badge
                label={STATUS_META[feature.globalStatus]?.label ?? feature.globalStatus}
                className={STATUS_META[feature.globalStatus]?.className ?? 'border-border bg-muted text-muted-foreground'}
              />
              <Badge
                label={overrideLabel(feature.tenantOverride)}
                className="border-primary/20 bg-primary/10 text-primary"
              />
              {feature.essential ? (
                <Badge label="Essencial" className="border-slate-200 bg-slate-500/10 text-slate-700" />
              ) : null}
            </div>

            <p className="mt-4 text-sm font-semibold leading-6 text-foreground">{friendlyExplanation(feature)}</p>
            <details className="mt-4 rounded-xl border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
              <summary className="cursor-pointer font-black text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-primary">Detalhes tecnicos</summary>
              <div className="mt-2 space-y-1"><div>Motivo: {REASON_LABELS[feature.reason] ?? feature.reason}</div><div>Override: {overrideLabel(feature.tenantOverride)}</div><div>Modulo: {feature.moduleKey ?? 'sem modulo dedicado'}</div><div>RBAC: {feature.requiredPermission?.join(', ') || 'sem permissao extra'}</div><div>Fonte: {feature.source ?? 'sem fonte detalhada'}</div></div>
            </details>
            {canAdjustTenantAccess(feature) ? <OverrideButton feature={feature} onOpen={setOverrideModal} /> : <p className="mt-4 text-xs font-semibold text-muted-foreground">Nenhuma acao disponivel para este estado.</p>}
          </div>
        ))}
      </div>

      <div className="rounded-2xl border border-dashed border-border bg-card/60 p-5">
        <div className="flex items-start gap-3">
          <ShieldAlert className="mt-0.5 h-5 w-5 text-amber-600" />
          <div>
            <p className="font-black text-foreground">Regras desta fase</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Feature essencial nao aceita override. `global disabled`, `internal` e `coming soon` bloqueiam o tenant. O preset sempre executa preview antes da aplicacao.
            </p>
          </div>
        </div>
      </div>

      {overrideModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-xl rounded-3xl border border-border bg-background p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-xl font-black text-foreground">Override por tenant</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {overrideModal.feature.name} - <span className="font-mono">{overrideModal.feature.featureKey}</span>
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOverrideModal(null)}
                className="rounded-xl border border-border px-3 py-2 text-xs font-black text-foreground transition hover:bg-muted"
              >
                Fechar
              </button>
            </div>

            <div className="mt-6 space-y-4">
              {overrideModal.feature.globalStatus === 'disabled' ||
              overrideModal.feature.globalStatus === 'internal' ||
              overrideModal.feature.globalStatus === 'coming_soon' ? (
                <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-semibold text-amber-800">
                  Essa feature tem restricao global no momento. O backend rejeitara `enabled` para este tenant nesse estado.
                </div>
              ) : null}

              <label className="block">
                <span className="mb-2 block text-xs font-black uppercase tracking-widest text-muted-foreground">Modo</span>
                <select
                  value={overrideModal.mode}
                  onChange={(event) => setOverrideModal((current) => current ? { ...current, mode: event.target.value as FeatureTenantOverrideMode } : current)}
                  className="h-11 w-full rounded-xl border border-input bg-background px-3 text-sm outline-none transition focus:ring-2 focus:ring-primary"
                >
                  <option value="inherit">Herdar global/plano</option>
                  <option value="enabled">Ativar para este tenant</option>
                  <option value="disabled">Desativar para este tenant</option>
                </select>
              </label>

              <label className="block">
                <span className="mb-2 block text-xs font-black uppercase tracking-widest text-muted-foreground">Motivo</span>
                <textarea
                  value={overrideModal.reason}
                  onChange={(event) => setOverrideModal((current) => current ? { ...current, reason: event.target.value } : current)}
                  rows={4}
                  placeholder="Ex: piloto assistido, rollback controlado, modulo fora do escopo comercial..."
                  className="w-full rounded-2xl border border-input bg-background px-4 py-3 text-sm outline-none transition focus:ring-2 focus:ring-primary"
                />
              </label>

              <label className="block">
                <span className="mb-2 block text-xs font-black uppercase tracking-widest text-muted-foreground">Expiracao opcional</span>
                <input
                  type="datetime-local"
                  value={overrideModal.expiresAt}
                  onChange={(event) => setOverrideModal((current) => current ? { ...current, expiresAt: event.target.value } : current)}
                  className="h-11 w-full rounded-xl border border-input bg-background px-3 text-sm outline-none transition focus:ring-2 focus:ring-primary"
                />
              </label>
            </div>

            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setOverrideModal(null)}
                className="rounded-xl border border-border px-4 py-3 text-sm font-black text-foreground transition hover:bg-muted"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => void saveOverride()}
                className="rounded-xl bg-primary px-4 py-3 text-sm font-black text-primary-foreground transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saving ? 'Salvando...' : 'Salvar override'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {presetModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-4xl rounded-3xl border border-border bg-background p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-xl font-black text-foreground">Preview do preset</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {presetModal.presetName} - confirme com cuidado antes de aplicar ao tenant.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPresetModal(null)}
                className="rounded-xl border border-border px-3 py-2 text-xs font-black text-foreground transition hover:bg-muted"
              >
                Fechar
              </button>
            </div>

            {presetModal.preview ? (
              <>
                <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
                  <SummaryCard label="Total" value={String(presetModal.preview.summary.total)} compact />
                  <SummaryCard label="Liga" value={String(presetModal.preview.summary.willEnable)} compact accent="text-emerald-600" />
                  <SummaryCard label="Desliga" value={String(presetModal.preview.summary.willDisable)} compact accent="text-red-600" />
                  <SummaryCard label="Ignoradas" value={String(presetModal.preview.summary.ignoredEssential)} compact />
                  <SummaryCard label="Bloqueadas" value={String(presetModal.preview.summary.blocked)} compact accent="text-amber-600" />
                  <SummaryCard label="Sem mudanca" value={String(presetModal.preview.summary.unchanged)} compact />
                </div>

                <div className="mt-6 max-h-[320px] overflow-auto rounded-2xl border border-border">
                  <table className="min-w-full text-left text-sm">
                    <thead className="bg-muted/60 text-[11px] font-black uppercase tracking-widest text-muted-foreground">
                      <tr>
                        <th className="px-4 py-3">Feature</th>
                        <th className="px-4 py-3">Acao</th>
                        <th className="px-4 py-3">Antes</th>
                        <th className="px-4 py-3">Depois</th>
                        <th className="px-4 py-3">Motivo</th>
                      </tr>
                    </thead>
                    <tbody>
                      {presetModal.preview.changes.map((change) => (
                        <tr key={change.featureKey} className="border-t border-border align-top">
                          <td className="px-4 py-3">
                            <div className="font-black text-foreground">{change.name}</div>
                            <div className="mt-1 text-xs font-mono text-muted-foreground">{change.featureKey}</div>
                          </td>
                          <td className="px-4 py-3">
                            <Badge
                              label={change.action}
                              className={
                                change.action === 'enable'
                                  ? 'border-emerald-200 bg-emerald-500/10 text-emerald-700'
                                  : change.action === 'disable'
                                    ? 'border-red-200 bg-red-500/10 text-red-700'
                                    : change.action === 'blocked'
                                      ? 'border-amber-200 bg-amber-500/10 text-amber-700'
                                      : 'border-slate-200 bg-slate-500/10 text-slate-700'
                              }
                            />
                          </td>
                          <td className="px-4 py-3 text-xs text-muted-foreground">{change.effectiveEnabledBefore ? 'Liberada' : 'Bloqueada'}</td>
                          <td className="px-4 py-3 text-xs text-muted-foreground">{change.effectiveEnabledAfter ? 'Liberada' : 'Bloqueada'}</td>
                          <td className="px-4 py-3 text-xs text-muted-foreground">{change.reason}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="mt-6 grid gap-4 lg:grid-cols-2">
                  <label className="block">
                    <span className="mb-2 block text-xs font-black uppercase tracking-widest text-muted-foreground">Motivo</span>
                    <textarea
                      value={presetModal.reason}
                      onChange={(event) => setPresetModal((current) => current ? { ...current, reason: event.target.value } : current)}
                      rows={4}
                      placeholder="Ex: preset aplicado no tenant piloto para alinhar escopo MVP comercial..."
                      className="w-full rounded-2xl border border-input bg-background px-4 py-3 text-sm outline-none transition focus:ring-2 focus:ring-primary"
                    />
                  </label>

                  <label className="block">
                    <span className="mb-2 block text-xs font-black uppercase tracking-widest text-red-600">Confirmacao forte</span>
                    <input
                      value={presetModal.confirmation}
                      onChange={(event) => setPresetModal((current) => current ? { ...current, confirmation: event.target.value } : current)}
                      placeholder="Digite APLICAR TENANT"
                      className="h-11 w-full rounded-xl border border-red-200 bg-red-50 px-3 text-sm outline-none transition focus:ring-2 focus:ring-red-400"
                    />
                  </label>
                </div>
              </>
            ) : null}

            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setPresetModal(null)}
                className="rounded-xl border border-border px-4 py-3 text-sm font-black text-foreground transition hover:bg-muted"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={saving || !presetModal.preview}
                onClick={() => void applyPreset()}
                className="rounded-xl bg-primary px-4 py-3 text-sm font-black text-primary-foreground transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saving ? 'Aplicando...' : 'Aplicar preset ao tenant'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function SummaryCard(props: { label: string; value: string; accent?: string; compact?: boolean }) {
  return (
    <div className={`rounded-2xl border border-border bg-card ${props.compact ? 'p-4' : 'p-5'}`}>
      <p className="text-xs font-black uppercase tracking-widest text-muted-foreground">{props.label}</p>
      <p className={`mt-3 text-3xl font-black ${props.accent ?? 'text-foreground'}`}>{props.value}</p>
    </div>
  );
}

function overrideLabel(mode: FeatureTenantOverrideMode): string {
  switch (mode) {
    case 'enabled':
      return 'Forcado ligado';
    case 'disabled':
      return 'Forcado desligado';
    case 'inherit':
    default:
      return 'Herdando';
  }
}

function toLocalDateInput(value: string | Date | null | undefined): string {
  if (!value) {
    return '';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }

  const pad = (input: number) => String(input).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
