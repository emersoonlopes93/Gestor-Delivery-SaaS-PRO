import { useState, useEffect, useRef } from 'react';
import { Printer, RefreshCw, Play, Square, AlertTriangle, Monitor, Plus, Settings, CheckCircle2, Loader2 } from 'lucide-react';
import { api } from '../../lib/api-client';
import { 
  usePrintingStations, 
  usePrinterDevices, 
  useCreateDevice,
  useUpdateDevice,
  useTestPrint,
  type PrinterDevice
} from '../../hooks/usePrinting';
import { connectBluetoothPrinter, requestBluetoothPermissions, scanBluetoothDevices, printTicketViaBluetooth, isNativeAndroid } from '../../lib/bluetooth';
import { EscPosBuilder } from '../../lib/escpos58';
import { connectQzTray, listQzPrinters, printTextViaQz } from '../../lib/qz-tray-client';
import { useAuthStore } from '../../stores/auth.store';

interface PrintJobDTO {
  id: string;
  content: string;
}

function getRequestErrorMessage(error: unknown) {
  const fallback = error instanceof Error ? error.message : String(error);
  const response = (error as { response?: { status?: number; data?: { message?: string | string[] } } })?.response;
  const message = response?.data?.message;
  const text = Array.isArray(message) ? message.join(', ') : message;

  return response?.status
    ? `HTTP ${response.status}${text ? ` - ${text}` : ''}`
    : fallback;
}

