import { Printer } from 'lucide-react';
import type { PrinterDevice } from '../../hooks/usePrinting';
import type { PrinterUiStatus } from './printing-ui';

interface PrinterOverviewCardProps {
  device: PrinterDevice | null;
  status: PrinterUiStatus;
  testing: boolean;
  onConfigure: () => void;
  onTest: () => void;
  onToggleAutoPrint: () => void;
}
export function PrinterOverviewCard({ device, status, testing, onConfigure, onTest, onToggleAutoPrint }: PrinterOverviewCardProps) {
  return (
    <section className="overflow-hidden rounded-[2rem] border border-border bg-card shadow-sm">
      <div className="flex flex-col gap-4 p-5 sm:p-6">
        <div className="flex items-start gap-3">
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-primary/10 text-primary"><Printer className="h-5 w-5" /></div>
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-muted-foreground">Impressão de pedidos</p>
            <h2 className="mt-1 text-xl font-black text-foreground">{device?.name ?? 'Nenhuma impressora configurada'}</h2>
            <p className="mt-1 text-sm font-semibold text-muted-foreground">{status}{device ? ' · Impressora principal' : ''}</p>
          </div>
        </div>

        {device ? (
          <>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={onTest} disabled={testing} className="min-h-11 rounded-xl bg-primary px-4 py-2.5 text-sm font-black text-primary-foreground disabled:opacity-50">{testing ? 'Imprimindo…' : 'Imprimir teste'}</button>
              <button type="button" onClick={onConfigure} className="min-h-11 rounded-xl border border-border bg-background px-4 py-2.5 text-sm font-bold text-foreground">Alterar</button>
            </div>
            <dl className="grid gap-3 rounded-2xl border border-border bg-muted/20 p-4 sm:grid-cols-2">
              <div><dt className="text-xs font-bold uppercase tracking-[0.18em] text-muted-foreground">Impressão automática</dt><dd className="mt-1 text-sm font-black text-foreground">{device.autoPrintEnabled ? 'Ativada' : 'Desativada'}</dd></div>
              <div><dt className="text-xs font-bold uppercase tracking-[0.18em] text-muted-foreground">Uso</dt><dd className="mt-1 text-sm font-black text-foreground">Principal</dd></div>
            </dl>
            <label className="flex min-h-12 cursor-pointer items-center justify-between gap-4 rounded-2xl border border-border bg-background px-4 py-3">
              <span><strong className="block text-sm text-foreground">Impressão automática</strong><span className="block text-xs text-muted-foreground">Imprime novos pedidos neste dispositivo.</span></span>
              <input type="checkbox" checked={device.autoPrintEnabled === true} onChange={onToggleAutoPrint} className="h-5 w-5 accent-primary" />
            </label>
          </>
        ) : (
          <>
            <p className="max-w-xl text-sm text-muted-foreground">Configure uma impressora térmica para imprimir pedidos automaticamente neste dispositivo.</p>
            <button type="button" onClick={onConfigure} className="min-h-11 w-fit rounded-xl bg-primary px-4 py-2.5 text-sm font-black text-primary-foreground">Configurar impressora</button>
          </>
        )}
      </div>
    </section>
  );
}
