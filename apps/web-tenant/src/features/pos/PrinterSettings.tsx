import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Info, Printer } from 'lucide-react';
import { api } from '../../lib/api-client';
import { printTicketViaBluetooth } from '../../lib/bluetooth';
import { EscPosBuilder } from '../../lib/escpos58';
import { printTextViaQz } from '../../lib/qz-tray-client';
import { printThermalText } from '../../lib/thermal-print';
import { useAuthStore } from '../../stores/auth.store';
import {
  useCreateDevice,
  usePrinterDevices,
  usePrintingStations,
  useTestPrint,
  useUpdateDevice,
  type CreateDevicePayload,
  type PrinterDevice,
} from '../../hooks/usePrinting';
import { getPrintingCapabilities, isPrinterDeviceCompatible, selectCurrentPlatformPrinter } from './printing-capabilities';
import { PrinterOverviewCard } from './PrinterOverviewCard';
import { PrinterSetupDialog } from './PrinterSetupDialog';
import { PrintingPoller, selectSpoolerDevice, type SpoolerState } from './printing-spooler';
import { getPrinterUiStatus, humanizePrintingError, SingleFlight } from './printing-ui';

interface PrintJobDTO {
  id: string;
  content: string;
}

const POLLING_INTERVAL_MS = 3000;

function buildTestContent(deviceName: string, station = 'Principal') {
  return [
    'TESTE DE IMPRESSAO',
    `Impressora: ${deviceName}`,
    `Setor: ${station}`,
    `Data: ${new Date().toLocaleString('pt-BR')}`,
    '',
    'Se este ticket saiu corretamente, a configuracao esta funcionando.',
  ].join('\n');
}

function toBluetoothPayload(content: string) {
  const builder = new EscPosBuilder();
  builder.alignCenter().boldOn().textLine('--- TICKET ---').boldOff().alignLeft();
  builder.textLine(content).feed(3).cut();
  return String.fromCharCode(...builder.build());
}

function newRequestId() {
  return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (character) => {
      const random = Math.floor(Math.random() * 16);
      return (character === 'x' ? random : (random & 0x3) | 0x8).toString(16);
    });
}

