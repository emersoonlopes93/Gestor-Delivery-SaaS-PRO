import { useMemo, useState } from 'react';
import { MapContainer, Marker, Popup, TileLayer } from 'react-leaflet';
import type { LatLngExpression } from 'leaflet';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import type { DriverDTO, OrderDispatchItemDTO } from '@gestor/types';

type DriverMarker = {
  id: string;
  name: string;
  status: string;
  lat: number;
  lng: number;
  lastLocationAt: string | null;
};

type OrderMarker = {
  id: string;
  orderNumber: string;
  status: string;
  customerName: string;
  lat: number;
  lng: number;
  deliveryDriverName: string | null;
};

function pickNumber(obj: Record<string, unknown>, key: string): number | null {
  const v = obj[key];
  return typeof v === 'number' ? v : null;
}

function normalizeDriverMarkers(drivers: DriverDTO[]): DriverMarker[] {
  const out: DriverMarker[] = [];
  for (const d of drivers) {
    const rec = d as unknown as Record<string, unknown>;
    const lat = pickNumber(rec, 'currentLat');
    const lng = pickNumber(rec, 'currentLng');
    if (lat == null || lng == null) continue;

    out.push({
      id: d.id,
      name: d.name,
      status: String(d.status),
      lat,
      lng,
      lastLocationAt: typeof rec['lastLocationAt'] === 'string' ? (rec['lastLocationAt'] as string) : null,
    });
  }
  return out;
}

function normalizeOrderMarkers(orders: OrderDispatchItemDTO[]): OrderMarker[] {
  const out: OrderMarker[] = [];
  for (const o of orders) {
    const rec = o as unknown as Record<string, unknown>;
    const lat = pickNumber(rec, 'deliveryLat');
    const lng = pickNumber(rec, 'deliveryLng');
    if (lat == null || lng == null) continue;

    out.push({
      id: o.id,
      orderNumber: o.orderNumber,
      status: String(o.status),
      customerName: o.customerName,
      lat,
      lng,
      deliveryDriverName: o.deliveryDriverName ?? null,
    });
  }
  return out;
}

export function DeliveryMapPage() {
  const [follow, setFollow] = useState<'none' | 'drivers' | 'orders'>('none');

  const driversQuery = useQuery({
    queryKey: ['delivery-map', 'drivers'],
    queryFn: async (): Promise<DriverDTO[]> => {
      const res = await api.get<DriverDTO[]>('/delivery/drivers');
      return res.data;
    },
    refetchInterval: 5000,
  });

  const ordersQuery = useQuery({
    queryKey: ['delivery-map', 'orders'],
    queryFn: async (): Promise<OrderDispatchItemDTO[]> => {
      const res = await api.get<OrderDispatchItemDTO[]>('/orders/operation/dispatch');
      return res.data;
    },
    refetchInterval: 5000,
  });

  const driverMarkers = useMemo(
    () => normalizeDriverMarkers(driversQuery.data ?? []),
    [driversQuery.data],
  );

  const orderMarkers = useMemo(
    () => normalizeOrderMarkers(ordersQuery.data ?? []),
    [ordersQuery.data],
  );

  const defaultCenter: LatLngExpression = [-23.55052, -46.633308];

  const center = useMemo<LatLngExpression>(() => {
    if (follow === 'drivers' && driverMarkers.length > 0) {
      return [driverMarkers[0].lat, driverMarkers[0].lng];
    }
    if (follow === 'orders' && orderMarkers.length > 0) {
      return [orderMarkers[0].lat, orderMarkers[0].lng];
    }
    return defaultCenter;
  }, [follow, driverMarkers, orderMarkers]);

  const isLoading = driversQuery.isLoading || ordersQuery.isLoading;
  const isError = driversQuery.isError || ordersQuery.isError;

  return (
    <div className="p-6 max-w-7xl mx-auto h-full flex flex-col">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Mapa de Logística (Tempo Real)</h1>
          <p className="text-sm text-gray-500">Motoristas e pedidos com polling a cada 5s.</p>
        </div>

        <div className="flex items-center gap-3">
          <label className="text-sm text-gray-600">Seguir:</label>
          <select
            className="text-sm border-gray-300 rounded focus:ring-primary-500 focus:border-primary-500 bg-gray-50"
            value={follow}
            onChange={(e) => {
              const v = e.target.value;
              if (v === 'none' || v === 'drivers' || v === 'orders') setFollow(v);
            }}
          >
            <option value="none">Nenhum</option>
            <option value="drivers">Entregadores</option>
            <option value="orders">Pedidos</option>
          </select>
        </div>
      </div>

      {isLoading ? <div className="text-sm text-gray-500">Carregando dados do mapa...</div> : null}
      {isError ? <div className="text-sm text-red-600">Erro ao carregar dados do mapa.</div> : null}

      <div className="flex-1 min-h-[520px] bg-white border border-gray-100 rounded-xl overflow-hidden shadow-sm">
        <MapContainer center={center} zoom={13} style={{ height: '100%', width: '100%' }}>
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          {driverMarkers.map((d) => (
            <Marker key={`driver-${d.id}`} position={[d.lat, d.lng]}>
              <Popup>
                <div className="text-sm">
                  <div className="font-semibold">Entregador</div>
                  <div>{d.name}</div>
                  <div className="text-gray-600">Status: {d.status}</div>
                  {d.lastLocationAt ? <div className="text-gray-600">Atualizado: {new Date(d.lastLocationAt).toLocaleString()}</div> : null}
                </div>
              </Popup>
            </Marker>
          ))}

          {orderMarkers.map((o) => (
            <Marker key={`order-${o.id}`} position={[o.lat, o.lng]}>
              <Popup>
                <div className="text-sm">
                  <div className="font-semibold">Pedido {o.orderNumber}</div>
                  <div className="text-gray-600">Status: {o.status}</div>
                  <div>Cliente: {o.customerName}</div>
                  {o.deliveryDriverName ? <div className="text-gray-600">Entregador: {o.deliveryDriverName}</div> : null}
                </div>
              </Popup>
            </Marker>
          ))}
        </MapContainer>
      </div>

      <div className="mt-4 text-xs text-gray-500">
        Drivers no mapa: {driverMarkers.length} | Pedidos no mapa: {orderMarkers.length}
      </div>
    </div>
  );
}
