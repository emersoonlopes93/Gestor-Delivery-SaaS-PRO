import { useState, useEffect, useCallback } from 'react';
import { RefreshCw, Clock, CheckCircle2, PlayCircle, ChefHat } from 'lucide-react';
import type { OrderKdsItemDTO, OrderStatus, UpdateOrderStatusDTO } from '@gestor/types';

const API_BASE = '/api/v1';

export function KdsPage() {
  const [stationId, setStationId] = useState<string>(localStorage.getItem('kds_station') || 'GERAL');
  const [printJobs, setPrintJobs] = useState<any[]>([]);
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

  return (
    <div className="p-6 h-[calc(100vh-64px)] flex flex-col bg-gray-50/50">
      <header className="flex flex-col md:flex-row md:items-center justify-between mb-6 shrink-0 gap-4">
        <div>
          <h1 className="text-2xl font-black text-gray-900 tracking-tight flex items-center gap-2">
            <ChefHat className="w-8 h-8 text-blue-600" /> KDS PRO
          </h1>
          <p className="text-sm text-gray-500 mt-1">Gestão de Produção Individualizada</p>
        </div>
        
        <div className="flex items-center gap-3">
          <select 
            value={stationId}
            onChange={(e) => setStationId(e.target.value)}
            className="bg-white border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5 font-bold shadow-sm"
          >
            <option value="GERAL">SETOR: GERAL</option>
            <option value="COZINHA">SETOR: COZINHA</option>
            <option value="BAR">SETOR: BAR</option>
            <option value="PIZZA">SETOR: PIZZA</option>
          </select>
          
          <button onClick={fetchJobs} className="p-2.5 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors shadow-sm" title="Atualizar">
            <RefreshCw className={`w-5 h-5 text-gray-700 ${updatingId ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </header>

      {loading ? (
        <div className="text-center py-12 text-gray-400 font-bold text-lg">Carregando painel KDS...</div>
      ) : printJobs.length === 0 ? (
        <div className="flex flex-col items-center justify-center grow pb-20">
          <ChefHat className="w-16 h-16 text-gray-200 mb-4" />
          <h2 className="text-2xl font-black text-gray-400">Nenhum pedido para este setor!</h2>
        </div>
      ) : (
        <div className="flex gap-4 overflow-x-auto overflow-y-hidden pb-4 grow items-start snap-x">
          {printJobs.map(job => {
            const order = job.order;
            const elapsed = getElapsedMin(job.createdAt);
            const isUrgent = elapsed > 15;

            return (
              <div 
                key={job.id} 
                className={`min-w-[340px] w-[340px] rounded-2xl flex flex-col max-h-full border border-gray-200 shadow-sm snap-start bg-white`}
              >
                <header className={`p-4 rounded-t-2xl flex justify-between items-start shrink-0 ${isUrgent ? 'bg-red-600' : 'bg-gray-800'}`}>
                  <div>
                    <h2 className="text-3xl font-black text-white">{order?.orderNumber || '---'}</h2>
                    <span className="text-white/70 text-xs font-medium uppercase tracking-wider">
                      {job.station} - {order?.fulfillmentType === 'delivery' ? 'Entrega' : 'Salão'}
                    </span>
                  </div>
                  <div className={`flex items-center gap-1.5 px-2 py-1 rounded-lg font-black text-sm bg-white/20 text-white`}>
                    <Clock className="w-4 h-4" /> {elapsed}m
                  </div>
                </header>

                <div className="p-5 overflow-y-auto grow bg-white/50">
                   {/* Digital Ticket Content */}
                   <pre className="whitespace-pre-wrap font-mono text-xs text-gray-800 leading-tight bg-gray-50 p-3 rounded-lg border border-gray-100">
                     {job.content}
                   </pre>
                </div>

                <footer className="p-4 bg-white rounded-b-2xl border-t border-gray-100 shrink-0">
                  <button
                    onClick={() => handleComplete(job.id)}
                    disabled={updatingId === job.id}
                    className="w-full bg-green-500 hover:bg-green-600 shadow-md text-white border-t border-green-400/50 text-lg font-black py-4 rounded-xl flex items-center justify-center gap-2 transition-colors disabled:opacity-50 uppercase tracking-widest"
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