export function PrinterSettings() {
  const [logs, setLogs] = useState<string[]>([]);
  const [selectedStation, setSelectedStation] = useState<string>('');
  const [selectedDevice, setSelectedDevice] = useState<string>('');
  const [printerRole, setPrinterRole] = useState<'primary' | 'station'>('primary');
  const [isSpoolerRunning, setIsSpoolerRunning] = useState(false);
  const [pollingInterval, setPollingInterval] = useState<number>(3000);
  const [isScanning, setIsScanning] = useState(false);
  const [pairedDevices, setPairedDevices] = useState<{name: string, address: string}[]>([]);
  const [bluetoothError, setBluetoothError] = useState('');
  const [lastBluetoothAction, setLastBluetoothAction] = useState('');
  const [selectedBluetoothDevice, setSelectedBluetoothDevice] = useState<{name: string, address: string} | null>(null);
  const [connectedBluetoothDevice, setConnectedBluetoothDevice] = useState<{name: string, address: string} | null>(null);
  const [isConnectingBluetooth, setIsConnectingBluetooth] = useState(false);
  const [bluetoothConnectionError, setBluetoothConnectionError] = useState('');
  const [activePrinterDevice, setActivePrinterDevice] = useState<PrinterDevice | null>(null);
  const [isSavingDevice, setIsSavingDevice] = useState(false);
  const [testPrintStatus, setTestPrintStatus] = useState('');
  const [stationLoadMessage, setStationLoadMessage] = useState('');
  const [autoPrintEnabled, setAutoPrintEnabled] = useState(false);
  const [qzPrinterNames, setQzPrinterNames] = useState<string[]>([]);
  const [isQzConnecting, setIsQzConnecting] = useState(false);
  const [qzStatus, setQzStatus] = useState('');
  const [qzError, setQzError] = useState('');
  const isNative = isNativeAndroid();
  const { user } = useAuthStore();

  const {
    data: stations = [],
    isLoading: stationsLoading,
    error: stationsError,
    refetch: refetchStations,
  } = usePrintingStations();
  const { data: devices = [] } = usePrinterDevices();
  const createDevice = useCreateDevice();
  const updateDevice = useUpdateDevice();
  const testPrint = useTestPrint();
  const selectedPrinterDevice = devices.find((device) => device.id === selectedDevice);
  const selectedDeviceCanAutoPrint =
    !!selectedPrinterDevice?.autoPrintEnabled &&
    ((isNative && selectedPrinterDevice.connectionType === 'BLUETOOTH_SPP') ||
      (!isNative && selectedPrinterDevice.connectionType === 'QZ_TRAY'));

  const spoolerRef = useRef<{ running: boolean }>({ running: false });

  // Update selected defaults when data loads
  useEffect(() => {
    if (stations.length > 0 && !selectedStation) {
      const savedStation = localStorage.getItem('printing.selectedStation');
      setSelectedStation(savedStation || stations[0].slug);
    }
    if (devices.length > 0 && !selectedDevice) {
      const savedDevice = localStorage.getItem('printing.selectedDevice');
      setSelectedDevice(savedDevice || devices[0].id);
    }
  }, [stations, devices, selectedStation, selectedDevice]);

  useEffect(() => {
    if (printerRole === 'station' && stations.length === 0) {
      setStationLoadMessage('');
      return;
    }

    if (stations.length === 1 && stations[0].slug === 'general') {
      setStationLoadMessage('Estação padrão Geral / Balcão criada.');
      return;
    }

    setStationLoadMessage('Estações carregadas a partir dos setores do KDS.');
  }, [stations]);

  useEffect(() => {
    localStorage.setItem('printing.selectedStation', selectedStation);
  }, [selectedStation]);

  useEffect(() => {
    localStorage.setItem('printing.selectedDevice', selectedDevice);
  }, [selectedDevice]);

  useEffect(() => {
    localStorage.setItem('printing.printerRole', printerRole);
  }, [printerRole]);

  useEffect(() => {
    if (selectedPrinterDevice) {
      setAutoPrintEnabled(selectedPrinterDevice.autoPrintEnabled === true);
    }
  }, [selectedPrinterDevice]);

  useEffect(() => {
    spoolerRef.current.running = isSpoolerRunning;
  }, [isSpoolerRunning]);

  const addLog = (msg: string) => {
    setLogs(prev => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...prev].slice(0, 50));
  };

  const handleScanBluetooth = async () => {
    return handleScanBluetoothWithFeedback();
    if (!isNative) {
      addLog('Escaneamento Bluetooth só funciona no App nativo Android.');
      return;
    }
    setIsScanning(true);
    addLog('Buscando dispositivos pareados...');
    try {
      const result = await scanBluetoothDevices();
      setPairedDevices(result);
      addLog(`Encontrado(s) ${result.length} dispositivo(s).`);
    } catch (e) {
      addLog('Erro ao buscar dispositivos Bluetooth.');
    } finally {
      setIsScanning(false);
    }
  };

  const handleScanBluetoothWithFeedback = async () => {
    setBluetoothError('');
    setPairedDevices([]);
    setLastBluetoothAction('Iniciando busca Bluetooth');

    if (!isNative) {
      const message = 'Bluetooth SPP só funciona no app Android.';
      setBluetoothError(message);
      setLastBluetoothAction(message);
      addLog(message);
      return;
    }

    setIsScanning(true);

    try {
      setLastBluetoothAction('Solicitando permissões Bluetooth...');
      addLog('Solicitando permissões Bluetooth...');
      await requestBluetoothPermissions();

      setLastBluetoothAction('Buscando dispositivos pareados...');
      addLog('Buscando dispositivos pareados...');
      const result = await scanBluetoothDevices();
      setPairedDevices(result);

      if (result.length === 0) {
        const message = 'Nenhum dispositivo pareado encontrado. Pareie a impressora nas configurações do Android primeiro.';
        setLastBluetoothAction(message);
        addLog(message);
      } else {
        setLastBluetoothAction(`Encontrado(s) ${result.length} dispositivo(s) pareado(s).`);
        addLog(`Encontrado(s) ${result.length} dispositivo(s).`);
      }
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Erro ao buscar dispositivos Bluetooth.';
      setBluetoothError(message);
      setLastBluetoothAction('Erro ao buscar dispositivos Bluetooth.');
      addLog(`Erro ao buscar dispositivos Bluetooth: ${message}`);
    } finally {
      setIsScanning(false);
    }
  };

  const handleAddAndConnectBluetoothDevice = async (btDevice: {name: string, address: string}) => {
    setSelectedBluetoothDevice(btDevice);
    setBluetoothConnectionError('');
    setBluetoothError('');
    setTestPrintStatus('');
    setActivePrinterDevice(null);

    if (stations.length === 0) {
      setIsConnectingBluetooth(true);
      setLastBluetoothAction(`Conectando em ${btDevice.name}...`);
      addLog(`Conectando em ${btDevice.name} (${btDevice.address})...`);

      try {
        await connectBluetoothPrinter(btDevice.address);
        setConnectedBluetoothDevice(btDevice);
        const message = 'Bluetooth conectado. Nenhuma estação de impressão foi carregada; teste local liberado, salvamento para auto-print pendente.';
        setBluetoothConnectionError(message);
        setLastBluetoothAction(message);
        addLog(message);
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : 'Falha ao conectar via Bluetooth.';
        setBluetoothConnectionError(`Falha ao conectar: ${message}`);
        setLastBluetoothAction(`Falha ao conectar em ${btDevice.name}.`);
        addLog(`Falha ao conectar em ${btDevice.name}: ${message}`);
      } finally {
        setIsConnectingBluetooth(false);
      }
      return;
    }

    const station = printerRole === 'station'
      ? stations.find(s => s.slug === selectedStation) ?? stations[0]
      : null;
    if (printerRole === 'station' && !station) {
      const message = 'Nenhuma estação de impressão encontrada. Crie/carregue uma estação antes de salvar a impressora.';
      setBluetoothConnectionError(message);
      setLastBluetoothAction(message);
      addLog(message);
      return;
    }

    setIsConnectingBluetooth(true);
    setLastBluetoothAction(`Conectando em ${btDevice.name}...`);
    addLog(`Conectando em ${btDevice.name} (${btDevice.address})...`);

    try {
      await connectBluetoothPrinter(btDevice.address);
      setConnectedBluetoothDevice(btDevice);
      setLastBluetoothAction(`Conectado em ${btDevice.name}. Salvando dispositivo...`);
      addLog(`Conectado em ${btDevice.name}.`);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Falha ao conectar via Bluetooth.';
      setBluetoothConnectionError(`Falha ao conectar: ${message}`);
      setLastBluetoothAction(`Falha ao conectar em ${btDevice.name}.`);
      addLog(`Falha ao conectar em ${btDevice.name}: ${message}`);
      setIsConnectingBluetooth(false);
      return;
    }

    setIsSavingDevice(true);

    try {
      const savedDevice = await createDevice.mutateAsync({
        name: btDevice.name,
        address: btDevice.address,
        connectionType: 'BLUETOOTH_SPP',
        stationId: station?.id ?? null,
        isDefault: printerRole === 'primary',
        isPrimary: printerRole === 'primary',
        role: printerRole === 'primary' ? 'primary_order' : 'station',
        purpose: printerRole === 'primary' ? 'main_receipt' : 'production_ticket',
        autoPrintEnabled,
      });
      setActivePrinterDevice(savedDevice);
      setSelectedDevice(savedDevice.id);
      if (station) setSelectedStation(station.slug);
      setLastBluetoothAction(
        printerRole === 'primary'
          ? 'Dispositivo salvo como impressora principal.'
          : 'Dispositivo salvo como impressora de setor.'
      );
      addLog(
        printerRole === 'primary'
          ? `Dispositivo ${btDevice.name} salvo como impressora principal.`
          : `Dispositivo ${btDevice.name} salvo como impressora de setor.`
      );
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      setBluetoothConnectionError(`Bluetooth conectado, mas falhou ao salvar no servidor: ${message}`);
      setLastBluetoothAction('Bluetooth conectado, mas falhou ao salvar no servidor.');
      addLog(`Falha ao salvar dispositivo: ${message}`);
    } finally {
      setIsSavingDevice(false);
      setIsConnectingBluetooth(false);
    }
  };

  const handleSavePrinterConfiguration = async () => {
    if (!selectedDevice) {
      addLog('Selecione um dispositivo para salvar.');
      return;
    }

    const device = devices.find((d) => d.id === selectedDevice);
    if (!device) {
      addLog('Dispositivo selecionado não encontrado.');
      return;
    }

    if (printerRole === 'station' && !selectedStation) {
      addLog('Selecione uma estação para salvar a impressora de setor.');
      return;
    }

    const station = printerRole === 'station'
      ? stations.find((s) => s.slug === selectedStation)
      : null;

    setIsSavingDevice(true);
    try {
      const updated = await updateDevice.mutateAsync({
        id: device.id,
        payload: {
          stationId: station?.id ?? null,
          isDefault: printerRole === 'primary',
          isPrimary: printerRole === 'primary',
          role: printerRole === 'primary' ? 'primary_order' : 'station',
          purpose: printerRole === 'primary' ? 'main_receipt' : 'production_ticket',
          autoPrintEnabled,
        },
      });

      setActivePrinterDevice(updated);
      setLastBluetoothAction(
        printerRole === 'primary'
          ? 'Impressora principal salva.'
          : 'Impressora de setor salva.'
      );
      addLog(
        printerRole === 'primary'
          ? `Impressora principal salva: ${updated.name}.`
          : `Impressora de setor salva: ${updated.name}.`
      );
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      setBluetoothConnectionError(`Falha ao salvar configuração: ${message}`);
      addLog(`Falha ao salvar configuração: ${message}`);
    } finally {
      setIsSavingDevice(false);
    }
  };

  const handleConnectQzTray = async () => {
    setQzError('');
    setQzStatus('Conectando ao QZ Tray...');
    setIsQzConnecting(true);

    try {
      await connectQzTray();
      setQzStatus('QZ Tray conectado. Buscando impressoras do Windows...');
      const printers = await listQzPrinters();
      setQzPrinterNames(printers);
      setQzStatus(printers.length > 0 ? `Encontrada(s) ${printers.length} impressora(s).` : 'QZ conectado, mas nenhuma impressora foi retornada.');
      addLog(`QZ Tray conectado. Impressoras encontradas: ${printers.length}.`);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      setQzError(message);
      setQzStatus('Falha ao conectar/listar impressoras via QZ Tray.');
      addLog(`Falha no QZ Tray: ${message}`);
    } finally {
      setIsQzConnecting(false);
    }
  };

  const handleAddQzPrinter = async (printerName: string) => {
    setQzError('');
    setQzStatus(`Salvando impressora ${printerName}...`);

    const station = printerRole === 'station'
      ? stations.find(s => s.slug === selectedStation) ?? stations[0]
      : null;
    if (printerRole === 'station' && !station) {
      const message = 'Selecione uma estacao antes de salvar a impressora QZ de setor.';
      setQzError(message);
      addLog(message);
      return;
    }

    setIsSavingDevice(true);
    try {
      const savedDevice = await createDevice.mutateAsync({
        name: printerName,
        address: printerName,
        connectionType: 'QZ_TRAY',
        stationId: station?.id ?? null,
        isDefault: printerRole === 'primary',
        isPrimary: printerRole === 'primary',
        role: printerRole === 'primary' ? 'primary_order' : 'station',
        purpose: printerRole === 'primary' ? 'main_receipt' : 'production_ticket',
        autoPrintEnabled,
      });
      setActivePrinterDevice(savedDevice);
      setSelectedDevice(savedDevice.id);
      if (station) setSelectedStation(station.slug);
      setQzStatus(`Impressora QZ salva: ${printerName}.`);
      addLog(`Impressora QZ salva: ${printerName}.`);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      setQzError(`Falha ao salvar impressora QZ: ${message}`);
      addLog(`Falha ao salvar impressora QZ: ${message}`);
    } finally {
      setIsSavingDevice(false);
    }
  };

  const handleLocalQzTestPrint = async (printerName?: string | null) => {
    const targetPrinter = printerName || selectedPrinterDevice?.address || selectedPrinterDevice?.name;
    if (!targetPrinter) {
      const message = 'Selecione uma impressora QZ antes do teste.';
      setTestPrintStatus(message);
      addLog(message);
      return;
    }

    setTestPrintStatus(`Imprimindo teste via QZ em ${targetPrinter}...`);
    addLog(`Imprimindo teste QZ em ${targetPrinter}...`);

    try {
      await printTextViaQz(targetPrinter, [
        'GESTOR PRO',
        'TESTE DE IMPRESSAO QZ',
        '',
        `Loja: ${user?.tenant?.name || 'Loja'}`,
        `Impressora: ${targetPrinter}`,
        `Data: ${new Date().toLocaleString('pt-BR')}`,
        '',
        'QZ TRAY OK',
      ].join('\n'));
      setTestPrintStatus('Teste QZ enviado com sucesso.');
      addLog('Teste QZ enviado com sucesso.');
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      setTestPrintStatus(`Falha no teste QZ: ${message}`);
      addLog(`Falha no teste QZ: ${message}`);
    }
  };

  const handleLocalBluetoothTestPrint = async () => {
    const btDevice = connectedBluetoothDevice ?? selectedBluetoothDevice;
    if (!btDevice) {
      const message = 'Selecione e conecte uma impressora Bluetooth antes do teste local.';
      setTestPrintStatus(message);
      addLog(message);
      return;
    }

    setTestPrintStatus(`Imprimindo teste em ${btDevice.name}...`);
    addLog(`Imprimindo teste local em ${btDevice.name}...`);

    try {
      const builder = new EscPosBuilder();
      builder
        .alignCenter()
        .boldOn()
        .textLine('GESTOR PRO')
        .boldOff()
        .textLine('TESTE DE IMPRESSAO')
        .textLine('')
        .alignLeft()
        .textLine(`Loja: ${user?.tenant?.name || 'Loja'}`)
        .textLine(`Dispositivo: ${btDevice.name}`)
        .textLine(`Data: ${new Date().toLocaleString('pt-BR')}`)
        .textLine('')
        .textLine('Bluetooth OK')
        .feed(3)
        .cut();

      const payload = builder.build();
      const payloadStr = String.fromCharCode(...payload);
      await printTicketViaBluetooth(btDevice.address, payloadStr);
      setTestPrintStatus('Teste de impressão enviado com sucesso.');
      addLog('Teste de impressão local enviado com sucesso.');
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Falha no teste de impressão local.';
      setTestPrintStatus(`Falha no teste: ${message}`);
      addLog(`Falha no teste de impressão local: ${message}`);
    }
  };

  const handleCreateDevice = async (btDevice: {name: string, address: string}) => {
    return handleAddAndConnectBluetoothDevice(btDevice);
    if (!selectedStation) {
      addLog('Selecione uma estação primeiro!');
      return;
    }
    try {
      const station = stations.find(s => s.slug === selectedStation);
      await createDevice.mutateAsync({
        name: btDevice.name,
        address: btDevice.address,
        connectionType: 'BLUETOOTH_SPP',
        stationId: station!.id,
      });
      addLog(`Dispositivo ${btDevice.name} cadastrado com sucesso!`);
    } catch (e) {
      addLog(`Erro ao cadastrar dispositivo: ${e}`);
    }
  };

  const handleTestPrint = async () => {
    if ((printerRole === 'station' && !selectedStation) || !selectedDevice) {
      addLog(printerRole === 'station' ? 'Selecione estação e dispositivo.' : 'Selecione a impressora principal.');
      return;
    }
    try {
      const device = devices.find(d => d.id === selectedDevice);
      // Cria job de teste
      await testPrint.mutateAsync({ 
        stationSlug: printerRole === 'primary' ? 'MAIN' : selectedStation, 
        deviceName: device?.name || 'Desconhecido' 
      });
      addLog('Job de teste enviado para a nuvem.');
      
      // Se estamos no Android, podemos tentar imprimir na hora ou deixar o spooler pegar.
      // O spooler pegaria no próximo tick.
    } catch (e) {
      addLog('Erro ao solicitar teste.');
    }
  };

  // Spooler local: Android usa Bluetooth SPP; navegador/Windows usa QZ Tray.
  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    const poll = async () => {
      if (!spoolerRef.current.running) return;

      if (!selectedDevice) {
        addLog('Erro: Nenhum dispositivo selecionado para o spooler.');
        setIsSpoolerRunning(false);
        return;
      }

      const device = devices.find(d => d.id === selectedDevice);
      if (!device || !device.address) {
        addLog('Erro: Dispositivo invalido ou sem endereco de impressora.');
        setIsSpoolerRunning(false);
        return;
      }

      if (!device.autoPrintEnabled) {
        addLog('Auto-Print esta desativado para este dispositivo.');
        setIsSpoolerRunning(false);
        return;
      }

      const isBluetoothDevice = device.connectionType === 'BLUETOOTH_SPP';
      const isQzDevice = device.connectionType === 'QZ_TRAY';

      if (isBluetoothDevice && !isNative) {
        addLog('Esta impressora Bluetooth so imprime automaticamente no app Android.');
        setIsSpoolerRunning(false);
        return;
      }

      if (!isBluetoothDevice && !isQzDevice) {
        addLog(`Tipo de impressora sem spooler local: ${device.connectionType}.`);
        setIsSpoolerRunning(false);
        return;
      }

      try {
        const res = await api.post<PrintJobDTO | null>('/printing/spooler/next', { printerDeviceId: device.id });
        const job = res.data;

        if (job && job.id) {
          addLog(`Job #${job.id} recebido. Tentando imprimir...`);

          try {
            if (isQzDevice) {
              await printTextViaQz(device.address, job.content);
            } else {
              const builder = new EscPosBuilder();
              builder.alignCenter().boldOn().textLine('--- TICKET ---').boldOff().alignLeft();
              builder.textLine(job.content).feed(3).cut();
              const payload = builder.build();
              const payloadStr = String.fromCharCode.apply(null, payload);
              await printTicketViaBluetooth(device.address, payloadStr);
            }

            await api.post(`/printing/spooler/${job.id}/ack`, { printerDeviceId: device.id });
            addLog(`Job #${job.id} impresso e finalizado (ACK).`);
          } catch (printErr: unknown) {
            const msg = printErr instanceof Error ? printErr.message : 'Erro';
            addLog(`Falha na impressora fisica: ${msg}`);
            await api.post(`/printing/spooler/${job.id}/fail`, {
              printerDeviceId: device.id,
              errorMessage: msg,
            });
          }
        }
      } catch (err: unknown) {
        const res = err as { response?: { status?: number } };
        if (res.response?.status !== 404) {
          console.error(err);
        }
      }

      if (spoolerRef.current.running) {
        timeoutId = setTimeout(poll, pollingInterval);
      }
    };

    if (isSpoolerRunning) {
      if (!selectedDeviceCanAutoPrint) {
        addLog('Selecione uma impressora compativel e ative a opcao Auto-Print antes de iniciar.');
        setIsSpoolerRunning(false);
        return;
      }
      addLog(`Auto-Print iniciado no device ID: ${selectedDevice}`);
      poll();
    } else {
      addLog('Spooler parado.');
    }

    return () => {
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [isSpoolerRunning, selectedDevice, selectedDeviceCanAutoPrint, pollingInterval, isNative, devices]);

  return (
    <div className="p-8 max-w-6xl mx-auto animate-in fade-in duration-500">
      <header className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-foreground flex items-center gap-3">
            <div className="p-2 bg-primary-600 rounded-xl text-white shadow-lg shadow-primary-600/20">
              <Printer className="w-6 h-6" />
            </div>
            Gestão de Impressoras (P1.1)
          </h1>
          <p className="text-muted-foreground mt-1 font-medium">
            Gerencie suas estações de produção e dispositivos de impressão nativos.
          </p>
        </div>
      </header>

      {!isNative && (
        <div className="mb-6 p-4 bg-status-warning/10 border-l-4 border-status-warning rounded-r-lg flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-status-warning mt-0.5" />
          <div className="text-sm text-status-warning-800 dark:text-status-warning-400">
            <strong>Modo Navegador Web:</strong> Bluetooth SPP direto continua exclusivo do app Android. No computador, use QZ Tray aberto para listar impressoras do Windows e ativar Auto-Print via USB/driver local.
          </div>
        </div>
      )}

      <div className="grid lg:grid-cols-3 gap-8">
        <div className="lg:col-span-1 space-y-6">
          <section className="bg-card dark:bg-muted900 rounded-3xl border border-border dark:border-border800 p-6 shadow-sm">
            <h2 className="text-sm font-black uppercase tracking-widest text-muted-foreground mb-6 flex items-center gap-2">
              <Settings className="w-4 h-4" />
              Estação & Dispositivo
            </h2>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">Tipo de impressora</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setPrinterRole('primary')}
                  className={`rounded-xl border px-3 py-3 text-left transition-all shadow-sm ${
                      printerRole === 'primary'
                        ? 'border-primary bg-card text-foreground ring-1 ring-primary/20'
                        : 'border-border bg-background text-foreground hover:bg-muted/50'
                    }`}
                  >
                    <span className="block text-xs font-black uppercase tracking-widest">Principal</span>
                    <span className="mt-1 block text-[11px] font-semibold leading-snug">Comanda completa do pedido</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setPrinterRole('station')}
                  className={`rounded-xl border px-3 py-3 text-left transition-all shadow-sm ${
                      printerRole === 'station'
                        ? 'border-primary bg-card text-foreground ring-1 ring-primary/20'
                        : 'border-border bg-background text-foreground hover:bg-muted/50'
                    }`}
                  >
                    <span className="block text-xs font-black uppercase tracking-widest">Setor</span>
                    <span className="mt-1 block text-[11px] font-semibold leading-snug">Ticket de produção</span>
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">Estação de Trabalho Ativa</label>
                <select 
                  value={selectedStation}
                  onChange={(e) => setSelectedStation(e.target.value)}
                  disabled={printerRole === 'primary'}
                  className="w-full bg-background dark:bg-muted900 border border-border dark:border-border700 rounded-xl px-4 py-3 text-sm font-bold text-foreground focus:ring-2 focus:ring-primary/20 outline-none transition-all"
                >
                  <option value="">-- Selecione a Estação --</option>
                  {stations.map(st => (
                    <option key={st.id} value={st.slug}>{st.name}</option>
                  ))}
                </select>
                {stationsLoading && (
                  <p className="mt-2 text-xs font-medium text-muted-foreground">
                    Carregando estações de impressão...
                  </p>
                )}
                {stationLoadMessage && (
                  <p className="mt-2 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                    {stationLoadMessage}
                  </p>
                )}
                {stationsError && (
                  <div className="mt-3 rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-xs font-bold text-destructive">
                    Falha ao carregar estações: {getRequestErrorMessage(stationsError)}
                  </div>
                )}
                {!stationsLoading && stations.length === 0 && (
                  <button
                    type="button"
                    onClick={() => refetchStations()}
                    className="mt-3 w-full rounded-xl border border-dashed border-border bg-background px-4 py-2 text-xs font-bold text-foreground transition-colors hover:bg-muted100 dark:hover:bg-muted800"
                  >
                    Recarregar estações
                  </button>
                )}
              </div>

              <div>
                <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">Dispositivo Padrão (Físico)</label>
                <select 
                  value={selectedDevice}
                  onChange={(e) => setSelectedDevice(e.target.value)}
                  className="w-full bg-background dark:bg-muted900 border border-border dark:border-border700 rounded-xl px-4 py-3 text-sm font-bold text-foreground focus:ring-2 focus:ring-primary/20 outline-none transition-all"
                >
                  <option value="">-- Nenhum --</option>
                  {devices.filter(d => {
                    if (printerRole === 'primary') return d.isPrimary;
                    return !selectedStation || d.stationId === stations.find(s => s.slug === selectedStation)?.id;
                  }).map(d => (
                    <option key={d.id} value={d.id}>{d.name} ({d.address}){d.isPrimary ? ' - principal' : ''}</option>
                  ))}
                </select>
                {selectedPrinterDevice ? (
                  <p className="mt-2 text-xs font-semibold text-muted-foreground">
                    Tipo: {selectedPrinterDevice.connectionType} {selectedPrinterDevice.autoPrintEnabled ? '- Auto-Print ativo' : '- Auto-Print desativado'}
                  </p>
                ) : null}
              </div>

              <label className="flex items-start gap-3 rounded-xl border border-border bg-muted/20 p-3 text-sm">
                <input
                  type="checkbox"
                  checked={autoPrintEnabled}
                  onChange={(event) => setAutoPrintEnabled(event.target.checked)}
                  className="mt-1 h-4 w-4 accent-primary"
                />
                <span>
                  <span className="block text-xs font-black uppercase tracking-widest text-foreground">Imprimir pedidos automaticamente</span>
                  <span className="mt-1 block text-xs font-semibold text-muted-foreground">
                    Opcional por dispositivo. Quando desligado, a impressora fica salva, mas o spooler automatico nao imprime.
                  </span>
                </span>
              </label>

              <div className="pt-2">
                <button
                  onClick={handleTestPrint}
                  className="w-full flex items-center justify-center gap-2 py-3 bg-background dark:bg-muted800 border border-border dark:border-border700 rounded-xl font-bold text-sm text-foreground hover:bg-muted100 dark:hover:bg-muted700 transition-colors"
                >
                  <Printer className="w-4 h-4" /> Testar Impressão na Nuvem
                </button>
              </div>

              <hr className="border-border dark:border-border800" />

              <div>
                <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">Intervalo de Spooler (ms)</label>
                <input 
                  type="number" 
                  value={pollingInterval}
                  onChange={(e) => setPollingInterval(Number(e.target.value))}
                  className="w-full bg-card dark:bg-muted900 border border-border dark:border-border700 rounded-xl px-4 py-3 text-sm font-bold focus:ring-2 focus:ring-primary/20 outline-none transition-all"
                />
              </div>

              <div className="pt-4">
                <button
                  type="button"
                  onClick={handleSavePrinterConfiguration}
                  disabled={isSavingDevice || !selectedDevice || (printerRole === 'station' && !selectedStation)}
                  className="w-full mb-3 flex items-center justify-center gap-2 py-3 rounded-2xl border border-primary/20 bg-primary/10 text-primary font-black uppercase tracking-widest transition-colors hover:bg-primary/15 disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {isSavingDevice ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                  Salvar configuração
                </button>
                <button
                  onClick={() => setIsSpoolerRunning(!isSpoolerRunning)}
                  disabled={!selectedDeviceCanAutoPrint}
                  className={`w-full flex items-center justify-center gap-3 py-4 rounded-2xl font-black uppercase tracking-widest transition-all shadow-lg disabled:opacity-50 disabled:cursor-not-allowed ${
                    isSpoolerRunning 
                      ? 'bg-destructive text-white shadow-destructive/20 active:scale-95' 
                      : 'bg-status-success text-white shadow-status-success/20 active:scale-95'
                  }`}
                >
                  {isSpoolerRunning ? (
                    <><Square className="w-5 h-5 fill-current" /> Parar Spooler</>
                  ) : (
                    <><Play className="w-5 h-5 fill-current" /> Iniciar Auto-Print</>
                  )}
                </button>
              </div>
            </div>
          </section>

          {!isNative && (
            <section className="bg-card dark:bg-muted900 rounded-3xl border border-border dark:border-border800 p-6 shadow-sm">
              <h2 className="text-sm font-black uppercase tracking-widest text-muted-foreground mb-4">Adicionar Impressora (QZ Tray / Windows)</h2>

              <button
                type="button"
                onClick={handleConnectQzTray}
                disabled={isQzConnecting}
                className="w-full py-3 bg-primary text-primary-foreground font-bold rounded-xl shadow mb-4 disabled:opacity-70 disabled:cursor-wait"
              >
                {isQzConnecting ? 'Conectando...' : 'Conectar e listar impressoras'}
              </button>

              <div className="mb-4 rounded-xl border border-border bg-muted/40 p-3 text-xs">
                <p className="font-black uppercase tracking-widest text-muted-foreground">Status QZ</p>
                <p className="mt-1 font-bold text-foreground">
                  {qzStatus || 'Abra o QZ Tray no Windows e clique em conectar.'}
                </p>
              </div>

              {qzError ? (
                <div className="mb-4 rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm font-bold text-destructive">
                  {qzError}
                </div>
              ) : null}

              <div className="space-y-2">
                {qzPrinterNames.map((printerName) => (
                  <div key={printerName} className="flex items-center justify-between gap-3 p-3 border border-border dark:border-border800 rounded-lg">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold">{printerName}</p>
                      <p className="text-xs text-muted-foreground">Windows / QZ Tray</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleLocalQzTestPrint(printerName)}
                        className="rounded-lg border border-border bg-background px-3 py-2 text-xs font-black uppercase tracking-widest text-foreground hover:bg-muted"
                      >
                        Testar
                      </button>
                      <button
                        type="button"
                        onClick={() => handleAddQzPrinter(printerName)}
                        disabled={isSavingDevice}
                        className="p-2 bg-primary/10 text-primary rounded-lg hover:bg-primary/20 disabled:opacity-60 disabled:cursor-wait"
                        title="Adicionar QZ"
                      >
                        {isSavingDevice ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {selectedPrinterDevice?.connectionType === 'QZ_TRAY' ? (
                <button
                  type="button"
                  onClick={() => handleLocalQzTestPrint()}
                  className="mt-4 w-full rounded-xl bg-status-success px-4 py-3 text-sm font-black uppercase tracking-widest text-white shadow"
                >
                  Testar impressora QZ selecionada
                </button>
              ) : null}

              {testPrintStatus ? (
                <p className="mt-3 text-sm font-bold text-muted-foreground">{testPrintStatus}</p>
              ) : null}
            </section>
          )}

          {isNative && (
            <section className="bg-card dark:bg-muted900 rounded-3xl border border-border dark:border-border800 p-6 shadow-sm">
              <h2 className="text-sm font-black uppercase tracking-widest text-muted-foreground mb-4">Adicionar Impressora (Android)</h2>
              <button 
                onClick={handleScanBluetooth}
                disabled={isScanning}
              className="w-full py-3 bg-primary text-primary-foreground font-bold rounded-xl shadow mb-4 disabled:opacity-70 disabled:cursor-wait"
              >
                {isScanning ? 'Buscando...' : 'Buscar Bluetooth Pareados'}
              </button>

              <div className="mb-4 rounded-xl border border-border bg-muted/40 p-3 text-xs">
                <p className="font-black uppercase tracking-widest text-muted-foreground">Última ação</p>
                <p className="mt-1 font-bold text-foreground">
                  {lastBluetoothAction || 'Aguardando busca Bluetooth.'}
                </p>
              </div>

              {bluetoothError ? (
                <div className="mb-4 rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm font-bold text-destructive">
                  {bluetoothError}
                </div>
              ) : null}
              
              <div className="space-y-2">
                {!isScanning && pairedDevices.length === 0 && lastBluetoothAction.includes('Nenhum dispositivo') ? (
                  <div className="rounded-xl border border-border bg-muted/30 p-3 text-sm font-bold text-muted-foreground">
                    Nenhum dispositivo pareado encontrado. Pareie a Goldensky nas configurações Bluetooth do Android e tente novamente.
                  </div>
                ) : null}

                {pairedDevices.map(bt => (
                  <div key={bt.address} className="flex items-center justify-between p-3 border border-border dark:border-border800 rounded-lg">
                    <div>
                      <p className="text-sm font-bold">{bt.name}</p>
                      <p className="text-xs text-muted-foreground">{bt.address}</p>
                    </div>
                    <button
                      onClick={() => handleCreateDevice(bt)}
                      disabled={isConnectingBluetooth || isSavingDevice}
                      className="p-2 bg-primary/10 text-primary rounded-lg hover:bg-primary/20 disabled:opacity-60 disabled:cursor-wait"
                      title="Adicionar e conectar"
                    >
                      {isConnectingBluetooth && selectedBluetoothDevice?.address === bt.address ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Plus className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                ))}
              </div>

              {(selectedBluetoothDevice || connectedBluetoothDevice || bluetoothConnectionError || testPrintStatus) ? (
                <div className="mt-4 space-y-3 rounded-xl border border-border bg-muted/30 p-3 text-sm">
                  {selectedBluetoothDevice ? (
                    <p className="font-bold text-foreground">
                      Selecionado: {selectedBluetoothDevice.name} ({selectedBluetoothDevice.address})
                    </p>
                  ) : null}

                  {isConnectingBluetooth ? (
                    <p className="flex items-center gap-2 font-bold text-primary">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Conectando em {selectedBluetoothDevice?.name || 'impressora'}...
                    </p>
                  ) : null}

                  {isSavingDevice ? (
                    <p className="flex items-center gap-2 font-bold text-primary">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Salvando dispositivo...
                    </p>
                  ) : null}

                  {connectedBluetoothDevice ? (
                    <p className="flex items-center gap-2 font-bold text-status-success">
                      <CheckCircle2 className="h-4 w-4" />
                      Conectado em {connectedBluetoothDevice.name}
                    </p>
                  ) : null}

                  {activePrinterDevice ? (
                    <p className="font-bold text-status-success">
                      Dispositivo salvo como impressora ativa.
                    </p>
                  ) : null}

                  {bluetoothConnectionError ? (
                    <p className="font-bold text-destructive">{bluetoothConnectionError}</p>
                  ) : null}

                  {connectedBluetoothDevice ? (
                    <button
                      type="button"
                      onClick={handleLocalBluetoothTestPrint}
                      className="w-full rounded-xl bg-status-success px-4 py-3 text-sm font-black uppercase tracking-widest text-white shadow"
                    >
                      Imprimir teste
                    </button>
                  ) : null}

                  {testPrintStatus ? (
                    <p className="font-bold text-muted-foreground">{testPrintStatus}</p>
                  ) : null}
                </div>
              ) : null}
            </section>
          )}
        </div>

        {/* Coluna Direita: Logs e Monitoramento */}
        <div className="lg:col-span-2 space-y-6">
          <section className="bg-card dark:bg-muted900 rounded-3xl border border-border dark:border-border800 flex flex-col h-[600px] shadow-sm">
            <div className="p-6 border-b border-border dark:border-border800 flex items-center justify-between bg-card/50 dark:bg-muted800/20 rounded-t-3xl">
              <h2 className="text-sm font-black uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                <RefreshCw className={`w-4 h-4 ${isSpoolerRunning ? 'animate-spin' : ''}`} />
                Logs do App Local
              </h2>
              <button 
                onClick={() => setLogs([])}
                className="text-xs font-bold text-primary hover:text-primary/90 transition-colors"
              >
                Limpar Logs
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-6 space-y-2 font-mono text-[13px]">
              {logs.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-muted-foreground opacity-50 italic">
                  <Monitor className="w-12 h-12 mb-3 stroke-[1px]" />
                  Aguardando inicialização do spooler nativo...
                </div>
              ) : (
                logs.map((log, i) => (
                  <div key={i} className={`py-1.5 px-3 rounded-lg ${
                    log.includes('ACK') ? 'bg-status-success/5 text-status-success font-bold' :
                    log.includes('Erro') || log.includes('Falha') ? 'bg-destructive/5 text-destructive font-bold' :
                    log.includes('recebido') ? 'bg-primary/5 text-primary' :
                    'text-muted-foreground'
                  }`}>
                    {log}
                  </div>
                ))
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
