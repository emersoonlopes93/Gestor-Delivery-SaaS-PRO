import { useEffect, useRef, useState } from 'react';
import { Bluetooth, Monitor, Printer, X } from 'lucide-react';
import type { CreateDevicePayload, PrintStation } from '../../hooks/usePrinting';
import { scanBluetoothDevices } from '../../lib/bluetooth';
import { listQzPrinters } from '../../lib/qz-tray-client';
import type { PrintingCapabilities } from './printing-capabilities';
import { humanizePrintingError, SingleFlight } from './printing-ui';

type SetupMethod = 'bluetooth' | 'qz' | 'browser';
type PrinterChoice = { name: string; address: string };

interface PrinterSetupDialogProps {
  capabilities: PrintingCapabilities;
  stations: PrintStation[];
  onClose: () => void;
  onSave: (payload: CreateDevicePayload) => Promise<void>;
  onTest: (method: Exclude<SetupMethod, 'browser'>, printer: PrinterChoice) => Promise<void>;
  onBrowserPrint: () => void;
}

export function PrinterSetupDialog({ capabilities, stations, onClose, onSave, onTest, onBrowserPrint }: PrinterSetupDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  const actionGuardRef = useRef(new SingleFlight());
  const [method, setMethod] = useState<SetupMethod>(capabilities.bluetooth ? 'bluetooth' : 'qz');
  const [role, setRole] = useState<'primary' | 'station'>('primary');
  const [stationId, setStationId] = useState(stations[0]?.id ?? '');
  const [printers, setPrinters] = useState<PrinterChoice[]>([]);
  const [selected, setSelected] = useState<PrinterChoice | null>(null);
  const [busy, setBusy] = useState<'search' | 'test' | 'save' | null>(null);
  const [feedback, setFeedback] = useState('');
  const [technicalDetail, setTechnicalDetail] = useState('');

  useEffect(() => {
    restoreFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeButtonRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
      if (event.key !== 'Tab' || !dialogRef.current) return;
      const focusable = [...dialogRef.current.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])')];
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      restoreFocusRef.current?.focus();
    };
  }, [onClose]);

  const searchPrinters = async () => {
    setBusy('search');
    setFeedback(method === 'bluetooth' ? 'Procurando impressoras pareadas…' : 'Procurando impressoras instaladas…');
    setTechnicalDetail('');
    setPrinters([]);
    setSelected(null);
    try {
      const found = method === 'bluetooth'
        ? await scanBluetoothDevices()
        : (await listQzPrinters()).map((name) => ({ name, address: name }));
      setPrinters(found);
      setFeedback(found.length > 0
        ? `${found.length} ${found.length === 1 ? 'impressora encontrada' : 'impressoras encontradas'}.`
        : method === 'bluetooth'
          ? 'Nenhuma impressora pareada. Pareie a impressora nas configurações de Bluetooth do Android e volte aqui.'
          : 'Nenhuma impressora instalada foi encontrada.');
    } catch (error) {
      setFeedback(humanizePrintingError(error));
      setTechnicalDetail(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(null);
    }
  };

  const testSelected = async () => {
    if (!selected || method === 'browser') return;
    await actionGuardRef.current.run(async () => {
      setBusy('test');
      setFeedback('Impressão em andamento…');
      try {
        await onTest(method, selected);
        setFeedback('Teste concluído. Confira o papel impresso.');
      } catch (error) {
        setFeedback(`Falha no teste. ${humanizePrintingError(error)}`);
        setTechnicalDetail(error instanceof Error ? error.message : String(error));
      } finally {
        setBusy(null);
      }
    });
  };

  const saveSelected = async () => {
    if (!selected || method === 'browser' || (role === 'station' && !stationId)) return;
    await actionGuardRef.current.run(async () => {
      setBusy('save');
      setFeedback('Salvando configuração…');
      try {
        await onSave({
          name: selected.name,
          address: selected.address,
          connectionType: method === 'bluetooth' ? 'BLUETOOTH_SPP' : 'QZ_TRAY',
          stationId: role === 'station' ? stationId : null,
          isDefault: role === 'primary',
          isPrimary: role === 'primary',
          role: role === 'primary' ? 'primary_order' : 'station',
          purpose: role === 'primary' ? 'main_receipt' : 'production_ticket',
          autoPrintEnabled: true,
        });
        setFeedback('Impressora configurada.');
        onClose();
      } catch (error) {
        setFeedback(humanizePrintingError(error));
        setTechnicalDetail(error instanceof Error ? error.message : String(error));
      } finally {
        setBusy(null);
      }
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/60 p-0 backdrop-blur-sm sm:items-center sm:p-6">
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="printer-setup-title" className="max-h-[calc(100dvh-env(safe-area-inset-top))] w-full max-w-2xl overflow-y-auto rounded-t-[2rem] border border-border bg-card pb-[env(safe-area-inset-bottom)] shadow-2xl sm:max-h-[90vh] sm:rounded-[2rem]">
        <header className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-border bg-card px-5 py-4 sm:px-6">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-primary">Configuração guiada</p>
            <h2 id="printer-setup-title" className="mt-1 text-xl font-black text-foreground sm:text-2xl">
              {capabilities.bluetooth ? 'Configurar impressora Bluetooth' : 'Como deseja imprimir?'}
            </h2>
          </div>
          <button ref={closeButtonRef} type="button" onClick={onClose} aria-label="Fechar configuração" className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-border bg-background text-foreground">
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="space-y-6 px-5 py-5 sm:px-6">
          {capabilities.qz ? (
            <fieldset className="space-y-3">
              <legend className="text-sm font-black text-foreground">Método de impressão</legend>
              <label className={`flex min-h-20 cursor-pointer items-start gap-3 rounded-2xl border p-4 ${method === 'qz' ? 'border-primary bg-primary/10' : 'border-border bg-background'}`}>
                <input type="radio" name="printer-method" value="qz" checked={method === 'qz'} onChange={() => { setMethod('qz'); setPrinters([]); setSelected(null); }} className="mt-1 accent-primary" />
                <Printer className="mt-0.5 h-5 w-5 text-primary" />
                <span><strong className="block text-sm text-foreground">Impressora térmica</strong><span className="mt-1 block text-sm text-muted-foreground">Imprime automaticamente usando uma impressora instalada neste computador.</span></span>
              </label>
              <label className={`flex min-h-20 cursor-pointer items-start gap-3 rounded-2xl border p-4 ${method === 'browser' ? 'border-primary bg-primary/10' : 'border-border bg-background'}`}>
                <input type="radio" name="printer-method" value="browser" checked={method === 'browser'} onChange={() => setMethod('browser')} className="mt-1 accent-primary" />
                <Monitor className="mt-0.5 h-5 w-5 text-primary" />
                <span><strong className="block text-sm text-foreground">Impressão do navegador</strong><span className="mt-1 block text-sm text-muted-foreground">Abre a tela de impressão quando você escolher imprimir.</span></span>
              </label>
            </fieldset>
          ) : null}

          {method === 'browser' ? (
            <section className="rounded-2xl border border-border bg-muted/20 p-5">
              <h3 className="font-black text-foreground">Imprimir neste dispositivo</h3>
              <p className="mt-2 text-sm text-muted-foreground">O navegador abrirá a tela de impressão do aparelho.</p>
              <button type="button" onClick={onBrowserPrint} className="mt-4 min-h-11 rounded-xl bg-primary px-4 py-2.5 text-sm font-black text-primary-foreground">Imprimir pelo navegador</button>
            </section>
          ) : (
            <>
              <section className="space-y-3">
                <div className="flex items-center gap-2">
                  {method === 'bluetooth' ? <Bluetooth className="h-5 w-5 text-primary" /> : <Printer className="h-5 w-5 text-primary" />}
                  <div><h3 className="font-black text-foreground">1. Impressora</h3><p className="text-sm text-muted-foreground">{method === 'bluetooth' ? 'Use uma impressora térmica já pareada com este celular.' : 'O serviço de impressão precisa estar aberto neste computador.'}</p></div>
                </div>
                <button type="button" onClick={() => void searchPrinters()} disabled={busy !== null} className="min-h-11 rounded-xl bg-primary px-4 py-2.5 text-sm font-black text-primary-foreground disabled:opacity-50">
                  {busy === 'search' ? 'Procurando…' : 'Procurar impressoras'}
                </button>
                {printers.length > 0 ? <div className="grid gap-2">{printers.map((printer) => (
                  <button key={printer.address} type="button" onClick={() => setSelected(printer)} className={`min-h-12 rounded-xl border px-4 py-3 text-left text-sm font-bold ${selected?.address === printer.address ? 'border-primary bg-primary/10 text-foreground' : 'border-border bg-background text-foreground'}`}>
                    {printer.name}<span className="block text-xs font-medium text-muted-foreground">{selected?.address === printer.address ? 'Selecionada' : 'Selecionar'}</span>
                  </button>
                ))}</div> : null}
              </section>

              <fieldset className="space-y-3">
                <legend className="font-black text-foreground">2. Uso</legend>
                <div className="grid gap-2 sm:grid-cols-2">
                  <label className={`min-h-16 cursor-pointer rounded-xl border p-3 ${role === 'primary' ? 'border-primary bg-primary/10' : 'border-border bg-background'}`}><input type="radio" name="printer-role" checked={role === 'primary'} onChange={() => setRole('primary')} className="mr-2 accent-primary" /><strong className="text-sm text-foreground">Impressora principal</strong></label>
                  <label className={`min-h-16 cursor-pointer rounded-xl border p-3 ${role === 'station' ? 'border-primary bg-primary/10' : 'border-border bg-background'}`}><input type="radio" name="printer-role" checked={role === 'station'} onChange={() => setRole('station')} className="mr-2 accent-primary" /><strong className="text-sm text-foreground">Impressora de setor</strong></label>
                </div>
                {role === 'station' ? <label className="block text-sm font-bold text-foreground">Setor<select value={stationId} onChange={(event) => setStationId(event.target.value)} className="mt-2 min-h-11 w-full rounded-xl border border-border bg-background px-3 text-foreground"><option value="">Selecione o setor</option>{stations.map((station) => <option key={station.id} value={station.id}>{station.name}</option>)}</select></label> : null}
              </fieldset>

              <section className="space-y-3">
                <h3 className="font-black text-foreground">3. Teste</h3>
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={() => void testSelected()} disabled={!selected || busy !== null} className="min-h-11 rounded-xl border border-primary/30 bg-primary/10 px-4 py-2.5 text-sm font-black text-primary disabled:opacity-50">{busy === 'test' ? 'Imprimindo…' : 'Imprimir teste'}</button>
                  <button type="button" onClick={() => void saveSelected()} disabled={!selected || busy !== null || (role === 'station' && !stationId)} className="min-h-11 rounded-xl bg-primary px-4 py-2.5 text-sm font-black text-primary-foreground disabled:opacity-50">{busy === 'save' ? 'Salvando…' : 'Salvar impressora'}</button>
                </div>
              </section>
            </>
          )}

          <div aria-live="polite" className="min-h-6 text-sm font-medium text-muted-foreground">{feedback}</div>
          {technicalDetail ? <details className="rounded-xl border border-border bg-muted/20 p-3 text-sm"><summary className="cursor-pointer font-bold text-foreground">Ver detalhes técnicos</summary><p className="mt-2 break-words text-muted-foreground">{technicalDetail}</p></details> : null}
        </div>
      </div>
    </div>
  );
}
