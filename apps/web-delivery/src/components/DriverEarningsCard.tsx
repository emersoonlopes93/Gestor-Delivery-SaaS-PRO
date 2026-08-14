import { useState } from 'react';
import { Banknote, ChevronDown, ChevronUp, Coins, Info } from 'lucide-react';
import { DriverShiftStatus, type DriverEarningsOrderDTO, type DriverEarningsSummaryDTO } from '@gestor/types';

function money(value: number, currency: string): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency }).format(value);
}

interface Props {
  summary: DriverEarningsSummaryDTO | null;
  eligibleStops: DriverEarningsOrderDTO[];
  isLoading: boolean;
  isMutating: boolean;
  error: string | null;
  onAddCashTip: (orderId: string, amount: number) => Promise<boolean>;
}

export function DriverEarningsCard({ summary, eligibleStops, isLoading, isMutating, error, onAddCashTip }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [showTip, setShowTip] = useState(false);
  const [orderId, setOrderId] = useState('');
  const [amount, setAmount] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const validAmount = Number(amount) > 0;

  const submitTip = async () => {
    if (!orderId || !validAmount) return;
    if (await onAddCashTip(orderId, Number(amount))) {
      setNotice('Gorjeta em dinheiro registrada neste turno.');
      setOrderId('');
      setAmount('');
      setShowTip(false);
    }
  };

  return (
    <section className="rounded-2xl border border-[var(--delivery-border)] bg-[var(--delivery-card)] shadow-sm" aria-labelledby="earnings-title" aria-busy={isLoading || isMutating}>
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-100 dark:bg-emerald-950/40"><Banknote className="h-5 w-5 text-emerald-600" aria-hidden="true" /></span>
            <div>
              <h2 id="earnings-title" className="text-sm font-bold text-[var(--delivery-foreground)]">Ganhos do turno</h2>
              {summary ? (
                <><p className="mt-0.5 text-2xl font-black tabular-nums text-[var(--delivery-foreground)]">{money(summary.totalEarnings, summary.currency)}</p><p className="mt-0.5 text-xs text-[var(--delivery-muted-foreground)]">{summary.shiftStatus === DriverShiftStatus.ACTIVE ? 'Turno atual' : 'Último turno encerrado'}</p></>
              ) : <p className="mt-1 text-xs text-[var(--delivery-muted-foreground)]">{isLoading ? 'Carregando valores…' : 'Inicie seu primeiro turno para acompanhar os ganhos.'}</p>}
            </div>
          </div>
          {summary && <button type="button" onClick={() => setExpanded((value) => !value)} aria-expanded={expanded} aria-controls="earnings-details" className="flex min-h-11 min-w-11 items-center justify-center rounded-xl text-[var(--delivery-muted-foreground)] hover:bg-[var(--delivery-muted)]"><span className="sr-only">{expanded ? 'Ocultar detalhes' : 'Ver detalhes'}</span>{expanded ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}</button>}
        </div>

        {error && <p role="alert" className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/30 dark:text-red-100">{error}</p>}
        {notice && <p role="status" className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm font-semibold text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-100">{notice}</p>}

        {summary && expanded && (
          <div id="earnings-details" className="mt-4 border-t border-[var(--delivery-border)] pt-4">
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
              <div><dt className="text-xs text-[var(--delivery-muted-foreground)]">Entregas</dt><dd className="mt-0.5 font-bold tabular-nums text-[var(--delivery-foreground)]">{money(summary.deliveryFees, summary.currency)}</dd></div>
              <div><dt className="text-xs text-[var(--delivery-muted-foreground)]">Gorjetas em dinheiro</dt><dd className="mt-0.5 font-bold tabular-nums text-[var(--delivery-foreground)]">{money(summary.cashTips, summary.currency)}</dd></div>
              <div><dt className="text-xs text-[var(--delivery-muted-foreground)]">Diária {summary.dailyRatePreview ? '(prevista)' : '(lançada)'}</dt><dd className="mt-0.5 font-bold tabular-nums text-[var(--delivery-foreground)]">{money(summary.dailyRate, summary.currency)}</dd></div>
              <div><dt className="text-xs text-[var(--delivery-muted-foreground)]">Ajustes</dt><dd className="mt-0.5 font-bold tabular-nums text-[var(--delivery-foreground)]">{money(summary.adjustments, summary.currency)}</dd></div>
            </dl>
            <div className="mt-4 grid gap-2 rounded-xl bg-[var(--delivery-muted)] p-3">
              <div className="flex justify-between gap-3 text-sm"><span className="text-[var(--delivery-muted-foreground)]">Recebido diretamente</span><strong className="tabular-nums text-[var(--delivery-foreground)]">{money(summary.receivedDirectly, summary.currency)}</strong></div>
              <div className="flex justify-between gap-3 text-sm"><span className="font-bold text-[var(--delivery-foreground)]">Devido pela loja</span><strong className="tabular-nums text-[var(--delivery-foreground)]">{money(summary.dueFromStore, summary.currency)}</strong></div>
              <p className="flex gap-1.5 text-xs leading-relaxed text-[var(--delivery-muted-foreground)]"><Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />Resumo do ledger deste turno; não é comprovante de pagamento.</p>
            </div>
          </div>
        )}

        {summary && eligibleStops.length > 0 && (
          <div className="mt-4">
            {!showTip ? <button type="button" onClick={() => { setShowTip(true); setNotice(null); }} className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-[var(--delivery-border)] text-sm font-bold text-[var(--delivery-foreground)]"><Coins className="h-4 w-4" />Registrar gorjeta em dinheiro</button> : (
              <div className="space-y-3 rounded-xl border border-[var(--delivery-border)] bg-[var(--delivery-muted)] p-3">
                <label className="block text-sm font-bold text-[var(--delivery-foreground)]" htmlFor="cash-tip-order">Pedido atendido</label>
                <select id="cash-tip-order" value={orderId} onChange={(event) => setOrderId(event.target.value)} disabled={isMutating} className="min-h-11 w-full rounded-xl border border-[var(--delivery-border)] bg-[var(--delivery-input)] px-3 text-sm text-[var(--delivery-foreground)]"><option value="">Selecione o pedido</option>{eligibleStops.map((order) => <option key={order.orderId} value={order.orderId}>Pedido #{order.orderNumber} · {order.customerName}</option>)}</select>
                <label className="block text-sm font-bold text-[var(--delivery-foreground)]" htmlFor="cash-tip-amount">Valor recebido</label>
                <input id="cash-tip-amount" type="number" min="0.01" step="0.01" inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} disabled={isMutating} placeholder="0,00" className="min-h-11 w-full rounded-xl border border-[var(--delivery-border)] bg-[var(--delivery-input)] px-3 text-sm text-[var(--delivery-foreground)]" />
                <p className="text-xs text-[var(--delivery-muted-foreground)]">Registre somente o dinheiro entregue pelo cliente diretamente a você.</p>
                <div className="grid grid-cols-2 gap-2"><button type="button" onClick={() => setShowTip(false)} disabled={isMutating} className="min-h-11 rounded-xl border border-[var(--delivery-border)] text-sm font-bold">Cancelar</button><button type="button" onClick={() => void submitTip()} disabled={isMutating || !orderId || !validAmount} className="min-h-11 rounded-xl bg-emerald-600 px-3 text-sm font-bold text-white disabled:opacity-50">{isMutating ? 'Registrando…' : 'Confirmar'}</button></div>
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
