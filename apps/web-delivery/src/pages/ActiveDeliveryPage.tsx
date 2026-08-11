import { useState, useEffect } from 'react';
import { useAuthStore } from '../store/authStore';
import { Package, Power, Navigation, MapPin, CheckCircle2, Clock, Truck, Bell, BellOff } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useDriverTracking } from '../hooks/useDriverTracking';
import { usePushNotifications } from '../hooks/usePushNotifications';
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
  const updateUser = useAuthStore((state) => state.updateUser);
  const navigate = useNavigate();

  const { isTracking, startTracking, stopTracking, error, lastLocation, lastDeliveryEvent } = useDriverTracking();

  const [runs, setRuns] = useState<DeliveryRun[]>([]);
  const [loadingRuns, setLoadingRuns] = useState(true);
  const [statusLoading, setStatusLoading] = useState(false);
  const [realtimeNotice, setRealtimeNotice] = useState<string | null>(null);

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

  useEffect(() => {
    if (!lastDeliveryEvent) return;
    setRealtimeNotice(
      lastDeliveryEvent.type === 'delivery.assigned'
        ? `Nova entrega #${lastDeliveryEvent.orderNumber} atribuída a você.`
        : `A entrega #${lastDeliveryEvent.orderNumber} foi atualizada.`,
    );
    void fetchRuns();
  }, [lastDeliveryEvent]);

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
    await cleanupPushForLogout();
    await api.post('/auth/driver/logout').catch(() => undefined);
    logout();
    navigate('/login');
  };

  const handleOperationalStatus = async () => {
    if (!user) return;
    const nextStatus = user.status === 'available' ? 'offline' : 'available';
    setStatusLoading(true);
    try {
      const response = await api.patch('/delivery/driver/status', { status: nextStatus });
      const data = response.data.success ? response.data.data : response.data;
      updateUser({ ...user, status: data.status });
    } catch {
      alert('Não foi possível alterar a disponibilidade. Conclua a entrega ativa primeiro.');
      void fetchRuns();
    } finally {
      setStatusLoading(false);
    }
  };

  const pendingRuns = runs.filter((r) => r.status === 'ready_for_delivery');
  const activeRuns = runs.filter((r) => r.status === 'out_for_delivery');

  const { permissionState, isSubscribed, isLoading: pushLoading, requestPermissionAndSubscribe, unsubscribe: unsubscribePush, cleanupForLogout: cleanupPushForLogout } = usePushNotifications();
  const showPushBanner = permissionState !== 'unsupported' && permissionState !== 'denied' && !isSubscribed;

  return (
    <div className="delivery-shell flex flex-col max-w-md mx-auto relative overflow-hidden font-sans">
      <header className="bg-[var(--delivery-card)] border-b border-[var(--delivery-border)] px-4 py-3 flex items-center justify-between shadow-sm relative z-10">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-orange-100 flex items-center justify-center">
            <Package className="w-5 h-5 text-orange-600" />
          </div>
          <div>
            <h1 className="font-bold text-[var(--delivery-foreground)] leading-tight tracking-tight">Motoboy</h1>
            <p className="text-[10px] text-[var(--delivery-muted-foreground)] font-medium leading-none">{user?.name}</p>
          </div>
        </div>

        <button
          onClick={handleLogout}
          className="p-2 flex items-center justify-center rounded-lg text-[var(--delivery-muted-foreground)] hover:text-red-500 hover:bg-red-50 transition-colors"
        >
          <Power className="w-5 h-5" />
        </button>
      </header>

      {/* Banner de push notifications */}
      {showPushBanner && (
        <div className="mx-3 mt-3 p-3 bg-orange-50 border border-orange-200 rounded-xl flex items-center gap-3">
          <div className="flex-shrink-0 w-9 h-9 rounded-lg bg-orange-100 flex items-center justify-center">
            <Bell className="w-5 h-5 text-orange-600" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-slate-800 leading-tight">Ativar alertas</p>
            <p className="text-xs text-slate-500">Receba novas corridas mesmo com o app em segundo plano</p>
          </div>
          <button
            onClick={requestPermissionAndSubscribe}
            disabled={pushLoading}
            className="flex-shrink-0 px-3 py-1.5 bg-orange-500 text-white text-xs font-bold rounded-lg disabled:opacity-50 hover:bg-orange-600 transition-colors"
          >
            {pushLoading ? '...' : 'Ativar'}
          </button>
        </div>
      )}
      {isSubscribed && (
        <div className="mx-3 mt-3 px-3 py-2 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center gap-2">
          <Bell className="w-4 h-4 text-emerald-600" />
          <p className="text-xs font-medium text-emerald-700 flex-1">Alertas de entrega ativos</p>
          <button onClick={unsubscribePush} className="text-xs text-[var(--delivery-muted-foreground)] hover:text-red-500 transition-colors">
            <BellOff className="w-4 h-4" />
          </button>
        </div>
      )}
      <main className="flex-1 overflow-y-auto px-4 py-6 flex flex-col gap-6">

        {realtimeNotice && (
          <div role="status" className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-sm font-semibold text-blue-800">
            {realtimeNotice}
          </div>
        )}

        <div className="bg-[var(--delivery-card)] p-5 rounded-2xl shadow-sm border border-[var(--delivery-border)] flex items-center justify-between gap-4">
          <div>
            <h2 className="text-sm font-bold text-[var(--delivery-foreground)]">Disponibilidade</h2>
            <p className="text-xs text-[var(--delivery-muted-foreground)]">
              {user?.status === 'available' ? 'Você está online para receber entregas.' : user?.status === 'busy' ? 'Você está ocupado com uma entrega.' : 'Você está offline.'}
            </p>
          </div>
          <button
            onClick={handleOperationalStatus}
            disabled={statusLoading || user?.status === 'busy'}
            className="rounded-xl bg-orange-500 px-4 py-2 text-xs font-bold text-white disabled:opacity-50"
          >
            {user?.status === 'available' ? 'Ficar offline' : 'Ficar online'}
          </button>
        </div>

        {/* GPS Status Card */}
        <div className="bg-[var(--delivery-card)] p-5 rounded-2xl shadow-sm border border-[var(--delivery-border)] flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-[var(--delivery-foreground)] flex items-center gap-2">
              <Navigation className="w-4 h-4 text-blue-500" />
              Rastreamento Automático
            </h2>
            <div className={`px-2 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider ${isTracking ? 'bg-emerald-100 text-emerald-700' : 'bg-[var(--delivery-muted)] text-[var(--delivery-muted-foreground)]'}`}>
              {isTracking ? 'ATIVO' : 'PAUSADO'}
            </div>
          </div>

          <p className="text-xs text-[var(--delivery-muted-foreground)] leading-relaxed">
            Mantenha o rastreamento ativo durante a sua jornada para que a loja e os clientes possam acompanhar as entregas em tempo real.
          </p>

          {isTracking && lastLocation && (
            <div className="bg-[var(--delivery-muted)] rounded-lg p-3 border border-[var(--delivery-border)] flex items-center gap-3">
              <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <p className="text-[11px] text-[var(--delivery-muted-foreground)] font-mono">
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
            {isTracking ? 'Parar localização' : 'Permitir localização'}
          </button>
        </div>

        {/* Pending (ready_for_delivery) - BUG 3 FIX: now shows these */}
        {pendingRuns.length > 0 && (
          <div className="bg-[var(--delivery-card)] p-5 rounded-2xl shadow-sm border border-amber-200/60">
            <h2 className="text-sm font-bold text-[var(--delivery-foreground)] flex items-center gap-2 mb-4">
              <Clock className="w-4 h-4 text-amber-500" />
              Aguardando Saída ({pendingRuns.length})
            </h2>
            <div className="space-y-3">
              {pendingRuns.map((run) => (
                <div key={run.id} className="border border-amber-100 bg-amber-50/50 rounded-xl p-4 flex flex-col gap-2">
                  <div className="flex justify-between items-start">
                    <div>
                      <h3 className="font-bold text-[var(--delivery-foreground)] text-sm">#{run.orderNumber}</h3>
                      <p className="text-xs text-[var(--delivery-muted-foreground)] font-medium">{run.customerName}</p>
                    </div>
                    <RunStatusBadge status={run.status} />
                  </div>
                  {run.deliveryAddress && (
                    <div className="bg-[var(--delivery-card)] p-3 rounded-lg border border-amber-200/60">
                      <p className="text-xs text-[var(--delivery-muted-foreground)] flex items-start gap-1">
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
        <div className="bg-[var(--delivery-card)] p-5 rounded-2xl shadow-sm border border-[var(--delivery-border)] mb-8">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-bold text-[var(--delivery-foreground)] flex items-center gap-2">
              <MapPin className="w-4 h-4 text-orange-500" />
              Entregas em Rota {activeRuns.length > 0 ? `(${activeRuns.length})` : ''}
            </h2>
            <button onClick={fetchRuns} className="text-[10px] text-blue-500 font-bold uppercase tracking-wider bg-blue-50 px-2 py-1 rounded">
              Atualizar
            </button>
          </div>

          {loadingRuns ? (
            <div className="text-center py-6">
              <p className="text-sm text-[var(--delivery-muted-foreground)]">Carregando...</p>
            </div>
          ) : activeRuns.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-sm text-[var(--delivery-muted-foreground)]">
                {pendingRuns.length > 0
                  ? 'Aguardando despacho das entregas acima.'
                  : 'Nenhuma entrega atribuída a você no momento.'}
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {activeRuns.map((run) => (
                <div key={run.id} className="border border-[var(--delivery-border)] rounded-xl p-4 flex flex-col gap-3">
                  <div className="flex justify-between items-start">
                    <div>
                      <h3 className="font-bold text-[var(--delivery-foreground)] text-sm">#{run.orderNumber}</h3>
                      <p className="text-xs text-[var(--delivery-muted-foreground)] font-medium">{run.customerName}</p>
                    </div>
                    <RunStatusBadge status={run.status} />
                  </div>

                  {run.deliveryAddress && (
                    <div className="bg-[var(--delivery-muted)] p-3 rounded-lg border border-[var(--delivery-border)]">
                      <p className="text-xs text-[var(--delivery-muted-foreground)] flex items-start gap-1">
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
                        className="flex-1 py-2 rounded-lg text-xs font-bold bg-[var(--delivery-muted)] text-[var(--delivery-foreground)] hover:opacity-80 border border-[var(--delivery-border)] transition-colors"
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
