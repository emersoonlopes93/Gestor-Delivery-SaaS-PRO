import { useEffect, useMemo, useState } from 'react';
import { Layers3, Lock, RefreshCw, Search, ShieldAlert, SlidersHorizontal } from 'lucide-react';
import { api, ApiError } from '../../lib/api-client';
import { useAdminPermissions } from '../../hooks/use-admin-auth';

type FeatureStatus = 'stable' | 'beta' | 'internal' | 'coming_soon' | 'legacy';
type FeatureOperationalStatus = 'enabled' | 'disabled' | 'beta' | 'internal' | 'coming_soon';

type FeatureCatalogItem = {
  featureKey: string;
  name: string;
  description?: string;
  category: string;
  essential: boolean;
  canDisable: boolean;
  catalogStatus: FeatureStatus;
  globalStatus: FeatureOperationalStatus;
  envFallbackKey?: string;
  moduleKey?: string;
  requiredPermission?: string[];
  updatedAt: string | null;
  updatedBy: string | null;
};

const STATUS_META: Record<FeatureOperationalStatus, { label: string; classes: string }> = {
  enabled: { label: 'Ativa', classes: 'bg-emerald-500/10 text-emerald-700 border-emerald-200' },
  disabled: { label: 'Desligada', classes: 'bg-red-500/10 text-red-700 border-red-200' },
  beta: { label: 'Beta', classes: 'bg-amber-500/10 text-amber-700 border-amber-200' },
  internal: { label: 'Interna', classes: 'bg-slate-500/10 text-slate-700 border-slate-200' },
  coming_soon: { label: 'Em breve', classes: 'bg-sky-500/10 text-sky-700 border-sky-200' },
};

