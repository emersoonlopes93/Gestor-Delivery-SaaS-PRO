import { BillingPaymentConfig, DecimalLike, InvoiceDetails, InvoiceItem, InvoiceSummary, PaymentAttempt } from '../admin-billing-api';
import { money, formatDate, shortId, metadataText, statusLabels } from '../types';
import { CreditCard, Eye, Loader2, Receipt, X } from 'lucide-react';
import { StatusBadge } from './BillingStatusBadge';
import { Panel, EmptyState, LoadingBlock, InfoPill } from './BillingShared';

export function InvoiceItemsTable({ items }: { items: Array<InvoiceItem | { type: string; description: string; quantity: number; unitAmount: DecimalLike; totalAmount: DecimalLike; metadata: Record<string, unknown> | null }> }) {
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


export function InvoicesTab(props: {
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
  const isAsaasSandbox = provider === 'asaas' && mode === 'sandbox';
  const canCreate = paymentsEnabled && (provider === 'manual' || provider === 'mock' || isAsaasSandbox) && mode !== 'disabled' && !['paid', 'void', 'failed'].includes(props.invoice.status);
  const createLabel = isAsaasSandbox ? 'Gerar cobrança Asaas Sandbox' : 'Criar tentativa manual/sandbox';

  return (
    <div className="rounded-lg border border-border bg-background">
      <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="font-black text-foreground">Payment attempts</p>
          <p className="mt-1 text-sm font-semibold text-muted-foreground">
            {isAsaasSandbox
              ? 'Sandbox: não use em produção. A cobrança usa link hospedado no Asaas.'
              : 'Esta ação ainda não cobra automaticamente em produção. Apenas manual/mock sandbox local.'}
          </p>
        </div>
        <button
          onClick={() => props.onCreateAttempt(props.invoice)}
          disabled={!canCreate || props.loading}
          className="inline-flex items-center justify-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-black text-primary-foreground disabled:opacity-50"
        >
          {props.loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />}
          {createLabel}
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
      {isAsaasSandbox && props.invoice.providerPaymentUrl ? (
        <div className="border-t border-border p-4">
          <a
            href={props.invoice.providerPaymentUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm font-black text-foreground"
          >
            <CreditCard className="h-4 w-4" />
            Abrir link Asaas sandbox
          </a>
          <p className="mt-2 font-mono text-xs font-bold text-muted-foreground">{props.invoice.providerPaymentUrl}</p>
        </div>
      ) : null}
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
                <th className="px-4 py-3 text-right">Ações</th>
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
                        disabled={props.loading || attempt.provider === 'asaas' || attempt.status === 'succeeded' || props.invoice.status === 'paid'}
                        className="rounded-md border border-border px-2.5 py-1.5 text-xs font-black disabled:opacity-50"
                      >
                        Pago
                      </button>
                      <button
                        onClick={() => props.onMarkAttemptFailed(attempt.id)}
                        disabled={props.loading || attempt.provider === 'asaas' || attempt.status === 'failed' || props.invoice.status === 'paid'}
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

