import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  ArrowUpRight,
  CalendarClock,
  CreditCard,
  FileText,
  Info,
  Loader2,
  ReceiptText,
  ShieldCheck,
  X,
} from 'lucide-react';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { EmptyState } from '../../components/ui/EmptyState';
import {
  DecimalLike,
  getTenantBillingInvoiceDetails,
  getTenantBillingOverview,
  listTenantBillingInvoices,
  TenantBillingInvoiceSummary,
} from './billing-api';

function formatCurrency(value: DecimalLike | null | undefined): string {
  if (value === null || value === undefined) return 'Sem valor';
  return Number(value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatDate(value: string | null | undefined): string {
  if (!value) return 'Sem data';
  return new Date(value).toLocaleDateString('pt-BR', { timeZone: 'UTC' });
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return 'Sem data';
  return new Date(value).toLocaleString('pt-BR');
}

function statusVariant(status: string | null | undefined): 'default' | 'success' | 'warning' | 'destructive' | 'info' {
  if (!status) return 'info';
  if (['active', 'paid', 'completed'].includes(status)) return 'success';
  if (['trialing', 'open', 'pending', 'draft'].includes(status)) return 'warning';
  if (['failed', 'canceled', 'cancelled', 'overdue', 'void'].includes(status)) return 'destructive';
  return 'default';
}

function booleanLabel(value: boolean): string {
  return value ? 'Sim' : 'Não';
}

function sourceLabel(source: string | null | undefined): string {
  if (source === 'billing_v2') return 'Billing V2';
  if (source === 'legacy_fallback') return 'Fallback legado';
  return 'Nenhuma';
}

function normalizeBillingText(value: string): string {
  return value.replace(/\bAte\b/g, 'Até').replace(/\bate\b/g, 'até');
}

function tierLabel(tier: { label: string | null; minRevenue: DecimalLike; maxRevenue: DecimalLike | null } | null | undefined): string {
  if (!tier) return 'Sem faixa';
  if (tier.label) return normalizeBillingText(tier.label);
  const min = formatCurrency(tier.minRevenue);
  const max = tier.maxRevenue === null ? 'aberto' : formatCurrency(tier.maxRevenue);
  return `${min} até ${max}`;
}

function Metric(props: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg border border-border bg-muted/30 p-4">
      <div className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-muted-foreground">
        {props.label}
        {props.hint ? (
          <span title={props.hint} aria-label={props.hint}>
            <Info className="h-3.5 w-3.5" />
          </span>
        ) : null}
      </div>
      <div className="mt-2 text-sm font-black text-foreground break-words">{props.value}</div>
    </div>
  );
}

function InvoiceRow(props: { invoice: TenantBillingInvoiceSummary; onOpen: (invoiceId: string) => void }) {
  const { invoice, onOpen } = props;
  return (
    <div className="grid gap-3 rounded-lg border border-border bg-card p-4 md:grid-cols-[1.2fr_0.8fr_0.7fr_0.9fr_auto] md:items-center">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-black text-foreground">{invoice.number}</span>
          <Badge variant={statusVariant(invoice.status)} size="sm">{invoice.status}</Badge>
        </div>
        <p className="mt-1 text-xs font-bold text-muted-foreground">Criada em {formatDate(invoice.createdAt)}</p>
      </div>
      <div className="text-sm font-bold text-foreground">{formatCurrency(invoice.total)}</div>
      <div className="text-sm font-bold text-muted-foreground">Vence {formatDate(invoice.dueDate)}</div>
      <div className="text-sm font-bold text-muted-foreground">
        {invoice.paidAt ? `Paga em ${formatDate(invoice.paidAt)}` : `Provider ${invoice.provider}`}
      </div>
      <div className="flex flex-wrap items-center gap-2 md:justify-end">
        {invoice.providerPaymentUrl ? (
          <a
            href={invoice.providerPaymentUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-8 items-center gap-1 rounded-lg border border-border px-3 text-xs font-bold text-foreground hover:bg-muted"
          >
            Pagamento <ArrowUpRight className="h-3.5 w-3.5" />
          </a>
        ) : null}
        <Button type="button" size="sm" variant="secondary" onClick={() => onOpen(invoice.id)}>
          Detalhes
        </Button>
      </div>
    </div>
  );
}

export function BillingPage() {
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(null);

  const overviewQuery = useQuery({
    queryKey: ['tenant-billing-overview'],
    queryFn: getTenantBillingOverview,
  });

  const invoicesQuery = useQuery({
    queryKey: ['tenant-billing-invoices'],
    queryFn: listTenantBillingInvoices,
  });

  const invoiceDetailsQuery = useQuery({
    queryKey: ['tenant-billing-invoice-details', selectedInvoiceId],
    queryFn: () => getTenantBillingInvoiceDetails(selectedInvoiceId ?? ''),
    enabled: selectedInvoiceId !== null,
  });

  const overview = overviewQuery.data;
  const invoices = invoicesQuery.data ?? [];
  const usage = overview?.usagePreview;

  const billingStatus = useMemo(() => {
    if (overview?.source === 'legacy_fallback') return 'Fallback legado';
    if (overview?.source === 'none') return 'Sem assinatura';
    return overview?.subscription?.status ?? 'Indefinido';
  }, [overview]);

  const loading = overviewQuery.isLoading || invoicesQuery.isLoading;
  const hasError = overviewQuery.isError || invoicesQuery.isError;

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <h1 className="text-xl font-black uppercase tracking-tight text-foreground md:text-2xl">
            Plano e Cobrança
          </h1>
          <p className="mt-1 text-sm font-medium text-muted-foreground">
            Consulte seu plano, uso mensal e histórico de faturas.
          </p>
        </div>
        <Badge variant={statusVariant(overview?.subscription?.status ?? overview?.source)} size="md">
          {billingStatus}
        </Badge>
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : hasError ? (
        <EmptyState
          icon={AlertTriangle}
          title="Não foi possível carregar billing"
          description="Tente novamente em instantes. Nenhuma cobrança foi executada."
        />
      ) : (
        <>
          {overview?.warning ? (
            <div className="flex gap-3 rounded-lg border border-status-warning/30 bg-status-warning/10 p-4 text-sm font-bold text-status-warning">
              <AlertTriangle className="h-5 w-5 shrink-0" />
              <span>{overview.warning}</span>
            </div>
          ) : null}

          <div className="grid gap-6 xl:grid-cols-3">
            <Card className="p-5">
              <div className="mb-5 flex items-center gap-3">
                <CreditCard className="h-5 w-5 text-primary" />
                <h2 className="text-sm font-black uppercase tracking-widest text-foreground">Plano Atual</h2>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <Metric label="Nome" value={overview?.plan?.name ?? 'Sem plano Billing V2'} />
                <Metric label="Modelo" value={overview?.plan?.type ?? 'Indefinido'} />
                <Metric label="Trial" value={`${overview?.plan?.trialDays ?? 0} dias`} />
                <Metric label="Status" value={overview?.subscription?.status ?? 'Sem assinatura'} />
                <Metric label="Fonte" value={sourceLabel(overview?.source)} />
                <Metric label="Exige pagamento" value={booleanLabel(overview?.plan?.requiresPaymentMethod ?? false)} />
                <Metric label="Todos os módulos" value={booleanLabel(overview?.plan?.allowAllModules ?? false)} />
                <Metric label="Início do trial" value={formatDate(overview?.subscription?.trialStartedAt)} />
                <Metric label="Fim do trial" value={formatDate(overview?.subscription?.trialEndsAt)} />
              </div>
            </Card>

            <Card className="p-5">
              <div className="mb-5 flex items-center gap-3">
                <CalendarClock className="h-5 w-5 text-primary" />
                <h2 className="text-sm font-black uppercase tracking-widest text-foreground">Uso do Mês</h2>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <Metric label="Período" value={`${formatDate(usage?.periodStart)} até ${formatDate(usage?.periodEnd)}`} />
                <Metric label="Faturamento apurado" value={formatCurrency(usage?.billableAmount)} />
                <Metric label="Pedidos contados" value={String(usage?.ordersCount ?? 0)} />
                <Metric label="Pedidos fora da regra" value={String(usage?.excludedOrdersCount ?? 0)} />
                <Metric label="Faixa atual" value={tierLabel(overview?.selectedTier)} />
                <Metric label="Próxima faixa" value={tierLabel(overview?.nextTier)} />
                <Metric label="Até a próxima" value={formatCurrency(overview?.revenueUntilNextTier)} />
                <Metric label="Mensalidade estimada" value={formatCurrency(overview?.estimatedMonthlyPrice)} />
              </div>
            </Card>

            <Card className="p-5">
              <div className="mb-5 flex items-center gap-3">
                <ShieldCheck className="h-5 w-5 text-primary" />
                <h2 className="text-sm font-black uppercase tracking-widest text-foreground">Configuração de Cobrança</h2>
              </div>
              <div className="grid gap-3">
                <Metric label="Cobrança automática" value={overview?.paymentModeInfo.automaticBillingActive ? 'Ativa' : 'Desativada'} />
                <Metric label="Provider" value={overview?.paymentModeInfo.provider ?? 'manual'} />
                <Metric label="Modo" value={overview?.paymentModeInfo.mode ?? 'disabled'} />
                <Metric
                  label="Gateway"
                  value={overview?.paymentModeInfo.paymentsEnabled ? 'Habilitado por ambiente' : 'Sem chamadas ao gateway'}
                />
              </div>
              <p className="mt-4 rounded-lg bg-muted/40 p-3 text-xs font-bold leading-relaxed text-muted-foreground">
                {overview?.paymentModeInfo.message ?? 'Cobrança automática não está ativa.'}
              </p>
            </Card>
          </div>

          <Card className="p-5">
            <div className="mb-5 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
              <div className="flex items-center gap-3">
                <ReceiptText className="h-5 w-5 text-primary" />
                <h2 className="text-sm font-black uppercase tracking-widest text-foreground">Faturas</h2>
              </div>
              {overview?.latestInvoice ? (
                <span className="text-xs font-bold text-muted-foreground">
                  Última fatura: {overview.latestInvoice.number}
                </span>
              ) : null}
            </div>

            {invoices.length === 0 ? (
              <EmptyState
                icon={FileText}
                title="Nenhuma fatura encontrada"
                description="O histórico aparecerá aqui quando houver ciclos faturados para este tenant."
              />
            ) : (
              <div className="space-y-3">
                {invoices.map((invoice) => (
                  <InvoiceRow key={invoice.id} invoice={invoice} onOpen={setSelectedInvoiceId} />
                ))}
              </div>
            )}
          </Card>
        </>
      )}

      {selectedInvoiceId ? (
        <div className="fixed inset-0 z-[80] flex items-end bg-black/50 p-0 md:items-center md:justify-center md:p-6">
          <div className="max-h-[92vh] w-full overflow-y-auto rounded-t-xl border border-border bg-background p-5 shadow-2xl md:max-w-3xl md:rounded-xl">
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-black text-foreground">Detalhes da fatura</h2>
                <p className="text-sm font-bold text-muted-foreground">
                  {invoiceDetailsQuery.data?.invoice.number ?? 'Carregando fatura'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedInvoiceId(null)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border text-foreground hover:bg-muted"
                aria-label="Fechar detalhes"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {invoiceDetailsQuery.isLoading ? (
              <div className="flex justify-center py-12">
                <Loader2 className="h-7 w-7 animate-spin text-primary" />
              </div>
            ) : invoiceDetailsQuery.isError ? (
              <EmptyState icon={AlertTriangle} title="Fatura indisponível" description="A fatura não pertence a este tenant ou não existe." />
            ) : invoiceDetailsQuery.data ? (
              <div className="space-y-5">
                <div className="grid gap-3 sm:grid-cols-3">
                  <Metric label="Status" value={invoiceDetailsQuery.data.invoice.status} />
                  <Metric label="Total" value={formatCurrency(invoiceDetailsQuery.data.invoice.total)} />
                  <Metric label="Vencimento" value={formatDate(invoiceDetailsQuery.data.invoice.dueDate)} />
                </div>

                <section>
                  <h3 className="mb-3 text-xs font-black uppercase tracking-widest text-muted-foreground">Itens</h3>
                  <div className="space-y-2">
                    {invoiceDetailsQuery.data.items.map((item) => (
                      <div key={item.id} className="flex flex-col gap-1 rounded-lg border border-border p-3 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <p className="text-sm font-black text-foreground">{normalizeBillingText(item.description)}</p>
                          <p className="text-xs font-bold text-muted-foreground">{item.quantity} x {formatCurrency(item.unitAmount)}</p>
                        </div>
                        <span className="text-sm font-black text-foreground">{formatCurrency(item.totalAmount)}</span>
                      </div>
                    ))}
                  </div>
                </section>

                <section className="grid gap-3 sm:grid-cols-2">
                  <Metric label="Ciclo" value={invoiceDetailsQuery.data.cycle?.status ?? 'Sem ciclo vinculado'} />
                  <Metric label="Faixa do ciclo" value={tierLabel(invoiceDetailsQuery.data.cycle?.selectedTier)} />
                  <Metric label="Snapshot pedidos" value={String(invoiceDetailsQuery.data.snapshot?.ordersCount ?? 0)} />
                  <Metric label="Snapshot faturamento" value={formatCurrency(invoiceDetailsQuery.data.snapshot?.billableAmount)} />
                </section>

                <section>
                  <h3 className="mb-3 text-xs font-black uppercase tracking-widest text-muted-foreground">Tentativas de pagamento</h3>
                  {invoiceDetailsQuery.data.paymentAttempts.length === 0 ? (
                    <p className="rounded-lg bg-muted/40 p-3 text-sm font-bold text-muted-foreground">
                      Nenhuma tentativa registrada. O portal não cria cobranças nem aciona gateway.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {invoiceDetailsQuery.data.paymentAttempts.map((attempt) => (
                        <div key={attempt.id} className="grid gap-2 rounded-lg border border-border p-3 text-sm sm:grid-cols-4">
                          <span className="font-bold text-foreground">{attempt.provider}</span>
                          <span className="font-bold text-muted-foreground">{attempt.mode}</span>
                          <span className="font-bold text-muted-foreground">{attempt.status}</span>
                          <span className="font-bold text-muted-foreground">{formatDateTime(attempt.attemptedAt)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </section>

                {invoiceDetailsQuery.data.providerPaymentUrl ? (
                  <a
                    href={invoiceDetailsQuery.data.providerPaymentUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-bold text-primary-foreground hover:bg-primary/90"
                  >
                    Abrir link de pagamento <ArrowUpRight className="h-4 w-4" />
                  </a>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
