import { Plus, Trash2 } from 'lucide-react';
import { DriverPayMode, type DriverPayRateTierDTO } from '@gestor/types';
import {
  DRIVER_PAY_MODE_OPTIONS,
  driverPaySummary,
  type DriverPayFormValue,
} from './driver-pay-form';

interface Props {
  value: DriverPayFormValue;
  onChange: (value: DriverPayFormValue) => void;
  idPrefix: string;
  currency?: string;
  disabled?: boolean;
  compact?: boolean;
  scope?: 'store' | 'driver';
}

const inputClassName = 'w-full rounded-lg border border-input bg-background px-3 py-2 text-sm font-semibold text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-60';

export function DriverPayFields({ value, onChange, idPrefix, currency = 'BRL', disabled = false, compact = false, scope = 'driver' }: Props) {
  const set = <Key extends keyof DriverPayFormValue>(key: Key, next: DriverPayFormValue[Key]) => {
    onChange({ ...value, [key]: next });
  };
  const updateTier = (index: number, patch: Partial<DriverPayRateTierDTO>) => {
    set('rateTable', value.rateTable.map((tier, tierIndex) => tierIndex === index ? { ...tier, ...patch } : tier));
  };
  const addTier = () => {
    const terminal = value.rateTable[value.rateTable.length - 1] ?? { upToKm: null, amount: 0 };
    const previous = value.rateTable[value.rateTable.length - 2];
    set('rateTable', [
      ...value.rateTable.slice(0, -1),
      { upToKm: (previous?.upToKm ?? 0) + 5, amount: 0 },
      terminal,
    ]);
  };

  return (
    <div className={compact ? 'space-y-4' : 'space-y-5'} aria-busy={disabled}>
      <div className="grid gap-4 sm:grid-cols-[minmax(0,12rem)_minmax(0,1fr)] sm:items-end">
        <label className="block" htmlFor={`${idPrefix}-daily-rate`}>
          <span className="text-sm font-bold text-foreground">Diária por turno</span>
          <span className="mt-0.5 block text-xs text-muted-foreground">Somada quando o turno é encerrado.</span>
        </label>
        <div className="relative">
          <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-xs font-bold text-muted-foreground">R$</span>
          <input
            id={`${idPrefix}-daily-rate`}
            type="number"
            min="0"
            step="0.01"
            value={value.dailyRate}
            onChange={(event) => set('dailyRate', event.target.valueAsNumber || 0)}
            disabled={disabled}
            className={`${inputClassName} pl-10`}
          />
        </div>
      </div>

      <fieldset disabled={disabled}>
        <legend className="text-sm font-bold text-foreground">Regra por entrega</legend>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {DRIVER_PAY_MODE_OPTIONS.map((option) => {
            const selected = value.mode === option.value;
            return (
              <label
                key={option.value}
                className={`flex cursor-pointer gap-2.5 rounded-lg border px-3 py-2.5 transition focus-within:ring-2 focus-within:ring-ring ${selected ? 'border-primary bg-primary/5' : 'border-border bg-background hover:border-border-strong'}`}
              >
                <input
                  type="radio"
                  name={`${idPrefix}-mode`}
                  value={option.value}
                  checked={selected}
                  onChange={() => set('mode', option.value)}
                  className="mt-1 h-4 w-4 shrink-0 accent-primary"
                />
                <span>
                  <span className="block text-sm font-bold text-foreground">{option.label}</span>
                  <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">
                    {scope === 'store' && option.value === DriverPayMode.DRIVER_RATE_TABLE
                      ? 'Use as faixas de distância da regra padrão da loja.'
                      : option.helper}
                  </span>
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>

      {value.mode === DriverPayMode.FIXED && (
        <label className="block max-w-sm" htmlFor={`${idPrefix}-fixed`}>
          <span className="text-sm font-bold text-foreground">Valor por entrega concluída</span>
          <div className="relative mt-1.5">
            <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-xs font-bold text-muted-foreground">R$</span>
            <input id={`${idPrefix}-fixed`} type="number" min="0" step="0.01" value={value.fixedAmount} onChange={(event) => set('fixedAmount', event.target.valueAsNumber || 0)} disabled={disabled} className={`${inputClassName} pl-10`} />
          </div>
        </label>
      )}

      {value.mode === DriverPayMode.PERCENTAGE_NORMAL_FEE && (
        <label className="block max-w-sm" htmlFor={`${idPrefix}-percentage`}>
          <span className="text-sm font-bold text-foreground">Percentual da taxa normal</span>
          <div className="relative mt-1.5">
            <input id={`${idPrefix}-percentage`} type="number" min="0" max="100" step="0.01" value={value.percentage} onChange={(event) => set('percentage', event.target.valueAsNumber || 0)} disabled={disabled} className={`${inputClassName} pr-10`} />
            <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm font-bold text-muted-foreground">%</span>
          </div>
        </label>
      )}

      {value.mode === DriverPayMode.DRIVER_RATE_TABLE && (
        <div>
          <div className="mb-2 flex items-end justify-between gap-3">
            <div>
              <h4 className="text-sm font-bold text-foreground">{scope === 'store' ? 'Tabela própria de pagamento' : 'Tabela própria do entregador'}</h4>
              <p className="text-xs text-muted-foreground">{scope === 'store' ? 'Faixas de distância da regra padrão da loja.' : 'Faixas exclusivas para este entregador.'} A última faixa cobre as demais distâncias.</p>
            </div>
            <button
              type="button"
              onClick={addTier}
              disabled={disabled}
              className="inline-flex shrink-0 items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-xs font-bold text-foreground transition hover:bg-muted focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-60"
            >
              <Plus className="h-3.5 w-3.5" /> Faixa
            </button>
          </div>
          <div className="space-y-2">
            {value.rateTable.map((tier, index) => {
              const terminal = tier.upToKm === null;
              return (
                <div key={`${idPrefix}-tier-${index}`} className="grid gap-2 rounded-lg border border-border bg-muted/30 p-2.5 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end">
                  <label htmlFor={`${idPrefix}-tier-distance-${index}`}>
                    <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-muted-foreground">{terminal ? 'Distância' : 'Até'}</span>
                    {terminal ? (
                      <span className="flex h-9 items-center rounded-lg border border-border bg-card px-3 text-sm font-semibold text-foreground">Acima das anteriores</span>
                    ) : (
                      <div className="relative">
                        <input id={`${idPrefix}-tier-distance-${index}`} aria-label={`Distância máxima da faixa ${index + 1}`} type="number" min="0.1" step="0.1" value={tier.upToKm ?? ''} onChange={(event) => updateTier(index, { upToKm: event.target.valueAsNumber || 0 })} disabled={disabled} className={`${inputClassName} pr-9`} />
                        <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs font-bold text-muted-foreground">km</span>
                      </div>
                    )}
                  </label>
                  <label htmlFor={`${idPrefix}-tier-amount-${index}`}>
                    <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Pagamento</span>
                    <div className="relative">
                      <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-xs font-bold text-muted-foreground">R$</span>
                      <input id={`${idPrefix}-tier-amount-${index}`} type="number" min="0" step="0.01" value={tier.amount} onChange={(event) => updateTier(index, { amount: event.target.valueAsNumber || 0 })} disabled={disabled} className={`${inputClassName} pl-10`} />
                    </div>
                  </label>
                  <button type="button" aria-label={`Remover faixa ${index + 1}`} onClick={() => set('rateTable', value.rateTable.filter((_, tierIndex) => tierIndex !== index))} disabled={disabled || value.rateTable.length === 1 || terminal} className="flex h-9 items-center justify-center gap-1.5 rounded-md px-2 text-xs font-bold text-muted-foreground transition hover:bg-status-danger/10 hover:text-status-danger focus:outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-30 sm:w-9 sm:px-0">
                    <Trash2 className="h-4 w-4" /><span className="sm:sr-only">Remover faixa</span>
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-border bg-background px-3 py-2.5">
        <input type="checkbox" checked={value.payFailedAttempt} onChange={(event) => set('payFailedAttempt', event.target.checked)} disabled={disabled} className="mt-0.5 h-4 w-4 rounded border-input accent-primary focus:ring-2 focus:ring-ring" />
        <span>
          <span className="block text-sm font-bold text-foreground">Pagar tentativa após chegada</span>
          <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">Registra o pagamento quando o entregador chegou ao endereço, mas a entrega não pôde ser concluída.</span>
        </span>
      </label>

      <div className="grid gap-2 border-l-4 border-primary bg-primary/5 px-3 py-2.5 sm:grid-cols-[auto_1fr] sm:items-center" aria-live="polite">
        <span className="text-[10px] font-black uppercase tracking-widest text-primary">Regra ativa</span>
        <p className="text-sm font-bold text-foreground">{driverPaySummary(value, currency)}</p>
        <p className="text-xs leading-relaxed text-muted-foreground sm:col-start-2">
          A taxa de entrega é cobrada do cliente. Este valor define quanto a loja deve ao entregador.
        </p>
      </div>
    </div>
  );
}
