import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { MapContainer, Marker, Polyline, TileLayer } from 'react-leaflet';
import L from 'leaflet';
import type { LatLngExpression } from 'leaflet';
import {
  ArrowLeft,
  Clock,
  Loader2,
  MapPin,
  Package,
  ChefHat,
  Truck,
  CheckCircle,
} from 'lucide-react';
import { api } from '../lib/api-client';
import { useOrderSocket } from '../hooks/useOrderSocket';
import { useDeliverySocket } from '../hooks/useDeliverySocket';
import { useQueryClient } from '@tanstack/react-query';
import { logger } from '../lib/logger';

type LatLng = { lat: number; lng: number };

type PublicTrackingDriver = {
  id: string;
  name: string;
};

type PublicTrackingDriverLocation = {
  lat: number;
  lng: number;
  lastLocationAt: string | null;
};

type PublicOrderTrackingResponse = {
  orderId: string;
  status: string;
  driver: PublicTrackingDriver | null;
  driverLocation: PublicTrackingDriverLocation | null;
};

type StatusKey = 'confirmed' | 'preparing' | 'out_for_delivery' | 'completed';

type Step = {
  key: StatusKey;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
};

const STEPS: readonly Step[] = [
  { key: 'confirmed', label: 'Confirmado', icon: Package },
  { key: 'preparing', label: 'Em preparo', icon: ChefHat },
  { key: 'out_for_delivery', label: 'Saiu para entrega', icon: Truck },
  { key: 'completed', label: 'Entregue', icon: CheckCircle },
];

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

function pickString(obj: Record<string, unknown>, key: string): string | null {
  const v = obj[key];
  return typeof v === 'string' ? v : null;
}

function pickNumber(obj: Record<string, unknown>, key: string): number | null {
  const v = obj[key];
  return typeof v === 'number' ? v : null;
}

function normalizeTracking(payload: unknown): PublicOrderTrackingResponse | null {
  if (!isRecord(payload)) return null;

  const orderId = pickString(payload, 'orderId');
  const status = pickString(payload, 'status');
  if (!orderId || !status) return null;

  const driverRaw = payload['driver'];
  const driver = isRecord(driverRaw)
    ? (() => {
        const id = pickString(driverRaw, 'id');
        const name = pickString(driverRaw, 'name');
        return id && name ? { id, name } : null;
      })()
    : null;

  const locRaw = payload['driverLocation'];
  const driverLocation = isRecord(locRaw)
    ? (() => {
        const lat = pickNumber(locRaw, 'lat');
        const lng = pickNumber(locRaw, 'lng');
        if (lat == null || lng == null) return null;
        const lastLocationAt = pickString(locRaw, 'lastLocationAt');
        return { lat, lng, lastLocationAt };
      })()
    : null;

  return { orderId, status, driver, driverLocation };
}

function haversineKm(a: LatLng, b: LatLng): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;

  const x =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.sin(dLng / 2) * Math.sin(dLng / 2) * Math.cos(lat1) * Math.cos(lat2);
  const c = 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
  return R * c;
}

function estimateDeliveryTime(distanceKm: number): number {
  // heurística simples: base 6min + 3min por km, clamp 8..45
  const minutes = Math.round(6 + distanceKm * 3);
  return Math.max(8, Math.min(45, minutes));
}

function createDriverIcon(): L.DivIcon {
  const html = `
    <div style="
      width: 22px;
      height: 22px;
      border-radius: 9999px;
      background: #2563eb;
      border: 3px solid rgba(255,255,255,0.95);
      box-shadow: 0 10px 22px rgba(0,0,0,0.22);
    "></div>
  `;

  return L.divIcon({
    className: '',
    html,
    iconSize: [22, 22],
    iconAnchor: [11, 11],
  });
}

function createDestinationIcon(): L.DivIcon {
  const html = `
    <div style="
      width: 26px;
      height: 26px;
      border-radius: 12px;
      background: #0f172a;
      border: 3px solid rgba(255,255,255,0.95);
      box-shadow: 0 10px 22px rgba(0,0,0,0.22);
      transform: rotate(45deg);
    "></div>
  `;

  return L.divIcon({
    className: '',
    html,
    iconSize: [26, 26],
    iconAnchor: [13, 13],
  });
}

function isStatusKey(value: string): value is StatusKey {
  return value === 'confirmed' || value === 'preparing' || value === 'out_for_delivery' || value === 'completed';
}

