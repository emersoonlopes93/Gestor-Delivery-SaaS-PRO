import { useState, useEffect } from 'react';
import { useAuthStore } from '../store/authStore';
import { Package, Power, Navigation, MapPin, CheckCircle2, Clock, Truck } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useDriverTracking } from '../hooks/useDriverTracking';
import { api } from '../lib/api';

interface DeliveryRun {
  id: string;
  orderNumber: string;
  status: 'ready_for_delivery' | 'out_for_delivery';
  customerName: string;
  customerPhone: string;
  deliveryAddress: {
    street: string;
    number: string;
    neighborhood: string;
    city: string;
    complement?: string | null;
  } | null;
}

function RunStatusBadge({ status }: { status: DeliveryRun['status'] }) {
  if (status === 'ready_for_delivery') {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">
        <Clock className="w-3 h-3" />
        Aguardando Saída
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full">
      <Truck className="w-3 h-3" />
      Em Rota
    </span>
  );
}

export function ActiveDeliveryPage() {
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);
  const navigate = useNavigate();

  const { isTracking, startTracking, stopTracking, error, lastLocation } = useDriverTracking();

  const [runs, setRuns] = useState<DeliveryRun[]>([]);
  const [loadingRuns, setLoadingRuns] = useState(true);

  const fetchRuns = async () => {
    try {
      setLoadingRuns(true);
      const res = await api.get('/delivery/driver/active-runs');
      const data = res.data.success ? res.data.data : res.data;
      setRuns(data);
    } catch (err) {
      console.error('Failed to load active runs:', err);
    } finally {
      setLoadingRuns(false);
    }
  };

  useEffect(() => {
    fetchRuns();
    const interval = setInterval(fetchRuns, 15000);
    return () => clearInterval(interval);
  }, []);

  const handleComplete = async (runId: string) => {
    try {
      await api.patch(`/delivery/driver/runs/${runId}/complete`);
      fetchRuns();
    } catch (err) {
      console.error('Error completing run:', err);
      alert('Erro ao confirmar entrega.');
    }
  };

  const handleOpenMaps = (run: DeliveryRun) => {
    if (!run.deliveryAddress) return;
    const addr = `${run.deliveryAddress.street}, ${run.deliveryAddress.number}, ${run.deliveryAddress.neighborhood}, ${run.deliveryAddress.city}`;
    const url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addr)}`;
    window.open(url, '_blank');
  };

  const handleCallCustomer = (phone: string) => {
    window.location.href = `tel:${phone}`;
  };

  const handleLogout = async () => {
    stopTracking();
    await api.post('/auth/driver/logout').catch(() => undefined);
    logout();
    navigate('/login');
  };

  const pendingRuns = runs.filter((r) => r.status === 'ready_for_delivery');
  const activeRuns = runs.filter((r) => r.status === 'out_for_delivery');

  return (
    <div className="flex flex-col h-screen bg-slate-50 max-w-md mx-auto relative overflow-hidden font-sans">
      <header className="bg-white border-b border-slate-200 px-4 py-3 flex items-center justify-between shadow-sm relative z-10">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-orange-100 flex items-center justify-center">
            <Package className="w-5 h-5 text-orange-600" />
          </div>
          <div>
            <h1 className="font-bold text-slate-900 leading-tight tracking-tight">Motoboy</h1>
            <p className="text-[10px] text-slate-500 font-medium leading-none">{user?.name}</p>
          </div>
        </div>

        <button
          onClick={handleLogout}
          className="p-2 flex items-center justify-center rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors"
        >
          <Power className="w-5 h-5" />
        </button>
      </header>

      <main className="flex-1 overflow-y-auto px-4 py-6 flex flex-col gap-6">

        {/* GPS Status Card */}
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-800 flex items-center gap-2">
              <Navigation className="w-4 h-4 text-blue-500" />
              Rastreamento Automático
            </h2>
            <div className={`px-2 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider ${isTracking ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
              {isTracking ? 'ATIVO' : 'PAUSADO'}
            </div>
          </div>

          <p className="text-xs text-slate-500 leading-relaxed">
            Mantenha o rastreamento ativo durante a sua jornada para que a loja e os clientes possam acompanhar as entregas em tempo real.
          </p>

          {isTracking && lastLocation && (
            <div className="bg-slate-50 rounded-lg p-3 border border-slate-100 flex items-center gap-3">
              <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <p className="text-[11px] text-slate-500 font-mono">
                Lat: {lastLocation.lat.toFixed(6)} | Lng: {lastLocation.lng.toFixed(6)}
              </p>
            </div>
          )}

          {error && <p className="text-xs text-red-500 font-medium">{error}</p>}

          <button
            onClick={isTracking ? stopTracking : startTracking}
            className={`w-full py-3 rounded-xl font-bold transition-all active:scale-[0.98] ${
              isTracking
                ? 'bg-red-50 text-red-600 hover:bg-red-100 border border-red-100'
                : 'bg-gradient-to-r from-emerald-500 to-emerald-600 text-white hover:to-emerald-700 shadow-md shadow-emerald-500/20'
            }`}
          >
            {isTracking ? 'Pausar GPS' : 'Iniciar GPS (Ficar Online)'}
          </button>
        </div>

        {/* Pending (ready_for_delivery) - BUG 3 FIX: now shows these */}
        {pendingRuns.length > 0 && (
          <div className="bg-white p-5 rounded-2xl shadow-sm border border-amber-100">
            <h2 className="text-sm font-bold text-slate-800 flex items-center gap-2 mb-4">
              <Clock className="w-4 h-4 text-amber-500" />
              Aguardando Saída ({pendingRuns.length})
            </h2>
            <div className="space-y-3">
              {pendingRuns.map((run) => (
                <div key={run.id} className="border border-amber-100 bg-amber-50/50 rounded-xl p-4 flex flex-col gap-2">
                  <div className="flex justify-between items-start">
                    <div>
                      <h3 className="font-bold text-slate-800 text-sm">#{run.orderNumber}</h3>
                      <p className="text-xs text-slate-500 font-medium">{run.customerName}</p>
                    </div>
                    <RunStatusBadge status={run.status} />
                  </div>
                  {run.deliveryAddress && (
                    <div className="bg-white p-3 rounded-lg border border-amber-100">
                      <p className="text-xs text-slate-600 flex items-start gap-1">
                        <MapPin className="w-3 h-3 mt-0.5 shrink-0 text-amber-500" />
                        <span>
                          {run.deliveryAddress.street}, {run.deliveryAddress.number}
                          {run.deliveryAddress.neighborhood ? ` — ${run.deliveryAddress.neighborhood}` : ''}
                        </span>
                      </p>
                    </div>
                  )}
                  <p className="text-[10px] text-amber-600 text-center font-medium">
                    Aguardando despacho pela loja...
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Active deliveries (out_for_delivery) */}
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 mb-8">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-bold text-slate-800 flex items-center gap-2">
              <MapPin className="w-4 h-4 text-orange-500" />
              Entregas em Rota {activeRuns.length > 0 ? `(${activeRuns.length})` : ''}
            </h2>
            <button onClick={fetchRuns} className="text-[10px] text-blue-500 font-bold uppercase tracking-wider bg-blue-50 px-2 py-1 rounded">
              Atualizar
            </button>
          </div>

          {loadingRuns ? (
            <div className="text-center py-6">
              <p className="text-sm text-slate-400">Carregando...</p>
            </div>
          ) : activeRuns.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-sm text-slate-400">
                {pendingRuns.length > 0
                  ? 'Aguardando despacho das entregas acima.'
                  : 'Nenhuma entrega atribuída a você no momento.'}
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {activeRuns.map((run) => (
                <div key={run.id} className="border border-slate-100 rounded-xl p-4 flex flex-col gap-3">
                  <div className="flex justify-between items-start">
                    <div>
                      <h3 className="font-bold text-slate-800 text-sm">#{run.orderNumber}</h3>
                      <p className="text-xs text-slate-500 font-medium">{run.customerName}</p>
                    </div>
                    <RunStatusBadge status={run.status} />
                  </div>

                  {run.deliveryAddress && (
                    <div className="bg-slate-50 p-3 rounded-lg border border-slate-100">
                      <p className="text-xs text-slate-600 flex items-start gap-1">
                        <MapPin className="w-3 h-3 mt-0.5 shrink-0" />
                        <span>
                          {run.deliveryAddress.street}, {run.deliveryAddress.number}
                          {run.deliveryAddress.neighborhood ? ` — ${run.deliveryAddress.neighborhood}` : ''}
                        </span>
                      </p>
                    </div>
                  )}

                  <div className="flex gap-2">
                    {run.deliveryAddress && (
                      <button
                        onClick={() => handleOpenMaps(run)}
                        className="flex-1 py-2 rounded-lg text-xs font-bold bg-blue-50 text-blue-600 hover:bg-blue-100 border border-blue-100 transition-colors flex items-center justify-center gap-1"
                      >
                        <MapPin className="w-3 h-3" />
                        Ver no Mapa
                      </button>
                    )}
                    {run.customerPhone && (
                      <button
                        onClick={() => handleCallCustomer(run.customerPhone)}
                        className="flex-1 py-2 rounded-lg text-xs font-bold bg-slate-50 text-slate-600 hover:bg-slate-100 border border-slate-200 transition-colors"
                      >
                        Ligar
                      </button>
                    )}
                  </div>

                  <button
                    onClick={() => handleComplete(run.id)}
                    className="w-full py-2.5 mt-1 rounded-lg font-bold text-sm bg-emerald-50 text-emerald-600 hover:bg-emerald-100 border border-emerald-200 transition-colors flex items-center justify-center gap-2"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    Concluir Entrega
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

      </main>
    </div>
  );
}
