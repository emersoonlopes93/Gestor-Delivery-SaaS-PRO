import { memo, useEffect, useMemo } from 'react';
import { MapContainer, Marker, Polyline, Popup, TileLayer, useMap } from 'react-leaflet';
import L from 'leaflet';
import type { LatLngBoundsExpression, LatLngExpression } from 'leaflet';
import type { DeliveryRunDTO, DriverDTO, OrderDispatchItemDTO } from '@gestor/types';
import { driverMapState, formatStopAddress, pointFromAddress, remainingRunStops, runStatusLabel, stopStatusLabel, type MapPoint } from '../tracking-map.utils';

export type OperationalDriver = {
  driver: DriverDTO;
  run: DeliveryRunDTO | null;
};

type Props = {
  drivers?: readonly OperationalDriver[];
  run?: DeliveryRunDTO | null;
  routePoints?: readonly MapPoint[];
  storePosition?: MapPoint | null;
  focusedOrderId?: string;
  dispatchOrders?: readonly OrderDispatchItemDTO[];
  className?: string;
  tileStyle?: 'dark' | 'standard' | 'satellite';
};

const DEFAULT_CENTER: LatLngExpression = [-23.55052, -46.633308];

const TILE_URLS: Record<'dark' | 'standard' | 'satellite', { url: string; attribution: string }> = {
  dark: {
    url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
  },
  standard: {
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  },
  satellite: {
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community',
  },
};

function motorcycleIcon(driverName: string, activeCount: number, freshness: 'fresh' | 'stale' | 'unavailable', focused: boolean): L.DivIcon {
  const stale = freshness === 'stale';
  const unavailable = freshness === 'unavailable';
  const background = unavailable ? '#ef4444' : stale ? '#f59e0b' : '#3b82f6';
  const border = focused ? '#60a5fa' : '#ffffff';

  return L.divIcon({
    className: '',
    iconSize: [120, 38],
    iconAnchor: [60, 19],
    popupAnchor: [0, -20],
    html: `<div title="${driverName} - ${activeCount} entregas" style="display:flex;align-items:center;gap:6px;width:max-content;padding:4px 8px;border-radius:10px;background:${background};color:white;border:2px solid ${border};box-shadow:0 6px 18px rgba(0,0,0,.4);font:800 11px/1.2 sans-serif">
      <div style="display:grid;place-items:center;width:22px;height:22px;border-radius:50%;background:rgba(255,255,255,.2)">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="5.5" cy="17.5" r="3.5"/><circle cx="18.5" cy="17.5" r="3.5"/><path d="M15 6h3l2 4h-5l-3 7H9l-2-5h4l2-4H9"/></svg>
      </div>
      <div style="display:flex;flex-direction:column">
        <span style="font-weight:900;letter-spacing:-.01em">${driverName.split(' ')[0]}</span>
        <span style="font-size:9px;opacity:.9">${activeCount > 0 ? `${activeCount} entrega${activeCount > 1 ? 's' : ''}` : 'Disponível'}</span>
      </div>
    </div>`,
  });
}

function stopIcon(sequence: number, focused: boolean): L.DivIcon {
  return L.divIcon({
    className: '',
    iconSize: focused ? [38, 38] : [32, 32],
    iconAnchor: focused ? [19, 19] : [16, 16],
    popupAnchor: [0, -18],
    html: `<div title="Parada ${sequence}" style="display:grid;place-items:center;width:100%;height:100%;border-radius:10px;background:#f97316;color:white;border:${focused ? 4 : 3}px solid ${focused ? '#3b82f6' : 'white'};box-shadow:0 4px 12px rgba(15,23,42,.4);font:900 13px/1 sans-serif">${sequence}</div>`,
  });
}

function storeIcon(): L.DivIcon {
  return L.divIcon({
    className: '', iconSize: [34, 34], iconAnchor: [17, 17], popupAnchor: [0, -18],
    html: '<div title="Loja — origem da rota" style="display:grid;place-items:center;width:34px;height:34px;border-radius:8px;background:#0f172a;color:white;border:3px solid #3b82f6;box-shadow:0 4px 12px rgba(15,23,42,.4)"><svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9l2-5h14l2 5"/><path d="M5 13v7h14v-7"/><path d="M9 20v-6h6v6"/><path d="M3 9a3 3 0 0 0 6 0 3 3 0 0 0 6 0 3 3 0 0 0 6 0"/></svg></div>',
  });
}

function dispatchOrderIcon(status: OrderDispatchItemDTO['status'], focused: boolean): L.DivIcon {
  const waiting = status === 'ready_for_delivery';
  return L.divIcon({
    className: '', iconSize: [34, 34], iconAnchor: [17, 17], popupAnchor: [0, -18],
    html: `<div title="${waiting ? 'Pedido aguardando despacho' : 'Pedido em rota'}" style="display:grid;place-items:center;width:34px;height:34px;border-radius:10px;background:${waiting ? '#eab308' : '#3b82f6'};color:white;border:${focused ? '4px solid #60a5fa' : '3px solid white'};box-shadow:0 4px 12px rgba(15,23,42,.4);font:900 11px/1 sans-serif">${waiting ? 'P' : 'R'}</div>`,
  });
}

