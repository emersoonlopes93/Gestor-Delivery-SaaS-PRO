import { useEffect, useMemo, useState } from 'react';
import { Layers3, Lock, RefreshCw, ShieldAlert, SlidersHorizontal } from 'lucide-react';
import type { AdminFeatureCatalogItem, FeaturePresetPreviewResponse } from '@gestor/types';
import { api, ApiError } from '../../lib/api-client';
import { useAdminPermissions } from '../../hooks/use-admin-auth';

type FeatureOperationalStatus = 'enabled' | 'disabled' | 'beta' | 'internal' | 'coming_soon';

type FeaturePresetSummary = {
  key: string;
  name: string;
  description: string;
  enabledCount: number;
  disabledCount: number;
};

type GlobalStatusModalState = {
  item: AdminFeatureCatalogItem;
  nextStatus: FeatureOperationalStatus;
  reason: string;
  confirmationWord: string;
};

type GlobalPresetModalState = {
  presetKey: string;
  presetName: string;
  reason: string;
  confirmation: string;
  preview: FeaturePresetPreviewResponse | null;
};

const STATUS_META: Record<FeatureOperationalStatus, { label: string; classes: string }> = {
  enabled: { label: 'Ativa', classes: 'bg-emerald-500/10 text-emerald-700 border-emerald-200' },
  disabled: { label: 'Desligada', classes: 'bg-red-500/10 text-red-700 border-red-200' },
  beta: { label: 'Beta', classes: 'bg-amber-500/10 text-amber-700 border-amber-200' },
  internal: { label: 'Interna', classes: 'bg-slate-500/10 text-slate-700 border-slate-200' },
  coming_soon: { label: 'Em breve', classes: 'bg-sky-500/10 text-sky-700 border-sky-200' },
};

