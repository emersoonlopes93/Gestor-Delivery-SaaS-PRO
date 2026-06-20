import { useState, useEffect, useRef, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Printer, Monitor, Plus } from 'lucide-react';
import { api, ApiError } from '../../lib/api-client';
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

type PrintJobRecord = {
  id: string;
  createdAt: string;
  printedAt?: string | null;
  status?: string;
};

type SetupMode = 'bluetooth' | 'qz' | 'bridge';

function formatMinutesAgo(createdAt?: string | null) {
  if (!createdAt) return 'Nunca';
  const minutes = Math.floor((Date.now() - new Date(createdAt).getTime()) / 60000);
  if (!Number.isFinite(minutes) || minutes < 0) return 'Agora';
  if (minutes < 1) return 'Agora';
  if (minutes === 1) return 'hÃ¡ 1 minuto';
  return `hÃ¡ ${minutes} minutos`;
}

function getConnectionLabel(connectionType?: string | null) {
  if (!connectionType) return 'NÃ£o definido';
  if (connectionType === 'QZ_TRAY') return 'Windows / QZ Tray';
  if (connectionType === 'BLUETOOTH_SPP') return 'Bluetooth Android';
  if (connectionType === 'USB') return 'USB';
  if (connectionType === 'IP') return 'Rede';
  return connectionType;
}

function buildTestPrintContent(deviceName: string, stationLabel: string) {
  const now = new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date());

  return [
    'TESTE DE IMPRESSAO',
    `Dispositivo: ${deviceName}`,
    `Setor: ${stationLabel}`,
    `Data: ${now}`,
    '',
    'Se este ticket saiu corretamente, a impressora esta pronta.',
  ].join('\n');
}

