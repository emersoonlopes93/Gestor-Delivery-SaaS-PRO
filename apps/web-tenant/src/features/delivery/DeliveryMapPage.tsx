import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { MapContainer, Marker, Polyline, Popup, TileLayer, useMap } from 'react-leaflet';
import L from 'leaflet';
import type { LatLngBoundsExpression, LatLngExpression } from 'leaflet';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import { DriverStatus } from '@gestor/types';
import type { DriverDTO, OrderDispatchItemDTO } from '@gestor/types';

type DriverMarker = {
  id: string;
  name: string;
  status: DriverDTO['status'];
  lat: number;
  lng: number;
  lastLocationAt: string | null;
};

type OrderMarker = {
  id: string;
  orderNumber: string;
  status: OrderDispatchItemDTO['status'];
  customerName: string;
  lat: number;
  lng: number;
  deliveryDriverName: string | null;
  deliveryDriverId: string | null;
};

type SelectedTarget =
  | { kind: 'driver'; id: string }
  | { kind: 'order'; id: string }
  | null;

function fmtRelativeTime(iso: string | null): string {
  if (!iso) return '—';
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return '—';
  const diffSec = Math.max(0, Math.floor((Date.now() - t) / 1000));
  if (diffSec < 10) return 'agora';
  if (diffSec < 60) return `há ${diffSec}s`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `há ${diffMin}min`;
  const diffHr = Math.floor(diffMin / 60);
  return `há ${diffHr}h`;
}

function driverColor(status: DriverDTO['status']): string {
  switch (status) {
    case DriverStatus.available:
      return '#16a34a';
    case DriverStatus.busy:
      return '#2563eb';
    case DriverStatus.offline:
    default:
      return '#6b7280';
  }
}

function createDriverDivIcon(status: DriverDTO['status']): L.DivIcon {
  const color = driverColor(status);
  const html = `
    <div style="
      width: 22px;
      height: 22px;
      border-radius: 9999px;
      background: ${color};
      border: 3px solid rgba(255,255,255,0.95);
      box-shadow: 0 8px 18px rgba(0,0,0,0.18);
    "></div>
  `;

  return L.divIcon({
    className: '',
    html,
    iconSize: [22, 22],
    iconAnchor: [11, 11],
    popupAnchor: [0, -12],
  });
}

function createOrderDivIcon(): L.DivIcon {
  const html = `
    <div style="
      width: 24px;
      height: 24px;
      border-radius: 10px;
      background: #f97316;
      border: 3px solid rgba(255,255,255,0.95);
      box-shadow: 0 8px 18px rgba(0,0,0,0.18);
      transform: rotate(45deg);
    "></div>
  `;

  return L.divIcon({
    className: '',
    html,
    iconSize: [24, 24],
    iconAnchor: [12, 12],
    popupAnchor: [0, -12],
  });
}

function normalizeDriverMarkers(drivers: DriverDTO[]): DriverMarker[] {
  const out: DriverMarker[] = [];
  for (const d of drivers) {
    const lat = d.currentLat;
    const lng = d.currentLng;
    if (typeof lat !== 'number' || typeof lng !== 'number') continue;

    out.push({
      id: d.id,
      name: d.name,
      status: d.status,
      lat,
      lng,
      lastLocationAt: typeof d.lastLocationAt === 'string' ? d.lastLocationAt : null,
    });
  }
  return out;
}

function normalizeOrderMarkers(orders: OrderDispatchItemDTO[]): OrderMarker[] {
  const out: OrderMarker[] = [];
  for (const o of orders) {
    const lat = o.deliveryLat;
    const lng = o.deliveryLng;
    if (typeof lat !== 'number' || typeof lng !== 'number') continue;

    out.push({
      id: o.id,
      orderNumber: o.orderNumber,
      status: o.status,
      customerName: o.customerName,
      lat,
      lng,
      deliveryDriverName: o.deliveryDriverName ?? null,
      deliveryDriverId: o.deliveryDriverId ?? null,
    });
  }
  return out;
}

