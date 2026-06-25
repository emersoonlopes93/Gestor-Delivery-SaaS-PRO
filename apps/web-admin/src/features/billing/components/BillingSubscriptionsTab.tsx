import { AdminTenantListItem, BillingCycleInvoicePreview, BillingCycleRecord, BillingUsagePreview, InvoiceSummary, TenantBillingSubscriptionResponse } from '../admin-billing-api';
import { money, formatDate, shortId } from '../types';
import { InvoiceItemsTable } from './BillingInvoicesTab';
import { AlertTriangle, BadgeDollarSign, CalendarClock, ClipboardList, FileText, Layers3, Loader2, Plus, Receipt, RefreshCw, Search, Store, TrendingUp } from 'lucide-react';
import { StatusBadge } from './BillingStatusBadge';
import { Panel, MetricCard, EmptyState, LoadingBlock, InfoPill } from './BillingShared';

export function TenantTab(props: {
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
  onCreateSubscription: () => void;
  creatingCycle: boolean;
  closingCycle: boolean;
  creatingSubscription: boolean;
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
          <Panel
            title="Tenant sem assinatura Billing V2"
            action={
              <button
                onClick={props.onCreateSubscription}
                disabled={props.creatingSubscription}
                className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-black text-primary-foreground disabled:opacity-60"
              >
                {props.creatingSubscription ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                Criar assinatura Billing V2
              </button>
            }
          >
            <div className="p-5">
              <EmptyState icon={AlertTriangle} title="Assinatura Billing V2 Pendente" text="Não há uma assinatura V2 para este tenant. Clique em criar para ativar a gestão operacional de faturamento manual." />
            </div>
          </Panel>
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
                    onClick={() => {
                      if (window.confirm("Atenção: Fechar este ciclo gerará uma fatura real (draft) no sistema para este tenant. Deseja prosseguir?")) {
                        props.onOpenCloseModal();
                      }
                    }}
                    disabled={!currentCycle || props.closingCycle}
                    className="btn-primary inline-flex items-center gap-2 px-3 py-2 text-sm font-black disabled:opacity-50 text-primary-foreground"
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


export function CloseCycleModal(props: { open: boolean; loading: boolean; onConfirm: () => void; onCancel: () => void }) {
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

