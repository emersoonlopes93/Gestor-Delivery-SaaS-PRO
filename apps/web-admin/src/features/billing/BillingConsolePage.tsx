import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  BadgeDollarSign,
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  CreditCard,
  Eye,
  FileText,
  Layers3,
  Loader2,
  Receipt,
  RefreshCw,
  Search,
  Settings,
  ShieldAlert,
  Store,
  TrendingUp,
  X,
} from 'lucide-react';
import {
  adminBillingApi,
  AdminTenantListItem,
  BillingCycleInvoicePreview,
  BillingCycleRecord,
  BillingOverview,
  BillingPaymentConfig,
  BillingPlanV2,
  BillingSettings,
  BillingUsagePreview,
  DecimalLike,
  InvoiceDetails,
  InvoiceItem,
  InvoiceSummary,
  PaymentAttempt,
  TenantBillingSubscriptionResponse,
} from './admin-billing-api';

type TabId = 'overview' | 'plans' | 'tenant' | 'invoices' | 'settings';

const TABS: Array<{ id: TabId; label: string; icon: typeof CreditCard }> = [
  { id: 'overview', label: 'Visão Geral', icon: TrendingUp },
  { id: 'plans', label: 'Planos por Faturamento', icon: Layers3 },
  { id: 'tenant', label: 'Tenant Billing', icon: Store },
  { id: 'invoices', label: 'Invoices Draft', icon: Receipt },
  { id: 'settings', label: 'Configurações', icon: Settings },
];

const statusLabels: Record<string, string> = {
  trialing: 'Trial',
  active: 'Ativo',
  draft: 'Rascunho',
  open: 'Aberto',
  closed: 'Fechado',
  invoiced: 'Faturado',
  paid: 'Pago',
  pending: 'Pendente',
  processing: 'Processando',
  succeeded: 'Sucesso',
  past_due: 'Em atraso',
  failed: 'Falhou',
  suspended: 'Suspenso',
  canceled: 'Cancelado',
  missing_new_billing_subscription: 'Sem billing novo',
  trial_expired_not_enforced: 'Trial expirado sem bloqueio',
  grace_period_expired_not_enforced: 'Carência expirada sem bloqueio',
};

function money(value: DecimalLike | null | undefined, currency = 'BRL'): string {
  const numberValue = Number(value ?? 0);
  return numberValue.toLocaleString('pt-BR', { style: 'currency', currency });
}

function formatDate(value: string | null | undefined): string {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('pt-BR');
}

function shortId(value: string | null | undefined): string {
  return value ? value.slice(0, 8) : '—';
}

function statusBadgeClass(status: string): string {
  if (['active', 'paid', 'invoiced'].includes(status)) return 'bg-emerald-50 text-emerald-700 border-emerald-200';
  if (['trialing', 'trial_expired_not_enforced'].includes(status)) return 'bg-amber-50 text-amber-800 border-amber-200';
  if (['past_due', 'suspended', 'failed'].includes(status)) return 'bg-red-50 text-red-700 border-red-200';
  if (['closed', 'open'].includes(status)) return 'bg-blue-50 text-blue-700 border-blue-200';
  return 'bg-slate-100 text-slate-700 border-slate-200';
}

