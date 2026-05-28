import { useState, useEffect, useCallback } from 'react';
import { RefreshCw, Clock, CheckCircle2, ChefHat } from 'lucide-react';
import { 
  KdsPrintJobDTO 
} from '@gestor/types';


const API_BASE = '/api/v1';

export function KdsPage() {
  const [stationId, setStationId] = useState<string>(localStorage.getItem('kds_station') || 'GERAL');
  const [printJobs, setPrintJobs] = useState<KdsPrintJobDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const token = localStorage.getItem('accessToken');

  const fetchJobs = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/kds/print-jobs?station=${stationId}&status=pending`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const json = await res.json();
        setPrintJobs(json.items || []);
      }
    } catch {
      // Ignore
    } finally {
      if (loading) setLoading(false);
    }
  }, [token, loading, stationId]);

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
      const res = await fetch(`${API_BASE}/kds/print-jobs/${jobId}/completed`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        await fetchJobs();
      }
    } catch {
      // Ignore
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
            <option value="GERAL">SETOR: GERAL</option>
            <option value="COZINHA">SETOR: COZINHA</option>
            <option value="BAR">SETOR: BAR</option>
            <option value="PIZZA">SETOR: PIZZA</option>
          </select>
          
          <button onClick={fetchJobs} className="p-2.5 bg-card border border-border rounded-lg hover:bg-muted transition-colors shadow-sm" title="Atualizar">
            <RefreshCw className={`w-5 h-5 text-foreground ${updatingId ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </header>

      {loading ? (
        <div className="text-center py-12 text-muted-foreground font-bold text-lg">Carregando painel KDS...</div>
      ) : printJobs.length === 0 ? (
        <div className="flex flex-col items-center justify-center grow pb-20">
          <ChefHat className="w-16 h-16 text-muted-foreground mb-4" />
          <h2 className="text-2xl font-black text-foreground">Nenhum pedido para este setor!</h2>
        </div>
      ) : (
        <div className="flex gap-4 overflow-x-auto overflow-y-hidden pb-4 grow items-start snap-x">
          {printJobs.map(job => {
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