function currentStepIndex(status: string): number {
  if (!isStatusKey(status)) {
    // fallback para status fora do stepper
    if (status === 'pending') return 0;
    if (status === 'ready_for_delivery') return 2;
    return 0;
  }

  const idx = STEPS.findIndex((s) => s.key === status);
  return idx >= 0 ? idx : 0;
}

const StatusStepper = memo(function StatusStepper(props: {
  status: string;
}) {
  const { status } = props;
  const activeIndex = currentStepIndex(status);

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-4">
      <div className="text-xs font-black text-gray-500 uppercase tracking-widest mb-3">Status do pedido</div>
      <div className="grid grid-cols-4 gap-2">
        {STEPS.map((s, idx) => {
          const Icon = s.icon;
          const isActive = idx <= activeIndex;
          return (
            <div key={s.key} className="flex flex-col items-center text-center">
              <div
                className={
                  'w-10 h-10 rounded-xl flex items-center justify-center border ' +
                  (isActive ? 'bg-primary-600 border-primary-600 text-white' : 'bg-gray-50 border-gray-200 text-gray-400')
                }
              >
                <Icon className="w-5 h-5" />
              </div>
              <div className={
                'mt-2 text-[11px] font-bold leading-tight ' +
                (isActive ? 'text-gray-900' : 'text-gray-400')
              }>
                {s.label}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
});

type AnimatedMarkerState = {
  from: LatLng;
  to: LatLng;
  startAt: number;
  durationMs: number;
};

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

export function OrderTrackingPage() {
  const { tenantSlug, orderId } = useParams<{ tenantSlug: string; orderId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [realtimeLocation, setRealtimeLocation] = useState<LatLng | null>(null);

  const token = orderId ? sessionStorage.getItem(`tracking:token:${orderId}`) : null;

  const dest = useMemo<LatLng | null>(() => {
    if (!orderId) return null;
    const raw = sessionStorage.getItem(`tracking:dest:${orderId}`);
    if (!raw) return null;
    try {
      const parsed: unknown = JSON.parse(raw);
      if (!isRecord(parsed)) return null;
      const lat = pickNumber(parsed, 'lat');
      const lng = pickNumber(parsed, 'lng');
      if (lat == null || lng == null) return null;
      return { lat, lng };
    } catch {
      return null;
    }
  }, [orderId]);

  const query = useQuery({
    queryKey: ['order-tracking-premium', token],
    queryFn: async (): Promise<PublicOrderTrackingResponse> => {
      if (!token) throw new Error('Token não encontrado');
      const res = await api.get<PublicOrderTrackingResponse>(`/public/orders/${token}/tracking`);
      const normalized = normalizeTracking(res.data);
      if (!normalized) throw new Error('Resposta inválida do tracking');
      return normalized;
    },
    enabled: !!token,
    refetchInterval: 60000, // Polling de backup (1 min)
  });

  // Real-time Status via Webhook
  useOrderSocket(token, (data) => {
    logger.log('Real-time status update received', data);
    // Invalida a query para forçar o refetch do objeto inteiro
    queryClient.invalidateQueries({ queryKey: ['order-tracking-premium', token] });
  });

  // Real-time Location via Webhook
  useDeliverySocket(token, (data: LatLng) => {
    setRealtimeLocation(data);
  });

  const driverIcon = useMemo(() => createDriverIcon(), []);
  const destIcon = useMemo(() => createDestinationIcon(), []);

  // Animação suave do marker do driver
  const [animatedPos, setAnimatedPos] = useState<LatLng | null>(null);
  const animRef = useRef<AnimatedMarkerState | null>(null);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const loc = realtimeLocation || query.data?.driverLocation;
    if (!loc) return;

    const next: LatLng = { lat: loc.lat, lng: loc.lng };
    const current: LatLng = animatedPos ?? next;

    animRef.current = {
      from: current,
      to: next,
      startAt: performance.now(),
      durationMs: 900,
    };

    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);

    const tick = (now: number) => {
      const st = animRef.current;
      if (!st) return;
      const t = clamp01((now - st.startAt) / st.durationMs);
      const eased = 1 - Math.pow(1 - t, 3); // easeOutCubic
      const p: LatLng = {
        lat: lerp(st.from.lat, st.to.lat, eased),
        lng: lerp(st.from.lng, st.to.lng, eased),
      };
      setAnimatedPos(p);

      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        rafRef.current = null;
      }
    };

    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query.data?.driverLocation?.lat, query.data?.driverLocation?.lng]);

  const driverPos = useMemo<LatLng | null>(() => {
    if (animatedPos) return animatedPos;
    const loc = realtimeLocation || query.data?.driverLocation;
    if (!loc) return null;
    return { lat: loc.lat, lng: loc.lng };
  }, [animatedPos, realtimeLocation, query.data?.driverLocation]);

  const distanceKm = useMemo(() => {
    if (!driverPos || !dest) return null;
    return haversineKm(driverPos, dest);
  }, [driverPos, dest]);

  const etaMin = useMemo(() => {
    if (distanceKm == null) return null;
    return estimateDeliveryTime(distanceKm);
  }, [distanceKm]);

  const defaultCenter: LatLngExpression = [-23.55052, -46.633308];

  const center = useMemo<LatLngExpression>(() => {
    if (driverPos) return [driverPos.lat, driverPos.lng];
    if (dest) return [dest.lat, dest.lng];
    return defaultCenter;
  }, [driverPos, dest]);

  return (
    <div className="px-4 py-6 max-w-lg mx-auto space-y-4">
      <header className="flex items-center gap-3">
        <button
          onClick={() => navigate(`/${tenantSlug}`)}
          className="p-2 hover:bg-gray-100 rounded-xl transition-colors"
        >
          <ArrowLeft className="w-5 h-5 text-gray-700" />
        </button>
        <div className="min-w-0">
          <div className="text-[11px] font-black text-gray-500 uppercase tracking-widest">Acompanhe seu pedido</div>
          <h1 className="text-lg font-black text-gray-900 truncate">Tracking em tempo real</h1>
        </div>
      </header>

      {!token ? (
        <div className="bg-white rounded-2xl border border-gray-100 p-4">
          <div className="font-bold text-gray-900">Não foi possível abrir o tracking</div>
          <div className="text-sm text-gray-600 mt-1">Este link depende do token do pedido. Volte à tela de confirmação.</div>
        </div>
      ) : null}

      {query.isLoading ? (
        <div className="bg-white rounded-2xl border border-gray-100 p-4 flex items-center gap-2 text-sm text-gray-600">
          <Loader2 className="w-4 h-4 animate-spin" /> Carregando tracking...
        </div>
      ) : null}

      {query.isError ? (
        <div className="bg-white rounded-2xl border border-red-100 p-4 text-sm text-red-700">
          Não foi possível carregar o tracking.
        </div>
      ) : null}

      {query.data ? (
        <>
          <StatusStepper status={query.data.status} />

          <div className="bg-white rounded-2xl border border-gray-100 p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs font-black text-gray-500 uppercase tracking-widest">Entrega</div>
                <div className="font-bold text-gray-900">{query.data.driver ? query.data.driver.name : 'Aguardando entregador'}</div>
              </div>
              <div className="text-right">
                <div className="text-xs text-gray-500 flex items-center gap-1 justify-end">
                  <Clock className="w-3.5 h-3.5" />
                  {etaMin != null ? `${etaMin} min` : '—'}
                </div>
                <div className="text-[11px] text-gray-500">
                  {distanceKm != null ? `${distanceKm.toFixed(1)} km` : ''}
                </div>
              </div>
            </div>

            <div className="mt-3 text-xs text-gray-500 flex items-center gap-2">
              <MapPin className="w-4 h-4" />
              Atualiza a cada 5s • Movimentos suavizados
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
            <div className="h-[360px] w-full">
              <MapContainer center={center} zoom={15} style={{ height: '100%', width: '100%' }}>
                <TileLayer
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />

                {dest ? (
                  <Marker position={[dest.lat, dest.lng]} icon={destIcon} />
                ) : null}

                {driverPos ? (
                  <Marker position={[driverPos.lat, driverPos.lng]} icon={driverIcon} />
                ) : null}

                {driverPos && dest ? (
                  <Polyline
                    positions={[
                      [driverPos.lat, driverPos.lng],
                      [dest.lat, dest.lng],
                    ]}
                    pathOptions={{ color: '#2563eb', weight: 4, opacity: 0.85 }}
                  />
                ) : null}
              </MapContainer>
            </div>

            {!dest ? (
              <div className="p-4 text-xs text-gray-500">
                Destino não disponível (sem lat/lng no endereço). Para UX iFood completa, precisamos do endereço geocodificado.
              </div>
            ) : null}

            {query.data.status !== 'out_for_delivery' ? (
              <div className="px-4 pb-4 text-xs text-gray-500">
                A localização do entregador aparece quando o pedido está em rota.
              </div>
            ) : null}
          </div>
        </>
      ) : null}
    </div>
  );
}
