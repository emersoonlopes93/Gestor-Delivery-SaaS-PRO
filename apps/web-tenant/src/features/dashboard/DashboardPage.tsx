import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarDays, MoreHorizontal, RefreshCw } from 'lucide-react';
import toast from 'react-hot-toast';
import { SetupWizard } from './SetupWizard';
import { useDashboardOverview } from './useDashboardOverview';
import {
  DASHBOARD_PERIOD_LABELS,
  type DashboardPeriodPreset,
} from './dashboard.utils';
import { DashboardSkeleton } from './components/DashboardSkeleton';
import { OperationsDashboard } from './components/OperationsDashboard';

export const DASHBOARD_ACTION_MENU_ITEM_CLASS = 'block rounded-lg px-3 py-2 font-semibold transition hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-ring dark:hover:bg-slate-800';
export const DASHBOARD_ACTION_MENU_DISABLED_CLASS = 'block w-full rounded-lg px-3 py-2 text-left font-semibold transition hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:text-slate-500 disabled:opacity-70 dark:hover:bg-slate-800 dark:disabled:text-slate-400';
export const DASHBOARD_PERIOD_SELECT_CLASS = 'appearance-none border-0 bg-white py-2 pl-8 pr-7 text-xs font-semibold text-slate-900 outline-none dark:bg-slate-900 dark:text-slate-100';
export const DASHBOARD_PERIOD_OPTION_CLASS = 'bg-white text-slate-900 dark:bg-slate-900 dark:text-slate-100';

function greeting(now = new Date()) {
  const hour = now.getHours();
  if (hour < 12) return 'Bom dia';
  if (hour < 18) return 'Boa tarde';
  return 'Boa noite';
}

function deriveStorefrontBaseUrl() {
  const envBase = (import.meta.env.VITE_STOREFRONT_BASE_URL as string | undefined)?.trim();
  if (envBase) return envBase.replace(/\/+$/, '');
  const { origin, hostname } = window.location;
  if (hostname === 'localhost' || hostname === '127.0.0.1') return origin.replace('5173', '3000');
  if (hostname.startsWith('app-')) return origin.replace('app-', '');
  if (hostname.startsWith('app.')) return origin.replace('app.', '');
  return origin.replace('tenant', 'storefront');
}

