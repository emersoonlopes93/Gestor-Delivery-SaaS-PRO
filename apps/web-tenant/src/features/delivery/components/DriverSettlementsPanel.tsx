import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  History,
  ReceiptText,
  RefreshCw,
  ShieldCheck,
  WalletCards,
  X,
} from 'lucide-react';
import {
  DriverSettlementMethod,
  type CreateDriverSettlementDTO,
  type DriverSettlementHistoryDTO,
} from '@gestor/types';
import {
  settlementErrorMessage,
  type SettlementPeriod,
  useDriverSettlements,
} from '../hooks/useDriverSettlements';
import {
  selectedSettlementTotal,
  settlementAttemptKey,
  settlementMethodLabel,
  shouldBlockSettlementSubmit,
} from './driver-settlement-ui';
import { useModalIsolation } from '../../../hooks/use-modal-isolation';

function money(value: number, currency: string): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency }).format(value);
}

function dateTime(value: string): string {
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value));
}

interface Props {
  driverId: string;
  canRead: boolean;
  canManage: boolean;
}

function createAttemptUuid(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function DriverSettlementsPanel({ driverId, canRead, canManage }: Props) {
  const [tab, setTab] = useState<'pending' | 'paid'>('pending');
  const [period, setPeriod] = useState<SettlementPeriod>({ from: '', to: '' });
  const settlements = useDriverSettlements(driverId, canRead, period);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [reviewing, setReviewing] = useState(false);
  const [method, setMethod] = useState<DriverSettlementMethod>(DriverSettlementMethod.PIX);
  const [paidAt, setPaidAt] = useState('');
  const [notes, setNotes] = useState('');
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [success, setSuccess] = useState<DriverSettlementHistoryDTO | null>(null);
  const [detail, setDetail] = useState<DriverSettlementHistoryDTO | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const idempotencyKeyRef = useRef<string | null>(null);
  const submittingRef = useRef(false);
  const detailDialogRef = useRef<HTMLDivElement>(null);
  const detailCloseRef = useRef<HTMLButtonElement>(null);
  const pendingTabRef = useRef<HTMLButtonElement>(null);
  const paidTabRef = useRef<HTMLButtonElement>(null);
  const closeDetail = useCallback(() => setDetail(null), []);
  useModalIsolation(Boolean(detail), detailDialogRef, detailCloseRef, closeDetail);
  useEffect(() => {
    setSelectedIds((current) => new Set([...current].filter((shiftId) => settlements.pending.some((shift) => shift.shiftId === shiftId))));
  }, [settlements.pending]);

  if (!canRead) {
    return (
      <section className="border-t border-border pt-5" aria-labelledby="driver-settlements-title">
        <div className="flex items-start gap-3">
          <span className="rounded-lg bg-muted p-2 text-muted-foreground"><WalletCards className="h-4 w-4" /></span>
          <div><h3 id="driver-settlements-title" className="text-sm font-black text-foreground">Acertos financeiros</h3><p className="mt-1 text-sm text-muted-foreground">Sem permissão para informações financeiras.</p></div>
        </div>
      </section>
    );
  }

  const selectedTotal = selectedSettlementTotal(settlements.pending, selectedIds);
  const currency = settlements.summary?.currency ?? settlements.pending[0]?.currency ?? 'BRL';
  const currentItems = tab === 'pending' ? settlements.pending : settlements.paid;
  const currentLoading = tab === 'pending' ? settlements.isPendingLoading : settlements.isPaidLoading;
  const currentError = tab === 'pending' ? settlements.pendingError : settlements.paidError;

  const toggleShift = (shiftId: string) => {
    setSuccess(null);
    setSubmitError(null);
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(shiftId)) next.delete(shiftId); else next.add(shiftId);
      return next;
    });
    setReviewing(false);
    idempotencyKeyRef.current = null;
  };

  const openReview = () => {
    if (selectedIds.size === 0) return;
    idempotencyKeyRef.current = settlementAttemptKey(driverId, idempotencyKeyRef.current, createAttemptUuid);
    setSubmitError(null);
    setReviewing(true);
  };

  const submit = async () => {
    if (shouldBlockSettlementSubmit(submittingRef.current, settlements.isCreating, selectedIds.size)) return;
    submittingRef.current = true;
    setSubmitError(null);
    try {
      const attemptKey = settlementAttemptKey(driverId, idempotencyKeyRef.current, createAttemptUuid);
      idempotencyKeyRef.current = attemptKey;
      const payload: CreateDriverSettlementDTO = {
        driverId,
        shiftIds: [...selectedIds],
        paymentMethod: method,
        ...(paidAt ? { paidAt: new Date(paidAt).toISOString() } : {}),
        ...(notes.trim() ? { notes: notes.trim() } : {}),
        idempotencyKey: attemptKey,
      };
      const created = await settlements.createSettlement(payload);
      setSuccess(created);
      setReviewing(false);
      setSelectedIds(new Set());
      setPaidAt('');
      setNotes('');
      idempotencyKeyRef.current = null;
      void settlements.refresh();
    } catch (error: unknown) {
      setSubmitError(settlementErrorMessage(error));
    } finally {
      submittingRef.current = false;
    }
  };

  const openDetail = async (item: DriverSettlementHistoryDTO) => {
    setDetail(item);
    setDetailLoading(true);
    setDetailError(null);
    try {
      setDetail(await settlements.getDetail(item.id));
    } catch (error: unknown) {
      setDetailError(settlementErrorMessage(error));
    } finally {
      setDetailLoading(false);
    }
  };

  const selectTab = (nextTab: 'pending' | 'paid') => {
    setTab(nextTab);
    if (nextTab === 'paid') setReviewing(false);
  };

  const handleTabKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    const keys = ['ArrowLeft', 'ArrowRight', 'Home', 'End'];
    if (!keys.includes(event.key)) return;
    event.preventDefault();
    const currentIndex = tab === 'pending' ? 0 : 1;
    const nextIndex = event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? 1
        : (currentIndex + 1) % 2;
    const nextTab = nextIndex === 0 ? 'pending' : 'paid';
    selectTab(nextTab);
    (nextTab === 'pending' ? pendingTabRef : paidTabRef).current?.focus();
  };

  return (
    <section
      className="space-y-4 border-t border-border pt-5"
      aria-labelledby="driver-settlements-title"
      onKeyDown={(event) => {
        if (event.key === 'Enter' && (event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement)) {
          event.preventDefault();
        }
      }}
    >
      <div className="flex items-start gap-3">
        <span className="rounded-lg bg-primary/10 p-2 text-primary"><WalletCards className="h-4 w-4" /></span>
        <div className="min-w-0 flex-1">
          <h3 id="driver-settlements-title" className="text-sm font-black text-foreground">Acertos financeiros</h3>
          <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">Quitação administrativa de turnos encerrados. O ledger permanece imutável.</p>
        </div>
      </div>

      {settlements.isSummaryLoading ? (
        <div className="h-28 animate-pulse rounded-xl bg-muted" aria-label="Carregando resumo de acertos" />
      ) : settlements.summaryError ? (
        <div role="alert" className="rounded-xl border border-status-danger/30 bg-status-danger/10 p-3 text-sm text-status-danger">
          <p className="font-bold">Não foi possível carregar o resumo financeiro.</p>
          <button type="button" onClick={() => void settlements.refresh()} className="mt-2 min-h-11 font-bold underline">Tentar novamente</button>
        </div>
      ) : settlements.summary ? (
        <div className="rounded-xl border border-border bg-muted/20 p-4">
          <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Saldo a quitar</p>
          <p className="mt-1 text-3xl font-black tabular-nums text-foreground">{money(settlements.summary.currentDue, settlements.summary.currency)}</p>
          <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 border-t border-border pt-3 text-xs">
            <span className="text-muted-foreground"><strong className="text-foreground">{settlements.summary.pendingShiftCount}</strong> turnos pendentes</span>
            <span className="text-muted-foreground">Último registro: <strong className="text-foreground">{settlements.summary.lastPayment ? `${money(settlements.summary.lastPayment.amount, settlements.summary.lastPayment.currency)} · ${dateTime(settlements.summary.lastPayment.paidAt)}` : 'nenhum'}</strong></span>
          </div>
        </div>
      ) : null}

      {!canManage && <p className="rounded-lg border border-border bg-muted/30 p-3 text-xs text-muted-foreground">Você possui acesso somente leitura. Para registrar um acerto, solicite a permissão financeira de gestão.</p>}

      <div className="grid grid-cols-2 rounded-xl border border-border bg-muted/30 p-1" role="tablist" aria-label="Situação dos turnos">
        <button ref={pendingTabRef} id="driver-settlements-tab-pending" type="button" role="tab" aria-controls="driver-settlements-panel-pending" aria-selected={tab === 'pending'} tabIndex={tab === 'pending' ? 0 : -1} onKeyDown={handleTabKeyDown} onClick={() => selectTab('pending')} className={`min-h-11 rounded-lg px-3 text-sm font-bold ${tab === 'pending' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground'}`}>Pendentes</button>
        <button ref={paidTabRef} id="driver-settlements-tab-paid" type="button" role="tab" aria-controls="driver-settlements-panel-paid" aria-selected={tab === 'paid'} tabIndex={tab === 'paid' ? 0 : -1} onKeyDown={handleTabKeyDown} onClick={() => selectTab('paid')} className={`min-h-11 rounded-lg px-3 text-sm font-bold ${tab === 'paid' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground'}`}>Pagos</button>
      </div>

      <fieldset className="grid gap-3 sm:grid-cols-2">
        <legend className="mb-2 flex items-center gap-1.5 text-xs font-bold text-muted-foreground"><CalendarDays className="h-3.5 w-3.5" />Filtrar encerramento do turno</legend>
        <label className="text-xs font-bold text-foreground">De<input type="date" value={period.from} max={period.to || undefined} onChange={(event) => { setPeriod((value) => ({ ...value, from: event.target.value })); setSelectedIds(new Set()); setReviewing(false); idempotencyKeyRef.current = null; }} className="input-premium mt-1 min-h-11" /></label>
        <label className="text-xs font-bold text-foreground">Até<input type="date" value={period.to} min={period.from || undefined} onChange={(event) => { setPeriod((value) => ({ ...value, to: event.target.value })); setSelectedIds(new Set()); setReviewing(false); idempotencyKeyRef.current = null; }} className="input-premium mt-1 min-h-11" /></label>
      </fieldset>

      <div role="tabpanel" id={`driver-settlements-panel-${tab}`} aria-labelledby={`driver-settlements-tab-${tab}`}>
      {currentLoading ? (
        <div className="h-32 animate-pulse rounded-xl bg-muted" aria-label={`Carregando turnos ${tab === 'pending' ? 'pendentes' : 'pagos'}`} />
      ) : currentError ? (
        <div role="alert" className="rounded-xl border border-status-danger/30 bg-status-danger/10 p-3 text-sm text-status-danger">
          <p className="font-bold">Não foi possível carregar os turnos. Esta falha não significa que a lista está vazia.</p>
          <button type="button" onClick={() => void settlements.refresh()} className="mt-2 min-h-11 font-bold underline">Tentar novamente</button>
        </div>
      ) : currentItems.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-5 text-center"><ReceiptText className="mx-auto h-5 w-5 text-muted-foreground" /><p className="mt-2 text-sm font-bold text-foreground">{tab === 'pending' ? 'Nenhum turno pendente neste período' : 'Nenhum turno pago neste período'}</p></div>
      ) : (
        <ul className="divide-y divide-border rounded-xl border border-border">
          {currentItems.map((shift) => (
            <li key={shift.shiftId} className="p-3">
              <label className={`flex gap-3 ${tab === 'pending' && canManage ? 'cursor-pointer' : ''}`}>
                {tab === 'pending' && canManage && <input type="checkbox" checked={selectedIds.has(shift.shiftId)} onChange={() => toggleShift(shift.shiftId)} className="mt-1 h-5 w-5 shrink-0 accent-primary" aria-label={`Selecionar turno encerrado em ${dateTime(shift.endedAt)}`} />}
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-start justify-between gap-2"><strong className="text-sm text-foreground">{dateTime(shift.endedAt)}</strong><strong className="tabular-nums text-foreground">{money(shift.amountDue, shift.currency)}</strong></span>
                  <span className="mt-2 grid grid-cols-2 gap-2 text-xs sm:grid-cols-3"><span className="text-muted-foreground">Bruto <strong className="block text-foreground">{money(shift.grossEarnings, shift.currency)}</strong></span><span className="text-muted-foreground">Recebido direto <strong className="block text-foreground">{money(shift.receivedDirectly, shift.currency)}</strong></span><span className="text-muted-foreground">Turno inteiro <strong className="block text-foreground">{tab === 'pending' ? 'Pendente' : 'Pago'}</strong></span></span>
                </span>
              </label>
            </li>
          ))}
        </ul>
      )}
      </div>

      {tab === 'pending' && canManage && selectedIds.size > 0 && (
        <div className="sticky bottom-0 rounded-xl border border-primary/30 bg-card p-3 shadow-lg">
          <div className="flex items-center justify-between gap-3"><span className="text-sm text-muted-foreground">{selectedIds.size} {selectedIds.size === 1 ? 'turno selecionado' : 'turnos selecionados'}</span><strong className="text-lg tabular-nums text-foreground">{money(selectedTotal, currency)}</strong></div>
          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">Este registro não realiza um pagamento. Confirme somente após pagar fora do sistema.</p>
          <button type="button" onClick={openReview} className="mt-3 min-h-11 w-full rounded-lg bg-primary px-4 text-sm font-bold text-primary-foreground">Revisar registro</button>
        </div>
      )}

      {reviewing && (
        <div className="rounded-xl border-2 border-primary/30 bg-card p-4" role="group" aria-labelledby="settlement-review-title">
          <div className="flex gap-3"><ShieldCheck className="h-5 w-5 shrink-0 text-primary" /><div><h4 id="settlement-review-title" className="font-black text-foreground">Confirmar registro de pagamento</h4><p className="mt-1 text-xs leading-relaxed text-muted-foreground">O backend recalculará o valor de cada turno antes de registrar. Não há pagamento parcial.</p></div></div>
          <dl className="mt-4 grid grid-cols-2 gap-3 rounded-lg bg-muted/30 p-3 text-sm"><div><dt className="text-xs text-muted-foreground">Turnos</dt><dd className="font-bold text-foreground">{selectedIds.size}</dd></div><div><dt className="text-xs text-muted-foreground">Total exibido</dt><dd className="font-black tabular-nums text-foreground">{money(selectedTotal, currency)}</dd></div></dl>
          <label className="mt-3 block text-xs font-bold text-foreground">Meio informado<select aria-label="Meio informado" value={method} onChange={(event) => { setMethod(event.target.value as DriverSettlementMethod); setSubmitError(null); idempotencyKeyRef.current = null; }} disabled={settlements.isCreating} className="input-premium mt-1 min-h-11"><option value={DriverSettlementMethod.PIX}>PIX</option><option value={DriverSettlementMethod.CASH}>Dinheiro</option><option value={DriverSettlementMethod.BANK_TRANSFER}>Transferência bancária</option><option value={DriverSettlementMethod.OTHER}>Outro</option></select></label>
          <label className="mt-3 block text-xs font-bold text-foreground">Data do pagamento (opcional)<input aria-label="Data do pagamento" type="datetime-local" value={paidAt} onChange={(event) => { setPaidAt(event.target.value); setSubmitError(null); idempotencyKeyRef.current = null; }} disabled={settlements.isCreating} className="input-premium mt-1 min-h-11" /></label>
          <label className="mt-3 block text-xs font-bold text-foreground">Observações (opcional)<textarea aria-label="Observações" value={notes} onChange={(event) => { setNotes(event.target.value); setSubmitError(null); idempotencyKeyRef.current = null; }} maxLength={500} rows={2} disabled={settlements.isCreating} className="input-premium mt-1 min-h-20" /></label>
          <p className="mt-3 flex gap-2 rounded-lg border border-status-warning/30 bg-status-warning/10 p-3 text-xs leading-relaxed text-foreground"><AlertTriangle className="h-4 w-4 shrink-0 text-status-warning" />Este registro não realiza um pagamento. Confirme somente após pagar fora do sistema.</p>
          {submitError && <p role="alert" className="mt-3 rounded-lg border border-status-danger/30 bg-status-danger/10 p-3 text-sm text-status-danger">{submitError}</p>}
          <div className="mt-4 grid grid-cols-2 gap-2"><button type="button" disabled={settlements.isCreating} onClick={() => setReviewing(false)} className="min-h-11 rounded-lg border border-border text-sm font-bold text-foreground">Voltar</button><button type="button" disabled={settlements.isCreating} onClick={() => void submit()} className="min-h-11 rounded-lg bg-primary px-3 text-sm font-bold text-primary-foreground disabled:opacity-50">{settlements.isCreating ? 'Registrando…' : 'Confirmar registro'}</button></div>
        </div>
      )}

      {success && <div role="status" className="rounded-xl border border-status-success/30 bg-status-success/10 p-4 text-sm text-foreground"><p className="flex items-center gap-2 font-black text-status-success"><CheckCircle2 className="h-5 w-5" />Pagamento registrado</p><p className="mt-2">{money(success.amount, success.currency)} · {settlementMethodLabel(success.paymentMethod)} · {dateTime(success.paidAt)}</p></div>}

      <div className="border-t border-border pt-4">
        <div className="flex items-center justify-between gap-3"><h4 className="flex items-center gap-2 text-sm font-black text-foreground"><History className="h-4 w-4" />Histórico imutável</h4><button type="button" onClick={() => void settlements.refresh()} aria-label="Atualizar histórico" className="flex min-h-11 min-w-11 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted"><RefreshCw className="h-4 w-4" /></button></div>
        {settlements.isHistoryLoading ? <div className="mt-2 h-20 animate-pulse rounded-lg bg-muted" aria-label="Carregando histórico" /> : settlements.historyError ? <p role="alert" className="mt-2 text-sm text-status-danger">Falha ao carregar o histórico. Tente atualizar.</p> : settlements.history.length === 0 ? <p className="mt-2 text-sm text-muted-foreground">Nenhum pagamento registrado.</p> : <ul className="mt-2 divide-y divide-border">{settlements.history.map((item) => <li key={item.id}><button type="button" onClick={() => void openDetail(item)} className="flex min-h-14 w-full items-center gap-3 py-2 text-left"><span className="min-w-0 flex-1"><span className="block text-sm font-bold text-foreground">{money(item.amount, item.currency)} · {settlementMethodLabel(item.paymentMethod)}</span><span className="block truncate text-xs text-muted-foreground">{dateTime(item.paidAt)} · {item.shifts.length} {item.shifts.length === 1 ? 'turno' : 'turnos'} · {item.createdByName}</span></span><ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" /></button></li>)}</ul>}
      </div>

      {detail && createPortal((
        <div ref={detailDialogRef} tabIndex={-1} className="fixed inset-0 z-[70] flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-labelledby="settlement-detail-title">
          <div className="max-h-[88dvh] w-full max-w-lg overflow-y-auto rounded-t-2xl border border-border bg-card p-5 shadow-2xl sm:rounded-2xl">
            <div className="flex items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Registro imutável</p><h4 id="settlement-detail-title" className="mt-1 text-xl font-black text-foreground">{money(detail.amount, detail.currency)}</h4></div><button ref={detailCloseRef} type="button" onClick={() => setDetail(null)} aria-label="Fechar detalhes" className="flex min-h-11 min-w-11 items-center justify-center rounded-lg text-muted-foreground"><X className="h-5 w-5" /></button></div>
            {detailLoading && <p className="mt-3 text-sm text-muted-foreground">Carregando detalhes…</p>}
            {detailError && <p role="alert" className="mt-3 text-sm text-status-danger">{detailError}</p>}
            <dl className="mt-4 grid grid-cols-2 gap-3 rounded-xl bg-muted/30 p-3 text-sm"><div><dt className="text-xs text-muted-foreground">Meio informado</dt><dd className="font-bold text-foreground">{settlementMethodLabel(detail.paymentMethod)}</dd></div><div><dt className="text-xs text-muted-foreground">Pago em</dt><dd className="font-bold text-foreground">{dateTime(detail.paidAt)}</dd></div><div><dt className="text-xs text-muted-foreground">Registrado por</dt><dd className="font-bold text-foreground">{detail.createdByName}</dd></div><div><dt className="text-xs text-muted-foreground">Registrado em</dt><dd className="font-bold text-foreground">{dateTime(detail.createdAt)}</dd></div></dl>
            {detail.notes && <p className="mt-3 rounded-lg border border-border p-3 text-sm text-foreground"><span className="block text-xs font-bold text-muted-foreground">Observações</span>{detail.notes}</p>}
            <h5 className="mt-5 text-sm font-black text-foreground">Turnos quitados integralmente</h5>
            <ul className="mt-2 divide-y divide-border rounded-xl border border-border">{detail.shifts.map((shift) => <li key={shift.shiftId} className="p-3"><div className="flex justify-between gap-3"><span className="text-sm font-bold text-foreground">{dateTime(shift.endedAt)}</span><strong className="tabular-nums text-foreground">{money(shift.amountDue, shift.currency)}</strong></div><p className="mt-1 text-xs text-muted-foreground">Bruto {money(shift.grossEarnings, shift.currency)} · recebido direto {money(shift.receivedDirectly, shift.currency)}</p></li>)}</ul>
            <p className="mt-4 text-xs leading-relaxed text-muted-foreground">Este é um registro administrativo. Não há edição, exclusão, estorno ou transferência dentro do app.</p>
          </div>
        </div>
      ), document.body)}
    </section>
  );
}