const FitMap = memo(function FitMap({ points }: { points: readonly MapPoint[] }) {
  const map = useMap();
  const key = points.map((point) => `${point.lat},${point.lng}`).join('|');
  useEffect(() => {
    if (points.length === 0) return;
    if (points.length === 1) map.setView([points[0].lat, points[0].lng], 16, { animate: true });
    else map.fitBounds(points.map((point) => [point.lat, point.lng]) as LatLngBoundsExpression, { padding: [40, 40], animate: true });
  }, [key, map, points]);
  return null;
});

export function OperationalRouteMap({ drivers = [], run = null, routePoints = [], storePosition = null, focusedOrderId, dispatchOrders = [], className = 'h-[520px]', tileStyle = 'dark' }: Props) {
  const visibleStops = useMemo(() => (run?.stops ?? []).map((stop) => ({ stop, point: pointFromAddress(stop.address) })).filter((item): item is typeof item & { point: MapPoint } => Boolean(item.point)), [run]);
  const visibleDrivers = useMemo(() => drivers.filter(({ driver }) => typeof driver.currentLat === 'number' && typeof driver.currentLng === 'number'), [drivers]);
  const visibleOrders = useMemo(() => dispatchOrders.filter((order) => typeof order.deliveryLat === 'number' && typeof order.deliveryLng === 'number'), [dispatchOrders]);
  const allPoints = useMemo(() => {
    const points: MapPoint[] = [...routePoints];
    if (storePosition) points.push(storePosition);
    for (const { point } of visibleStops) points.push(point);
    for (const { driver } of visibleDrivers) points.push({ lat: driver.currentLat as number, lng: driver.currentLng as number });
    for (const order of visibleOrders) points.push({ lat: order.deliveryLat as number, lng: order.deliveryLng as number });
    return points;
  }, [routePoints, storePosition, visibleDrivers, visibleOrders, visibleStops]);

  const tileConfig = TILE_URLS[tileStyle] ?? TILE_URLS.dark;

  return (
    <div className={`relative overflow-hidden rounded-xl border border-border bg-card ${className}`}>
      <MapContainer center={allPoints[0] ? [allPoints[0].lat, allPoints[0].lng] : DEFAULT_CENTER} zoom={13} className="theme-aware-map h-full w-full">
        <FitMap points={allPoints} />
        <TileLayer attribution={tileConfig.attribution} url={tileConfig.url} />
        {routePoints.length > 1 ? <Polyline positions={routePoints.map((point) => [point.lat, point.lng])} pathOptions={{ color: '#3b82f6', weight: 4, opacity: 0.85 }} /> : null}
        {storePosition ? <Marker position={[storePosition.lat, storePosition.lng]} icon={storeIcon()}><Popup><strong>Loja</strong><br />Origem da rota</Popup></Marker> : null}
        {visibleStops.map(({ stop, point }) => (
          <Marker key={stop.id} position={[point.lat, point.lng]} icon={stopIcon(stop.sequence, stop.orderId === focusedOrderId)}>
            <Popup><strong>Parada {stop.sequence} · Pedido #{stop.orderNumber}</strong><br />{stop.customerName}<br />{formatStopAddress(stop.address)}<br />{stopStatusLabel(stop.status)}</Popup>
          </Marker>
        ))}
        {!run ? visibleOrders.map((order) => (
          <Marker key={order.id} position={[order.deliveryLat as number, order.deliveryLng as number]} icon={dispatchOrderIcon(order.status, order.id === focusedOrderId)}>
            <Popup><strong>Pedido #{order.orderNumber}</strong><br />{order.customerName}<br />{order.status === 'ready_for_delivery' ? 'Aguardando despacho' : 'Em rota'}<br />{order.deliveryDriverName ? `Entregador: ${order.deliveryDriverName}` : 'Sem entregador atribuído'}</Popup>
          </Marker>
        )) : null}
        {visibleDrivers.map(({ driver, run: driverRun }) => {
          const freshness = driverMapState(driver);
          const activeStopsCount = driverRun ? remainingRunStops(driverRun) : 0;
          return (
            <Marker key={driver.id} position={[driver.currentLat as number, driver.currentLng as number]} icon={motorcycleIcon(driver.name, activeStopsCount, freshness.status, Boolean(driverRun))}>
              <Popup><strong>{driver.name}</strong><br />{driverRun ? runStatusLabel(driverRun.status) : 'Sem rota ativa'}<br />{freshness.label}</Popup>
            </Marker>
          );
        })}
      </MapContainer>
      <div className="pointer-events-none absolute bottom-3 left-3 z-[400] max-w-[calc(100%-1.5rem)] rounded-lg border border-border/80 bg-background/90 px-3 py-1.5 text-[11px] font-medium text-muted-foreground shadow-lg backdrop-blur">
        {run?.route?.quality === 'ROAD' ? 'Trajeto viário calculado pela rota.' : 'Exibindo pontos e marcadores operacionais da frota.'}
      </div>
    </div>
  );
}
