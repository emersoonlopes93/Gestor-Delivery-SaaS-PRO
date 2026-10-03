import { Ban, Gift, Map, Pencil, Trash2 } from 'lucide-react';
import { CurrencyInput } from '@gestor/ui';
import type { DeliveryRateRule, SpecialAreaDraft } from './types';
import { fmtMoney, getAreaSummary } from './helpers';

type SpecialAreasPanelProps = {
  areas: DeliveryRateRule[];
  isDesktop: boolean;
  drawing: boolean;
  draftPointCount: number;
  areaDraft: SpecialAreaDraft;
  areaError: string | null;
  onAreaDraftChange: (next: SpecialAreaDraft) => void;
  onCreateSpecialFee: () => void;
  onCreateBlocked: () => void;
  onCreateFree: () => void;
  onUndoPoint: () => void;
  onClearDrawing: () => void;
  onFinishDrawing: () => void;
  onEditArea: (rule: DeliveryRateRule) => void;
  onDeleteArea: (rule: DeliveryRateRule) => void;
  onSaveArea: () => void;
  onCancelArea: () => void;
};

export function SpecialAreasPanel(props: SpecialAreasPanelProps) {
  return (
    <section className="space-y-4">
      <div>
        <h3 className="text-lg font-black text-foreground">Áreas especiais no mapa</h3>
        <p className="text-sm text-muted-foreground">Use o mapa para criar exceções de cobrança, bloqueio ou entrega grátis.</p>
      </div>

      {props.isDesktop ? (
        <div className="grid gap-3 md:grid-cols-3">
          <button
            type="button"
            onClick={props.onCreateSpecialFee}
            className="rounded-2xl border border-border bg-card p-4 text-left shadow-sm transition hover:border-blue-300 hover:bg-blue-500/10"
          >
            <Map className="h-5 w-5 text-blue-600" />
            <div className="mt-3 text-sm font-black text-foreground">Cobrar valor diferente</div>
            <div className="mt-1 text-xs text-muted-foreground">Desenhe uma área e defina taxa fixa ou por km.</div>
          </button>
          <button
            type="button"
            onClick={props.onCreateBlocked}
            className="rounded-2xl border border-border bg-card p-4 text-left shadow-sm transition hover:border-red-300 hover:bg-red-500/10"
          >
            <Ban className="h-5 w-5 text-red-600" />
            <div className="mt-3 text-sm font-black text-foreground">Bloquear área</div>
            <div className="mt-1 text-xs text-muted-foreground">Clientes dentro dela não poderão finalizar entrega.</div>
          </button>
          <button
            type="button"
            onClick={props.onCreateFree}
            className="rounded-2xl border border-border bg-card p-4 text-left shadow-sm transition hover:border-green-300 hover:bg-green-500/10"
          >
            <Gift className="h-5 w-5 text-green-600" />
            <div className="mt-3 text-sm font-black text-foreground">Entrega grátis</div>
            <div className="mt-1 text-xs text-muted-foreground">Crie uma área promocional com taxa zerada.</div>
          </button>
        </div>
      ) : (
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-700 dark:text-amber-300">
          Para desenhar ou editar áreas no mapa, recomendamos usar um computador.
        </div>
      )}

      {props.drawing ? (
        <div className="rounded-3xl border border-primary/30 bg-primary/10 p-5">
          <div className="text-sm font-black uppercase tracking-[0.18em] text-blue-700">Desenhando área</div>
          <div className="mt-2 text-sm text-blue-900">
            Clique no mapa para marcar os pontos da área. Pontos marcados: <strong>{props.draftPointCount}</strong>
          </div>
          <div className="mt-4 flex flex-wrap gap-3">
            <button type="button" onClick={props.onUndoPoint} className="rounded-xl border border-primary/30 px-4 py-2 text-sm font-bold text-foreground hover:bg-primary/10">
              Desfazer ponto
            </button>
            <button type="button" onClick={props.onClearDrawing} className="rounded-xl border border-primary/30 px-4 py-2 text-sm font-bold text-foreground hover:bg-primary/10">
              Limpar desenho
            </button>
            <button type="button" onClick={props.onFinishDrawing} className="rounded-xl bg-primary px-4 py-2 text-sm font-black text-primary-foreground">
              Concluir área
            </button>
          </div>
        </div>
      ) : null}

      {props.areaDraft.polygonCoordinates ? (
        <div className="rounded-3xl border border-border bg-muted/40 p-5">
          <div className="text-sm font-black uppercase tracking-[0.18em] text-muted-foreground">
            {props.areaDraft.zoneKind === 'blocked_zone' ? 'Nova área bloqueada' : 'Nova área especial'}
          </div>
          <div className="mt-4 space-y-4">
            <label className="block space-y-2">
              <span className="text-sm font-semibold text-foreground">Nome da área</span>
              <input
                type="text"
                value={props.areaDraft.name}
                onChange={(event) => props.onAreaDraftChange({ ...props.areaDraft, name: event.target.value })}
                className="input-premium"
                placeholder="Ex: Difícil acesso"
              />
            </label>

            {props.areaDraft.zoneKind !== 'blocked_zone' ? (
              <>
                <div className="grid gap-3 md:grid-cols-3">
                  {[
                    { mode: 'fixed' as const, label: 'Valor fixo' },
                    { mode: 'distance' as const, label: 'Por km' },
                    { mode: 'free' as const, label: 'Grátis' },
                  ].map((option) => (
                    <button
                      key={option.mode}
                      type="button"
                      onClick={() => props.onAreaDraftChange({ ...props.areaDraft, pricingMode: option.mode })}
                      className={
                        'rounded-2xl border px-4 py-3 text-left text-sm font-bold transition ' +
                        (props.areaDraft.pricingMode === option.mode
                          ? 'border-primary bg-primary/10 text-primary'
                          : 'border-border bg-card text-foreground hover:border-border/80')
                      }
                    >
                      {option.label}
                    </button>
                  ))}
                </div>

                {props.areaDraft.pricingMode === 'fixed' ? (
                  <label className="block space-y-2">
                    <span className="text-sm font-semibold text-foreground">Valor da entrega</span>
                    <CurrencyInput
                      value={props.areaDraft.fixedFee ?? 0}
                      onChange={(value) => props.onAreaDraftChange({ ...props.areaDraft, fixedFee: value })}
                      className="input-premium"
                    />
                  </label>
                ) : null}

                {props.areaDraft.pricingMode === 'distance' ? (
                  <label className="block space-y-2">
                    <span className="text-sm font-semibold text-foreground">Valor por km</span>
                    <CurrencyInput
                      value={props.areaDraft.pricePerKm ?? 0}
                      onChange={(value) => props.onAreaDraftChange({ ...props.areaDraft, pricePerKm: value })}
                      className="input-premium"
                    />
                  </label>
                ) : null}

                <label className="block space-y-2">
                  <span className="text-sm font-semibold text-foreground">Tempo estimado (min)</span>
                  <input
                    type="number"
                    min={1}
                    step={1}
                    value={props.areaDraft.estimatedDeliveryMinutes}
                    onChange={(event) =>
                      props.onAreaDraftChange({
                        ...props.areaDraft,
                        estimatedDeliveryMinutes: Number(event.target.value),
                      })
                    }
                    className="input-premium"
                  />
                </label>
              </>
            ) : (
              <div className="rounded-2xl border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm font-medium text-destructive">
                Clientes dentro dessa área não poderão finalizar pedidos para entrega.
              </div>
            )}

            {props.areaError ? <div className="rounded-2xl border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm font-semibold text-destructive">{props.areaError}</div> : null}

            <div className="flex flex-wrap gap-3">
              <button type="button" onClick={props.onSaveArea} className="rounded-xl bg-primary px-5 py-3 text-sm font-black text-primary-foreground">
                Salvar área
              </button>
              <button type="button" onClick={props.onCancelArea} className="rounded-xl border border-border bg-background px-5 py-3 text-sm font-bold text-foreground">
                Cancelar
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <div className="space-y-3">
        {props.areas.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-muted/40 p-5 text-sm text-muted-foreground">
            Nenhuma área especial criada ainda.
          </div>
        ) : (
          props.areas.map((area) => (
            <div key={area.id} className="rounded-2xl border border-border bg-card p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-black text-foreground">{area.name || 'Área especial'}</div>
                  <div className="mt-1 text-sm text-muted-foreground">
                    {getAreaSummary(area)}
                    {area.zoneKind !== 'blocked_zone' ? ` • ${fmtMoney(Number(area.fixedFee ?? area.fixedRate ?? 0))}` : ''}
                    {area.zoneKind !== 'blocked_zone' && area.estimatedDeliveryMinutes ? ` • ${area.estimatedDeliveryMinutes} min` : ''}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {props.isDesktop ? (
                    <button
                      type="button"
                      onClick={() => props.onEditArea(area)}
                      className="inline-flex h-9 items-center gap-1 rounded-xl border border-border bg-background px-3 text-sm font-bold text-foreground"
                    >
                      <Pencil className="h-4 w-4" />
                      Editar
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => props.onDeleteArea(area)}
                    className="inline-flex h-9 items-center gap-1 rounded-xl border border-destructive/30 px-3 text-sm font-bold text-destructive hover:bg-destructive/10"
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
    </section>
  );
}
