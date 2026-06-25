import { DecimalLike } from '../admin-billing-api';
import { money } from '../types';
import { CreditCard, Loader2 } from 'lucide-react';

export function Panel(props: { title?: string; action?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={`rounded-lg border border-border bg-card shadow-sm ${props.className ?? ''}`}>
      {props.title || props.action ? (
        <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-center sm:justify-between">
          {props.title ? <h2 className="text-base font-black text-foreground">{props.title}</h2> : <div />}
          {props.action}
        </div>
      ) : null}
      {props.children}
    </section>
  );
}


export function MetricCard(props: { label: string; value: string | number; icon: typeof CreditCard; tone?: string }) {
  const Icon = props.icon;
  return (
    <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm font-bold text-muted-foreground">{props.label}</p>
        <Icon className={`h-5 w-5 ${props.tone ?? 'text-primary'}`} />
      </div>
      <p className="text-2xl font-black text-foreground">{props.value}</p>
    </div>
  );
}


export function EmptyState(props: { icon: typeof CreditCard; title: string; text: string }) {
  const Icon = props.icon;
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border bg-muted/30 p-8 text-center">
      <Icon className="mb-3 h-9 w-9 text-muted-foreground" />
      <p className="font-black text-foreground">{props.title}</p>
      <p className="mt-1 max-w-lg text-sm font-medium text-muted-foreground">{props.text}</p>
    </div>
  );
}


export function LoadingBlock() {
  return (
    <div className="flex min-h-40 items-center justify-center rounded-lg border border-border bg-card">
      <Loader2 className="h-6 w-6 animate-spin text-primary" />
    </div>
  );
}


export function InfoPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-background px-3 py-2">
      <p className="text-xs font-bold text-muted-foreground">{label}</p>
      <p className="mt-0.5 font-black text-foreground">{value}</p>
    </div>
  );
}


export function ToggleField(props: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <label className="flex min-h-16 items-center justify-between gap-3 rounded-md border border-border bg-background px-3 py-2">
      <span className="text-sm font-black text-foreground">{props.label}</span>
      <input
        type="checkbox"
        checked={props.checked}
        onChange={(event) => props.onChange(event.target.checked)}
        className="h-5 w-5 rounded border-input text-primary focus:ring-ring"
      />
    </label>
  );
}


export function NumberField(props: { label: string; value: number; onChange: (value: number) => void }) {
  return (
    <label className="space-y-1">
      <span className="text-xs font-bold text-muted-foreground">{props.label}</span>
      <input
        type="number"
        min={0}
        value={props.value}
        onChange={(event) => props.onChange(Number(event.target.value))}
        className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm font-bold outline-none focus:ring-2 focus:ring-ring"
      />
    </label>
  );
}


export function MoneyInput(props: { value: DecimalLike | ''; placeholder?: string; onChange: (value: string) => void }) {
  return (
    <input
      inputMode="decimal"
      value={String(props.value)}
      placeholder={props.placeholder}
      onChange={(event) => props.onChange(event.target.value)}
      className="w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-sm font-bold outline-none focus:ring-2 focus:ring-ring"
    />
  );
}


export function IconButton(props: { label: string; icon: typeof CreditCard; disabled?: boolean; onClick: () => void }) {
  const Icon = props.icon;
  return (
    <button
      type="button"
      aria-label={props.label}
      title={props.label}
      disabled={props.disabled}
      onClick={props.onClick}
      className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-border text-foreground disabled:bg-muted disabled:text-muted-foreground disabled:opacity-70 disabled:cursor-not-allowed"
    >
      <Icon className="h-4 w-4" />
    </button>
  );
}