function FeatureBadge(props: { label: string; className: string }) {
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-black uppercase tracking-wide ${props.className}`}>
      {props.label}
    </span>
  );
}

export function FeatureControlPage() {
  const { has } = useAdminPermissions();
  const canManage = has('saas.modules.manage');

  const [items, setItems] = useState<AdminFeatureCatalogItem[]>([]);
  const [presets, setPresets] = useState<FeaturePresetSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');
  const [status, setStatus] = useState('all');
  const [scope, setScope] = useState('all');

  const [statusModal, setStatusModal] = useState<GlobalStatusModalState | null>(null);
  const [presetModal, setPresetModal] = useState<GlobalPresetModalState | null>(null);

  const loadItems = async () => {
    setLoading(true);
    setErrorMessage(null);
    try {
      const [catalogResponse, presetsResponse] = await Promise.all([
        api.get<AdminFeatureCatalogItem[]>('/admin/features'),
        api.get<FeaturePresetSummary[]>('/admin/features/presets'),
      ]);
      setItems(catalogResponse.data);
      setPresets(presetsResponse.data);
    } catch (error) {
      const message = error instanceof ApiError ? error.message : 'Nao foi possivel carregar o Feature Control Center.';
      setErrorMessage(message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadItems();
  }, []);

  const categories = useMemo(() => {
    return Array.from(new Set(items.map((item) => item.category))).sort((a, b) => a.localeCompare(b));
  }, [items]);

  const filteredItems = useMemo(() => {
    const query = search.trim().toLowerCase();
    return items.filter((item) => {
      if (category !== 'all' && item.category !== category) return false;
      if (status !== 'all' && item.globalStatus !== status) return false;
      if (scope === 'essential' && !item.essential) return false;
      if (scope === 'optional' && item.essential) return false;
      if (!query) return true;

      return [item.name, item.featureKey, item.description ?? '', item.category, item.moduleKey ?? '']
        .some((value) => value.toLowerCase().includes(query));
    });
  }, [category, items, scope, search, status]);

  const stats = useMemo(() => {
    return {
      total: items.length,
      enabled: items.filter((item) => item.globalStatus === 'enabled').length,
      protected: items.filter((item) => item.essential).length,
      constrained: items.filter((item) => item.globalStatus !== 'enabled').length,
    };
  }, [items]);

  const openStatusModal = (item: AdminFeatureCatalogItem) => {
    setStatusModal({
      item,
      nextStatus: item.globalStatus,
      reason: '',
      confirmationWord: '',
    });
    setErrorMessage(null);
    setSuccessMessage(null);
  };

  const saveGlobalStatus = async () => {
    if (!statusModal) {
      return;
    }

    if (!statusModal.reason.trim()) {
      setErrorMessage('Informe o motivo operacional da alteracao.');
      return;
    }

    if (statusModal.nextStatus === 'disabled' && statusModal.confirmationWord.trim().toUpperCase() !== 'DESATIVAR') {
      setErrorMessage('Digite DESATIVAR para confirmar a desativacao global.');
      return;
    }

    setSaving(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const res = await api.patch<AdminFeatureCatalogItem>(`/admin/features/${statusModal.item.featureKey}/status`, {
        status: statusModal.nextStatus,
        reason: statusModal.reason.trim(),
      });

      setItems((current) => current.map((item) => (item.featureKey === res.data.featureKey ? res.data : item)));
      setSuccessMessage(`Status global de ${res.data.name} atualizado para ${STATUS_META[res.data.globalStatus].label.toLowerCase()}.`);
      setStatusModal(null);
    } catch (error) {
      const message = error instanceof ApiError ? error.message : 'Nao foi possivel salvar a alteracao.';
      setErrorMessage(message);
    } finally {
      setSaving(false);
    }
  };

  const openPresetPreview = async (preset: FeaturePresetSummary) => {
    setSaving(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const res = await api.post<FeaturePresetPreviewResponse>(`/admin/features/presets/${preset.key}/preview`);
      setPresetModal({
        presetKey: preset.key,
        presetName: preset.name,
        reason: '',
        confirmation: '',
        preview: res.data,
      });
    } catch (error) {
      const message = error instanceof ApiError ? error.message : 'Nao foi possivel gerar o preview do preset global.';
      setErrorMessage(message);
    } finally {
      setSaving(false);
    }
  };

  const applyGlobalPreset = async () => {
    if (!presetModal) {
      return;
    }

    if (!presetModal.reason.trim()) {
      setErrorMessage('Motivo operacional e obrigatorio para aplicar o preset global.');
      return;
    }

    if (presetModal.confirmation.trim().toUpperCase() !== 'APLICAR GLOBAL') {
      setErrorMessage('Digite APLICAR GLOBAL para confirmar.');
      return;
    }

    setSaving(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      await api.post(`/admin/features/presets/${presetModal.presetKey}/apply-global`, {
        reason: presetModal.reason.trim(),
        confirmation: presetModal.confirmation.trim(),
      });
      await loadItems();
      setSuccessMessage(`Preset ${presetModal.presetName} aplicado globalmente.`);
      setPresetModal(null);
    } catch (error) {
      const message = error instanceof ApiError ? error.message : 'Nao foi possivel aplicar o preset global.';
      setErrorMessage(message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="mb-2 text-sm font-black uppercase tracking-widest text-primary">P16.4C</p>
          <h1 className="text-3xl font-black tracking-tight text-foreground">Feature Control Center</h1>
          <p className="mt-2 max-w-3xl text-base font-semibold text-muted-foreground">
            Governanca global com catalogo oficial, bloqueio de core, presets MVP com dry-run e trilha auditavel.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void loadItems()}
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-border bg-card px-4 py-3 text-sm font-black text-foreground transition-colors hover:bg-muted"
        >
          <RefreshCw className="h-4 w-4" />
          Atualizar
        </button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Catalogo total" value={String(stats.total)} />
        <StatCard label="Ativas" value={String(stats.enabled)} accent="text-emerald-600" />
        <StatCard label="Essenciais protegidas" value={String(stats.protected)} />
        <StatCard label="Com restricao global" value={String(stats.constrained)} accent="text-amber-600" />
      </div>

      <section className="rounded-2xl border border-border bg-card p-5">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="text-xl font-black text-foreground">Presets MVP</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              O preview mostra diff, ignoradas essenciais e bloqueios antes de qualquer aplicacao global.
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
                  disabled={!canManage || saving}
                  onClick={() => void openPresetPreview(preset)}
                  className="inline-flex items-center gap-2 rounded-xl border border-border px-3 py-2 text-xs font-black text-foreground transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <SlidersHorizontal className="h-4 w-4" />
                  Pre-visualizar
                </button>
              </div>
              <p className="mt-3 text-sm text-muted-foreground">{preset.description}</p>
              <div className="mt-4 flex flex-wrap gap-2">
                <FeatureBadge label={`${preset.enabledCount} liga`} className="bg-emerald-500/10 text-emerald-700 border-emerald-200" />
                <FeatureBadge label={`${preset.disabledCount} desliga`} className="bg-red-500/10 text-red-700 border-red-200" />
              </div>
            </div>
          ))}
        </div>
      </section>

      <div className="rounded-2xl border border-border bg-card p-4">
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr),180px,180px,180px]">
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar por nome, chave, modulo..."
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

          <select
            value={status}
            onChange={(event) => setStatus(event.target.value)}
            className="h-11 rounded-xl border border-input bg-background px-3 text-sm outline-none transition focus:ring-2 focus:ring-primary"
          >
            <option value="all">Todos status</option>
            <option value="enabled">Ativas</option>
            <option value="disabled">Desligadas</option>
            <option value="beta">Beta</option>
            <option value="internal">Internas</option>
            <option value="coming_soon">Em breve</option>
          </select>

          <select
            value={scope}
            onChange={(event) => setScope(event.target.value)}
            className="h-11 rounded-xl border border-input bg-background px-3 text-sm outline-none transition focus:ring-2 focus:ring-primary"
          >
            <option value="all">Essenciais + opcionais</option>
            <option value="essential">So essenciais</option>
            <option value="optional">So opcionais</option>
          </select>
        </div>
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

      <div className="hidden overflow-hidden rounded-2xl border border-border bg-card lg:block">
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-muted/60 text-[11px] font-black uppercase tracking-widest text-muted-foreground">
              <tr>
                <th className="px-5 py-4">Feature</th>
                <th className="px-5 py-4">Categoria</th>
                <th className="px-5 py-4">Status global</th>
                <th className="px-5 py-4">Modulo / fallback</th>
                <th className="px-5 py-4">Ultima alteracao</th>
                <th className="px-5 py-4 text-right">Acao</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-5 py-10 text-center text-sm font-semibold text-muted-foreground">
                    Carregando catalogo oficial...
                  </td>
                </tr>
              ) : filteredItems.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-5 py-10 text-center text-sm font-semibold text-muted-foreground">
                    Nenhuma feature encontrada com os filtros atuais.
                  </td>
                </tr>
              ) : (
                filteredItems.map((item) => (
                  <tr key={item.featureKey} className="border-t border-border align-top">
                    <td className="px-5 py-4">
                      <div className="font-black text-foreground">{item.name}</div>
                      <div className="mt-1 text-xs font-mono text-muted-foreground">{item.featureKey}</div>
                      {item.description ? <p className="mt-2 max-w-md text-xs text-muted-foreground">{item.description}</p> : null}
                    </td>
                    <td className="px-5 py-4">
                      <div className="font-semibold text-foreground">{item.category}</div>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {item.essential ? (
                          <FeatureBadge label="Essencial" className="bg-slate-500/10 text-slate-700 border-slate-200" />
                        ) : (
                          <FeatureBadge label="Opcional" className="bg-primary/10 text-primary border-primary/20" />
                        )}
                        {!item.canDisable ? (
                          <FeatureBadge label="Protegida" className="bg-orange-500/10 text-orange-700 border-orange-200" />
                        ) : null}
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <FeatureBadge label={STATUS_META[item.globalStatus].label} className={STATUS_META[item.globalStatus].classes} />
                    </td>
                    <td className="px-5 py-4 text-xs text-muted-foreground">
                      <div>{item.moduleKey ? `Modulo: ${item.moduleKey}` : 'Sem modulo dedicado'}</div>
                      <div className="mt-1">{item.envFallbackKey ? `Env: ${item.envFallbackKey}` : 'Sem fallback env'}</div>
                      <div className="mt-1">{item.requiredPermission?.length ? `RBAC: ${item.requiredPermission.join(', ')}` : 'Sem RBAC extra'}</div>
                    </td>
                    <td className="px-5 py-4 text-xs text-muted-foreground">
                      <div>{item.updatedAt ? new Date(item.updatedAt).toLocaleString('pt-BR') : 'Usando default do catalogo'}</div>
                      <div className="mt-1 font-mono">{item.updatedBy ?? 'sem admin registrado'}</div>
                    </td>
                    <td className="px-5 py-4 text-right">
                      <button
                        type="button"
                        disabled={!canManage || item.essential || !item.canDisable}
                        onClick={() => openStatusModal(item)}
                        className="inline-flex items-center gap-2 rounded-xl border border-border px-3 py-2 text-xs font-black text-foreground transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
                        title={item.essential ? 'Essa feature e essencial para o sistema.' : undefined}
                      >
                        {item.essential ? <Lock className="h-4 w-4" /> : <SlidersHorizontal className="h-4 w-4" />}
                        {item.essential ? 'Protegida' : 'Alterar status'}
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid gap-4 lg:hidden">
        {loading ? (
          <div className="rounded-2xl border border-border bg-card p-5 text-center text-sm font-semibold text-muted-foreground">
            Carregando catalogo oficial...
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="rounded-2xl border border-border bg-card p-5 text-center text-sm font-semibold text-muted-foreground">
            Nenhuma feature encontrada com os filtros atuais.
          </div>
        ) : (
          filteredItems.map((item) => (
            <div key={item.featureKey} className="rounded-2xl border border-border bg-card p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="font-black text-foreground">{item.name}</h2>
                  <p className="mt-1 text-xs font-mono text-muted-foreground">{item.featureKey}</p>
                </div>
                <FeatureBadge label={STATUS_META[item.globalStatus].label} className={STATUS_META[item.globalStatus].classes} />
              </div>
              {item.description ? <p className="mt-3 text-sm text-muted-foreground">{item.description}</p> : null}
              <div className="mt-4 flex flex-wrap gap-2">
                <FeatureBadge
                  label={item.essential ? 'Essencial' : 'Opcional'}
                  className={item.essential ? 'bg-slate-500/10 text-slate-700 border-slate-200' : 'bg-primary/10 text-primary border-primary/20'}
                />
              </div>
              <div className="mt-4 space-y-1 text-xs text-muted-foreground">
                <div>{item.moduleKey ? `Modulo: ${item.moduleKey}` : 'Sem modulo dedicado'}</div>
                <div>{item.envFallbackKey ? `Fallback env: ${item.envFallbackKey}` : 'Sem fallback env'}</div>
                <div>{item.updatedAt ? `Ultima alteracao: ${new Date(item.updatedAt).toLocaleString('pt-BR')}` : 'Usando default do catalogo'}</div>
              </div>
              <button
                type="button"
                disabled={!canManage || item.essential || !item.canDisable}
                onClick={() => openStatusModal(item)}
                className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-border px-4 py-3 text-sm font-black text-foreground transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
              >
                {item.essential ? <Lock className="h-4 w-4" /> : <SlidersHorizontal className="h-4 w-4" />}
                {item.essential ? 'Feature protegida' : 'Alterar status global'}
              </button>
            </div>
          ))
        )}
      </div>

      <div className="rounded-2xl border border-dashed border-border bg-card/60 p-5">
        <div className="flex items-start gap-3">
          <ShieldAlert className="mt-0.5 h-5 w-5 text-amber-600" />
          <div>
            <p className="font-black text-foreground">Regras do MVP</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Features essenciais continuam imutaveis. `disabled` global vence override por tenant. `.env`, billing e guards legados seguem ativos como fallback durante a migracao.
            </p>
          </div>
        </div>
      </div>

      {statusModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-xl rounded-3xl border border-border bg-background p-6 shadow-2xl">
            <div className="flex items-start gap-3">
              <div className="rounded-2xl bg-primary/10 p-3 text-primary">
                <Layers3 className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <h2 className="text-xl font-black text-foreground">Alterar status global</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {statusModal.item.name} - <span className="font-mono">{statusModal.item.featureKey}</span>
                </p>
              </div>
            </div>

            <div className="mt-6 space-y-4">
              <label className="block">
                <span className="mb-2 block text-xs font-black uppercase tracking-widest text-muted-foreground">Novo status</span>
                <select
                  value={statusModal.nextStatus}
                  onChange={(event) => setStatusModal((current) => current ? { ...current, nextStatus: event.target.value as FeatureOperationalStatus } : current)}
                  className="h-11 w-full rounded-xl border border-input bg-background px-3 text-sm outline-none transition focus:ring-2 focus:ring-primary"
                >
                  <option value="enabled">Ativa</option>
                  <option value="disabled">Desligada</option>
                  <option value="beta">Beta</option>
                  <option value="internal">Interna</option>
                  <option value="coming_soon">Em breve</option>
                </select>
              </label>

              <label className="block">
                <span className="mb-2 block text-xs font-black uppercase tracking-widest text-muted-foreground">Motivo operacional</span>
                <textarea
                  value={statusModal.reason}
                  onChange={(event) => setStatusModal((current) => current ? { ...current, reason: event.target.value } : current)}
                  rows={4}
                  placeholder="Ex: liberado para piloto interno com acompanhamento do time..."
                  className="w-full rounded-2xl border border-input bg-background px-4 py-3 text-sm outline-none transition focus:ring-2 focus:ring-primary"
                />
              </label>

              {statusModal.nextStatus === 'disabled' ? (
                <label className="block">
                  <span className="mb-2 block text-xs font-black uppercase tracking-widest text-red-600">Confirmacao forte</span>
                  <input
                    value={statusModal.confirmationWord}
                    onChange={(event) => setStatusModal((current) => current ? { ...current, confirmationWord: event.target.value } : current)}
                    placeholder="Digite DESATIVAR"
                    className="h-11 w-full rounded-xl border border-red-200 bg-red-50 px-3 text-sm outline-none transition focus:ring-2 focus:ring-red-400"
                  />
                </label>
              ) : null}
            </div>

            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setStatusModal(null)}
                className="rounded-xl border border-border px-4 py-3 text-sm font-black text-foreground transition hover:bg-muted"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => void saveGlobalStatus()}
                className="rounded-xl bg-primary px-4 py-3 text-sm font-black text-primary-foreground transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saving ? 'Salvando...' : 'Salvar status global'}
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
                <h2 className="text-xl font-black text-foreground">Preview do preset global</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {presetModal.presetName} - revise o diff antes de aplicar no catalogo inteiro.
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
                  <StatCard compact label="Total" value={String(presetModal.preview.summary.total)} />
                  <StatCard compact label="Liga" value={String(presetModal.preview.summary.willEnable)} accent="text-emerald-600" />
                  <StatCard compact label="Desliga" value={String(presetModal.preview.summary.willDisable)} accent="text-red-600" />
                  <StatCard compact label="Ignoradas" value={String(presetModal.preview.summary.ignoredEssential)} />
                  <StatCard compact label="Bloqueadas" value={String(presetModal.preview.summary.blocked)} accent="text-amber-600" />
                  <StatCard compact label="Sem mudanca" value={String(presetModal.preview.summary.unchanged)} />
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
                            <FeatureBadge
                              label={change.action}
                              className={
                                change.action === 'enable'
                                  ? 'bg-emerald-500/10 text-emerald-700 border-emerald-200'
                                  : change.action === 'disable'
                                    ? 'bg-red-500/10 text-red-700 border-red-200'
                                    : change.action === 'blocked'
                                      ? 'bg-amber-500/10 text-amber-700 border-amber-200'
                                      : 'bg-slate-500/10 text-slate-700 border-slate-200'
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
                    <span className="mb-2 block text-xs font-black uppercase tracking-widest text-muted-foreground">Motivo operacional</span>
                    <textarea
                      value={presetModal.reason}
                      onChange={(event) => setPresetModal((current) => current ? { ...current, reason: event.target.value } : current)}
                      rows={4}
                      placeholder="Ex: baseline MVP comercial para novos tenants..."
                      className="w-full rounded-2xl border border-input bg-background px-4 py-3 text-sm outline-none transition focus:ring-2 focus:ring-primary"
                    />
                  </label>

                  <label className="block">
                    <span className="mb-2 block text-xs font-black uppercase tracking-widest text-red-600">Confirmacao forte</span>
                    <input
                      value={presetModal.confirmation}
                      onChange={(event) => setPresetModal((current) => current ? { ...current, confirmation: event.target.value } : current)}
                      placeholder="Digite APLICAR GLOBAL"
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
                disabled={saving || !canManage || !presetModal.preview}
                onClick={() => void applyGlobalPreset()}
                className="rounded-xl bg-primary px-4 py-3 text-sm font-black text-primary-foreground transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saving ? 'Aplicando...' : 'Aplicar preset global'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function StatCard(props: { label: string; value: string; accent?: string; compact?: boolean }) {
  return (
    <div className={`rounded-2xl border border-border bg-card ${props.compact ? 'p-4' : 'p-5'}`}>
      <p className="text-xs font-black uppercase tracking-widest text-muted-foreground">{props.label}</p>
      <p className={`mt-3 text-3xl font-black ${props.accent ?? 'text-foreground'}`}>{props.value}</p>
    </div>
  );
}