function metadataText(metadata: Record<string, unknown> | null | undefined, key: string): string {
  const value = metadata?.[key];
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return '—';
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-flex items-center rounded-md border px-2.5 py-1 text-xs font-bold ${statusBadgeClass(status)}`}>
      {statusLabels[status] ?? status}
    </span>
  );
}

function Panel(props: { title?: string; action?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={`rounded-lg border border-border bg-card shadow-sm ${props.className ?? ''}`}>
      {props.title || props.action ? (
        <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-center sm:justify-between">
          {props.title ? <h2 className="text-base font-black text-foreground">{props.title}</h2> : <div />}
          {props.action}
        </div>
      ) : null}
      {props.children}
    </section>
  );
}

function MetricCard(props: { label: string; value: string | number; icon: typeof CreditCard; tone?: string }) {
  const Icon = props.icon;
  return (
    <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm font-bold text-muted-foreground">{props.label}</p>
        <Icon className={`h-5 w-5 ${props.tone ?? 'text-primary'}`} />
      </div>
      <p className="text-2xl font-black text-foreground">{props.value}</p>
    </div>
  );
}

function EmptyState(props: { icon: typeof CreditCard; title: string; text: string }) {
  const Icon = props.icon;
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border bg-muted/30 p-8 text-center">
      <Icon className="mb-3 h-9 w-9 text-muted-foreground" />
      <p className="font-black text-foreground">{props.title}</p>
      <p className="mt-1 max-w-lg text-sm font-medium text-muted-foreground">{props.text}</p>
    </div>
  );
}

function LoadingBlock() {
  return (
    <div className="flex min-h-40 items-center justify-center rounded-lg border border-border bg-card">
      <Loader2 className="h-6 w-6 animate-spin text-primary" />
    </div>
  );
}

function SafetyAlert() {
  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-amber-900">
      <div className="flex gap-3">
        <ShieldAlert className="mt-0.5 h-5 w-5 flex-shrink-0" />
        <div>
          <p className="font-black">Operação manual sem cobrança real</p>
          <p className="mt-1 text-sm font-semibold">
            Este console apenas visualiza usage, fecha ciclos e cria invoices em rascunho. Nenhum gateway é chamado, nenhum payment attempt é criado e nenhum tenant é bloqueado.
          </p>
        </div>
      </div>
    </div>
  );
}

function PlansTab({ plans }: { plans: BillingPlanV2[] }) {
  if (!plans.length) {
    return <EmptyState icon={Layers3} title="Nenhum plano billing v2 encontrado" text="Quando o plano revenue-growth existir, suas faixas aparecerão aqui com dados reais." />;
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {plans.map((plan) => (
        <Panel key={plan.id}>
          <div className="p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-xl font-black text-foreground">{plan.name}</h2>
                  <StatusBadge status={plan.isActive ? 'active' : 'canceled'} />
                </div>
                <p className="mt-1 font-mono text-sm font-bold text-muted-foreground">{plan.slug}</p>
              </div>
              <div className="rounded-md bg-muted px-3 py-2 text-right">
                <p className="text-xs font-bold text-muted-foreground">Trial</p>
                <p className="font-black text-foreground">{plan.trialDays} dias</p>
              </div>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              <InfoPill label="Cartão obrigatório" value={plan.requiresPaymentMethod ? 'Sim' : 'Não'} />
              <InfoPill label="Todos módulos" value={plan.allowAllModules ? 'Sim' : 'Não'} />
              <InfoPill label="Ciclo" value={plan.cycleInterval} />
            </div>

            <div className="mt-5 overflow-hidden rounded-lg border border-border">
              <table className="w-full text-sm">
                <thead className="bg-muted">
                  <tr className="text-left text-xs font-black uppercase text-muted-foreground">
                    <th className="px-4 py-3">Faixa</th>
                    <th className="px-4 py-3">Receita</th>
                    <th className="px-4 py-3 text-right">Mensalidade</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {plan.revenueTiers.map((tier) => (
                    <tr key={tier.id}>
                      <td className="px-4 py-3 font-bold text-foreground">{tier.label ?? `Faixa ${tier.sortOrder + 1}`}</td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {money(tier.minRevenue)} até {tier.maxRevenue ? money(tier.maxRevenue) : 'acima'}
                      </td>
                      <td className="px-4 py-3 text-right font-black text-foreground">{money(tier.price, plan.currency)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </Panel>
      ))}
    </div>
  );
}

function InfoPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-background px-3 py-2">
      <p className="text-xs font-bold text-muted-foreground">{label}</p>
      <p className="mt-0.5 font-black text-foreground">{value}</p>
    </div>
  );
}

function OverviewTab(props: { overview?: BillingOverview; loading: boolean }) {
  const { overview, loading } = props;
  if (loading) return <LoadingBlock />;
  if (!overview) {
    return <EmptyState icon={TrendingUp} title="Sem dados de overview" text="O backend não retornou métricas para o console de billing." />;
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Tenants com billing novo" value={overview.tenantsWithBilling} icon={Store} />
        <MetricCard label="Invoices draft" value={overview.draftInvoices} icon={Receipt} />
        <MetricCard label="Ciclos abertos" value={overview.openCycles} icon={CalendarClock} />
        <MetricCard label="Ciclos fechados" value={overview.closedCycles} icon={ClipboardList} />
        <MetricCard label="Faturamento apurado no mês" value={money(overview.monthBillableRevenue)} icon={TrendingUp} />
        <MetricCard label="Receita SaaS estimada" value={money(overview.estimatedSaasRevenue)} icon={BadgeDollarSign} />
        <MetricCard label="Tenants em trial" value={overview.trialingSubscriptions} icon={AlertTriangle} tone="text-amber-600" />
        <MetricCard label="Tenants ativos" value={overview.activeSubscriptions} icon={CheckCircle2} tone="text-emerald-600" />
      </div>
      <Panel>
        <div className="flex flex-col gap-4 p-5 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-sm font-bold text-muted-foreground">Tenants sem assinatura billing nova</p>
            <p className="mt-1 text-3xl font-black text-foreground">{overview.tenantsWithoutNewBilling}</p>
          </div>
          <p className="max-w-2xl text-sm font-semibold text-muted-foreground">
            Este número é honesto: tenants legados ou sem assinatura v2 aparecem aqui, sem simular MRR ou cobrança.
          </p>
        </div>
      </Panel>
    </div>
  );
}

function TenantTab(props: {
  tenants: AdminTenantListItem[];
  selectedTenantId: string;
  onSelectTenant: (tenantId: string) => void;
  tenantBilling?: TenantBillingSubscriptionResponse;
  cycles: BillingCycleRecord[];
  invoices: InvoiceSummary[];
  usagePreview?: BillingUsagePreview;
  invoicePreview?: BillingCycleInvoicePreview;
  tenantLoading: boolean;
  usageLoading: boolean;
  invoicePreviewLoading: boolean;
  onCreateCycle: () => void;
  onRefreshUsage: () => void;
  onPreviewInvoice: () => void;
  onOpenCloseModal: () => void;
  creatingCycle: boolean;
  closingCycle: boolean;
}) {
  const tenantBilling = props.tenantBilling;
  const subscription = tenantBilling?.subscription ?? null;
  const plan = tenantBilling?.plan ?? null;
  const currentCycle = tenantBilling?.currentCycle ?? props.cycles[0] ?? null;
  const latestInvoice = tenantBilling?.latestInvoice ?? props.invoices[0] ?? null;

  return (
    <div className="grid gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
      <Panel title="Selecionar tenant">
        <div className="p-4">
          <div className="relative mb-3">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <select
              value={props.selectedTenantId}
              onChange={(event) => props.onSelectTenant(event.target.value)}
              className="w-full rounded-lg border border-input bg-card py-3 pl-10 pr-4 text-sm font-bold text-foreground outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="">Escolha um tenant</option>
              {props.tenants.map((tenant) => (
                <option key={tenant.id} value={tenant.id}>
                  {tenant.name} · {tenant.slug}
                </option>
              ))}
            </select>
          </div>
          {!props.selectedTenantId ? (
            <p className="text-sm font-semibold text-muted-foreground">Selecione um tenant para carregar assinatura, ciclo, usage e invoices reais.</p>
          ) : null}
        </div>
      </Panel>

      <div className="space-y-4">
        {!props.selectedTenantId ? (
          <EmptyState icon={Store} title="Nenhum tenant selecionado" text="A operação manual começa selecionando um tenant existente da plataforma." />
        ) : props.tenantLoading ? (
          <LoadingBlock />
        ) : !subscription ? (
          <EmptyState icon={AlertTriangle} title="Tenant sem assinatura billing nova" text="Não há TenantBillingSubscription v2 para este tenant. A console não cria cobrança nem inventa assinatura." />
        ) : (
          <>
            <Panel
              title="Assinatura e ciclo"
              action={
                <button
                  onClick={props.onCreateCycle}
                  disabled={props.creatingCycle}
                  className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-black text-primary-foreground disabled:opacity-60"
                >
                  {props.creatingCycle ? <Loader2 className="h-4 w-4 animate-spin" /> : <CalendarClock className="h-4 w-4" />}
                  Criar/obter ciclo atual
                </button>
              }
            >
              <div className="grid gap-4 p-5 lg:grid-cols-3">
                <InfoPill label="Plano" value={plan?.name ?? '—'} />
                <div className="rounded-md border border-border bg-background px-3 py-2">
                  <p className="text-xs font-bold text-muted-foreground">Status</p>
                  <div className="mt-1"><StatusBadge status={tenantBilling?.calculatedStatus ?? subscription.status} /></div>
                </div>
                <InfoPill label="Trial termina em" value={formatDate(subscription.trialEndsAt)} />
                <InfoPill label="Ciclo atual" value={currentCycle ? shortId(currentCycle.id) : 'Não criado'} />
                <InfoPill label="Período" value={currentCycle ? `${formatDate(currentCycle.startedAt)} até ${formatDate(currentCycle.endedAt)}` : '—'} />
                <div className="rounded-md border border-border bg-background px-3 py-2">
                  <p className="text-xs font-bold text-muted-foreground">Status do ciclo</p>
                  <div className="mt-1">{currentCycle ? <StatusBadge status={currentCycle.status} /> : <span className="font-black text-foreground">—</span>}</div>
                </div>
              </div>
            </Panel>

            <Panel
              title="Usage preview"
              action={
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={props.onRefreshUsage}
                    disabled={!currentCycle || props.usageLoading}
                    className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm font-black text-foreground disabled:opacity-50"
                  >
                    {props.usageLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                    Atualizar preview
                  </button>
                  <button
                    onClick={props.onPreviewInvoice}
                    disabled={!currentCycle || props.invoicePreviewLoading}
                    className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm font-black text-foreground disabled:opacity-50"
                  >
                    {props.invoicePreviewLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
                    Preview invoice
                  </button>
                  <button
                    onClick={props.onOpenCloseModal}
                    disabled={!currentCycle || props.closingCycle}
                    className="inline-flex items-center gap-2 rounded-md bg-slate-900 px-3 py-2 text-sm font-black text-white disabled:opacity-50 dark:bg-slate-100 dark:text-slate-950"
                  >
                    <Receipt className="h-4 w-4" />
                    Fechar e gerar draft
                  </button>
                </div>
              }
            >
              <div className="grid gap-4 p-5 lg:grid-cols-4">
                <MetricCard label="Faturamento apurado" value={money(props.usagePreview?.billableAmount)} icon={TrendingUp} />
                <MetricCard label="Pedidos contados" value={props.usagePreview?.ordersCount ?? 0} icon={ClipboardList} />
                <MetricCard label="Faixa atual" value={props.usagePreview?.rating?.selectedTier?.label ?? '—'} icon={Layers3} />
                <MetricCard label="Mensalidade estimada" value={money(props.usagePreview?.rating?.currentMonthlyPrice)} icon={BadgeDollarSign} />
              </div>
              <div className="grid gap-4 border-t border-border p-5 lg:grid-cols-3">
                <InfoPill label="Próxima faixa" value={props.usagePreview?.rating?.nextTier?.label ?? 'Sem próxima faixa'} />
                <InfoPill label="Falta para próxima" value={props.usagePreview?.rating?.revenueUntilNextTier ? money(props.usagePreview.rating.revenueUntilNextTier) : '—'} />
                <InfoPill label="Latest invoice draft" value={latestInvoice ? `${latestInvoice.number} · ${money(latestInvoice.total)}` : 'Nenhuma'} />
              </div>
            </Panel>

            {props.invoicePreview ? (
              <Panel title="Preview da invoice">
                <div className="p-5">
                  <div className="mb-4 grid gap-3 sm:grid-cols-3">
                    <InfoPill label="Total preview" value={money(props.invoicePreview.totalAmount)} />
                    <InfoPill label="Moeda" value={props.invoicePreview.currency} />
                    <InfoPill label="Item count" value={String(props.invoicePreview.invoiceItems.length)} />
                  </div>
                  <InvoiceItemsTable items={props.invoicePreview.invoiceItems} />
                </div>
              </Panel>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}

function InvoiceItemsTable({ items }: { items: Array<InvoiceItem | { type: string; description: string; quantity: number; unitAmount: DecimalLike; totalAmount: DecimalLike; metadata: Record<string, unknown> | null }> }) {
  return (
    <div className="overflow-hidden rounded-lg border border-border">
      <table className="w-full text-sm">
        <thead className="bg-muted text-left text-xs font-black uppercase text-muted-foreground">
          <tr>
            <th className="px-4 py-3">Tipo</th>
            <th className="px-4 py-3">Descrição</th>
            <th className="px-4 py-3 text-right">Qtd.</th>
            <th className="px-4 py-3 text-right">Total</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {items.map((item) => (
            <tr key={`${item.type}-${item.description}`}>
              <td className="px-4 py-3 font-mono text-xs font-bold text-muted-foreground">{item.type}</td>
              <td className="px-4 py-3 font-bold text-foreground">{item.description}</td>
              <td className="px-4 py-3 text-right text-muted-foreground">{item.quantity}</td>
              <td className="px-4 py-3 text-right font-black text-foreground">{money(item.totalAmount)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function InvoicesTab(props: {
  invoices: InvoiceSummary[];
  loading: boolean;
  onOpenInvoice: (invoiceId: string) => void;
  selectedDetails?: InvoiceDetails;
  paymentConfig?: BillingPaymentConfig;
  detailsLoading: boolean;
  onCloseDetails: () => void;
  onCreateAttempt: (invoice: InvoiceSummary) => void;
  onMarkAttemptPaid: (attemptId: string) => void;
  onMarkAttemptFailed: (attemptId: string) => void;
  paymentActionLoading: boolean;
}) {
  if (props.loading) return <LoadingBlock />;
  if (!props.invoices.length) {
    return <EmptyState icon={Receipt} title="Nenhuma invoice draft" text="Invoices rascunho aparecerão aqui depois de fechar um ciclo manualmente." />;
  }

  return (
    <>
      <Panel title="Invoices draft">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-sm">
            <thead className="bg-muted text-left text-xs font-black uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Número</th>
                <th className="px-4 py-3">Tenant</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Subtotal</th>
                <th className="px-4 py-3 text-right">Total</th>
                <th className="px-4 py-3">Vencimento</th>
                <th className="px-4 py-3">Provider</th>
                <th className="px-4 py-3 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {props.invoices.map((invoice) => (
                <tr key={invoice.id}>
                  <td className="px-4 py-3 font-mono font-black text-foreground">{invoice.number}</td>
                  <td className="px-4 py-3">
                    <p className="font-bold text-foreground">{invoice.tenant?.name ?? invoice.tenantId}</p>
                    <p className="text-xs font-semibold text-muted-foreground">{invoice.tenant?.slug ?? shortId(invoice.tenantId)}</p>
                  </td>
                  <td className="px-4 py-3"><StatusBadge status={invoice.status} /></td>
                  <td className="px-4 py-3 text-right font-bold">{money(invoice.subtotal)}</td>
                  <td className="px-4 py-3 text-right font-black">{money(invoice.total)}</td>
                  <td className="px-4 py-3">{formatDate(invoice.dueDate)}</td>
                  <td className="px-4 py-3 font-mono text-xs font-bold">{invoice.provider}</td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => props.onOpenInvoice(invoice.id)}
                      className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 font-black text-foreground"
                    >
                      <Eye className="h-4 w-4" />
                      Detalhes
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      {props.selectedDetails || props.detailsLoading ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
          <div className="max-h-[88vh] w-full max-w-4xl overflow-y-auto rounded-lg bg-card shadow-2xl">
            <div className="flex items-center justify-between border-b border-border p-5">
              <div>
                <h2 className="text-xl font-black">Detalhe da invoice</h2>
                <p className="mt-1 text-sm font-semibold text-muted-foreground">Sem ação de cobrança real nesta fase.</p>
              </div>
              <button onClick={props.onCloseDetails} className="rounded-md p-2 hover:bg-muted">
                <X className="h-5 w-5" />
              </button>
            </div>
            {props.detailsLoading || !props.selectedDetails ? (
              <div className="p-8"><LoadingBlock /></div>
            ) : (
              <InvoiceDetailsView
                details={props.selectedDetails}
                paymentConfig={props.paymentConfig}
                onCreateAttempt={props.onCreateAttempt}
                onMarkAttemptPaid={props.onMarkAttemptPaid}
                onMarkAttemptFailed={props.onMarkAttemptFailed}
                paymentActionLoading={props.paymentActionLoading}
              />
            )}
          </div>
        </div>
      ) : null}
    </>
  );
}

function InvoiceDetailsView(props: {
  details: InvoiceDetails;
  paymentConfig?: BillingPaymentConfig;
  onCreateAttempt: (invoice: InvoiceSummary) => void;
  onMarkAttemptPaid: (attemptId: string) => void;
  onMarkAttemptFailed: (attemptId: string) => void;
  paymentActionLoading: boolean;
}) {
  const { details } = props;
  const firstItem = details.items[0];
  return (
    <div className="space-y-5 p-5">
      <div className="grid gap-3 sm:grid-cols-4">
        <InfoPill label="Status" value={statusLabels[details.invoice.status] ?? details.invoice.status} />
        <InfoPill label="Ciclo" value={shortId(details.invoice.cycleId)} />
        <InfoPill label="Período" value={details.cycle ? `${formatDate(details.cycle.startedAt)} até ${formatDate(details.cycle.endedAt)}` : '—'} />
        <InfoPill label="Total" value={money(details.invoice.total)} />
      </div>
      <InvoiceItemsTable items={details.items} />
      <PaymentAttemptPanel
        invoice={details.invoice}
        attempts={details.paymentAttempts}
        paymentConfig={props.paymentConfig}
        onCreateAttempt={props.onCreateAttempt}
        onMarkAttemptPaid={props.onMarkAttemptPaid}
        onMarkAttemptFailed={props.onMarkAttemptFailed}
        loading={props.paymentActionLoading}
      />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <InfoPill label="Measured revenue" value={metadataText(firstItem?.metadata, 'measuredRevenue')} />
        <InfoPill label="Billable revenue" value={metadataText(firstItem?.metadata, 'billableRevenue')} />
        <InfoPill label="Tier" value={metadataText(firstItem?.metadata, 'tierLabel')} />
        <InfoPill label="Snapshot" value={shortId(details.snapshot?.id)} />
      </div>
      <button disabled className="w-full rounded-md border border-dashed border-border bg-muted px-4 py-3 font-black text-muted-foreground">
        Cobrança real indisponível nesta fase
      </button>
    </div>
  );
}

function PaymentAttemptPanel(props: {
  invoice: InvoiceSummary;
  attempts: PaymentAttempt[];
  paymentConfig?: BillingPaymentConfig;
  onCreateAttempt: (invoice: InvoiceSummary) => void;
  onMarkAttemptPaid: (attemptId: string) => void;
  onMarkAttemptFailed: (attemptId: string) => void;
  loading: boolean;
}) {
  const paymentsEnabled = props.paymentConfig?.paymentsEnabled ?? false;
  const provider = props.paymentConfig?.provider ?? 'manual';
  const mode = props.paymentConfig?.mode ?? 'disabled';
  const canCreate = paymentsEnabled && (provider === 'manual' || provider === 'mock') && mode !== 'disabled' && !['paid', 'void', 'failed'].includes(props.invoice.status);

  return (
    <div className="rounded-lg border border-border bg-background">
      <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="font-black text-foreground">Payment attempts</p>
          <p className="mt-1 text-sm font-semibold text-muted-foreground">
            Esta acao ainda nao cobra automaticamente em producao. Apenas manual/mock sandbox local.
          </p>
        </div>
        <button
          onClick={() => props.onCreateAttempt(props.invoice)}
          disabled={!canCreate || props.loading}
          className="inline-flex items-center justify-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-black text-primary-foreground disabled:opacity-50"
        >
          {props.loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />}
          Criar tentativa manual/sandbox
        </button>
      </div>
      {!paymentsEnabled ? (
        <div className="border-b border-border bg-amber-50 p-4 text-sm font-semibold text-amber-900">
          <span className="mr-2 rounded-md border border-amber-200 px-2 py-1 text-xs font-black">Payments OFF</span>
          Ative sandbox com BILLING_PAYMENTS_ENABLED=true, BILLING_GATEWAY_PROVIDER=mock e BILLING_GATEWAY_MODE=sandbox.
        </div>
      ) : null}
      <div className="grid gap-3 p-4 sm:grid-cols-3">
        <InfoPill label="Provider ativo" value={provider} />
        <InfoPill label="Modo ativo" value={mode} />
        <InfoPill label="Attempts" value={String(props.attempts.length)} />
      </div>
      {props.attempts.length ? (
        <div className="overflow-x-auto border-t border-border">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="bg-muted text-left text-xs font-black uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Provider</th>
                <th className="px-4 py-3">Mode</th>
                <th className="px-4 py-3">Gateway ID</th>
                <th className="px-4 py-3">Attempted</th>
                <th className="px-4 py-3 text-right">Acoes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {props.attempts.map((attempt) => (
                <tr key={attempt.id}>
                  <td className="px-4 py-3"><StatusBadge status={attempt.status} /></td>
                  <td className="px-4 py-3 font-mono text-xs font-bold">{attempt.provider}</td>
                  <td className="px-4 py-3 font-mono text-xs font-bold">{attempt.mode}</td>
                  <td className="px-4 py-3 font-mono text-xs font-bold">{attempt.providerPaymentId ?? 'local'}</td>
                  <td className="px-4 py-3">{formatDate(attempt.attemptedAt)}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-2">
                      <button
                        onClick={() => props.onMarkAttemptPaid(attempt.id)}
                        disabled={props.loading || attempt.status === 'succeeded' || props.invoice.status === 'paid'}
                        className="rounded-md border border-border px-2.5 py-1.5 text-xs font-black disabled:opacity-50"
                      >
                        Pago
                      </button>
                      <button
                        onClick={() => props.onMarkAttemptFailed(attempt.id)}
                        disabled={props.loading || attempt.status === 'failed' || props.invoice.status === 'paid'}
                        className="rounded-md border border-border px-2.5 py-1.5 text-xs font-black disabled:opacity-50"
                      >
                        Falha
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="border-t border-border p-4 text-sm font-semibold text-muted-foreground">
          Nenhuma tentativa registrada para esta invoice.
        </div>
      )}
    </div>
  );
}

function SettingsTab({ settings, loading }: { settings?: BillingSettings; loading: boolean }) {
  if (loading) return <LoadingBlock />;
  if (!settings) return <EmptyState icon={Settings} title="Configurações indisponíveis" text="Não foi possível carregar BillingSettings global." />;

  const rows: Array<{ label: string; value: boolean | number }> = [
    { label: 'countStorefrontOrders', value: settings.countStorefrontOrders },
    { label: 'countPosOrders', value: settings.countPosOrders },
    { label: 'countWhatsappAiOrders', value: settings.countWhatsappAiOrders },
    { label: 'countManualOrders', value: settings.countManualOrders },
    { label: 'countConfirmedOrders', value: settings.countConfirmedOrders },
    { label: 'countCompletedOrders', value: settings.countCompletedOrders },
    { label: 'excludeCancelledOrders', value: settings.excludeCancelledOrders },
    { label: 'includeDeliveryFeeByDefault', value: settings.includeDeliveryFeeByDefault },
    { label: 'includeServiceFeeByDefault', value: settings.includeServiceFeeByDefault },
    { label: 'discountReducesRevenue', value: settings.discountReducesRevenue },
    { label: 'defaultGracePeriodDays', value: settings.defaultGracePeriodDays },
    { label: 'defaultTrialDays', value: settings.defaultTrialDays },
    { label: 'requirePaymentMethodForPaidPlans', value: settings.requirePaymentMethodForPaidPlans },
  ];

  return (
    <Panel title="BillingSettings global">
      <div className="grid gap-3 p-5 sm:grid-cols-2 xl:grid-cols-3">
        {rows.map((row) => (
          <div key={row.label} className="flex items-center justify-between rounded-lg border border-border bg-background px-4 py-3">
            <span className="font-mono text-sm font-bold text-foreground">{row.label}</span>
            <span className={`rounded-md px-2.5 py-1 text-xs font-black ${typeof row.value === 'boolean' ? (row.value ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-700') : 'bg-blue-50 text-blue-700'}`}>
              {typeof row.value === 'boolean' ? (row.value ? 'true' : 'false') : row.value}
            </span>
          </div>
        ))}
      </div>
    </Panel>
  );
}