function getFriendlyTestPrintError(device: PrinterDevice, error: unknown) {
  if (error instanceof ApiError && error.status === 500) {
    return device.isPrimary
      ? 'Nao foi possivel imprimir o teste. Verifique se ha uma impressora principal configurada e tente novamente.'
      : 'Nao foi possivel imprimir o teste. Verifique se a impressora do setor esta configurada e tente novamente.';
  }

  if (error instanceof Error && error.message) return error.message;
  if (typeof error === 'string' && error.trim()) return error;
  return 'Nao foi possivel imprimir o teste.';
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
  const [isSavingDevice, setIsSavingDevice] = useState(false);
  const [testPrintStatus, setTestPrintStatus] = useState('');
  const [autoPrintEnabled, setAutoPrintEnabled] = useState(false);
  const [qzPrinterNames, setQzPrinterNames] = useState<string[]>([]);
  const [isQzConnecting, setIsQzConnecting] = useState(false);
  const [qzStatus, setQzStatus] = useState('');
  const [qzError, setQzError] = useState('');
  const [isSetupModalOpen, setIsSetupModalOpen] = useState(false);
  const [setupMode, setSetupMode] = useState<SetupMode>('qz');
  const [setupStep, setSetupStep] = useState<1 | 2 | 3 | 4>(1);
  const [setupSelectedPrinterName, setSetupSelectedPrinterName] = useState('');
  const isNative = isNativeAndroid();
  const { user } = useAuthStore();

  const {
    data: stations = [],
  } = usePrintingStations();
  const { data: devices = [] } = usePrinterDevices();
  const createDevice = useCreateDevice();
  const updateDevice = useUpdateDevice();
  const testPrint = useTestPrint();
  const { data: printJobs = [] } = useQuery<PrintJobRecord[]>({
    queryKey: ['printing-jobs'],
    queryFn: async () => {
      const { data } = await api.get<PrintJobRecord[]>('/printing/jobs');
      return data;
    },
    refetchInterval: 30000,
    retry: false,
  });
  const selectedPrinterDevice = useMemo(
    () => devices.find((device) => device.id === selectedDevice) ?? null,
    [devices, selectedDevice],
  );
  const primaryPrinterDevice = useMemo(
    () => devices.find((device) => device.isPrimary && device.isActive) ?? null,
    [devices],
  );
  const mainPrinterDevice = primaryPrinterDevice ?? devices.find((device) => device.isPrimary) ?? null;
  const sectorDevices = useMemo(() => {
    return stations.map((station) => ({
      station,
      device: devices.find((device) => device.stationId === station.id && !device.isPrimary) ?? null,
    }));
  }, [devices, stations]);
  const lastPrintedJob = useMemo(() => {
    return [...printJobs]
      .filter((job) => job.printedAt || job.status === 'completed')
      .sort((a, b) => new Date((b.printedAt ?? b.createdAt)).getTime() - new Date((a.printedAt ?? a.createdAt)).getTime())[0] ?? null;
  }, [printJobs]);
  const selectedDeviceCanAutoPrint =
    !!selectedPrinterDevice?.autoPrintEnabled &&
    ((isNative && selectedPrinterDevice.connectionType === 'BLUETOOTH_SPP') ||
      (!isNative && selectedPrinterDevice.connectionType === 'QZ_TRAY'));
  const mainPrinterStatus = mainPrinterDevice ? 'Configurada' : 'Nao configurada';
  const autoPrintStatus = selectedDeviceCanAutoPrint ? 'Ativa' : 'Parada';
  const lastPrintStatus = formatMinutesAgo(lastPrintedJob?.printedAt ?? lastPrintedJob?.createdAt ?? null);
  const spoolerRef = useRef<{ running: boolean }>({ running: false });
  const lastSpoolerStateRef = useRef<'running' | 'stopped' | null>('stopped');

  // Update selected defaults when data loads
  useEffect(() => {
    if (!selectedStation && stations.length > 0) {
      const savedStation = localStorage.getItem('printing.selectedStation');
      const nextStation = savedStation || stations[0].slug;
      if (nextStation !== selectedStation) setSelectedStation(nextStation);
    }
    if (!selectedDevice && devices.length > 0) {
      const savedDevice = localStorage.getItem('printing.selectedDevice');
      const nextDevice = savedDevice || devices[0].id;
      if (nextDevice !== selectedDevice) setSelectedDevice(nextDevice);
    }
  }, [stations.length, devices.length, selectedStation, selectedDevice]);

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
    if (!selectedPrinterDevice) return;
    const nextAutoPrint = selectedPrinterDevice.autoPrintEnabled === true;
    setAutoPrintEnabled((current) => (current === nextAutoPrint ? current : nextAutoPrint));
  }, [selectedPrinterDevice?.id, selectedPrinterDevice?.autoPrintEnabled]);

  useEffect(() => {
    spoolerRef.current.running = isSpoolerRunning;
  }, [isSpoolerRunning]);

  const openSetup = (mode: SetupMode = 'qz') => {
    setSetupMode(mode);
    setSetupStep(1);
    setSetupSelectedPrinterName('');
    setSelectedBluetoothDevice(null);
    setConnectedBluetoothDevice(null);
    setQzError('');
    setBluetoothError('');
    setTestPrintStatus('');
    setIsSetupModalOpen(true);
  };

  const closeSetup = () => {
    setIsSetupModalOpen(false);
    setSetupStep(1);
  };

  const addLog = (msg: string) => {
    setLogs(prev => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...prev].slice(0, 50));
  };

  const handleScanBluetoothWithFeedback = async () => {
    setBluetoothError('');
    setPairedDevices([]);
    setLastBluetoothAction('Iniciando busca Bluetooth');

    if (!isNative) {
      const message = 'Bluetooth SPP sÃ³ funciona no app Android.';
      setBluetoothError(message);
      setLastBluetoothAction(message);
      addLog(message);
      return;
    }

    setIsScanning(true);

    try {
      setLastBluetoothAction('Solicitando permissÃµes Bluetooth...');
      addLog('Solicitando permissÃµes Bluetooth...');
      await requestBluetoothPermissions();

      setLastBluetoothAction('Buscando dispositivos pareados...');
      addLog('Buscando dispositivos pareados...');
      const result = await scanBluetoothDevices();
      setPairedDevices(result);

      if (result.length === 0) {
        const message = 'Nenhum dispositivo pareado encontrado. Pareie a impressora nas configuraÃ§Ãµes do Android primeiro.';
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
    if (stations.length === 0) {
      setIsConnectingBluetooth(true);
      setLastBluetoothAction(`Conectando em ${btDevice.name}...`);
      addLog(`Conectando em ${btDevice.name} (${btDevice.address})...`);

      try {
        await connectBluetoothPrinter(btDevice.address);
        setConnectedBluetoothDevice(btDevice);
        const message = 'Bluetooth conectado. Nenhuma estaÃ§Ã£o de impressÃ£o foi carregada; teste local liberado, salvamento para auto-print pendente.';
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
      const message = 'Nenhuma estaÃ§Ã£o de impressÃ£o encontrada. Crie/carregue uma estaÃ§Ã£o antes de salvar a impressora.';
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
      setTestPrintStatus('Teste de impressÃ£o enviado com sucesso.');
      addLog('Teste de impressÃ£o local enviado com sucesso.');
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Falha no teste de impressÃ£o local.';
      setTestPrintStatus(`Falha no teste: ${message}`);
      addLog(`Falha no teste de impressÃ£o local: ${message}`);
    }
  };

  const handleOpenPrinterWizard = () => {
    openSetup(isNative ? 'bluetooth' : 'qz');
  };

  const handleToggleDeviceAutoPrint = async (device: PrinterDevice) => {
    try {
      const updated = await updateDevice.mutateAsync({
        id: device.id,
        payload: {
          autoPrintEnabled: !device.autoPrintEnabled,
        },
      });

      if (selectedDevice === updated.id) {
        setAutoPrintEnabled(updated.autoPrintEnabled === true);
      }

      addLog(
        updated.autoPrintEnabled
          ? `Auto-Print ativado para ${updated.name}.`
          : `Auto-Print desativado para ${updated.name}.`,
      );
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      addLog(`Falha ao atualizar auto-print: ${message}`);
    }
  };

  const handleTestSpecificDevice = async (device: PrinterDevice) => {
    const stationSlug = device.isPrimary
      ? 'MAIN'
      : stations.find((station) => station.id === device.stationId)?.slug || selectedStation || 'MAIN';
    const stationLabel = device.isPrimary ? 'Principal' : stationSlug;
    const testContent = buildTestPrintContent(device.name, stationLabel);

    try {
      if (device.connectionType === 'QZ_TRAY' && device.address) {
        setTestPrintStatus(`Imprimindo teste local em ${device.name}...`);
        await printTextViaQz(device.address, testContent);
        addLog(`Teste local enviado para ${device.name} via impressão no Windows.`);
        setTestPrintStatus('Teste de impressão enviado com sucesso.');
        return;
      }

      if (device.connectionType === 'BLUETOOTH_SPP') {
        if (!isNative) {
          throw new Error('Bluetooth SPP só funciona no app Android.');
        }
        if (!device.address) {
          throw new Error('A impressora Bluetooth não possui endereço configurado.');
        }
        setTestPrintStatus(`Imprimindo teste em ${device.name}...`);
        const builder = new EscPosBuilder();
        builder.alignCenter().boldOn().textLine('--- TESTE DE IMPRESSAO ---').boldOff().alignLeft();
        builder.textLine(testContent).feed(3).cut();
        const payload = builder.build();
        const payloadStr = String.fromCharCode.apply(null, payload);
        await printTicketViaBluetooth(device.address, payloadStr);
        addLog(`Teste local enviado para ${device.name} via Bluetooth.`);
        setTestPrintStatus('Teste de impressão enviado com sucesso.');
        return;
      }

      setTestPrintStatus(`Solicitando teste para ${device.name}...`);
      await testPrint.mutateAsync({
        stationSlug,
        deviceName: device.name,
      });
      addLog(`Teste solicitado para ${device.name}.`);
      setTestPrintStatus('Teste de impressão enviado com sucesso.');
    } catch (error) {
      const friendlyMessage = getFriendlyTestPrintError(device, error);
      setTestPrintStatus(friendlyMessage);
      addLog(`Falha no teste de impressão para ${device.name}: ${friendlyMessage}`);
    }
  };

  const handleConfigureSector = (stationSlug: string, deviceId?: string | null) => {
    setPrinterRole('station');
    setSelectedStation(stationSlug);
    if (deviceId) {
      setSelectedDevice(deviceId);
    }
    openSetup(isNative ? 'bluetooth' : 'qz');
  };

  const activeWizardPrinter = setupMode === 'qz' ? setupSelectedPrinterName : selectedBluetoothDevice?.name || '';
  const activeWizardPrinterAddress = setupMode === 'qz' ? setupSelectedPrinterName : selectedBluetoothDevice?.address || '';
  const canSaveWizardPrinter = setupMode === 'qz' ? !!setupSelectedPrinterName : !!selectedBluetoothDevice;

  // Spooler local: Android usa Bluetooth SPP; navegador/Windows usa QZ Tray.
  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    let cancelled = false;

    const stopSpooler = (message: string) => {
      if (lastSpoolerStateRef.current !== 'stopped') {
        addLog(message);
        lastSpoolerStateRef.current = 'stopped';
      }
      setIsSpoolerRunning(false);
    };

    const poll = async () => {
      if (cancelled || !spoolerRef.current.running) return;

      if (!selectedPrinterDevice) {
        stopSpooler('Erro: nenhum dispositivo de impressão foi selecionado.');
        return;
      }

      if (!selectedPrinterDevice.address) {
        stopSpooler('Erro: a impressora selecionada não possui endereço configurado.');
        return;
      }

      if (!selectedPrinterDevice.autoPrintEnabled) {
        stopSpooler('A impressão automática está desativada para este dispositivo.');
        return;
      }

      const isBluetoothDevice = selectedPrinterDevice.connectionType === 'BLUETOOTH_SPP';
      const isQzDevice = selectedPrinterDevice.connectionType === 'QZ_TRAY';

      if (isBluetoothDevice && !isNative) {
        stopSpooler('Esta impressora Bluetooth só imprime automaticamente no app Android.');
        return;
      }

      if (!isBluetoothDevice && !isQzDevice) {
        stopSpooler('Este tipo de impressora não usa a fila local de impressão.');
        return;
      }

      try {
        const res = await api.post<PrintJobDTO | null>('/printing/spooler/next', { printerDeviceId: selectedPrinterDevice.id });
        const job = res.data;

        if (job && job.id) {
          addLog(`Job #${job.id} recebido. Tentando imprimir...`);

          try {
            if (isQzDevice) {
              await printTextViaQz(selectedPrinterDevice.address, job.content);
            } else {
              const builder = new EscPosBuilder();
              builder.alignCenter().boldOn().textLine('--- TICKET ---').boldOff().alignLeft();
              builder.textLine(job.content).feed(3).cut();
              const payload = builder.build();
              const payloadStr = String.fromCharCode.apply(null, payload);
              await printTicketViaBluetooth(selectedPrinterDevice.address, payloadStr);
            }

            await api.post(`/printing/spooler/${job.id}/ack`, { printerDeviceId: selectedPrinterDevice.id });
            addLog(`Job #${job.id} impresso e finalizado (ACK).`);
          } catch (printErr: unknown) {
            const msg = printErr instanceof Error ? printErr.message : 'Erro';
            addLog(`Falha na impressora física: ${msg}`);
            await api.post(`/printing/spooler/${job.id}/fail`, {
              printerDeviceId: selectedPrinterDevice.id,
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

      if (!cancelled && spoolerRef.current.running) {
        timeoutId = setTimeout(poll, pollingInterval);
      }
    };

    if (isSpoolerRunning) {
      if (!selectedDeviceCanAutoPrint) {
        stopSpooler('Selecione uma impressora compatível e ative a impressão automática antes de iniciar.');
        return () => {
          cancelled = true;
          if (timeoutId) clearTimeout(timeoutId);
        };
      }

      if (lastSpoolerStateRef.current !== 'running') {
        addLog(`Auto-Print iniciado para ${selectedPrinterDevice?.name || 'o dispositivo selecionado'}.`);
        lastSpoolerStateRef.current = 'running';
      }

      spoolerRef.current.running = true;
      void poll();
    } else if (lastSpoolerStateRef.current !== 'stopped') {
      addLog('Fila local pausada.');
      lastSpoolerStateRef.current = 'stopped';
      spoolerRef.current.running = false;
    }

    return () => {
      cancelled = true;
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [isSpoolerRunning, selectedDeviceCanAutoPrint, pollingInterval, isNative, selectedPrinterDevice, selectedPrinterDevice?.id, selectedPrinterDevice?.address, selectedPrinterDevice?.autoPrintEnabled, selectedPrinterDevice?.name]);

  return (
    <div className="mx-auto max-w-6xl px-3 py-4 sm:px-6 sm:py-6 lg:px-8">
      <div className="mb-8 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-2">
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-bold uppercase tracking-[0.24em] text-primary">
            <Printer className="h-3.5 w-3.5" />
            Impressoras
          </div>
          <h1 className="text-3xl font-black tracking-tight text-foreground sm:text-4xl">Impressoras</h1>
          <p className="max-w-2xl text-sm font-medium text-muted-foreground sm:text-base">
            Configure onde seus pedidos serao impressos.
          </p>
        </div>
        <button
          type="button"
          onClick={handleOpenPrinterWizard}
          className="inline-flex items-center justify-center gap-2 rounded-2xl bg-primary px-4 py-3 text-sm font-black uppercase tracking-widest text-primary-foreground shadow-lg shadow-primary/20 transition hover:translate-y-[-1px]"
        >
          <Plus className="h-4 w-4" />
          Adicionar impressora
        </button>
      </div>

      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <section className="rounded-3xl border border-border bg-card p-4 shadow-sm">
          <p className="text-[10px] font-black uppercase tracking-[0.24em] text-muted-foreground">Impressora principal</p>
          <p className="mt-2 text-lg font-black text-foreground">{mainPrinterStatus}</p>
          <p className="mt-1 text-sm font-medium text-muted-foreground truncate">{mainPrinterDevice ? mainPrinterDevice.name : 'Nenhuma impressora principal configurada.'}</p>
        </section>
        <section className="rounded-3xl border border-border bg-card p-4 shadow-sm">
          <p className="text-[10px] font-black uppercase tracking-[0.24em] text-muted-foreground">Impressão automática</p>
          <p className="mt-2 text-lg font-black text-foreground">{autoPrintStatus}</p>
          <p className="mt-1 text-sm font-medium text-muted-foreground">{selectedPrinterDevice?.autoPrintEnabled ? 'Fila local pronta.' : 'Fila local parada.'}</p>
        </section>
        <section className="rounded-3xl border border-border bg-card p-4 shadow-sm">
          <p className="text-[10px] font-black uppercase tracking-[0.24em] text-muted-foreground">Última impressão</p>
          <p className="mt-2 text-lg font-black text-foreground">{lastPrintStatus}</p>
          <p className="mt-1 text-sm font-medium text-muted-foreground truncate">{lastPrintedJob ? `Job #${lastPrintedJob.id}` : 'Nenhum pedido impresso ainda'}</p>
        </section>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.55fr)_minmax(320px,0.85fr)]">
        <div className="space-y-6">
          <section className="overflow-hidden rounded-[2rem] border border-border bg-card shadow-sm">
            <div className="border-b border-border px-5 py-4 sm:px-6 sm:py-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="space-y-1.5">
                  <p className="text-[10px] font-black uppercase tracking-[0.24em] text-muted-foreground">Impressora principal</p>
                  <h2 className="text-xl font-black text-foreground sm:text-2xl">Comanda completa do pedido</h2>
                  <p className="max-w-2xl text-sm font-medium text-muted-foreground">Imprime cliente, endereço, itens, pagamento e observações.</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={handleOpenPrinterWizard} className="rounded-2xl border border-border bg-background px-4 py-2.5 text-sm font-bold text-foreground transition hover:bg-muted/40">Alterar</button>
                  <button type="button" onClick={() => mainPrinterDevice && void handleTestSpecificDevice(mainPrinterDevice)} disabled={!mainPrinterDevice} className="rounded-2xl bg-primary px-4 py-2.5 text-sm font-black text-primary-foreground transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-50">Testar</button>
                  <button type="button" onClick={() => mainPrinterDevice && void handleToggleDeviceAutoPrint(mainPrinterDevice)} disabled={!mainPrinterDevice} className="rounded-2xl border border-primary/20 bg-primary/10 px-4 py-2.5 text-sm font-bold text-primary transition hover:bg-primary/15 disabled:cursor-not-allowed disabled:opacity-50">{selectedDeviceCanAutoPrint ? 'Pausar auto' : 'Ativar auto'}</button>
                </div>
              </div>
            </div>
            <div className="p-5 sm:p-6">
              {mainPrinterDevice ? (
                <div className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(240px,0.8fr)]">
                  <div className="rounded-3xl border border-border bg-muted/20 p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-lg font-black text-foreground">{mainPrinterDevice.name}</p>
                        <p className="mt-1 text-sm font-medium text-muted-foreground">{getConnectionLabel(mainPrinterDevice.connectionType)}{mainPrinterDevice.address ? ` · ${mainPrinterDevice.address}` : ''}</p>
                      </div>
                      <span className={`rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] ${mainPrinterDevice.isActive === false ? 'bg-muted text-muted-foreground' : 'bg-emerald-500/10 text-emerald-600'}`}>
                        {mainPrinterDevice.isActive === false ? 'Inativa' : 'Pronta'}
                      </span>
                    </div>
                    <p className="mt-4 text-sm font-medium text-muted-foreground">
                      Esta impressora recebe a comanda completa dos pedidos e não depende de setor.
                    </p>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
                    <div className="rounded-2xl border border-border bg-background p-4">
                      <p className="text-[10px] font-black uppercase tracking-[0.24em] text-muted-foreground">Conexão</p>
                      <p className="mt-2 text-sm font-bold text-foreground">{mainPrinterDevice ? getConnectionLabel(mainPrinterDevice.connectionType) : 'Não configurada'}</p>
                    </div>
                    <div className="rounded-2xl border border-border bg-background p-4">
                      <p className="text-[10px] font-black uppercase tracking-[0.24em] text-muted-foreground">Uso</p>
                      <p className="mt-2 text-sm font-bold text-foreground">{mainPrinterDevice?.isPrimary ? 'Principal' : 'Padrão de loja'}</p>
                    </div>
                    <div className="rounded-2xl border border-border bg-background p-4">
                      <p className="text-[10px] font-black uppercase tracking-[0.24em] text-muted-foreground">Auto-print</p>
                      <p className="mt-2 text-sm font-bold text-foreground">{selectedDeviceCanAutoPrint ? 'Ativo' : 'Parado'}</p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex min-h-[180px] flex-col items-start justify-center gap-4 rounded-3xl border border-dashed border-border bg-background p-6">
                  <div>
                    <p className="text-2xl font-black text-foreground">Nenhuma impressora principal configurada.</p>
                    <p className="mt-2 max-w-lg text-sm font-medium text-muted-foreground">Configure a impressora principal para receber a comanda completa dos pedidos.</p>
                  </div>
                  <button type="button" onClick={handleOpenPrinterWizard} className="rounded-2xl bg-primary px-4 py-3 text-sm font-black uppercase tracking-widest text-primary-foreground">Configurar impressora principal</button>
                </div>
              )}
            </div>
          </section>
          <section className="overflow-hidden rounded-[2rem] border border-border bg-card shadow-sm">
            <div className="border-b border-border px-5 py-4 sm:px-6">
              <p className="text-[10px] font-black uppercase tracking-[0.24em] text-muted-foreground">Impressoras por setor</p>
              <h2 className="mt-2 text-xl font-black text-foreground sm:text-2xl">Impressoras por setor</h2>
              <p className="mt-2 text-sm font-medium text-muted-foreground">Use impressoras separadas para cozinha, bebidas, balcão ou produção.</p>
            </div>
            <div className="space-y-4 p-4 sm:p-6">
              {sectorDevices.length > 0 ? (
                <>
                  <div className="space-y-3 xl:hidden">
                    {sectorDevices.map(({ station, device }) => (
                      <div key={station.id} className="rounded-3xl border border-border bg-background p-4 shadow-sm">
                        <div className="flex items-start justify-between gap-3">
                          <div className="space-y-1">
                            <p className="text-sm font-black text-foreground">{station.name}</p>
                            <p className="text-xs font-medium text-muted-foreground">{station.slug}</p>
                          </div>
                          <span className={`inline-flex rounded-full px-3 py-1 text-xs font-black uppercase tracking-[0.18em] ${device?.autoPrintEnabled ? 'bg-emerald-500/10 text-emerald-600' : 'bg-muted/40 text-muted-foreground'}`}>
                            {device?.autoPrintEnabled ? 'Ativa' : 'Inativa'}
                          </span>
                        </div>

                        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                          <div className="min-w-0">
                            <p className="text-sm font-bold text-foreground">{device?.name || 'Nenhuma impressora configurada'}</p>
                            <p className="mt-1 text-xs font-medium text-muted-foreground">{device ? getConnectionLabel(device.connectionType) : 'Sem impressora por setor'}</p>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <button type="button" onClick={() => handleConfigureSector(station.slug, device?.id)} className="rounded-2xl border border-border bg-background px-3 py-2 text-xs font-black uppercase tracking-widest text-foreground transition hover:bg-muted/40">Configurar</button>
                            <button type="button" onClick={() => device && void handleTestSpecificDevice(device)} disabled={!device} className="rounded-2xl bg-primary px-3 py-2 text-xs font-black uppercase tracking-widest text-primary-foreground transition disabled:cursor-not-allowed disabled:opacity-50">Testar</button>
                            <button type="button" onClick={() => device && void handleToggleDeviceAutoPrint(device)} disabled={!device} className="rounded-2xl border border-primary/20 bg-primary/10 px-3 py-2 text-xs font-black uppercase tracking-widest text-primary transition disabled:cursor-not-allowed disabled:opacity-50">{device?.autoPrintEnabled ? 'Desativar' : 'Ativar'}</button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="hidden xl:block overflow-x-auto">
                    <table className="min-w-full divide-y divide-border">
                      <thead className="bg-muted/30">
                        <tr className="text-left text-xs font-black uppercase tracking-[0.18em] text-muted-foreground">
                          <th className="px-6 py-4">Setor</th>
                          <th className="px-6 py-4">Impressora</th>
                          <th className="px-6 py-4">Ticket</th>
                          <th className="px-6 py-4">Status</th>
                          <th className="px-6 py-4 text-right">Acoes</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {sectorDevices.map(({ station, device }) => (
                          <tr key={station.id} className="align-middle">
                            <td className="px-6 py-4"><div className="space-y-1"><p className="text-sm font-black text-foreground">{station.name}</p><p className="text-xs font-medium text-muted-foreground">{station.slug}</p></div></td>
                            <td className="px-6 py-4"><div className="space-y-1"><p className="text-sm font-bold text-foreground">{device?.name || 'Nenhuma'}</p><p className="text-xs font-medium text-muted-foreground">{device ? getConnectionLabel(device.connectionType) : 'Sem impressora configurada'}</p></div></td>
                            <td className="px-6 py-4"><span className="inline-flex rounded-full bg-primary/10 px-3 py-1 text-xs font-black uppercase tracking-[0.18em] text-primary">Comanda de producao</span></td>
                            <td className="px-6 py-4"><span className={`inline-flex rounded-full px-3 py-1 text-xs font-black uppercase tracking-[0.18em] ${device?.autoPrintEnabled ? 'bg-emerald-500/10 text-emerald-600' : 'bg-muted/40 text-muted-foreground'}`}>{device?.autoPrintEnabled ? 'Ativa' : 'Inativa'}</span></td>
                            <td className="px-6 py-4"><div className="flex flex-wrap justify-end gap-2"><button type="button" onClick={() => handleConfigureSector(station.slug, device?.id)} className="rounded-2xl border border-border bg-background px-3 py-2 text-xs font-black uppercase tracking-widest text-foreground transition hover:bg-muted/40">Configurar</button><button type="button" onClick={() => device && void handleTestSpecificDevice(device)} disabled={!device} className="rounded-2xl bg-primary px-3 py-2 text-xs font-black uppercase tracking-widest text-primary-foreground transition disabled:cursor-not-allowed disabled:opacity-50">Testar</button><button type="button" onClick={() => device && void handleToggleDeviceAutoPrint(device)} disabled={!device} className="rounded-2xl border border-primary/20 bg-primary/10 px-3 py-2 text-xs font-black uppercase tracking-widest text-primary transition disabled:cursor-not-allowed disabled:opacity-50">{device?.autoPrintEnabled ? 'Desativar' : 'Ativar'}</button></div></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              ) : (
                <div className="rounded-3xl border border-dashed border-border bg-background p-6 text-sm font-medium text-muted-foreground">
                  Nenhuma impressora por setor configurada.
                </div>
              )}
            </div>
          </section>
        </div>

        <div className="space-y-6">
          <details className="rounded-[2rem] border border-border bg-card shadow-sm">
            <summary className="cursor-pointer list-none px-5 py-4 sm:px-6">
              <div className="flex items-center justify-between gap-4">
                <div className="space-y-1">
                  <p className="text-[10px] font-black uppercase tracking-[0.24em] text-muted-foreground">Diagnóstico avançado</p>
                  <h2 className="text-lg font-black text-foreground sm:text-xl">Diagnóstico avançado</h2>
                  <p className="text-sm text-muted-foreground">Use apenas se precisar investigar problemas de conexão ou impressão.</p>
                </div>
                <span className="rounded-full bg-muted/50 px-3 py-1 text-xs font-black uppercase tracking-[0.18em] text-muted-foreground">Fechado</span>
              </div>
            </summary>
            <div className="space-y-4 border-t border-border px-5 py-5 sm:px-6">
              <div className="grid gap-3 md:grid-cols-2">
                <div className="rounded-3xl border border-border bg-muted/20 p-4">
                  <p className="text-[10px] font-black uppercase tracking-[0.24em] text-muted-foreground">Conector do Windows</p>
                  <p className="mt-2 text-sm font-bold text-foreground">
                    {isNative ? 'Não se aplica no Android.' : qzStatus || 'Abra o conector do Windows para listar as impressoras instaladas.'}
                  </p>
                  {qzError ? <p className="mt-2 text-sm font-medium text-destructive">{qzError}</p> : null}
                </div>
                <div className="rounded-3xl border border-border bg-muted/20 p-4">
                  <p className="text-[10px] font-black uppercase tracking-[0.24em] text-muted-foreground">Impressão automática</p>
                  <p className="mt-2 text-sm font-bold text-foreground">Intervalo atual de {pollingInterval} ms. {isSpoolerRunning ? 'Fila ativa.' : 'Fila parada.'}</p>
                  <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_auto]">
                    <label className="space-y-2">
                      <span className="block text-[10px] font-black uppercase tracking-[0.24em] text-muted-foreground">Ajustar intervalo</span>
                      <input
                        type="range"
                        min={1500}
                        max={10000}
                        step={500}
                        value={pollingInterval}
                        onChange={(event) => setPollingInterval(Number(event.target.value))}
                        className="w-full accent-primary"
                      />
                    </label>
                    <label className="space-y-2 sm:w-28">
                      <span className="block text-[10px] font-black uppercase tracking-[0.24em] text-muted-foreground">ms</span>
                      <input
                        type="number"
                        min={1500}
                        max={10000}
                        step={500}
                        value={pollingInterval}
                        onChange={(event) => setPollingInterval(Number(event.target.value))}
                        className="w-full rounded-2xl border border-border bg-background px-3 py-2 text-sm font-bold text-foreground outline-none"
                      />
                    </label>
                  </div>
                </div>
              </div>

              {bluetoothConnectionError || testPrintStatus ? (
                <div className="rounded-3xl border border-border bg-background p-4">
                  <p className="text-[10px] font-black uppercase tracking-[0.24em] text-muted-foreground">Último feedback</p>
                  {bluetoothConnectionError ? <p className="mt-2 text-sm font-medium text-destructive">{bluetoothConnectionError}</p> : null}
                  {testPrintStatus ? <p className="mt-2 text-sm font-medium text-foreground">{testPrintStatus}</p> : null}
                </div>
              ) : null}

              <div className="rounded-3xl border border-border bg-background">
                <div className="flex items-center justify-between border-b border-border px-4 py-3">
                  <p className="text-[10px] font-black uppercase tracking-[0.24em] text-muted-foreground">Diagnóstico</p>
                  <button type="button" onClick={() => setLogs([])} className="text-xs font-black uppercase tracking-widest text-primary">Limpar</button>
                </div>
                <div className="max-h-[220px] space-y-2 overflow-y-auto p-4 text-[13px]">
                  {logs.length === 0 ? <div className="flex min-h-[140px] flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-muted/20 text-center text-muted-foreground"><Monitor className="mb-3 h-8 w-8 opacity-40" /><p className="text-sm font-medium">Nenhum log gerado ainda.</p></div> : logs.map((log, index) => <div key={`${index}-${log}`} className={`rounded-2xl px-3 py-2 ${log.includes('ACK') ? 'bg-emerald-500/10 font-bold text-emerald-600' : log.includes('Erro') || log.includes('Falha') ? 'bg-destructive/10 font-bold text-destructive' : log.includes('recebido') ? 'bg-primary/10 text-primary' : 'bg-muted/30 text-muted-foreground'}`}>{log}</div>)}
                </div>
              </div>
            </div>
          </details>
        </div>
      </div>

      {isSetupModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/60 p-3 backdrop-blur-sm sm:items-center sm:p-6">
          <div className="max-h-[92vh] w-full max-w-4xl overflow-hidden rounded-[2rem] border border-border bg-card shadow-2xl">
            <div className="flex items-start justify-between border-b border-border px-5 py-4 sm:px-6">
              <div><p className="text-xs font-black uppercase tracking-[0.24em] text-muted-foreground">Adicionar impressora</p><h3 className="mt-1 text-2xl font-black text-foreground">Assistente de configuracao</h3></div>
              <button type="button" onClick={closeSetup} className="rounded-full border border-border bg-background px-3 py-2 text-sm font-black text-foreground">Fechar</button>
            </div>
            <div className="border-b border-border px-5 py-4 sm:px-6">
              <div className="grid gap-2 sm:grid-cols-4">
                {[{ step: 1, label: 'Conexao' }, { step: 2, label: 'Buscar' }, { step: 3, label: 'Uso' }, { step: 4, label: 'Salvar' }].map(({ step, label }) => <div key={label} className={`rounded-2xl border px-3 py-2 text-sm font-black ${setupStep >= step ? 'border-primary/20 bg-primary/10 text-primary' : 'border-border bg-background text-muted-foreground'}`}><span className="mr-2 inline-flex h-6 w-6 items-center justify-center rounded-full bg-current/10 text-xs">{step}</span>{label}</div>)}
              </div>
            </div>
            <div className="max-h-[calc(92vh-152px)] overflow-y-auto px-5 py-5 sm:px-6">
              {setupStep === 1 ? (
                <div className="space-y-4"><div className="grid gap-4 md:grid-cols-3">{[{ mode: 'bluetooth' as SetupMode, title: 'Bluetooth Android', description: 'Para mini impressoras pareadas no app Android.' }, { mode: 'qz' as SetupMode, title: 'Windows / QZ Tray', description: 'Para impressoras instaladas no computador.' }, { mode: 'bridge' as SetupMode, title: 'Bridge USB/Rede', description: 'Em breve.' }].map((option) => (<button key={option.mode} type="button" onClick={() => { setSetupMode(option.mode); setSetupStep(2); }} className={`rounded-3xl border p-4 text-left transition ${setupMode === option.mode ? 'border-primary bg-primary/10' : 'border-border bg-background hover:bg-muted/30'}`}><p className="text-base font-black text-foreground">{option.title}</p><p className="mt-2 text-sm font-medium text-muted-foreground">{option.description}</p></button>))}</div></div>
              ) : null}

              {setupStep === 2 ? (
                <div className="space-y-4">
                  {setupMode === 'qz' ? (
                    <>
                      <button type="button" onClick={() => void handleConnectQzTray()} disabled={isQzConnecting} className="rounded-2xl bg-primary px-4 py-3 text-sm font-black uppercase tracking-widest text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50">{isQzConnecting ? 'Conectando...' : 'Conectar e listar impressoras'}</button>
                      {qzPrinterNames.length > 0 ? (<div className="grid gap-3">{qzPrinterNames.map((printerName) => (<button key={printerName} type="button" onClick={() => setSetupSelectedPrinterName(printerName)} className={`flex items-center justify-between rounded-2xl border px-4 py-3 text-left ${setupSelectedPrinterName === printerName ? 'border-primary bg-primary/10' : 'border-border bg-background'}`}><div><p className="text-sm font-black text-foreground">{printerName}</p><p className="text-xs font-medium text-muted-foreground">Windows / QZ Tray</p></div><span className="text-xs font-black uppercase tracking-widest text-primary">{setupSelectedPrinterName === printerName ? 'Selecionada' : 'Selecionar'}</span></button>))}</div>) : (<div className="rounded-2xl border border-dashed border-border bg-muted/20 p-4 text-sm font-medium text-muted-foreground">{qzStatus || 'Nenhuma impressora listada ainda.'}</div>)}
                    </>
                  ) : setupMode === 'bluetooth' ? (
                    <>
                      <button type="button" onClick={() => void handleScanBluetoothWithFeedback()} disabled={isScanning} className="rounded-2xl bg-primary px-4 py-3 text-sm font-black uppercase tracking-widest text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50">{isScanning ? 'Buscando...' : 'Buscar Bluetooth pareados'}</button>
                      {pairedDevices.length > 0 ? (<div className="grid gap-3">{pairedDevices.map((bt) => (<button key={bt.address} type="button" onClick={() => setSelectedBluetoothDevice(bt)} className={`flex items-center justify-between rounded-2xl border px-4 py-3 text-left ${selectedBluetoothDevice?.address === bt.address ? 'border-primary bg-primary/10' : 'border-border bg-background'}`}><div><p className="text-sm font-black text-foreground">{bt.name}</p><p className="text-xs font-medium text-muted-foreground">{bt.address}</p></div><span className="text-xs font-black uppercase tracking-widest text-primary">{selectedBluetoothDevice?.address === bt.address ? 'Selecionada' : 'Selecionar'}</span></button>))}</div>) : (<div className="rounded-2xl border border-dashed border-border bg-muted/20 p-4 text-sm font-medium text-muted-foreground">{bluetoothError || lastBluetoothAction || 'Nenhum dispositivo pareado encontrado.'}</div>)}
                    </>
                  ) : (<div className="rounded-2xl border border-dashed border-border bg-muted/20 p-4 text-sm font-medium text-muted-foreground">Bridge USB/Rede ainda nao esta disponivel.</div>)}
                </div>
              ) : null}

              {setupStep === 3 ? (
                <div className="space-y-4"><div className="grid gap-3 sm:grid-cols-2"><button type="button" onClick={() => setPrinterRole('primary')} className={`rounded-3xl border p-4 text-left ${printerRole === 'primary' ? 'border-primary bg-primary/10' : 'border-border bg-background hover:bg-muted/30'}`}><p className="text-base font-black text-foreground">Impressora principal</p><p className="mt-2 text-sm font-medium text-muted-foreground">Escolha qual impressora vai receber a comanda completa dos pedidos.</p></button><button type="button" onClick={() => setPrinterRole('station')} className={`rounded-3xl border p-4 text-left ${printerRole === 'station' ? 'border-primary bg-primary/10' : 'border-border bg-background hover:bg-muted/30'}`}><p className="text-base font-black text-foreground">Impressora de setor</p><p className="mt-2 text-sm font-medium text-muted-foreground">Separada por cozinha, bebidas, balcao ou producao.</p></button></div>{printerRole === 'station' ? (<div className="rounded-3xl border border-border bg-background p-4"><label className="mb-2 block text-xs font-black uppercase tracking-[0.24em] text-muted-foreground">Selecionar setor</label><select value={selectedStation} onChange={(event) => setSelectedStation(event.target.value)} className="w-full rounded-2xl border border-border bg-card px-4 py-3 text-sm font-bold text-foreground outline-none"><option value="">Selecione o setor</option>{stations.map((station) => (<option key={station.id} value={station.slug}>{station.name}</option>))}</select>{stations.length === 0 ? (<p className="mt-2 text-sm font-medium text-muted-foreground">Nenhum setor carregado no momento.</p>) : null}</div>) : null}</div>
              ) : null}

              {setupStep === 4 ? (
                <div className="space-y-4"><div className="grid gap-4 md:grid-cols-2"><div className="rounded-3xl border border-border bg-background p-4"><p className="text-xs font-black uppercase tracking-[0.24em] text-muted-foreground">Conexao</p><p className="mt-2 text-sm font-bold text-foreground">{setupMode === 'bluetooth' ? 'Bluetooth Android' : setupMode === 'qz' ? 'Windows / QZ Tray' : 'Bridge USB/Rede'}</p></div><div className="rounded-3xl border border-border bg-background p-4"><p className="text-xs font-black uppercase tracking-[0.24em] text-muted-foreground">Uso</p><p className="mt-2 text-sm font-bold text-foreground">{printerRole === 'primary' ? 'Impressora principal' : 'Impressora de setor'}</p></div><div className="rounded-3xl border border-border bg-background p-4 md:col-span-2"><p className="text-xs font-black uppercase tracking-[0.24em] text-muted-foreground">Impressora escolhida</p><p className="mt-2 text-sm font-bold text-foreground">{activeWizardPrinter || 'Nenhuma impressora selecionada'}</p>{activeWizardPrinterAddress ? (<p className="mt-1 text-xs font-medium text-muted-foreground">{activeWizardPrinterAddress}</p>) : null}</div></div><div className="flex flex-wrap gap-3"><button type="button" onClick={() => setSetupStep(3)} className="rounded-2xl border border-border bg-background px-4 py-3 text-sm font-black uppercase tracking-widest text-foreground">Voltar</button><button type="button" onClick={() => { if (setupMode === 'qz' && setupSelectedPrinterName) { void handleLocalQzTestPrint(setupSelectedPrinterName); } else if (setupMode === 'bluetooth' && selectedBluetoothDevice) { void handleLocalBluetoothTestPrint(); } }} className="rounded-2xl bg-primary px-4 py-3 text-sm font-black uppercase tracking-widest text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50" disabled={!canSaveWizardPrinter}>Testar impressao</button><button type="button" onClick={() => { if (setupMode === 'qz' && setupSelectedPrinterName) { void handleAddQzPrinter(setupSelectedPrinterName); } else if (setupMode === 'bluetooth' && selectedBluetoothDevice) { void handleAddAndConnectBluetoothDevice(selectedBluetoothDevice); } }} disabled={!canSaveWizardPrinter || isSavingDevice || isConnectingBluetooth} className="rounded-2xl border border-primary/20 bg-primary/10 px-4 py-3 text-sm font-black uppercase tracking-widest text-primary disabled:cursor-not-allowed disabled:opacity-50">{isSavingDevice || isConnectingBluetooth ? 'Salvando...' : 'Salvar impressora'}</button></div></div>
              ) : null}

              <div className="mt-6 flex items-center justify-between"><div className="text-sm font-medium text-muted-foreground">Etapa {setupStep} de 4</div><div className="flex gap-2"><button type="button" onClick={() => setSetupStep((current) => (current > 1 ? (current - 1) as 1 | 2 | 3 | 4 : current))} disabled={setupStep === 1} className="rounded-2xl border border-border bg-background px-4 py-2 text-sm font-bold text-foreground disabled:cursor-not-allowed disabled:opacity-50">Anterior</button><button type="button" onClick={() => setSetupStep((current) => (current < 4 ? (current + 1) as 1 | 2 | 3 | 4 : current))} disabled={setupStep === 4} className="rounded-2xl bg-primary px-4 py-2 text-sm font-black text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50">Proximo</button></div></div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
