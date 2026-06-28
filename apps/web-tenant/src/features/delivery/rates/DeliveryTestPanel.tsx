import { Loader2, Search } from 'lucide-react';
import type { DeliveryTestResult } from './types';
import { fmtMoney } from './helpers';

type DeliveryTestPanelProps = {
  query: string;
  loading: boolean;
  error: string | null;
  result: DeliveryTestResult | null;
  onQueryChange: (value: string) => void;
  onSubmit: () => void;
};

export function DeliveryTestPanel(props: DeliveryTestPanelProps) {
  return (
    <section className="space-y-4 rounded-3xl border border-border bg-card p-5 shadow-sm">
      <div>
        <h3 className="text-lg font-black text-foreground">Testar entrega</h3>
        <p className="text-sm text-slate-500">Digite um endereço completo ou CEP e use a mesma lógica real do backend.</p>
      </div>

      <div className="flex flex-col gap-3 md:flex-row">
        <input
          type="text"
          value={props.query}
          onChange={(event) => props.onQueryChange(event.target.value)}
          className="input-premium flex-1"
          placeholder="Rua, número, bairro ou CEP"
        />
        <button
          type="button"
          onClick={props.onSubmit}
          disabled={props.loading}
          className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-foreground px-5 text-sm font-black text-background transition hover:opacity-90 disabled:opacity-60"
        >
          {props.loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
          Testar
        </button>
      </div>

      {props.error ? <div className="rounded-2xl border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm font-semibold text-destructive">{props.error}</div> : null}

      {props.result ? (
        <div
          className={
            'rounded-3xl border p-5 ' +
            (props.result.available ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50')
          }
        >
          <div className={'text-base font-black ' + (props.result.available ? 'text-green-700' : 'text-red-700')}>
            {props.result.available ? 'Entrega disponível' : 'Entrega indisponível'}
          </div>
          <div className="mt-3 grid gap-2 text-sm text-slate-700">
            <div><strong>Taxa:</strong> {fmtMoney(props.result.fee)}</div>
            {props.result.distanceKm != null ? <div><strong>Distância:</strong> {props.result.distanceKm.toFixed(2)} km</div> : null}
            {props.result.estimatedDeliveryMinutes != null ? (
              <div><strong>Tempo estimado:</strong> {props.result.estimatedDeliveryMinutes} min</div>
            ) : null}
            <div><strong>Regra aplicada:</strong> {props.result.appliedRule}</div>
            {!props.result.available && props.result.reason ? <div><strong>Motivo:</strong> {props.result.reason}</div> : null}
          </div>
        </div>
      ) : null}
    </section>
  );
}
