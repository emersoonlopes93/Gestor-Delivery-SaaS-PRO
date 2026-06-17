import { useState, useEffect, useRef } from 'react';
import { Printer, RefreshCw, Play, Square, AlertTriangle, Monitor, Plus, Settings } from 'lucide-react';
import { api } from '../../lib/api-client';
import { 
  usePrintingStations, 
  usePrinterDevices, 
  useCreateDevice,
  useTestPrint
} from '../../hooks/usePrinting';
import { scanBluetoothDevices, printTicketViaBluetooth, isNativeAndroid } from '../../lib/bluetooth';
import { EscPosBuilder } from '../../lib/escpos58';

interface PrintJobDTO {
  id: string;
  content: string;
}

export function PrinterSettings() {
  const [logs, setLogs] = useState<string[]>([]);
  const [selectedStation, setSelectedStation] = useState<string>('');
  const [selectedDevice, setSelectedDevice] = useState<string>('');
  const [isSpoolerRunning, setIsSpoolerRunning] = useState(false);
  const [pollingInterval, setPollingInterval] = useState<number>(3000);
  const [isScanning, setIsScanning] = useState(false);
  const [btDevices, setBtDevices] = useState<{name: string, address: string}[]>([]);
  const isNative = isNativeAndroid();

  const { data: stations = [] } = usePrintingStations();
  const { data: devices = [] } = usePrinterDevices();
  const createDevice = useCreateDevice();
  const testPrint = useTestPrint();

  const spoolerRef = useRef<{ running: boolean }>({ running: false });

  // Update selected defaults when data loads
  useEffect(() => {
    if (stations.length > 0 && !selectedStation) {
      setSelectedStation(stations[0].slug);
    }
    if (devices.length > 0 && !selectedDevice) {
      setSelectedDevice(devices[0].id);
    }
  }, [stations, devices]);

  useEffect(() => {
    spoolerRef.current.running = isSpoolerRunning;
  }, [isSpoolerRunning]);

  const addLog = (msg: string) => {
    setLogs(prev => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...prev].slice(0, 50));
  };

  const handleScanBluetooth = async () => {
    if (!isNative) {
      addLog('Escaneamento Bluetooth só funciona no App nativo Android.');
      return;
    }
    setIsScanning(true);
    addLog('Buscando dispositivos pareados...');
    try {
      const result = await scanBluetoothDevices();
      setBtDevices(result);
      addLog(`Encontrado(s) ${result.length} dispositivo(s).`);
    } catch (e) {
      addLog('Erro ao buscar dispositivos Bluetooth.');
    } finally {
      setIsScanning(false);
    }
  };

  const handleCreateDevice = async (btDevice: {name: string, address: string}) => {
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
    if (!selectedStation || !selectedDevice) {
      addLog('Selecione estação e dispositivo.');
      return;
    }
    try {
      const device = devices.find(d => d.id === selectedDevice);
      // Cria job de teste
      await testPrint.mutateAsync({ 
        stationSlug: selectedStation, 
        deviceName: device?.name || 'Desconhecido' 
      });
      addLog('Job de teste enviado para a nuvem.');
      
      // Se estamos no Android, podemos tentar imprimir na hora ou deixar o spooler pegar.
      // O spooler pegaria no próximo tick.
    } catch (e) {
      addLog('Erro ao solicitar teste.');
    }
  };

  // Lógica do Spooler Local (Android Real)
  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    const poll = async () => {
      if (!spoolerRef.current.running) return;

      if (!isNative) {
        // Modo browser
        timeoutId = setTimeout(poll, pollingInterval);
        return;
      }

      if (!selectedDevice) {
        addLog('Erro: Nenhum dispositivo selecionado para o spooler.');
        setIsSpoolerRunning(false);
        return;
      }

      const device = devices.find(d => d.id === selectedDevice);
      if (!device || !device.address) {
        addLog('Erro: Dispositivo inválido ou sem endereço MAC.');
        setIsSpoolerRunning(false);
        return;
      }

      try {
        const res = await api.post<PrintJobDTO | null>('/printing/spooler/next', { printerDeviceId: device.id });
        const job = res.data;

        if (job && job.id) {
          addLog(`Job #${job.id} recebido. Tentando imprimir...`);
          
          try {
            // Conversão de texto para ESC/POS Uint8Array formatado.
            // Para simplificar a ponte, se o plugin Bluetooth write() recebe string,
            // podemos mandar a string ou encodar como Base64.
            // Assumimos que o bluetooth.ts e o plugin Java aceitam bytes via array/base64 ou texto limpo.
            const builder = new EscPosBuilder();
            builder.alignCenter().boldOn().textLine("--- TICKET ---").boldOff().alignLeft();
            builder.textLine(job.content).feed(3).cut();
            const payload = builder.build();
            // A interface atual printTicketViaBluetooth pede string. No Android real, o plugin deverá ler os bytes.
            // Convertendo payload array para string (simplificação - no app real o plugin receberá array).
            const payloadStr = String.fromCharCode.apply(null, payload);

            await printTicketViaBluetooth(device.address, payloadStr);
            
            // Sucesso - envia ACK
            await api.post(`/printing/spooler/${job.id}/ack`, { printerDeviceId: device.id });
            addLog(`Job #${job.id} impresso e finalizado (ACK).`);
          } catch (printErr: unknown) {
            const msg = printErr instanceof Error ? printErr.message : 'Erro';
            addLog(`Falha na impressora física: ${msg}`);
            // Falha - envia FAIL
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
      if (!isNative) {
        addLog('AVISO: O Spooler Automático só envia para impressoras físicas no app Android.');
        addLog('No navegador, esta tela funciona apenas como painel de controle.');
        setIsSpoolerRunning(false);
        return;
      }
      addLog(`Spooler Bluetooth iniciado no device ID: ${selectedDevice}`);
      poll();
    } else {
      addLog('Spooler parado.');
    }

    return () => {
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [isSpoolerRunning, selectedDevice, pollingInterval, isNative, devices]);

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
            <strong>Modo Navegador Web:</strong> A impressão térmica Bluetooth direta (SPP) funciona exclusivamente dentro do Aplicativo Android nativo (Capacitor). Aqui no navegador, você pode visualizar e configurar os dispositivos, mas o Auto-Print físico está desativado.
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
                <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">Estação de Trabalho Ativa</label>
                <select 
                  value={selectedStation}
                  onChange={(e) => setSelectedStation(e.target.value)}
                  className="w-full bg-card dark:bg-muted900 border border-border dark:border-border700 rounded-xl px-4 py-3 text-sm font-bold focus:ring-2 focus:ring-primary/20 outline-none transition-all"
                >
                  <option value="">-- Selecione a Estação --</option>
                  {stations.map(st => (
                    <option key={st.id} value={st.slug}>{st.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">Dispositivo Padrão (Físico)</label>
                <select 
                  value={selectedDevice}
                  onChange={(e) => setSelectedDevice(e.target.value)}
                  className="w-full bg-card dark:bg-muted900 border border-border dark:border-border700 rounded-xl px-4 py-3 text-sm font-bold focus:ring-2 focus:ring-primary/20 outline-none transition-all"
                >
                  <option value="">-- Nenhum --</option>
                  {devices.filter(d => !selectedStation || d.stationId === stations.find(s => s.slug === selectedStation)?.id).map(d => (
                    <option key={d.id} value={d.id}>{d.name} ({d.address})</option>
                  ))}
                </select>
              </div>

              <div className="pt-2">
                <button
                  onClick={handleTestPrint}
                  className="w-full flex items-center justify-center gap-2 py-3 bg-muted100 dark:bg-muted800 rounded-xl font-bold text-sm hover:bg-muted200 dark:hover:bg-muted700 transition-colors"
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
                  onClick={() => setIsSpoolerRunning(!isSpoolerRunning)}
                  disabled={!isNative}
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

          {isNative && (
            <section className="bg-card dark:bg-muted900 rounded-3xl border border-border dark:border-border800 p-6 shadow-sm">
              <h2 className="text-sm font-black uppercase tracking-widest text-muted-foreground mb-4">Adicionar Impressora (Android)</h2>
              <button 
                onClick={handleScanBluetooth}
                disabled={isScanning}
                className="w-full py-3 bg-primary text-white font-bold rounded-xl shadow mb-4"
              >
                {isScanning ? 'Buscando...' : 'Buscar Bluetooth Pareados'}
              </button>
              
              <div className="space-y-2">
                {btDevices.map(bt => (
                  <div key={bt.address} className="flex items-center justify-between p-3 border border-border dark:border-border800 rounded-lg">
                    <div>
                      <p className="text-sm font-bold">{bt.name}</p>
                      <p className="text-xs text-muted-foreground">{bt.address}</p>
                    </div>
                    <button 
                      onClick={() => handleCreateDevice(bt)}
                      className="p-2 bg-primary/10 text-primary rounded-lg hover:bg-primary/20"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
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