const MapActions = memo(function MapActions(props: {
  fitBoundsKey: number;
  selectedPosition: LatLngExpression | null;
}) {
  const { fitBoundsKey, selectedPosition } = props;
  const map = useMap();

  useEffect(() => {
    if (!selectedPosition) return;
    map.setView(selectedPosition, Math.max(map.getZoom(), 16), { animate: true });
  }, [map, selectedPosition]);

  useEffect(() => {
    if (fitBoundsKey <= 0) return;
    // fitBounds happens in parent by calling map.fitBounds via imperative ref;
    // this component exists mostly to avoid re-rendering MapContainer.
  }, [fitBoundsKey]);

  return null;
});

const MapRefSync = memo(function MapRefSync(props: {
  mapRef: React.MutableRefObject<L.Map | null>;
}) {
  const { mapRef } = props;
  const map = useMap();

  useEffect(() => {
    mapRef.current = map;
    return () => {
      if (mapRef.current === map) mapRef.current = null;
    };
  }, [map, mapRef]);

  return null;
});

const DriverMarkersLayer = memo(function DriverMarkersLayer(props: {
  drivers: readonly DriverMarker[];
  selected: SelectedTarget;
  onSelect: (t: SelectedTarget) => void;
}) {
  const { drivers, selected, onSelect } = props;

  const iconByStatus = useMemo(() => {
    return {
      [DriverStatus.available]: createDriverDivIcon(DriverStatus.available),
      [DriverStatus.busy]: createDriverDivIcon(DriverStatus.busy),
      [DriverStatus.offline]: createDriverDivIcon(DriverStatus.offline),
    } satisfies Record<DriverDTO['status'], L.DivIcon>;
  }, []);

  return (
    <>
      {drivers.map((d) => (
        <Marker
          key={`driver-${d.id}`}
          position={[d.lat, d.lng]}
          icon={iconByStatus[d.status]}
          eventHandlers={{
            click: () => onSelect({ kind: 'driver', id: d.id }),
          }}
        >
          <Popup>
            <div className="text-sm">
              <div className="font-semibold">{d.name}</div>
              <div className="text-gray-600 dark:text-gray-400">Status: {d.status === DriverStatus.available ? 'Disponível' : d.status === DriverStatus.busy ? 'Em rota' : 'Offline'}</div>
              <div className="text-gray-600 dark:text-gray-400">Último update: {fmtRelativeTime(d.lastLocationAt)}</div>
              {selected?.kind === 'driver' && selected.id === d.id ? (
                <div className="mt-2 text-[11px] text-primary-700 font-semibold">Selecionado</div>
              ) : null}
            </div>
          </Popup>
        </Marker>
      ))}
    </>
  );
});

const OrderMarkersLayer = memo(function OrderMarkersLayer(props: {
  orders: readonly OrderMarker[];
  selected: SelectedTarget;
  onSelect: (t: SelectedTarget) => void;
}) {
  const { orders, selected, onSelect } = props;
  const icon = useMemo(() => createOrderDivIcon(), []);

  return (
    <>
      {orders.map((o) => (
        <Marker
          key={`order-${o.id}`}
          position={[o.lat, o.lng]}
          icon={icon}
          eventHandlers={{
            click: () => onSelect({ kind: 'order', id: o.id }),
          }}
        >
          <Popup>
            <div className="text-sm">
              <div className="font-semibold">Pedido {o.orderNumber}</div>
              <div className="text-gray-600 dark:text-gray-400">Status: {o.status.replace(/_/g, ' ')}</div>
              <div>Cliente: {o.customerName}</div>
              <div className="text-gray-600 dark:text-gray-400">Entregador: {o.deliveryDriverName ?? '—'}</div>
              {selected?.kind === 'order' && selected.id === o.id ? (
                <div className="mt-2 text-[11px] text-primary-700 font-semibold">Selecionado</div>
              ) : null}
            </div>
          </Popup>
        </Marker>
      ))}
    </>
  );
});

