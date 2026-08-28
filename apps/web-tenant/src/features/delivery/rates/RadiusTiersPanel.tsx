import { Plus, Pencil, Trash2 } from 'lucide-react';
import { CurrencyInput } from '@gestor/ui';
import type { TierDraft } from './types';
import { fmtMoney, tierLabel } from './helpers';

type RadiusTiersPanelProps = {
  tiers: TierDraft[];
  tierForm: TierDraft;
  editingIndex: number | null;
  error: string | null;
  onTierFormChange: (next: TierDraft) => void;
  onStartAdd: () => void;
  onStartEdit: (index: number) => void;
  onRemove: (index: number) => void;
  onSave: () => void;
  onCancel: () => void;
};

export function RadiusTiersPanel(props: RadiusTiersPanelProps) {
  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-black text-foreground">Raios e taxas</h3>
          <p className="text-sm text-muted-foreground">Configure a cobrança principal por distância.</p>
        </div>
        <button
          type="button"
          onClick={props.onStartAdd}
          className="inline-flex h-10 items-center gap-2 rounded-xl bg-foreground px-4 text-sm font-black text-background transition hover:opacity-90"
        >
          <Plus className="h-4 w-4" />
          Novo raio
        </button>
      </div>

      <div className="space-y-3">
        {props.tiers.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-muted/40 p-5 text-sm text-muted-foreground">
            Nenhum raio cadastrado ainda. Adicione sua primeira faixa recomendada.
          </div>
        ) : (
          props.tiers.map((tier, index) => (
            <div key={`${tier.minDistanceKm}-${tier.maxDistanceKm}-${index}`} className="rounded-2xl border border-border bg-card p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-base font-black text-foreground">{tierLabel(tier)}</div>
                  <div className="mt-1 text-sm text-muted-foreground">{fmtMoney(tier.fee)} • {tier.estimatedDeliveryMinutes} min</div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => props.onStartEdit(index)}
                    className="inline-flex h-9 items-center gap-1 rounded-xl border border-border px-3 text-sm font-bold text-foreground transition hover:bg-muted"
                  >
                    <Pencil className="h-4 w-4" />
                    Editar
                  </button>
                  <button
                    type="button"
                    onClick={() => props.onRemove(index)}
                    className="inline-flex h-9 items-center gap-1 rounded-xl border border-destructive/30 px-3 text-sm font-bold text-destructive transition hover:bg-destructive/10"
                  >
                    <Trash2 className="h-4 w-4" />
                    Remover
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      <div className="rounded-3xl border border-border bg-muted/40 p-5">
        <div className="text-sm font-black uppercase tracking-[0.18em] text-muted-foreground">
          {props.editingIndex == null ? 'Novo raio de entrega' : 'Editar raio'}
        </div>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <label className="space-y-2">
            <span className="text-sm font-semibold text-foreground">Distância inicial (km)</span>
            <input
              type="number"
              min={0}
              step={0.1}
              value={props.tierForm.minDistanceKm}
              onChange={(event) => props.onTierFormChange({ ...props.tierForm, minDistanceKm: Number(event.target.value) })}
              className="input-premium"
            />
          </label>
          <label className="space-y-2">
            <span className="text-sm font-semibold text-foreground">Distância final (km)</span>
            <input
              type="number"
              min={0}
              step={0.1}
              value={props.tierForm.maxDistanceKm}
              onChange={(event) => props.onTierFormChange({ ...props.tierForm, maxDistanceKm: Number(event.target.value) })}
              className="input-premium"
            />
          </label>
          <label className="space-y-2">
            <span className="text-sm font-semibold text-foreground">Valor da entrega</span>
            <CurrencyInput
              value={props.tierForm.fee}
              onChange={(value) => props.onTierFormChange({ ...props.tierForm, fee: value })}
              className="input-premium"
            />
          </label>
          <label className="space-y-2">
            <span className="text-sm font-semibold text-foreground">Tempo estimado (min)</span>
            <input
              type="number"
              min={1}
              step={1}
              value={props.tierForm.estimatedDeliveryMinutes}
              onChange={(event) =>
                props.onTierFormChange({ ...props.tierForm, estimatedDeliveryMinutes: Number(event.target.value) })
              }
              className="input-premium"
            />
          </label>
        </div>

        {props.error ? <div className="mt-4 rounded-2xl border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm font-semibold text-destructive">{props.error}</div> : null}

        <div className="mt-4 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={props.onSave}
            className="inline-flex h-11 items-center rounded-xl bg-blue-600 px-5 text-sm font-black text-white transition hover:bg-blue-500"
          >
            Salvar raio
          </button>
          <button
            type="button"
            onClick={props.onCancel}
            className="inline-flex h-11 items-center rounded-xl border border-border bg-background px-5 text-sm font-bold text-foreground transition hover:bg-muted"
          >
            Limpar
          </button>
        </div>
      </div>
    </section>
  );
}
