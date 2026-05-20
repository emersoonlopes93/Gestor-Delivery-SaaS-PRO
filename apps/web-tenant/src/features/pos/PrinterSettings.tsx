import { useState, useEffect } from 'react';
import { 
  Printer, 
  RefreshCw, 
  Play, 
  Square,
  AlertTriangle,
  Monitor
} from 'lucide-react';
import { api } from '../../lib/api-client';
import { useQuery } from '@tanstack/react-query';


import { 
  PrintJobDTO,
} from '@gestor/types';

interface StationStats {
  pending: number;
  completed: number;
  failed: number;
  total: number;
}

export function PrinterSettings() {

  const [isSpoolerRunning, setIsSpoolerRunning] = useState(false);
  const [selectedStation, setSelectedStation] = useState('GERAL');
  const [logs, setLogs] = useState<string[]>([]);
  const [pollingInterval, setPollingInterval] = useState<number>(3000);

  // Stats
  const { data: stats } = useQuery<StationStats>({
    queryKey: ['printer-stats', selectedStation],
    queryFn: async () => {
      const res = await api.get<StationStats>(`/kds/stations/${selectedStation}/stats`);
      return res.data;
    },
    refetchInterval: 10000,
  });

  const addLog = (msg: string) => {
    setLogs(prev => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...prev].slice(0, 50));
  };

  // Lógica do Spooler Local (Simulado via Browser)
  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    const poll = async () => {
      if (!isSpoolerRunning) return;

      try {
        const res = await api.post<PrintJobDTO>('/kds/spooler/next', { station: selectedStation });
        const job = res.data;

        if (job && job.id) {
          addLog(`Job #${job.id} recebido. Imprimindo...`);
          
          // Simulação de tempo de impressão
          await new Promise(resolve => setTimeout(resolve, 1000));

          try {
            // Se estivéssemos em um app desktop real, aqui chamaríamos o driver.
            // No browser, podemos tentar usar window.print() ou apenas marcar como concluído.
            await api.put(`/kds/print-jobs/${job.id}/completed`);
            addLog(`Job #${job.id} concluído com sucesso.`);
          } catch (err) {
            addLog(`Erro ao concluir job #${job.id}`);
            await api.put(`/kds/print-jobs/${job.id}/failed`);
          }
        } else {
          // addLog('Nenhum job pendente.');
        }
      } catch (err) {
        addLog('Erro na comunicação com o servidor.');
        console.error(err);
      }

      timeoutId = setTimeout(poll, pollingInterval);
    };

    if (isSpoolerRunning) {
      addLog(`Spooler iniciado para estação: ${selectedStation}`);
      poll();
    } else {
      addLog('Spooler parado.');
    }

    return () => {
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [isSpoolerRunning, selectedStation, pollingInterval]);

  return (
    <div className="p-8 max-w-6xl mx-auto animate-in fade-in duration-500">
      <header className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-gray-900 dark:text-gray-100 flex items-center gap-3">
            <div className="p-2 bg-primary-600 rounded-xl text-white shadow-lg shadow-primary-600/20">
              <Printer className="w-6 h-6" />
            </div>
            Configuração de Impressão
          </h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1 font-medium">
            Gerencie suas impressoras térmicas e o spooler local de produção.
          </p>
        </div>
      </header>

      <div className="grid lg:grid-cols-3 gap-8">
        {/* Coluna Esquerda: Configurações e Status */}
        <div className="lg:col-span-1 space-y-6">
          <section className="bg-white dark:bg-gray-900 rounded-3xl border border-gray-100 dark:border-gray-800 p-6 shadow-sm">
            <h2 className="text-sm font-black uppercase tracking-widest text-gray-400 mb-6 flex items-center gap-2">
              <Monitor className="w-4 h-4" />
              Controle do Spooler
            </h2>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Estação de Trabalho</label>
                <select 
                  value={selectedStation}
                  onChange={(e) => setSelectedStation(e.target.value)}
                  className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-xl px-4 py-3 text-sm font-bold focus:ring-2 focus:ring-primary-500 outline-none transition-all"
                >
                  <option value="GERAL">Geral (Balcão)</option>
                  <option value="COZINHA">Cozinha</option>
                  <option value="BAR">Bar / Bebidas</option>
                  <option value="PIZZA">Pizzaria</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Intervalo de Busca (ms)</label>
                <input 
                  type="number" 
                  value={pollingInterval}
                  onChange={(e) => setPollingInterval(Number(e.target.value))}
                  className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-xl px-4 py-3 text-sm font-bold focus:ring-2 focus:ring-primary-500 outline-none transition-all"
                />
              </div>

              <div className="pt-4">
                <button
                  onClick={() => setIsSpoolerRunning(!isSpoolerRunning)}
                  className={`w-full flex items-center justify-center gap-3 py-4 rounded-2xl font-black uppercase tracking-widest transition-all active:scale-95 shadow-lg ${
                    isSpoolerRunning 
                      ? 'bg-red-500 text-white shadow-red-500/20' 
                      : 'bg-emerald-500 text-white shadow-emerald-500/20'
                  }`}
                >
                  {isSpoolerRunning ? (
                    <><Square className="w-5 h-5 fill-current" /> Parar Spooler</>
                  ) : (
                    <><Play className="w-5 h-5 fill-current" /> Iniciar Spooler</>
                  )}
                </button>
              </div>
            </div>
          </section>

          <section className="bg-white dark:bg-gray-900 rounded-3xl border border-gray-100 dark:border-gray-800 p-6 shadow-sm">
            <h2 className="text-sm font-black uppercase tracking-widest text-gray-400 mb-6">Métricas da Estação</h2>
            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 bg-gray-50 dark:bg-gray-800/50 rounded-2xl border border-gray-100 dark:border-gray-700">
                <p className="text-xs font-bold text-gray-500 uppercase">Pendentes</p>
                <p className="text-2xl font-black text-primary-600 mt-1">{stats?.pending || 0}</p>
              </div>
              <div className="p-4 bg-gray-50 dark:bg-gray-800/50 rounded-2xl border border-gray-100 dark:border-gray-700">
                <p className="text-xs font-bold text-gray-500 uppercase">Concluídos</p>
                <p className="text-2xl font-black text-emerald-600 mt-1">{stats?.completed || 0}</p>
              </div>
            </div>
          </section>
        </div>

        {/* Coluna Direita: Logs e Monitoramento */}
        <div className="lg:col-span-2 space-y-6">
          <section className="bg-white dark:bg-gray-900 rounded-3xl border border-gray-100 dark:border-gray-800 flex flex-col h-[600px] shadow-sm">
            <div className="p-6 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between bg-gray-50/50 dark:bg-gray-800/20 rounded-t-3xl">
              <h2 className="text-sm font-black uppercase tracking-widest text-gray-400 flex items-center gap-2">
                <RefreshCw className={`w-4 h-4 ${isSpoolerRunning ? 'animate-spin' : ''}`} />
                Monitor de Atividade
              </h2>
              <button 
                onClick={() => setLogs([])}
                className="text-xs font-bold text-primary-600 hover:text-primary-700 transition-colors"
              >
                Limpar Logs
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-6 space-y-2 font-mono text-[13px]">
              {logs.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-gray-400 opacity-50 italic">
                  <Printer className="w-12 h-12 mb-3 stroke-[1px]" />
                  Nenhuma atividade registrada.
                </div>
              ) : (
                logs.map((log, i) => (
                  <div key={i} className={`py-1.5 px-3 rounded-lg ${
                    log.includes('concluído') ? 'bg-emerald-500/5 text-emerald-600' :
                    log.includes('Erro') ? 'bg-red-500/5 text-red-600' :
                    log.includes('recebido') ? 'bg-primary-500/5 text-primary-600 font-bold' :
                    'text-gray-500 dark:text-gray-400'
                  }`}>
                    {log}
                  </div>
                ))
              )}
            </div>

            <div className="p-6 bg-amber-50 dark:bg-amber-900/10 border-t border-amber-100 dark:border-amber-900/30 rounded-b-3xl">
              <div className="flex gap-3">
                <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
                <div className="text-xs text-amber-800 dark:text-amber-400 leading-relaxed font-medium">
                  <strong className="block mb-1">Dica de Produção:</strong>
                  Para uma experiência de spooler real que envie dados diretamente para a porta USB/Rede, utilize nosso <strong>Gestor Print Bridge</strong> (aplicativo local) configurado com esta mesma estação.
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