export function DashboardPage() {
  const [periodPreset, setPeriodPreset] = useState<DashboardPeriodPreset>('today');
  const overview = useDashboardOverview(periodPreset);
  const [actionsOpen, setActionsOpen] = useState(false);
  const firstName = overview.user?.name?.trim().split(/\s+/)[0] || 'operador';
  const menuUrl = useMemo(() => overview.tenant?.slug ? `${deriveStorefrontBaseUrl()}/${overview.tenant.slug}` : '', [overview.tenant?.slug]);

  const copyMenu = async () => {
    if (!menuUrl) return;
    try {
      await navigator.clipboard.writeText(menuUrl);
      toast.success('Link do cardápio copiado');
    } catch {
      toast.error('Não foi possível copiar o link');
    }
  };

  return (
    <main className="min-w-0 px-3 py-4 sm:px-5 lg:px-6">
      <header className="mb-4 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="truncate text-xl font-bold tracking-tight text-foreground sm:text-2xl">{greeting()}, {firstName}</h1>
            <span className="hidden h-1.5 w-1.5 rounded-full bg-emerald-500 sm:block" aria-hidden="true" />
          </div>
          <p className="mt-1 text-xs text-muted-foreground sm:text-sm">
            Acompanhe o ritmo {DASHBOARD_PERIOD_LABELS[periodPreset].sentence} e priorize o que pede atenção.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <label className="relative inline-flex items-center rounded-lg border border-border bg-card text-xs font-semibold text-foreground shadow-card focus-within:ring-2 focus-within:ring-ring">
            <CalendarDays className="pointer-events-none absolute left-3 h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
            <span className="sr-only">Período do dashboard</span>
            <select
              aria-label="Período do dashboard"
              value={periodPreset}
              onChange={(event) => setPeriodPreset(event.target.value as DashboardPeriodPreset)}
              className={DASHBOARD_PERIOD_SELECT_CLASS}
            >
              {(Object.entries(DASHBOARD_PERIOD_LABELS) as Array<[DashboardPeriodPreset, { control: string; sentence: string }]>).map(([value, label]) => (
                <option key={value} value={value} className={DASHBOARD_PERIOD_OPTION_CLASS}>{label.control}</option>
              ))}
            </select>
            <span className="pointer-events-none absolute right-2 text-[10px] text-muted-foreground" aria-hidden="true">▾</span>
          </label>
          <button
            type="button"
            onClick={() => void overview.refetch()}
            disabled={overview.isLoading}
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground shadow-card transition hover:bg-accent hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background disabled:cursor-not-allowed disabled:opacity-60"
            aria-label="Atualizar dashboard"
          >
            <RefreshCw className={`h-4 w-4 ${overview.isLoading ? 'animate-spin' : ''}`} />
          </button>
          <div className="relative">
            <button
              type="button"
              onClick={() => setActionsOpen((open) => !open)}
              aria-expanded={actionsOpen}
              aria-label="Abrir ações rápidas"
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-foreground text-background transition hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background"
            >
              <MoreHorizontal className="h-4 w-4" />
            </button>
            {actionsOpen ? (
              <div className="absolute right-0 z-20 mt-2 w-52 overflow-hidden rounded-xl border border-slate-200 bg-white p-1.5 text-xs text-slate-900 shadow-dropdown dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100">
                <Link to="/orders" className={DASHBOARD_ACTION_MENU_ITEM_CLASS} onClick={() => setActionsOpen(false)}>Abrir pedidos</Link>
                <Link to="/cash" className={DASHBOARD_ACTION_MENU_ITEM_CLASS} onClick={() => setActionsOpen(false)}>Abrir caixa</Link>
                <Link to="/catalog/products" className={DASHBOARD_ACTION_MENU_ITEM_CLASS} onClick={() => setActionsOpen(false)}>Gerenciar produtos</Link>
                <Link to="/settings" className={DASHBOARD_ACTION_MENU_ITEM_CLASS} onClick={() => setActionsOpen(false)}>Configurar loja</Link>
                {menuUrl ? <button type="button" onClick={() => { setActionsOpen(false); void copyMenu(); }} className={DASHBOARD_ACTION_MENU_DISABLED_CLASS}>Copiar link do cardápio</button> : null}
              </div>
            ) : null}
          </div>
        </div>
      </header>

      {overview.hasPartialError ? (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3">
          <div><p className="text-xs font-bold text-amber-800 dark:text-amber-200">Parte da visão não pôde ser atualizada</p><p className="text-[11px] text-amber-700 dark:text-amber-300">Os dados disponíveis continuam visíveis.</p></div>
          <button type="button" onClick={() => void overview.refetch()} className="text-xs font-bold text-amber-800 underline-offset-4 hover:underline dark:text-amber-200">Tentar novamente</button>
        </div>
      ) : null}

      {!overview.setup || overview.isLoading ? null : (
        <SetupWizard
          settings={overview.tenant?.settings ?? null}
          operatingHours={overview.setup.operatingHours}
          hasCategories={overview.setup.hasCategories}
          hasProducts={overview.setup.hasProducts}
        />
      )}

      {overview.isLoading ? <DashboardSkeleton /> : overview.canReadReports ? (
        <OperationsDashboard
          current={overview.current}
          previous={overview.previous}
          storeStatus={overview.storeStatus}
          tenantSlug={overview.tenant?.slug}
          tenantName={overview.tenant?.name}
          billingWarning={overview.billing?.warning}
          onCopyMenu={() => void copyMenu()}
          onRefresh={() => void overview.refetch()}
          refreshing={overview.isAnalyticsLoading}
          periodLabel={DASHBOARD_PERIOD_LABELS[periodPreset].sentence}
        />
      ) : (
        <section className="rounded-2xl border border-border bg-card px-5 py-8 text-center shadow-card">
          <p className="text-sm font-bold text-foreground">Visão analítica indisponível para este perfil</p>
          <p className="mx-auto mt-1 max-w-md text-xs leading-relaxed text-muted-foreground">Seu acesso continua normal. Solicite a permissão de relatórios para visualizar métricas operacionais e comerciais.</p>
          <Link to="/orders" className="mt-4 inline-flex rounded-lg bg-primary px-4 py-2 text-xs font-bold text-primary-foreground hover:opacity-90">Ir para pedidos</Link>
        </section>
      )}
    </main>
  );
}