function CloseCycleModal(props: { open: boolean; loading: boolean; onConfirm: () => void; onCancel: () => void }) {
  if (!props.open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
      <div className="w-full max-w-lg rounded-lg bg-card shadow-2xl">
        <div className="border-b border-border p-5">
          <h2 className="text-xl font-black">Confirmar fechamento de ciclo</h2>
        </div>
        <div className="space-y-4 p-5">
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-amber-900">
            <p className="font-black">Esta ação NÃO cobra o cliente.</p>
            <p className="mt-1 text-sm font-semibold">Ela apenas fecha o ciclo e cria uma fatura rascunho.</p>
          </div>
          <div className="flex gap-3">
            <button onClick={props.onCancel} disabled={props.loading} className="flex-1 rounded-md border border-border px-4 py-3 font-black">
              Cancelar
            </button>
            <button onClick={props.onConfirm} disabled={props.loading} className="flex-1 rounded-md bg-primary px-4 py-3 font-black text-primary-foreground disabled:opacity-60">
              {props.loading ? 'Processando...' : 'Fechar e criar draft'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function BillingConsolePage() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<TabId>('overview');
  const [selectedTenantId, setSelectedTenantId] = useState('');
  const [usagePreview, setUsagePreview] = useState<BillingUsagePreview | undefined>();
  const [invoicePreview, setInvoicePreview] = useState<BillingCycleInvoicePreview | undefined>();
  const [closeModalOpen, setCloseModalOpen] = useState(false);
  const [selectedInvoiceId, setSelectedInvoiceId] = useState('');

  const tenantsQuery = useQuery({ queryKey: ['admin-tenants-billing'], queryFn: adminBillingApi.listTenants });
  const overviewQuery = useQuery({ queryKey: ['admin-billing-overview'], queryFn: adminBillingApi.getBillingOverview });
  const plansQuery = useQuery({ queryKey: ['admin-billing-plans-v2'], queryFn: adminBillingApi.listBillingPlansV2 });
  const settingsQuery = useQuery({ queryKey: ['admin-billing-settings'], queryFn: adminBillingApi.getBillingSettings });
  const paymentConfigQuery = useQuery({ queryKey: ['admin-billing-payment-config'], queryFn: adminBillingApi.getBillingPaymentConfig });
  const draftInvoicesQuery = useQuery({ queryKey: ['admin-billing-draft-invoices'], queryFn: adminBillingApi.listDraftInvoices });

  const tenantBillingQuery = useQuery({
    queryKey: ['admin-tenant-billing', selectedTenantId],
    queryFn: () => adminBillingApi.getTenantBillingSubscription(selectedTenantId),
    enabled: !!selectedTenantId,
  });
  const tenantCyclesQuery = useQuery({
    queryKey: ['admin-tenant-billing-cycles', selectedTenantId],
    queryFn: () => adminBillingApi.getTenantBillingCycles(selectedTenantId),
    enabled: !!selectedTenantId,
  });
  const tenantInvoicesQuery = useQuery({
    queryKey: ['admin-tenant-billing-invoices', selectedTenantId],
    queryFn: () => adminBillingApi.getTenantBillingInvoices(selectedTenantId),
    enabled: !!selectedTenantId,
  });
  const invoiceDetailsQuery = useQuery({
    queryKey: ['admin-billing-invoice-details', selectedInvoiceId],
    queryFn: () => adminBillingApi.getInvoiceDetails(selectedInvoiceId),
    enabled: !!selectedInvoiceId,
  });

  const selectedTenantBilling = tenantBillingQuery.data;
  const selectedSubscription = selectedTenantBilling?.subscription ?? null;
  const selectedPlan = selectedTenantBilling?.plan ?? null;
  const selectedCycle = selectedTenantBilling?.currentCycle ?? tenantCyclesQuery.data?.[0] ?? null;

  const refreshTenantBilling = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['admin-tenant-billing', selectedTenantId] }),
      queryClient.invalidateQueries({ queryKey: ['admin-tenant-billing-cycles', selectedTenantId] }),
      queryClient.invalidateQueries({ queryKey: ['admin-tenant-billing-invoices', selectedTenantId] }),
      queryClient.invalidateQueries({ queryKey: ['admin-billing-overview'] }),
      queryClient.invalidateQueries({ queryKey: ['admin-billing-draft-invoices'] }),
    ]);
  };

  const createCycleMutation = useMutation({
    mutationFn: async () => {
      if (!selectedTenantId || !selectedSubscription) throw new Error('Selecione tenant com assinatura billing.');
      return adminBillingApi.getOrCreateCurrentCycle({
        tenantId: selectedTenantId,
        subscriptionId: selectedSubscription.id,
      });
    },
    onSuccess: () => {
      setUsagePreview(undefined);
      setInvoicePreview(undefined);
      void refreshTenantBilling();
    },
  });

  const usagePreviewMutation = useMutation({
    mutationFn: async () => {
      if (!selectedTenantId || !selectedCycle) throw new Error('Crie ou selecione um ciclo.');
      return adminBillingApi.getUsagePreview({
        tenantId: selectedTenantId,
        periodStart: selectedCycle.startedAt,
        periodEnd: selectedCycle.endedAt ?? new Date().toISOString(),
        planId: selectedPlan?.id,
      });
    },
    onSuccess: setUsagePreview,
  });

  const invoicePreviewMutation = useMutation({
    mutationFn: async () => {
      if (!selectedTenantId || !selectedSubscription || !selectedPlan || !selectedCycle) {
        throw new Error('Tenant, assinatura, plano e ciclo são obrigatórios.');
      }
      return adminBillingApi.previewCycleInvoice(selectedCycle.id, {
        tenantId: selectedTenantId,
        subscriptionId: selectedSubscription.id,
        planId: selectedPlan.id,
      });
    },
    onSuccess: setInvoicePreview,
  });

  const closeCycleMutation = useMutation({
    mutationFn: async () => {
      if (!selectedTenantId || !selectedSubscription || !selectedPlan || !selectedCycle) {
        throw new Error('Tenant, assinatura, plano e ciclo são obrigatórios.');
      }
      return adminBillingApi.closeAndDraftInvoice(selectedCycle.id, {
        tenantId: selectedTenantId,
        subscriptionId: selectedSubscription.id,
        planId: selectedPlan.id,
      });
    },
    onSuccess: async () => {
      setCloseModalOpen(false);
      setInvoicePreview(undefined);
      await refreshTenantBilling();
      if (selectedCycle && selectedPlan && selectedSubscription) {
        const preview = await adminBillingApi.previewCycleInvoice(selectedCycle.id, {
          tenantId: selectedTenantId,
          subscriptionId: selectedSubscription.id,
          planId: selectedPlan.id,
        });
        setInvoicePreview(preview);
      }
    },
  });

  const refreshInvoiceDetails = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['admin-billing-invoice-details', selectedInvoiceId] }),
      queryClient.invalidateQueries({ queryKey: ['admin-billing-draft-invoices'] }),
      queryClient.invalidateQueries({ queryKey: ['admin-billing-overview'] }),
    ]);
  };

  const createPaymentAttemptMutation = useMutation({
    mutationFn: async (invoice: InvoiceSummary) => {
      const config = paymentConfigQuery.data;
      if (!config?.paymentsEnabled) throw new Error('Payments estao desativados.');
      if (config.provider !== 'manual' && config.provider !== 'mock') throw new Error('Provider nao suportado nesta fase.');
      if (config.mode !== 'manual' && config.mode !== 'sandbox' && config.mode !== 'production') throw new Error('Modo de gateway invalido.');
      return adminBillingApi.createInvoicePaymentAttempt(invoice.id, {
        provider: config.provider,
        mode: config.mode,
        idempotencyKey: `admin-console:${invoice.id}:${config.provider}:${config.mode}`,
        simulate: config.provider === 'mock' ? 'pending' : undefined,
      });
    },
    onSuccess: () => {
      void refreshInvoiceDetails();
    },
  });

  const markPaymentAttemptPaidMutation = useMutation({
    mutationFn: adminBillingApi.markPaymentAttemptPaid,
    onSuccess: () => {
      void refreshInvoiceDetails();
    },
  });

  const markPaymentAttemptFailedMutation = useMutation({
    mutationFn: adminBillingApi.markPaymentAttemptFailed,
    onSuccess: () => {
      void refreshInvoiceDetails();
    },
  });

  const tenants = tenantsQuery.data?.items ?? [];
  const revenueGrowthPlans = useMemo(() => {
    const plans = plansQuery.data ?? [];
    return plans.filter((plan) => plan.slug === 'revenue-growth');
  }, [plansQuery.data]);

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="mb-2 text-sm font-black uppercase tracking-widest text-primary">Billing Phase 4</p>
          <h1 className="text-3xl font-black tracking-tight text-foreground">Console SaaS Admin de Billing</h1>
          <p className="mt-2 max-w-3xl text-base font-semibold text-muted-foreground">
            Visualize planos por faturamento, audite usage, feche ciclos manualmente e gere invoices draft sem ativar cobrança real.
          </p>
        </div>
        <div className="rounded-lg border border-border bg-card px-4 py-3">
          <p className="text-xs font-bold text-muted-foreground">Estado da fase</p>
          <p className="mt-1 flex items-center gap-2 font-black text-foreground">
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            Manual, auditável e sem gateway
          </p>
        </div>
      </div>

      <SafetyAlert />

      <div className="flex gap-2 overflow-x-auto rounded-lg border border-border bg-card p-2">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`inline-flex shrink-0 items-center gap-2 rounded-md px-3 py-2 text-sm font-black transition-colors ${
                active ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              }`}
            >
              <Icon className="h-4 w-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {activeTab === 'overview' ? <OverviewTab overview={overviewQuery.data} loading={overviewQuery.isLoading} /> : null}
      {activeTab === 'plans' ? <PlansTab plans={revenueGrowthPlans} /> : null}
      {activeTab === 'tenant' ? (
        <TenantTab
          tenants={tenants}
          selectedTenantId={selectedTenantId}
          onSelectTenant={(tenantId) => {
            setSelectedTenantId(tenantId);
            setUsagePreview(undefined);
            setInvoicePreview(undefined);
          }}
          tenantBilling={selectedTenantBilling}
          cycles={tenantCyclesQuery.data ?? []}
          invoices={tenantInvoicesQuery.data ?? []}
          usagePreview={usagePreview}
          invoicePreview={invoicePreview}
          tenantLoading={tenantBillingQuery.isLoading || tenantCyclesQuery.isLoading || tenantInvoicesQuery.isLoading}
          usageLoading={usagePreviewMutation.isPending}
          invoicePreviewLoading={invoicePreviewMutation.isPending}
          onCreateCycle={() => createCycleMutation.mutate()}
          onRefreshUsage={() => usagePreviewMutation.mutate()}
          onPreviewInvoice={() => invoicePreviewMutation.mutate()}
          onOpenCloseModal={() => setCloseModalOpen(true)}
          creatingCycle={createCycleMutation.isPending}
          closingCycle={closeCycleMutation.isPending}
        />
      ) : null}
      {activeTab === 'invoices' ? (
        <InvoicesTab
          invoices={draftInvoicesQuery.data ?? []}
          loading={draftInvoicesQuery.isLoading}
          onOpenInvoice={setSelectedInvoiceId}
          selectedDetails={invoiceDetailsQuery.data}
          paymentConfig={paymentConfigQuery.data}
          detailsLoading={invoiceDetailsQuery.isLoading}
          onCloseDetails={() => setSelectedInvoiceId('')}
          onCreateAttempt={(invoice) => createPaymentAttemptMutation.mutate(invoice)}
          onMarkAttemptPaid={(attemptId) => markPaymentAttemptPaidMutation.mutate(attemptId)}
          onMarkAttemptFailed={(attemptId) => markPaymentAttemptFailedMutation.mutate(attemptId)}
          paymentActionLoading={
            createPaymentAttemptMutation.isPending
            || markPaymentAttemptPaidMutation.isPending
            || markPaymentAttemptFailedMutation.isPending
          }
        />
      ) : null}
      {activeTab === 'settings' ? <SettingsTab settings={settingsQuery.data} loading={settingsQuery.isLoading} /> : null}

      {(createCycleMutation.error || usagePreviewMutation.error || invoicePreviewMutation.error || closeCycleMutation.error || createPaymentAttemptMutation.error || markPaymentAttemptPaidMutation.error || markPaymentAttemptFailedMutation.error) ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 font-bold text-red-700">
          {(createCycleMutation.error ?? usagePreviewMutation.error ?? invoicePreviewMutation.error ?? closeCycleMutation.error ?? createPaymentAttemptMutation.error ?? markPaymentAttemptPaidMutation.error ?? markPaymentAttemptFailedMutation.error)?.message}
        </div>
      ) : null}

      <CloseCycleModal
        open={closeModalOpen}
        loading={closeCycleMutation.isPending}
        onConfirm={() => closeCycleMutation.mutate()}
        onCancel={() => setCloseModalOpen(false)}
      />
    </div>
  );
}
