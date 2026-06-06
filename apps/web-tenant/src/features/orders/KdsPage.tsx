import { useState, useEffect, useCallback, useMemo } from 'react';
import { RefreshCw, Clock, CheckCircle2, ChefHat, Printer, Eye, User, DollarSign, MessageSquare, X } from 'lucide-react';
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

interface KdsCardProps {
  job: KdsPrintJobDTO;
  onPrint: (content: string) => void;
  onComplete: (jobId: string) => void;
  updatingId: string | null;
  onViewTicket: (content: string) => void;
}

function KdsCard({ job, onPrint, onComplete, updatingId, onViewTicket }: KdsCardProps) {
  const order = job.order;
  const isScheduled = order?.isScheduled;
  const scheduledForStr = order?.scheduledFor 
    ? new Date(order.scheduledFor).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) 
    : '';

  const getElapsedMin = () => {
    const min = Math.floor((new Date().getTime() - new Date(job.createdAt).getTime()) / 60000);
    return min >= 0 ? min : 0;
  };

  const [elapsed, setElapsed] = useState(getElapsedMin());

  useEffect(() => {
    setElapsed(getElapsedMin());
    const timer = setInterval(() => {
      setElapsed(getElapsedMin());
    }, 30000); // atualiza a cada 30 segundos
    return () => clearInterval(timer);
  }, [job.createdAt]);

  // SLA Indicator por cores (sem quebra de linha nas tags)
  let slaBadge = null;
  if (isScheduled) {
    slaBadge = (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-[10px] font-black uppercase tracking-wider bg-amber-500/10 text-amber-500 border border-amber-500/20 whitespace-nowrap shrink-0 max-w-[140px] truncate" title={`Agendado ${scheduledForStr}`}>
        <Clock className="w-3.5 h-3.5 shrink-0" />
        <span className="truncate">Agendado {scheduledForStr}</span>
      </span>
    );
  } else {
    let indicator = '🟢';
    let slaColorClass = 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20';
    if (elapsed > 20) {
      indicator = '🔴';
      slaColorClass = 'bg-rose-500/10 text-rose-500 border border-rose-500/20 animate-pulse';
    } else if (elapsed >= 10) {
      indicator = '🟡';
      slaColorClass = 'bg-amber-500/10 text-amber-500 border border-amber-500/20';
    }
    
    slaBadge = (
      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-[10px] font-black tracking-wider whitespace-nowrap shrink-0 ${slaColorClass}`}>
        <span>{indicator}</span>
        <Clock className="w-3.5 h-3.5 shrink-0" />
        <span className="truncate">{elapsed} min</span>
      </span>
    );
  }

  const fmt = (v: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

  const fulfillmentLabels: Record<string, string> = {
    delivery: '📦 Entrega',
    pickup: '🏪 Retirada',
    dine_in: '🍽 Salão',
    table: '🍽 Mesa',
  };

  return (
    <div
      className={`w-full rounded-[24px] flex flex-col border border-border bg-card shadow-sm hover:shadow-md transition-all duration-200 ${
        isScheduled ? 'border-amber-500/30 ring-1 ring-amber-500/10' : ''
      }`}
    >
      {/* Header do Card (Alinhamento de elementos e prevenção de quebra) */}
      <header className="p-4 border-b border-border/40 flex items-center justify-between gap-3 bg-muted/20 rounded-t-[24px] min-w-0">
        <div className="min-w-0 flex-1">
          <h2 className="text-xl font-black text-foreground truncate">#{order?.orderNumber || '---'}</h2>
          <span className="text-[9px] font-black text-muted-foreground uppercase tracking-widest block mt-0.5 truncate">
            Setor: {job.station}
          </span>
        </div>
        <div className="shrink-0">
          {slaBadge}
        </div>
      </header>

      {/* Corpo do Card */}
      <div className="p-5 flex-1 flex flex-col space-y-4">
        {/* Lista de itens estruturada */}
        <div className="space-y-3.5">
          {order?.items?.map((item) => (
            <div key={item.id} className="pb-3 border-b border-border/30 last:border-b-0">
              <div className="flex items-start justify-between font-bold text-foreground text-sm">
                <span>🍕 {item.quantity}x {item.snapshotName}</span>
              </div>
              
              {/* Complementos */}
              {item.complements && item.complements.length > 0 && (
                <div className="pl-6 mt-1.5 text-xs text-muted-foreground font-medium space-y-0.5">
                  {item.complements.map(c => (
                    <div key={c.id} className="flex justify-between">
                      <span>+ {c.snapshotName}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Combo Selections */}
              {item.comboSelections && item.comboSelections.length > 0 && (
                <div className="pl-6 mt-1.5 text-xs text-muted-foreground font-medium space-y-0.5">
                  {item.comboSelections.map(s => (
                    <div key={s.id} className="flex justify-between">
                      <span>- {s.snapshotProductName}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Observação do Item */}
              {item.notes && (
                <div className="pl-6 mt-1.5 flex items-start gap-1 text-[11px] text-amber-600 dark:text-amber-400 font-semibold bg-amber-500/5 p-1.5 rounded-lg border border-amber-500/10">
                  <MessageSquare className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  <span>Obs: {item.notes}</span>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Observações Gerais do Pedido */}
        {order?.notes && (
          <div className="p-3 bg-amber-500/5 rounded-xl border border-amber-500/15 flex items-start gap-2">
            <MessageSquare className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
            <div className="text-xs">
              <p className="font-bold text-amber-600 dark:text-amber-400">Obs do Pedido:</p>
              <p className="text-amber-700 dark:text-amber-300 font-medium mt-0.5 leading-relaxed">{order.notes}</p>
            </div>
          </div>
        )}
      </div>

      {/* Info do Cliente e Tipo de Pedido (Prevenção de quebra de tags no rodapé) */}
      <div className="px-4 py-3 border-t border-b border-border/40 bg-muted/10 flex justify-between items-center gap-2 text-xs font-bold text-foreground min-w-0">
        <span className="flex items-center gap-1.5 min-w-0 flex-1">
          <User className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
          <span className="truncate">{order?.customerName}</span>
        </span>
        <span className="flex items-center gap-1 shrink-0">
          <DollarSign className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
          <span className="truncate">{order ? fmt(order.total) : '---'}</span>
        </span>
        <span className="px-2 py-0.5 rounded-lg bg-secondary text-secondary-foreground text-[9px] font-black uppercase tracking-wider whitespace-nowrap shrink-0 max-w-[100px] truncate" title={fulfillmentLabels[order?.fulfillmentType || ''] || order?.fulfillmentType || 'Outro'}>
          {fulfillmentLabels[order?.fulfillmentType || ''] || order?.fulfillmentType || 'Outro'}
        </span>
      </div>

      {/* Ações do Card (Botões harmonizados com proporções padronizadas) */}
      <footer className="p-4 flex flex-col gap-2 bg-card rounded-b-[24px]">
        <div className="flex gap-2">
          <button
            onClick={() => onPrint(job.content)}
            className="flex-1 bg-secondary hover:bg-secondary/80 text-secondary-foreground font-black text-[10px] py-2 rounded-xl flex items-center justify-center gap-1.5 transition-all border border-border/50 hover:border-border active:scale-95 whitespace-nowrap"
            title="Imprimir Ticket"
          >
            <Printer className="w-3.5 h-3.5 shrink-0" />
            <span>Imprimir</span>
          </button>
          
          <button
            onClick={() => onViewTicket(job.content)}
            className="flex-1 bg-secondary hover:bg-secondary/80 text-secondary-foreground font-black text-[10px] py-2 rounded-xl flex items-center justify-center gap-1.5 transition-all border border-border/50 hover:border-border active:scale-95 whitespace-nowrap"
            title="Visualizar Ticket Original"
          >
            <Eye className="w-3.5 h-3.5 shrink-0" />
            <span>Ver Ticket</span>
          </button>
        </div>

        <button
          onClick={() => onComplete(job.id)}
          disabled={updatingId === job.id}
          className={`w-full text-xs font-black py-2.5 rounded-xl flex items-center justify-center gap-2 transition-all active:scale-[0.98] disabled:opacity-70 uppercase tracking-wider ${
            isScheduled 
              ? 'bg-amber-500 hover:bg-amber-600 text-amber-950 shadow-md shadow-amber-500/10' 
              : 'bg-status-open hover:bg-status-open/90 text-destructive-foreground shadow-md shadow-emerald-500/10'
          }`}
        >
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{isScheduled ? 'Concluir Agendamento' : 'Concluir Setor'}</span>
        </button>
      </footer>
    </div>
  );
}

export function KdsPage() {
  const [stationId, setStationId] = useState<string>(localStorage.getItem('kds_station') || 'ALL');
  const [printJobs, setPrintJobs] = useState<KdsPrintJobDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [stations, setStations] = useState<string[]>(['GERAL']);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [viewingTicketContent, setViewingTicketContent] = useState<string | null>(null);

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
    <div className="p-6 h-screen md:h-[calc(100vh-64px)] flex flex-col bg-background overflow-y-auto">
      <header className="flex flex-col md:flex-row md:items-center justify-between mb-6 shrink-0 gap-4 bg-card border border-border p-5 rounded-[24px] shadow-sm">
        <div>
          <h1 className="text-2xl font-black text-foreground tracking-tight flex items-center gap-2">
            <ChefHat className="w-8 h-8 text-primary" /> KDS PRO
          </h1>
          <p className="text-sm text-muted-foreground mt-1 font-bold uppercase tracking-wider text-[11px]">Gestão de Produção Individualizada</p>
        </div>

        <div className="flex items-center gap-3">
          <select
            value={stationId}
            onChange={(e) => setStationId(e.target.value)}
            className="bg-card border border-input text-foreground text-sm rounded-xl focus:ring-ring focus:border-primary block w-full p-2.5 font-bold shadow-sm"
          >
            <option value="ALL">TODOS OS SETORES</option>
            {stations.map(st => (
              <option key={st} value={st}>SETOR: {st}</option>
            ))}
          </select>

          <button onClick={fetchJobs} className="p-2.5 bg-card border border-border rounded-xl hover:bg-muted transition-colors shadow-sm" title="Atualizar">
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
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 w-full grow pb-8 items-start">
          {printJobs.map(job => (
            <KdsCard
              key={job.id}
              job={job}
              onPrint={handlePrint}
              onComplete={handleComplete}
              updatingId={updatingId}
              onViewTicket={setViewingTicketContent}
            />
          ))}
        </div>
      )}

      {/* Modal de Visualização de Ticket */}
      {viewingTicketContent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setViewingTicketContent(null)} />
          <div className="relative z-10 w-full max-w-lg bg-card border border-border rounded-[28px] shadow-2xl flex flex-col max-h-[90vh]">
            <header className="px-6 py-5 border-b border-border/40 flex justify-between items-center bg-muted/20 rounded-t-[28px]">
              <h3 className="text-lg font-black text-foreground flex items-center gap-2">
                <ChefHat className="w-5 h-5 text-primary" /> Visualização do Ticket
              </h3>
              <button 
                onClick={() => setViewingTicketContent(null)} 
                className="p-2 hover:bg-muted rounded-2xl transition-all active:scale-90"
              >
                <X className="w-5 h-5 text-muted-foreground" />
              </button>
            </header>
            <div className="p-6 overflow-y-auto grow custom-scrollbar bg-card/60">
              <pre className="whitespace-pre-wrap font-mono text-xs text-foreground bg-muted p-4 rounded-2xl border border-border leading-relaxed">
                {viewingTicketContent}
              </pre>
            </div>
            <footer className="p-4 border-t border-border/40 flex justify-end gap-3 bg-muted/10 rounded-b-[28px]">
              <button
                onClick={() => {
                  handlePrint(viewingTicketContent);
                  setViewingTicketContent(null);
                }}
                className="bg-primary text-primary-foreground hover:bg-primary/90 px-6 py-2.5 rounded-xl font-black text-xs uppercase tracking-widest flex items-center gap-1.5 active:scale-95 transition-all shadow-md"
              >
                <Printer className="w-4 h-4" />
                <span>Imprimir Ticket</span>
              </button>
              <button
                onClick={() => setViewingTicketContent(null)}
                className="bg-secondary text-secondary-foreground hover:bg-secondary/80 px-6 py-2.5 rounded-xl font-black text-xs uppercase tracking-widest active:scale-95 transition-all"
              >
                Fechar
              </button>
            </footer>
          </div>
        </div>
      )}
    </div>
  );
}