const CATALOG_META: Record<FeatureStatus, { label: string; classes: string }> = {
  stable: { label: 'Stable', classes: 'bg-emerald-500/10 text-emerald-700 border-emerald-200' },
  beta: { label: 'Beta', classes: 'bg-amber-500/10 text-amber-700 border-amber-200' },
  internal: { label: 'Internal', classes: 'bg-slate-500/10 text-slate-700 border-slate-200' },
  coming_soon: { label: 'Coming soon', classes: 'bg-sky-500/10 text-sky-700 border-sky-200' },
  legacy: { label: 'Legacy', classes: 'bg-rose-500/10 text-rose-700 border-rose-200' },
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

  const [items, setItems] = useState<FeatureCatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');
  const [status, setStatus] = useState('all');
  const [scope, setScope] = useState('all');

  const [selectedItem, setSelectedItem] = useState<FeatureCatalogItem | null>(null);
  const [nextStatus, setNextStatus] = useState<FeatureOperationalStatus>('enabled');
  const [reason, setReason] = useState('');
  const [confirmationWord, setConfirmationWord] = useState('');

  const loadItems = async () => {
    setLoading(true);
    setErrorMessage(null);
    try {
      const res = await api.get<FeatureCatalogItem[]>('/admin/features');
      setItems(res.data);
    } catch (error) {
      const message = error instanceof ApiError ? error.message : 'Nao foi possivel carregar o catalogo de features.';
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

  const openStatusModal = (item: FeatureCatalogItem) => {
    setSelectedItem(item);
    setNextStatus(item.globalStatus);
    setReason('');
    setConfirmationWord('');
    setSuccessMessage(null);
    setErrorMessage(null);
  };

  const closeModal = (force = false) => {
    if (saving && !force) return;
    setSelectedItem(null);
    setReason('');
    setConfirmationWord('');
  };

  const handleSave = async () => {
    if (!selectedItem) return;

    if (!reason.trim()) {
      setErrorMessage('Informe o motivo operacional da alteracao.');
      return;
    }

    if (nextStatus === 'disabled' && confirmationWord.trim().toUpperCase() !== 'DESATIVAR') {
      setErrorMessage('Digite DESATIVAR para confirmar a desativacao global.');
      return;
    }

    setSaving(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      const res = await api.patch<FeatureCatalogItem>(`/admin/features/${selectedItem.featureKey}/status`, {
        status: nextStatus,
        reason: reason.trim(),
      });

      setItems((current) => current.map((item) => (item.featureKey === res.data.featureKey ? res.data : item)));
      setSuccessMessage(`Status global de ${res.data.name} atualizado para ${STATUS_META[res.data.globalStatus].label.toLowerCase()}.`);
      closeModal(true);
    } catch (error) {
      const message = error instanceof ApiError ? error.message : 'Nao foi possivel salvar a alteracao.';
      setErrorMessage(message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="mb-2 text-sm font-black uppercase tracking-widest text-primary">P16.4B</p>
          <h1 className="text-3xl font-black tracking-tight text-foreground">Feature Control Center</h1>
          <p className="mt-2 max-w-3xl text-base font-semibold text-muted-foreground">
            Controle global auditavel para features opcionais, sem desligar o core e sem depender apenas de `.env`.
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
        <div className="rounded-2xl border border-border bg-card p-5">
          <p className="text-xs font-black uppercase tracking-widest text-muted-foreground">Catalogo total</p>
          <p className="mt-3 text-3xl font-black text-foreground">{stats.total}</p>
        </div>
        <div className="rounded-2xl border border-border bg-card p-5">
          <p className="text-xs font-black uppercase tracking-widest text-muted-foreground">Ativas</p>
          <p className="mt-3 text-3xl font-black text-emerald-600">{stats.enabled}</p>
        </div>
        <div className="rounded-2xl border border-border bg-card p-5">
          <p className="text-xs font-black uppercase tracking-widest text-muted-foreground">Essenciais protegidas</p>
          <p className="mt-3 text-3xl font-black text-slate-700">{stats.protected}</p>
        </div>
        <div className="rounded-2xl border border-border bg-card p-5">
          <p className="text-xs font-black uppercase tracking-widest text-muted-foreground">Com restricao global</p>
          <p className="mt-3 text-3xl font-black text-amber-600">{stats.constrained}</p>
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-card p-4">
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr),180px,180px,180px]">
          <label className="relative block">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar por nome, chave, modulo..."
              className="h-11 w-full rounded-xl border border-input bg-background pl-10 pr-4 text-sm outline-none transition focus:ring-2 focus:ring-primary"
            />
          </label>

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
                <th className="px-5 py-4">Catalogo</th>
                <th className="px-5 py-4">Modulo / fallback</th>
                <th className="px-5 py-4">Ultima alteracao</th>
                <th className="px-5 py-4 text-right">Acao</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-5 py-10 text-center text-sm font-semibold text-muted-foreground">
                    Carregando catalogo oficial...
                  </td>
                </tr>
              ) : filteredItems.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-5 py-10 text-center text-sm font-semibold text-muted-foreground">
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
                    <td className="px-5 py-4">
                      <FeatureBadge label={CATALOG_META[item.catalogStatus].label} className={CATALOG_META[item.catalogStatus].classes} />
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
                <FeatureBadge label={CATALOG_META[item.catalogStatus].label} className={CATALOG_META[item.catalogStatus].classes} />
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

      {selectedItem ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-xl rounded-3xl border border-border bg-background p-6 shadow-2xl">
            <div className="flex items-start gap-3">
              <div className="rounded-2xl bg-primary/10 p-3 text-primary">
                <Layers3 className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <h2 className="text-xl font-black text-foreground">Alterar status global</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {selectedItem.name} • <span className="font-mono">{selectedItem.featureKey}</span>
                </p>
              </div>
            </div>

            <div className="mt-6 space-y-4">
              <label className="block">
                <span className="mb-2 block text-xs font-black uppercase tracking-widest text-muted-foreground">Novo status</span>
                <select
                  value={nextStatus}
                  onChange={(event) => setNextStatus(event.target.value as FeatureOperationalStatus)}
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
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  rows={4}
                  placeholder="Ex: liberado para piloto interno com acompanhamento do time..."
                  className="w-full rounded-2xl border border-input bg-background px-4 py-3 text-sm outline-none transition focus:ring-2 focus:ring-primary"
                />
              </label>

              {nextStatus === 'disabled' ? (
                <label className="block">
                  <span className="mb-2 block text-xs font-black uppercase tracking-widest text-red-600">Confirmacao forte</span>
                  <input
                    value={confirmationWord}
                    onChange={(event) => setConfirmationWord(event.target.value)}
                    placeholder="Digite DESATIVAR"
                    className="h-11 w-full rounded-xl border border-red-200 bg-red-50 px-3 text-sm outline-none transition focus:ring-2 focus:ring-red-400"
                  />
                </label>
              ) : null}
            </div>

            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => closeModal()}
                className="rounded-xl border border-border px-4 py-3 text-sm font-black text-foreground transition hover:bg-muted"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => void handleSave()}
                className="rounded-xl bg-primary px-4 py-3 text-sm font-black text-primary-foreground transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saving ? 'Salvando...' : 'Salvar status global'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