export function PrinterSettings() {
  const capabilities = useMemo(() => getPrintingCapabilities(), []);
  const { user } = useAuthStore();
  const { data: stations = [] } = usePrintingStations();
  const { data: devices = [] } = usePrinterDevices();
  const createDevice = useCreateDevice();
  const updateDevice = useUpdateDevice();
  const testPrint = useTestPrint();
  const [setupOpen, setSetupOpen] = useState(false);
  const [testingDeviceId, setTestingDeviceId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState('');
  const [technicalDetail, setTechnicalDetail] = useState('');
  const [spoolerState, setSpoolerState] = useState<SpoolerState>('stopped');
  const [qzAvailable, setQzAvailable] = useState(false);
  const lastPollingErrorAtRef = useRef(0);
  const testPrintGuardRef = useRef(new SingleFlight());

  const mainPrinter = useMemo(
    () => selectCurrentPlatformPrinter(devices, capabilities),
    [capabilities, devices],
  );
  const sectorDevices = useMemo(() => stations.map((station) => ({
    station,
    device: devices.find((device) => device.stationId === station.id && !device.isPrimary && isPrinterDeviceCompatible(device, capabilities)) ?? null,
  })), [capabilities, devices, stations]);
  const spoolerDevice = useMemo(
    () => selectSpoolerDevice(devices, capabilities),
    [capabilities, devices],
  );

  const printWithAdapter = useCallback(async (device: PrinterDevice, content: string) => {
    if (!device.address) throw new Error('Endereço da impressora ausente.');
    if (device.connectionType === 'BLUETOOTH_SPP' && capabilities.bluetooth) {
      await printTicketViaBluetooth(device.address, toBluetoothPayload(content));
      return;
    }
    if (device.connectionType === 'QZ_TRAY' && capabilities.qz) {
      await printTextViaQz(device.address, content);
      setQzAvailable(true);
      return;
    }
    throw new Error('Método de impressão indisponível nesta plataforma.');
  }, [capabilities.bluetooth, capabilities.qz]);

  useEffect(() => {
    if (!spoolerDevice) {
      setSpoolerState('stopped');
      return;
    }

    const poller = new PrintingPoller(async () => {
      const { data: job } = await api.post<PrintJobDTO | null>('/printing/spooler/next', { printerDeviceId: spoolerDevice.id });
      if (!job) {
        setSpoolerState('running');
        return;
      }

      setSpoolerState('printing');
      try {
        await printWithAdapter(spoolerDevice, job.content);
        await api.post(`/printing/spooler/${job.id}/ack`, { printerDeviceId: spoolerDevice.id });
        setFeedback('Impressão concluída.');
        setSpoolerState('running');
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        await api.post(`/printing/spooler/${job.id}/fail`, { printerDeviceId: spoolerDevice.id, errorMessage: detail });
        setFeedback(humanizePrintingError(error));
        setTechnicalDetail(detail);
        setSpoolerState('attention');
      }
    }, POLLING_INTERVAL_MS, (error) => {
      const now = Date.now();
      if (now - lastPollingErrorAtRef.current < 30000) return;
      lastPollingErrorAtRef.current = now;
      setFeedback('A impressão automática requer atenção. Uma nova tentativa será feita em instantes.');
      setTechnicalDetail(error instanceof Error ? error.message : String(error));
      setSpoolerState('attention');
    });

    setSpoolerState('running');
    poller.start();
    return () => {
      poller.stop();
      setSpoolerState('stopped');
    };
  }, [printWithAdapter, spoolerDevice, user?.tenant?.id]);

  const closeSetup = useCallback(() => setSetupOpen(false), []);

  const openSetup = () => {
    setTechnicalDetail('');
    if (capabilities.platform === 'mobile-web') {
      setFeedback('Neste dispositivo, use a impressão do navegador.');
      return;
    }
    setSetupOpen(true);
  };

  const browserPrint = () => {
    const opened = printThermalText(buildTestContent(user?.tenant?.name ?? 'Loja'), { title: 'Teste de impressão' });
    setFeedback(opened ? 'Tela de impressão aberta.' : 'Não foi possível abrir a tela de impressão. Permita pop-ups e tente novamente.');
  };

  const savePrinter = async (payload: CreateDevicePayload) => {
    await createDevice.mutateAsync(payload);
    setFeedback('Impressora configurada.');
  };

  const testDraftPrinter = async (method: 'bluetooth' | 'qz', printer: { name: string; address: string }) => {
    const content = buildTestContent(printer.name);
    if (method === 'bluetooth') {
      await printTicketViaBluetooth(printer.address, toBluetoothPayload(content));
    } else {
      await printTextViaQz(printer.address, content);
      setQzAvailable(true);
    }
  };

  const testDevice = async (device: PrinterDevice) => {
    await testPrintGuardRef.current.run(async () => {
      setTestingDeviceId(device.id);
      setFeedback('Impressão em andamento…');
      setTechnicalDetail('');
      try {
        const station = stations.find((item) => item.id === device.stationId);
        if ((device.connectionType === 'BLUETOOTH_SPP' && capabilities.bluetooth)
          || (device.connectionType === 'QZ_TRAY' && capabilities.qz)) {
          await printWithAdapter(device, buildTestContent(device.name, station?.name));
        } else {
          await testPrint.mutateAsync({
            stationSlug: device.isPrimary ? 'MAIN' : station?.slug ?? 'MAIN',
            deviceName: device.name,
            requestId: newRequestId(),
          });
        }
        setFeedback('Teste concluído. Confira o papel impresso.');
      } catch (error) {
        setFeedback(`Falha no teste. ${humanizePrintingError(error)}`);
        setTechnicalDetail(error instanceof Error ? error.message : String(error));
      } finally {
        setTestingDeviceId(null);
      }
    });
  };

  const toggleAutoPrint = async (device: PrinterDevice) => {
    try {
      await updateDevice.mutateAsync({ id: device.id, payload: { autoPrintEnabled: !device.autoPrintEnabled } });
      setFeedback(device.autoPrintEnabled ? 'Impressão automática desativada.' : 'Impressão automática ativada.');
    } catch (error) {
      setFeedback(humanizePrintingError(error));
      setTechnicalDetail(error instanceof Error ? error.message : String(error));
    }
  };

  const mainRuntime = spoolerState === 'printing'
    ? 'printing'
    : spoolerState === 'attention'
      ? 'attention'
      : qzAvailable && mainPrinter?.connectionType === 'QZ_TRAY'
        ? 'available'
        : 'idle';

  return (
    <main className="mx-auto max-w-5xl overflow-x-hidden px-3 py-4 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:px-6 sm:py-6 lg:px-8">
      <header className="mb-6">
        <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-bold uppercase tracking-[0.2em] text-primary"><Printer className="h-3.5 w-3.5" />Impressoras</div>
        <h1 className="mt-3 text-3xl font-black tracking-tight text-foreground sm:text-4xl">Impressão de pedidos</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground sm:text-base">Configure onde os pedidos serão impressos. As opções disponíveis são adaptadas a este dispositivo.</p>
      </header>

      <div className="space-y-6">
        <PrinterOverviewCard
          device={mainPrinter}
          status={getPrinterUiStatus(mainPrinter, mainRuntime)}
          testing={testingDeviceId === mainPrinter?.id}
          onConfigure={openSetup}
          onTest={() => mainPrinter && void testDevice(mainPrinter)}
          onToggleAutoPrint={() => mainPrinter && void toggleAutoPrint(mainPrinter)}
        />

        {capabilities.browserPrint ? (
          <section className="flex flex-col gap-4 rounded-[2rem] border border-border bg-card p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:p-6">
            <div><h2 className="text-lg font-black text-foreground">Imprimir neste dispositivo</h2><p className="mt-1 text-sm text-muted-foreground">O navegador abrirá a tela de impressão do aparelho.</p></div>
            <button type="button" onClick={browserPrint} className="min-h-11 shrink-0 rounded-xl border border-primary/30 bg-primary/10 px-4 py-2.5 text-sm font-black text-primary">Imprimir pelo navegador</button>
          </section>
        ) : null}

        {sectorDevices.length > 0 ? (
          <section className="rounded-[2rem] border border-border bg-card p-5 shadow-sm sm:p-6">
            <div className="mb-4"><h2 className="text-xl font-black text-foreground">Impressoras por setor</h2><p className="mt-1 text-sm text-muted-foreground">Cozinha, bebidas, balcão ou outra área de produção.</p></div>
            <div className="grid gap-3">{sectorDevices.map(({ station, device }) => (
              <article key={station.id} className="flex flex-col gap-3 rounded-2xl border border-border bg-background p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0"><h3 className="font-black text-foreground">{station.name}</h3><p className="mt-1 truncate text-sm text-muted-foreground">{device ? `${device.name} · Configurada` : 'Não configurada'}</p></div>
                <div className="flex flex-wrap gap-2"><button type="button" onClick={openSetup} className="min-h-11 rounded-xl border border-border px-3 py-2 text-sm font-bold text-foreground">Alterar</button>{device ? <button type="button" onClick={() => void testDevice(device)} disabled={testingDeviceId !== null} className="min-h-11 rounded-xl bg-primary px-3 py-2 text-sm font-black text-primary-foreground disabled:opacity-50">{testingDeviceId === device.id ? 'Imprimindo…' : 'Imprimir teste'}</button> : null}</div>
              </article>
            ))}</div>
          </section>
        ) : null}

        <details className="rounded-[2rem] border border-border bg-card shadow-sm">
          <summary className="min-h-14 cursor-pointer list-none px-5 py-4 font-black text-foreground sm:px-6">Configurações avançadas</summary>
          <div className="space-y-4 border-t border-border px-5 py-5 sm:px-6">
            <dl className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl bg-muted/20 p-4"><dt className="text-xs font-bold uppercase tracking-[0.18em] text-muted-foreground">Papel</dt><dd className="mt-1 text-sm font-bold text-foreground">{mainPrinter?.paperWidth ? `${mainPrinter.paperWidth} mm` : '58 mm'}</dd></div>
              <div className="rounded-2xl bg-muted/20 p-4"><dt className="text-xs font-bold uppercase tracking-[0.18em] text-muted-foreground">Tecnologia</dt><dd className="mt-1 text-sm font-bold text-foreground">{mainPrinter?.connectionType === 'QZ_TRAY' ? 'Serviço de impressão do computador' : mainPrinter?.connectionType === 'BLUETOOTH_SPP' ? 'Bluetooth' : 'Não configurada'}</dd></div>
              <div className="rounded-2xl bg-muted/20 p-4"><dt className="text-xs font-bold uppercase tracking-[0.18em] text-muted-foreground">Impressão automática</dt><dd className="mt-1 text-sm font-bold text-foreground">{spoolerDevice ? `${spoolerState === 'attention' ? 'Requer atenção' : 'Em execução'} · ${POLLING_INTERVAL_MS} ms` : 'Parada'}</dd></div>
              {capabilities.qz ? <div className="rounded-2xl bg-muted/20 p-4"><dt className="text-xs font-bold uppercase tracking-[0.18em] text-muted-foreground">Ajuda técnica</dt><dd className="mt-1 text-sm font-bold text-foreground">Requer o QZ Tray instalado e aberto neste computador.</dd></div> : null}
            </dl>
            {mainPrinter?.address ? <details className="rounded-2xl border border-border p-4 text-sm"><summary className="cursor-pointer font-bold text-foreground">Ver detalhes técnicos</summary><p className="mt-2 break-all text-muted-foreground">Endereço: {mainPrinter.address}</p></details> : null}
          </div>
        </details>

        <div aria-live="polite" className="flex min-h-12 items-start gap-3 rounded-2xl border border-border bg-muted/20 p-4 text-sm text-muted-foreground"><Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" /><span>{feedback || (spoolerDevice ? 'Impressão automática em execução.' : 'Configure uma impressora compatível para ativar a impressão automática.')}</span></div>
        {technicalDetail ? <details className="rounded-2xl border border-border bg-card p-4 text-sm"><summary className="cursor-pointer font-bold text-foreground">Ver detalhes técnicos do último erro</summary><p className="mt-2 break-words text-muted-foreground">{technicalDetail}</p></details> : null}
      </div>

      {setupOpen ? <PrinterSetupDialog capabilities={capabilities} stations={stations} onClose={closeSetup} onSave={savePrinter} onTest={testDraftPrinter} onBrowserPrint={browserPrint} /> : null}
    </main>
  );
}
