import { useCallback, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Banknote, CheckCircle2, ChevronDown, ChevronRight, ChevronUp, History, RefreshCw, X } from 'lucide-react';
import { DriverSettlementMethod, type DriverSettlementHistoryDTO, type DriverSettlementSummaryDTO } from '@gestor/types';
import { useModalIsolation } from '../hooks/useModalIsolation';

function money(value: number, currency: string): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency }).format(value);
}

function dateTime(value: string): string {
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value));
}

function methodLabel(method: DriverSettlementMethod): string {
  return {
    [DriverSettlementMethod.PIX]: 'PIX',
    [DriverSettlementMethod.CASH]: 'Dinheiro',
    [DriverSettlementMethod.BANK_TRANSFER]: 'Transferência bancária',
    [DriverSettlementMethod.OTHER]: 'Outro',
  }[method];
}

interface Props {
  summary: DriverSettlementSummaryDTO | null;
  history: DriverSettlementHistoryDTO[];
  isLoading: boolean;
  isRefreshing: boolean;
  error: string | null;
  onRetry: () => Promise<void>;
  onOpenDetail: (settlementId: string) => Promise<DriverSettlementHistoryDTO>;
}

export function DriverSettlementsCard({ summary, history, isLoading, isRefreshing, error, onRetry, onOpenDetail }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [detail, setDetail] = useState<DriverSettlementHistoryDTO | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const detailDialogRef = useRef<HTMLDivElement>(null);
  const detailCloseRef = useRef<HTMLButtonElement>(null);
  const closeDetail = useCallback(() => setDetail(null), []);
  useModalIsolation(Boolean(detail), detailDialogRef, detailCloseRef, closeDetail);

  const openDetail = async (item: DriverSettlementHistoryDTO) => {
    setDetail(item);
    setDetailLoading(true);
    setDetailError(null);
    try {
      setDetail(await onOpenDetail(item.id));
    } catch (requestError: unknown) {
      setDetailError(requestError instanceof Error && requestError.message ? requestError.message : 'Não foi possível abrir os detalhes.');
    } finally {
      setDetailLoading(false);
    }
  };

  return (
    <section className="rounded-2xl border border-[var(--delivery-border)] bg-[var(--delivery-card)] shadow-sm" aria-labelledby="settlements-title" aria-busy={isLoading || isRefreshing}>
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-100 dark:bg-blue-950/40"><Banknote className="h-5 w-5 text-blue-600" aria-hidden="true" /></span>
            <div>
              <h2 id="settlements-title" className="text-sm font-bold text-[var(--delivery-foreground)]">Pagamentos registrados</h2>
              {summary ? <><p className="mt-0.5 text-2xl font-black tabular-nums text-[var(--delivery-foreground)]">{money(summary.currentDue, summary.currency)}</p><p className="mt-0.5 text-xs text-[var(--delivery-muted-foreground)]">A receber · {summary.pendingShiftCount} {summary.pendingShiftCount === 1 ? 'turno encerrado' : 'turnos encerrados'}</p></> : <p className="mt-1 text-xs text-[var(--delivery-muted-foreground)]">{isLoading ? 'Carregando pagamentos…' : 'Nenhum resumo disponível.'}</p>}
            </div>
          </div>
          {(summary || history.length > 0) && <button type="button" onClick={() => setExpanded((value) => !value)} aria-expanded={expanded} aria-controls="driver-settlement-history" className="flex min-h-11 min-w-11 items-center justify-center rounded-xl text-[var(--delivery-muted-foreground)] hover:bg-[var(--delivery-muted)]"><span className="sr-only">{expanded ? 'Ocultar histórico' : 'Ver histórico'}</span>{expanded ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}</button>}
        </div>

        <p className="mt-3 rounded-xl bg-[var(--delivery-muted)] p-3 text-xs leading-relaxed text-[var(--delivery-muted-foreground)]">Aqui aparecem pagamentos que a loja registrou após pagar fora do sistema. O app não faz PIX, transferência bancária nem saque.</p>

        {error && <div role="alert" className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/30 dark:text-red-100"><p className="font-bold">Não foi possível atualizar.</p><p className="mt-1">{error}</p><p className="mt-1 text-xs">Os últimos dados carregados continuam visíveis.</p><button type="button" onClick={() => void onRetry()} disabled={isRefreshing} className="mt-2 inline-flex min-h-11 items-center gap-2 font-bold underline"><RefreshCw className="h-4 w-4" />Tentar novamente</button></div>}

        {summary?.lastPayment && <div className="mt-3 border-l-4 border-emerald-500 bg-emerald-50 px-3 py-2.5 dark:bg-emerald-950/20"><p className="flex items-center gap-2 text-xs font-bold text-emerald-800 dark:text-emerald-200"><CheckCircle2 className="h-4 w-4" />Último pagamento registrado</p><p className="mt-1 text-sm font-black tabular-nums text-[var(--delivery-foreground)]">{money(summary.lastPayment.amount, summary.lastPayment.currency)} · {methodLabel(summary.lastPayment.paymentMethod)}</p><p className="mt-0.5 text-xs text-[var(--delivery-muted-foreground)]">{dateTime(summary.lastPayment.paidAt)}</p></div>}

        {expanded && (
          <div id="driver-settlement-history" className="mt-4 border-t border-[var(--delivery-border)] pt-4">
            <h3 className="flex items-center gap-2 text-sm font-bold text-[var(--delivery-foreground)]"><History className="h-4 w-4" />Histórico de pagamentos</h3>
            {history.length === 0 ? <p className="mt-3 rounded-xl border border-dashed border-[var(--delivery-border)] p-4 text-sm text-[var(--delivery-muted-foreground)]">A loja ainda não registrou pagamentos para seus turnos.</p> : <ul className="mt-2 divide-y divide-[var(--delivery-border)]">{history.map((item) => <li key={item.id}><button type="button" onClick={() => void openDetail(item)} className="flex min-h-16 w-full items-center gap-3 py-3 text-left"><span className="min-w-0 flex-1"><span className="block text-sm font-black tabular-nums text-[var(--delivery-foreground)]">{money(item.amount, item.currency)} · {methodLabel(item.paymentMethod)}</span><span className="mt-0.5 block text-xs text-[var(--delivery-muted-foreground)]">{dateTime(item.paidAt)} · {item.shifts.length} {item.shifts.length === 1 ? 'turno pago' : 'turnos pagos'}</span></span><ChevronRight className="h-4 w-4 shrink-0 text-[var(--delivery-muted-foreground)]" /></button></li>)}</ul>}
          </div>
        )}
      </div>

      {detail && createPortal((
        <div ref={detailDialogRef} tabIndex={-1} className="fixed inset-0 z-[70] flex items-end justify-center bg-black/60 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-labelledby="driver-settlement-detail-title">
          <div className="max-h-[88dvh] w-full max-w-md overflow-y-auto rounded-t-2xl border border-[var(--delivery-border)] bg-[var(--delivery-card)] p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-2xl sm:rounded-2xl">
            <div className="flex items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-wide text-[var(--delivery-muted-foreground)]">Pagamento registrado</p><h3 id="driver-settlement-detail-title" className="mt-1 text-2xl font-black tabular-nums text-[var(--delivery-foreground)]">{money(detail.amount, detail.currency)}</h3></div><button ref={detailCloseRef} type="button" onClick={() => setDetail(null)} aria-label="Fechar detalhes" className="flex min-h-11 min-w-11 items-center justify-center rounded-xl text-[var(--delivery-muted-foreground)]"><X className="h-5 w-5" /></button></div>
            {detailLoading && <p className="mt-3 text-sm text-[var(--delivery-muted-foreground)]">Carregando detalhes…</p>}
            {detailError && <p role="alert" className="mt-3 rounded-xl bg-red-50 p-3 text-sm text-red-800 dark:bg-red-950/30 dark:text-red-100">{detailError}</p>}
            <dl className="mt-4 grid grid-cols-2 gap-3 rounded-xl bg-[var(--delivery-muted)] p-3 text-sm"><div><dt className="text-xs text-[var(--delivery-muted-foreground)]">Meio informado</dt><dd className="font-bold text-[var(--delivery-foreground)]">{methodLabel(detail.paymentMethod)}</dd></div><div><dt className="text-xs text-[var(--delivery-muted-foreground)]">Data</dt><dd className="font-bold text-[var(--delivery-foreground)]">{dateTime(detail.paidAt)}</dd></div></dl>
            <h4 className="mt-5 text-sm font-bold text-[var(--delivery-foreground)]">Turnos pagos</h4>
            <ul className="mt-2 divide-y divide-[var(--delivery-border)] rounded-xl border border-[var(--delivery-border)]">{detail.shifts.map((shift) => <li key={shift.shiftId} className="p-3"><div className="flex justify-between gap-3"><span className="text-sm font-bold text-[var(--delivery-foreground)]">{dateTime(shift.endedAt)}</span><strong className="tabular-nums text-[var(--delivery-foreground)]">{money(shift.amountDue, shift.currency)}</strong></div><dl className="mt-2 grid grid-cols-2 gap-2 text-xs"><div><dt className="text-[var(--delivery-muted-foreground)]">Ganhos brutos</dt><dd className="font-bold text-[var(--delivery-foreground)]">{money(shift.grossEarnings, shift.currency)}</dd></div><div><dt className="text-[var(--delivery-muted-foreground)]">Recebido direto</dt><dd className="font-bold text-[var(--delivery-foreground)]">{money(shift.receivedDirectly, shift.currency)}</dd></div></dl></li>)}</ul>
            <p className="mt-4 text-xs leading-relaxed text-[var(--delivery-muted-foreground)]">Somente leitura: este registro não é um payout, PIX, transferência ou comprovante bancário.</p>
          </div>
        </div>
      ), document.body)}
    </section>
  );
}
