import { useState } from 'react';
import { Banknote, Info, MinusCircle, PlusCircle } from 'lucide-react';
import { DriverShiftStatus, type DriverEarningsSummaryDTO } from '@gestor/types';

function money(value: number, currency: string): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency }).format(value);
}

interface Props {
  summary: DriverEarningsSummaryDTO | null;
  isLoading: boolean;
  isError: boolean;
  isMutating: boolean;
  onCashTip: (payload: { orderId: string; amount: number }) => Promise<DriverEarningsSummaryDTO>;
  onAdjustment: (payload: { amount: number; reason: string }) => Promise<DriverEarningsSummaryDTO>;
}

export function DriverEarningsPanel({ summary, isLoading, isError, isMutating, onCashTip, onAdjustment }: Props) {
  const stops = summary?.eligibleCashTipOrders ?? [];
  const [action, setAction] = useState<'tip' | 'adjustment' | null>(null);
  const [orderId, setOrderId] = useState('');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [feedback, setFeedback] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const numericAmount = Number(amount);

  const submit = async () => {
    setActionError(null);
    try {
      if (action === 'tip') {
        if (!orderId || numericAmount <= 0) return;
        await onCashTip({ orderId, amount: numericAmount });
        setFeedback('Gorjeta em dinheiro registrada.');
      } else if (action === 'adjustment') {
        if (!numericAmount || !reason.trim()) return;
        await onAdjustment({ amount: numericAmount, reason: reason.trim() });
        setFeedback('Ajuste registrado no ledger do turno.');
      }
      setAction(null); setOrderId(''); setAmount(''); setReason('');
    } catch (error: unknown) {
      setActionError(error instanceof Error && error.message ? error.message : 'Não foi possível registrar o lançamento.');
    }
  };

  return (
    <section className="space-y-4 border-t border-border pt-5" aria-labelledby="driver-earnings-title" aria-busy={isLoading || isMutating}>
      <div className="flex items-start gap-3"><span className="rounded-lg bg-status-success/10 p-2 text-status-success"><Banknote className="h-4 w-4" /></span><div><h3 id="driver-earnings-title" className="text-sm font-black text-foreground">Ganhos do turno</h3><p className="mt-0.5 text-xs text-muted-foreground">Resumo contábil do turno mais recente deste entregador.</p></div></div>
      {isLoading ? <div className="h-24 animate-pulse rounded-xl bg-muted" aria-label="Carregando ganhos" /> : isError ? <p role="alert" className="rounded-lg border border-status-danger/30 bg-status-danger/10 p-3 text-sm text-status-danger">Não foi possível carregar os ganhos. O entregador pode ainda não ter iniciado um turno.</p> : !summary ? <p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">Nenhum turno disponível para resumir.</p> : (
        <div className="space-y-3">
          <div className="rounded-xl border border-border bg-muted/20 p-3">
            <div className="flex items-end justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{summary.shiftStatus === DriverShiftStatus.ACTIVE ? 'Turno atual' : 'Último turno encerrado'}</p><p className="mt-1 text-2xl font-black tabular-nums text-foreground">{money(summary.totalEarnings, summary.currency)}</p></div><div className="text-right"><p className="text-xs text-muted-foreground">Devido pela loja</p><p className="font-black tabular-nums text-foreground">{money(summary.dueFromStore, summary.currency)}</p></div></div>
            <dl className="mt-3 grid grid-cols-2 gap-2 border-t border-border pt-3 text-xs sm:grid-cols-3">
              <div><dt className="text-muted-foreground">Entregas</dt><dd className="font-bold tabular-nums text-foreground">{money(summary.deliveryFees, summary.currency)}</dd></div>
              <div><dt className="text-muted-foreground">Gorjetas cash</dt><dd className="font-bold tabular-nums text-foreground">{money(summary.cashTips, summary.currency)}</dd></div>
              <div><dt className="text-muted-foreground">Diária {summary.dailyRatePreview ? 'prevista' : 'lançada'}</dt><dd className="font-bold tabular-nums text-foreground">{money(summary.dailyRate, summary.currency)}</dd></div>
              <div><dt className="text-muted-foreground">Ajustes</dt><dd className="font-bold tabular-nums text-foreground">{money(summary.adjustments, summary.currency)}</dd></div>
              <div><dt className="text-muted-foreground">Recebido direto</dt><dd className="font-bold tabular-nums text-foreground">{money(summary.receivedDirectly, summary.currency)}</dd></div>
            </dl>
            <p className="mt-3 flex gap-1.5 text-xs text-muted-foreground"><Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />Resumo do ledger; não confirma quitação financeira.</p>
          </div>
          {feedback && <p role="status" className="rounded-lg border border-status-success/30 bg-status-success/10 p-3 text-sm font-semibold text-status-success">{feedback}</p>}
          {actionError && <p role="alert" className="rounded-lg border border-status-danger/30 bg-status-danger/10 p-3 text-sm text-status-danger">{actionError}</p>}
          {!action ? <div className="grid gap-2 sm:grid-cols-2"><button type="button" onClick={() => { setAction('tip'); setFeedback(null); }} disabled={stops.length === 0 || isMutating} className="min-h-11 rounded-lg border border-border px-3 text-sm font-bold text-foreground hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"><span className="inline-flex items-center gap-2"><PlusCircle className="h-4 w-4" />Gorjeta em dinheiro</span></button><button type="button" onClick={() => { setAction('adjustment'); setFeedback(null); }} disabled={isMutating} className="min-h-11 rounded-lg border border-border px-3 text-sm font-bold text-foreground hover:bg-muted disabled:opacity-50"><span className="inline-flex items-center gap-2"><MinusCircle className="h-4 w-4" />Registrar ajuste</span></button>{stops.length === 0 && <p className="text-xs text-muted-foreground sm:col-span-2">Gorjetas só ficam disponíveis para pedidos atendidos na rota ativa.</p>}</div> : (
            <div className="space-y-3 rounded-xl border border-border bg-muted/20 p-3">
              <h4 className="text-sm font-bold text-foreground">{action === 'tip' ? 'Gorjeta recebida em dinheiro' : 'Ajuste manual do turno'}</h4>
              {action === 'tip' && <label className="block text-xs font-bold text-foreground" htmlFor="tenant-tip-order">Pedido<select id="tenant-tip-order" value={orderId} onChange={(event) => setOrderId(event.target.value)} disabled={isMutating} className="input-premium mt-1 min-h-11"><option value="">Selecione</option>{stops.map((order) => <option key={order.orderId} value={order.orderId}>#{order.orderNumber} · {order.customerName}</option>)}</select></label>}
              <label className="block text-xs font-bold text-foreground" htmlFor="tenant-earning-amount">Valor<input id="tenant-earning-amount" type="number" step="0.01" {...(action === 'tip' ? { min: 0.01 } : {})} value={amount} onChange={(event) => setAmount(event.target.value)} disabled={isMutating} className="input-premium mt-1 min-h-11" placeholder={action === 'adjustment' ? 'Use negativo para desconto' : '0,00'} /></label>
              {action === 'adjustment' && <label className="block text-xs font-bold text-foreground" htmlFor="tenant-adjustment-reason">Motivo<textarea id="tenant-adjustment-reason" value={reason} onChange={(event) => setReason(event.target.value)} maxLength={255} rows={2} disabled={isMutating} className="input-premium mt-1 min-h-11" /></label>}
              <div className="grid grid-cols-2 gap-2"><button type="button" onClick={() => setAction(null)} disabled={isMutating} className="min-h-11 rounded-lg border border-border text-sm font-bold text-foreground">Cancelar</button><button type="button" onClick={() => void submit()} disabled={isMutating || !numericAmount || (action === 'tip' ? !orderId || numericAmount <= 0 : !reason.trim())} className="min-h-11 rounded-lg bg-primary px-3 text-sm font-bold text-primary-foreground disabled:opacity-50">{isMutating ? 'Registrando…' : 'Registrar'}</button></div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
