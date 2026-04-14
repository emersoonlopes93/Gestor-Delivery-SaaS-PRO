import { useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { MapContainer, Marker, Popup, TileLayer } from 'react-leaflet';
import type { LatLngExpression } from 'leaflet';
import { ArrowLeft, Loader2, Truck, MapPin } from 'lucide-react';
import { api } from '../lib/api-client';

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

export function PublicTrackingPage() {
  const { tenantSlug, token } = useParams<{ tenantSlug: string; token: string }>();
  const navigate = useNavigate();

  const query = useQuery({
    queryKey: ['public-tracking', token],
    queryFn: async (): Promise<PublicOrderTrackingResponse> => {
      const res = await api.get<PublicOrderTrackingResponse>(`/public/orders/${token}/tracking`);
      const normalized = normalizeTracking(res.data);
      if (!normalized) {
        throw new Error('Resposta inválida do tracking');
      }
      return normalized;
    },
    enabled: !!token,
    refetchInterval: 5000,
  });

  const defaultCenter: LatLngExpression = [-23.55052, -46.633308];

  const center = useMemo<LatLngExpression>(() => {
    if (query.data?.driverLocation) {
      return [query.data.driverLocation.lat, query.data.driverLocation.lng];
    }
    return defaultCenter;
  }, [query.data]);

  const statusLabel = (s: string) => s.replace(/_/g, ' ');

  return (
    <div className="px-4 py-6 max-w-lg mx-auto">
      <header className="flex items-center gap-3 mb-6">
        <button onClick={() => navigate(`/${tenantSlug}`)} className="p-2 hover:bg-gray-100 rounded-xl transition-colors">
          <ArrowLeft className="w-5 h-5 text-gray-700" />
        </button>
        <h1 className="text-lg font-black text-gray-900 uppercase tracking-tight">Tracking do Pedido</h1>
      </header>

      {!token ? (
        <div className="text-sm text-red-600">Token inválido.</div>
      ) : null}

      {query.isLoading ? (
        <div className="flex items-center gap-2 text-gray-600 text-sm">
          <Loader2 className="w-4 h-4 animate-spin" />
          Carregando tracking...
        </div>
      ) : null}

      {query.isError ? (
        <div className="text-sm text-red-600">Não foi possível carregar o tracking.</div>
      ) : null}

      {query.data ? (
        <>
          <section className="bg-gray-50 rounded-2xl p-4 mb-4 border border-gray-100 space-y-2">
            <div className="text-sm text-gray-600">
              Pedido: <strong className="text-gray-900">{query.data.orderId}</strong>
            </div>
            <div className="text-sm text-gray-600">
              Status: <strong className="text-gray-900 uppercase">{statusLabel(query.data.status)}</strong>
            </div>
            <div className="text-sm text-gray-600 flex items-center gap-2">
              <Truck className="w-4 h-4" />
              Entregador:{' '}
              <strong className="text-gray-900">{query.data.driver ? query.data.driver.name : 'Ainda não atribuído'}</strong>
            </div>
          </section>

          <section className="bg-white rounded-2xl p-4 border border-gray-100 overflow-hidden">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-black text-gray-700 uppercase tracking-widest flex items-center gap-2">
                <MapPin className="w-4 h-4" /> Localização
              </h2>
              <div className="text-xs text-gray-500">Atualiza a cada 5s</div>
            </div>

            <div className="h-[340px] w-full rounded-xl overflow-hidden border border-gray-100">
              <MapContainer center={center} zoom={15} style={{ height: '100%', width: '100%' }}>
                <TileLayer
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />

                {query.data.driverLocation ? (
                  <Marker position={[query.data.driverLocation.lat, query.data.driverLocation.lng]}>
                    <Popup>
                      <div className="text-sm">
                        <div className="font-semibold">Entregador</div>
                        <div>{query.data.driver ? query.data.driver.name : 'Em rota'}</div>
                        {query.data.driverLocation.lastLocationAt ? (
                          <div className="text-gray-600">Atualizado: {new Date(query.data.driverLocation.lastLocationAt).toLocaleString()}</div>
                        ) : null}
                      </div>
                    </Popup>
                  </Marker>
                ) : null}
              </MapContainer>
            </div>

            {!query.data.driverLocation ? (
              <div className="mt-3 text-xs text-gray-500">
                Localização do entregador ainda não disponível.
              </div>
            ) : null}
          </section>
        </>
      ) : null}
    </div>
  );
}
