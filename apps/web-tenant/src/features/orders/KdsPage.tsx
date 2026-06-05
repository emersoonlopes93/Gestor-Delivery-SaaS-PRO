import { useState, useEffect, useCallback, useMemo } from 'react';
import { RefreshCw, Clock, CheckCircle2, ChefHat } from 'lucide-react';
import { 
  KdsPrintJobDTO,
  PrintJobStatus,
} from '@gestor/types';
import { api } from '@/lib/api-client';

interface KdsPrintJobsResponse {
  items: KdsPrintJobDTO[];
  total: number;
  page: number;
  limit: number;
}

export function KdsPage() {
  const [stationId, setStationId] = useState<string>(localStorage.getItem('kds_station') || 'ALL');
  const [printJobs, setPrintJobs] = useState<KdsPrintJobDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [stations, setStations] = useState<string[]>(['GERAL']);
  const [loadError, setLoadError] = useState<string | null>(null);

  const activeStatuses = useMemo(
    () => new Set<PrintJobStatus>([PrintJobStatus.pending, PrintJobStatus.printing]),
    [],
  );

  const fetchJobs = useCallback(async () => {
    try {
      setLoadError(null);
      const res = await api.get<KdsPrintJobsResponse>(
        `/kds/print-jobs?station=${encodeURIComponent(stationId)}&limit=100`,
      );
      setPrintJobs((res.data.items || []).filter((job) => activeStatuses.has(job.status)));
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Erro ao carregar KDS.');
    } finally {
      if (loading) setLoading(false);
    }
  }, [activeStatuses, loading, stationId]);

  useEffect(() => {
    const fetchStations = async () => {
      try {
        const res = await api.get<string[]>('/kds/stations');
        if (Array.isArray(res.data) && res.data.length > 0) {
          setStations(res.data);
        }
      } catch (error) {
        setLoadError(error instanceof Error ? error.message : 'Erro ao carregar setores do KDS.');
      }
    };
    fetchStations();
  }, []);

  useEffect(() => {
    localStorage.setItem('kds_station', stationId);
    fetchJobs();
    const interval = setInterval(fetchJobs, 10000); // 10s polling
    return () => clearInterval(interval);
  }, [fetchJobs, stationId]);

  const handleComplete = async (jobId: string) => {
    if (updatingId) return;
    setUpdatingId(jobId);
    try {
      await api.put(`/kds/print-jobs/${jobId}/completed`);
      await fetchJobs();
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Erro ao concluir job do KDS.');
    } finally {
      setUpdatingId(null);
    }
  };

  const getElapsedMin = (createdAt: string) => {
    const min = Math.floor((new Date().getTime() - new Date(createdAt).getTime()) / 60000);
    return min >= 0 ? min : 0;
  };

  const handlePrint = (content: string) => {
    const printWindow = window.open('', '_blank', 'width=300,height=600');
    if (!printWindow) return;
    
    printWindow.document.write(`
      <html>
        <head>
          <title>Imprimir Ticket</title>
          <style>
            @page { margin: 0; }
            body { 
              font-family: 'Courier New', Courier, monospace; 
              font-size: 12px; 
              padding: 10px;
              width: 80mm;
              margin: 0;
            }
            pre { 
              white-space: pre-wrap; 
              word-wrap: break-word;
              margin: 0;
            }
          </style>
        </head>
        <body>
          <pre>${content}</pre>
          <script>
            window.onload = () => {
              window.print();
              setTimeout(() => window.close(), 100);
            };
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  return (
    <div className="p-6 h-[calc(100vh-64px)] flex flex-col bg-background">
      <header className="flex flex-col md:flex-row md:items-center justify-between mb-6 shrink-0 gap-4">
        <div>
          <h1 className="text-2xl font-black text-foreground tracking-tight flex items-center gap-2">
            <ChefHat className="w-8 h-8 text-primary" /> KDS PRO
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Gestão de Produção Individualizada</p>
        </div>
        
        <div className="flex items-center gap-3">
          <select 
            value={stationId}
            onChange={(e) => setStationId(e.target.value)}
            className="bg-card border border-input text-foreground text-sm rounded-lg focus:ring-ring focus:border-primary block w-full p-2.5 font-bold shadow-sm"
          >
            <option value="ALL">TODOS OS SETORES</option>
            {stations.map(st => (
              <option key={st} value={st}>SETOR: {st}</option>
            ))}
          </select>
          
          <button onClick={fetchJobs} className="p-2.5 bg-card border border-border rounded-lg hover:bg-muted transition-colors shadow-sm" title="Atualizar">
            <RefreshCw className={`w-5 h-5 text-foreground ${updatingId ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </header>

      {loadError && (
        <div className="mb-4 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm font-bold text-destructive">
          {loadError}
        </div>
      )}

      {loading ? (
        <div className="text-center py-12 text-muted-foreground font-bold text-lg">Carregando painel KDS...</div>
      ) : printJobs.length === 0 ? (
        <div className="flex flex-col items-center justify-center grow pb-20">
          <ChefHat className="w-16 h-16 text-muted-foreground mb-4" />
          <h2 className="text-2xl font-black text-foreground">Nenhum pedido para este setor!</h2>
        </div>
      ) : (
        <div className="flex gap-4 overflow-x-auto overflow-y-hidden pb-4 grow items-start snap-x">
          {printJobs.filter(j => j.order?.isScheduled).map(job => {
            const order = job.order;
            const scheduledForStr = order?.scheduledFor ? new Date(order.scheduledFor).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '';
            return (
              <div 
                key={job.id} 
                className="min-w-[340px] w-[340px] rounded-2xl flex flex-col max-h-full border-2 border-amber-500/50 shadow-[0_0_15px_rgba(245,158,11,0.2)] snap-start bg-amber-50/50 dark:bg-amber-950/10"
              >
                <header className="p-4 rounded-t-xl flex flex-col items-start shrink-0 bg-amber-500 text-amber-950">
                  <div className="w-full flex justify-between items-center mb-2">
                    <h2 className="text-3xl font-black">{order?.orderNumber || '---'}</h2>
                    <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg font-black text-sm bg-amber-950 text-amber-500 border border-amber-900/50">
                      <Clock className="w-4 h-4" /> AGENDADO
                    </div>
                  </div>
                  <span className="text-xs font-bold uppercase tracking-wider bg-amber-600/20 px-2 py-1 rounded-md w-full">
                    {job.station} - Para: {scheduledForStr}
                  </span>
                </header>

                <div className="p-5 overflow-y-auto grow bg-transparent">
                   <pre className="whitespace-pre-wrap font-mono text-xs text-amber-950 dark:text-amber-50 leading-tight bg-white/50 dark:bg-black/50 p-3 rounded-lg border border-amber-500/20">
                     {job.content}
                   </pre>
                </div>

                <footer className="p-4 rounded-b-2xl border-t border-amber-500/20 shrink-0 flex flex-col gap-2">
                  <button
                    onClick={() => handlePrint(job.content)}
                    className="w-full bg-card border border-amber-500 text-amber-600 font-bold py-2 rounded-xl flex items-center justify-center gap-2 transition-colors hover:bg-amber-500 hover:text-amber-950"
                  >
                    <RefreshCw className="w-4 h-4" /> Imprimir Ticket
                  </button>
                  <button
                    onClick={() => handleComplete(job.id)}
                    disabled={updatingId === job.id}
                    className="w-full bg-amber-500 hover:bg-amber-600 shadow-md text-amber-950 border-t border-amber-400 text-lg font-black py-4 rounded-xl flex items-center justify-center gap-2 transition-colors disabled:opacity-70 uppercase tracking-widest"
                  >
                    <CheckCircle2 className="w-6 h-6" /> Concluir Agendamento
                  </button>
                </footer>
              </div>
            );
          })}

          {printJobs.filter(j => !j.order?.isScheduled).map(job => {
            const order = job.order;
            const elapsed = getElapsedMin(job.createdAt.toString());
            const isUrgent = elapsed > 15;

            return (
              <div 
                key={job.id} 
                className={`min-w-[340px] w-[340px] rounded-2xl flex flex-col max-h-full border border-border shadow-sm snap-start bg-card`}
              >
                <header className={`p-4 rounded-t-2xl flex justify-between items-start shrink-0 ${isUrgent ? 'bg-destructive' : 'bg-secondary'}`}>
                  <div>
                    <h2 className="text-3xl font-black text-destructive-foreground">{order?.orderNumber || '---'}</h2>
                    <span className="text-destructive-foreground text-xs font-medium uppercase tracking-wider">
                      {job.station} - {order?.fulfillmentType === 'delivery' ? 'Entrega' : 'Salão'}
                    </span>
                  </div>
                  <div className={`flex items-center gap-1.5 px-2 py-1 rounded-lg font-black text-sm bg-muted text-destructive-foreground border border-border`}>
                    <Clock className="w-4 h-4" /> {elapsed}m
                  </div>
                </header>

                <div className="p-5 overflow-y-auto grow bg-card">
                   <pre className="whitespace-pre-wrap font-mono text-xs text-foreground leading-tight bg-muted p-3 rounded-lg border border-border">
                     {job.content}
                   </pre>
                </div>

                <footer className="p-4 bg-card rounded-b-2xl border-t border-border shrink-0 flex flex-col gap-2">
                  <button
                    onClick={() => handlePrint(job.content)}
                    className="w-full bg-card border border-border text-primary font-bold py-2 rounded-xl flex items-center justify-center gap-2 transition-colors hover:bg-muted hover:text-foreground"
                  >
                    <RefreshCw className="w-4 h-4" /> Imprimir Ticket
                  </button>
                  <button
                    onClick={() => handleComplete(job.id)}
                    disabled={updatingId === job.id}
                    className="w-full bg-status-open hover:bg-status-open/90 shadow-md text-destructive-foreground border-t border-status-open/50 text-lg font-black py-4 rounded-xl flex items-center justify-center gap-2 transition-colors disabled:opacity-70 uppercase tracking-widest"
                  >
                    <CheckCircle2 className="w-6 h-6" /> Concluir Setor
                  </button>
                </footer>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