export function DeliveryMapPage() {
  const [selected, setSelected] = useState<SelectedTarget>(null);
  const [isPanelOpen, setIsPanelOpen] = useState(true);
  const mapRef = useRef<L.Map | null>(null);
  const [fitSeq, setFitSeq] = useState(0);

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

  const outForDeliveryOrders = useMemo(() => {
    return orderMarkers.filter((o) => o.status === 'out_for_delivery');
  }, [orderMarkers]);

  const defaultCenter: LatLngExpression = [-23.55052, -46.633308];

  const selectedPosition = useMemo<LatLngExpression | null>(() => {
    if (!selected) return null;
    if (selected.kind === 'driver') {
      const d = driverMarkers.find((x) => x.id === selected.id);
      return d ? ([d.lat, d.lng] as LatLngExpression) : null;
    }
    const o = outForDeliveryOrders.find((x) => x.id === selected.id) ?? orderMarkers.find((x) => x.id === selected.id);
    return o ? ([o.lat, o.lng] as LatLngExpression) : null;
  }, [selected, driverMarkers, orderMarkers, outForDeliveryOrders]);

  const bounds = useMemo<LatLngBoundsExpression | null>(() => {
    const points: LatLngExpression[] = [];
    for (const d of driverMarkers) points.push([d.lat, d.lng]);
    for (const o of outForDeliveryOrders) points.push([o.lat, o.lng]);
    if (points.length < 2) return null;
    return points as LatLngBoundsExpression;
  }, [driverMarkers, outForDeliveryOrders]);

  const handleFit = useCallback(() => {
    if (!mapRef.current) return;
    if (bounds) {
      mapRef.current.fitBounds(bounds, { padding: [32, 32], animate: true });
    } else if (selectedPosition) {
      mapRef.current.setView(selectedPosition, 16, { animate: true });
    } else {
      mapRef.current.setView(defaultCenter, 13, { animate: true });
    }
    setFitSeq((v) => v + 1);
  }, [bounds, defaultCenter, selectedPosition]);

  const handleSelect = useCallback((t: SelectedTarget) => {
    setSelected(t);
  }, []);

  const isLoading = driversQuery.isLoading || ordersQuery.isLoading;
  const isError = driversQuery.isError || ordersQuery.isError;

  return (
    <div className="h-full w-full">
      <div className="p-6 max-w-7xl mx-auto">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Operação — Mapa em tempo real</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">Drivers e pedidos em rota. Polling a cada 5s.</p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleFit}
              className="h-10 px-3 rounded-lg bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 text-sm font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 dark:bg-gray-900/50"
            >
              Ajustar mapa
            </button>
            <button
              type="button"
              onClick={() => setIsPanelOpen((v) => !v)}
              className="h-10 px-3 rounded-lg bg-primary-600 text-white text-sm font-semibold hover:bg-primary-700"
            >
              {isPanelOpen ? 'Ocultar painel' : 'Abrir painel'}
            </button>
          </div>
        </div>

        {isLoading ? <div className="text-sm text-gray-500 dark:text-gray-400">Carregando dados do mapa...</div> : null}
        {isError ? <div className="text-sm text-red-600">Erro ao carregar dados do mapa.</div> : null}

        {driverMarkers.length === 0 && outForDeliveryOrders.length === 0 && !isLoading ? (
          <div className="text-sm text-gray-500 dark:text-gray-400 mb-4">
            Nenhum driver com localização disponível e nenhum pedido em rota.
          </div>
        ) : null}

        <div className="relative grid grid-cols-1 lg:grid-cols-[360px_1fr] gap-4">
          <div
            className={
              `lg:block ${isPanelOpen ? 'block' : 'hidden'} ` +
              'lg:static fixed left-0 right-0 bottom-0 lg:bottom-auto lg:right-auto lg:left-auto z-40'
            }
          >
            <div className="bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-xl shadow-sm overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
                <div>
                  <div className="font-bold text-gray-900 dark:text-gray-100">Painel operacional</div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">Clique para focar no mapa</div>
                </div>
                <button
                  type="button"
                  onClick={() => setIsPanelOpen(false)}
                  className="lg:hidden text-xs font-semibold text-gray-600 dark:text-gray-400"
                >
                  Fechar
                </button>
              </div>

              <div className="p-4 space-y-4 max-h-[60vh] lg:max-h-[650px] overflow-auto">
                <section>
                  <div className="flex items-center justify-between mb-2">
                    <h2 className="text-xs font-black text-gray-500 dark:text-gray-400 uppercase tracking-widest">Drivers</h2>
                    <div className="text-xs text-gray-500 dark:text-gray-400">{driverMarkers.length}</div>
                  </div>
                  <div className="space-y-2">
                    {driverMarkers.map((d) => (
                      <button
                        key={`panel-driver-${d.id}`}
                        type="button"
                        onClick={() => handleSelect({ kind: 'driver', id: d.id })}
                        className={
                          'w-full text-left rounded-lg border px-3 py-2 transition-colors ' +
                          (selected?.kind === 'driver' && selected.id === d.id
                            ? 'border-primary-300 bg-primary-50'
                            : 'border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800 dark:bg-gray-900/50')
                        }
                      >
                        <div className="flex items-center justify-between">
                          <div className="font-semibold text-sm text-gray-900 dark:text-gray-100 truncate">{d.name}</div>
                          <span
                            className="inline-flex items-center gap-1 text-[11px] font-bold"
                            style={{ color: driverColor(d.status) }}
                          >
                            <span
                              style={{ backgroundColor: driverColor(d.status) }}
                              className="inline-block w-2 h-2 rounded-full"
                            />
                            {d.status === DriverStatus.available ? 'Disponível' : d.status === DriverStatus.busy ? 'Em rota' : 'Offline'}
                          </span>
                        </div>
                        <div className="text-xs text-gray-500 dark:text-gray-400">Último update: {fmtRelativeTime(d.lastLocationAt)}</div>
                      </button>
                    ))}
                    {driverMarkers.length === 0 ? (
                      <div className="text-xs text-gray-400">Sem drivers com localização.</div>
                    ) : null}
                  </div>
                </section>

                <section>
                  <div className="flex items-center justify-between mb-2">
                    <h2 className="text-xs font-black text-gray-500 dark:text-gray-400 uppercase tracking-widest">Pedidos em rota</h2>
                    <div className="text-xs text-gray-500 dark:text-gray-400">{outForDeliveryOrders.length}</div>
                  </div>
                  <div className="space-y-2">
                    {outForDeliveryOrders.map((o) => (
                      <button
                        key={`panel-order-${o.id}`}
                        type="button"
                        onClick={() => handleSelect({ kind: 'order', id: o.id })}
                        className={
                          'w-full text-left rounded-lg border px-3 py-2 transition-colors ' +
                          (selected?.kind === 'order' && selected.id === o.id
                            ? 'border-primary-300 bg-primary-50'
                            : 'border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800 dark:bg-gray-900/50')
                        }
                      >
                        <div className="flex items-center justify-between">
                          <div className="font-semibold text-sm text-gray-900 dark:text-gray-100">{o.orderNumber}</div>
                          <div className="text-[11px] font-black text-orange-600">EM ROTA</div>
                        </div>
                        <div className="text-xs text-gray-600 dark:text-gray-400 truncate">Cliente: {o.customerName}</div>
                        <div className="text-xs text-gray-500 dark:text-gray-400 truncate">Driver: {o.deliveryDriverName ?? '—'}</div>
                      </button>
                    ))}
                    {outForDeliveryOrders.length === 0 ? (
                      <div className="text-xs text-gray-400">Nenhum pedido em rota.</div>
                    ) : null}
                  </div>
                </section>
              </div>
            </div>
          </div>

          <div className="min-h-[520px] bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-xl overflow-hidden shadow-sm">
            <MapContainer
              center={selectedPosition ?? defaultCenter}
              zoom={13}
              style={{ height: '100%', width: '100%' }}
            >
              <MapActions
                fitBoundsKey={fitSeq}
                selectedPosition={selectedPosition}
              />

              <MapRefSync
                mapRef={mapRef}
              />

              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />

              <DriverMarkersLayer drivers={driverMarkers} selected={selected} onSelect={handleSelect} />
              <OrderMarkersLayer orders={outForDeliveryOrders} selected={selected} onSelect={handleSelect} />

              {/* Linha simples driver -> destino (opcional) */}
              {outForDeliveryOrders
                .filter((o) => o.deliveryDriverId)
                .map((o) => {
                  const driver = driverMarkers.find((d) => d.id === o.deliveryDriverId);
                  if (!driver) return null;
                  return (
                    <Polyline
                      key={`line-${o.id}`}
                      positions={[
                        [driver.lat, driver.lng],
                        [o.lat, o.lng],
                      ]}
                      pathOptions={{ color: '#fb923c', weight: 3, opacity: 0.8 }}
                    />
                  );
                })}
            </MapContainer>
          </div>
        </div>

        <div className="mt-3 text-xs text-gray-500 dark:text-gray-400">
          Drivers no mapa: {driverMarkers.length} | Pedidos em rota: {outForDeliveryOrders.length}
        </div>
      </div>
    </div>
  );
}
