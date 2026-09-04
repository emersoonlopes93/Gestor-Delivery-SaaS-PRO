import { memo, useEffect, useMemo } from 'react';
import { MapContainer, Marker, Polyline, Popup, TileLayer, useMap } from 'react-leaflet';
import L from 'leaflet';
import type { LatLngBoundsExpression, LatLngExpression } from 'leaflet';
import type { DeliveryRunDTO, DriverDTO, OrderDispatchItemDTO } from '@gestor/types';
import { driverMapState, formatStopAddress, pointFromAddress, runStatusLabel, stopStatusLabel, type MapPoint } from '../tracking-map.utils';

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
};

const DEFAULT_CENTER: LatLngExpression = [-23.55052, -46.633308];

function motorcycleIcon(freshness: 'fresh' | 'stale' | 'unavailable'): L.DivIcon {
  const stale = freshness === 'stale';
  const unavailable = freshness === 'unavailable';
  const background = unavailable ? '#64748b' : stale ? '#b45309' : '#4f46e5';
  const label = unavailable ? 'SEM GPS' : stale ? 'DESAT.' : 'MOTO';
  return L.divIcon({
    className: '',
    iconSize: [58, 36],
    iconAnchor: [29, 18],
    popupAnchor: [0, -20],
    html: `<div title="Entregador de moto: ${label}" style="display:flex;align-items:center;gap:4px;width:max-content;padding:5px 7px;border-radius:8px;background:${background};color:white;border:2px solid white;box-shadow:0 5px 15px rgba(15,23,42,.28);font:800 9px/1 sans-serif;letter-spacing:.04em">
      <svg aria-hidden="true" width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="5.5" cy="17.5" r="3.5"/><circle cx="18.5" cy="17.5" r="3.5"/><path d="M15 6h3l2 4h-5l-3 7H9l-2-5h4l2-4H9"/></svg>${label}</div>`,
  });
}

function stopIcon(sequence: number, focused: boolean): L.DivIcon {
  return L.divIcon({
    className: '',
    iconSize: focused ? [38, 38] : [32, 32],
    iconAnchor: focused ? [19, 19] : [16, 16],
    popupAnchor: [0, -18],
    html: `<div title="Parada ${sequence}" style="display:grid;place-items:center;width:100%;height:100%;border-radius:10px;background:#f97316;color:white;border:${focused ? 4 : 3}px solid ${focused ? '#312e81' : 'white'};box-shadow:0 4px 12px rgba(15,23,42,.24);font:900 13px/1 sans-serif">${sequence}</div>`,
  });
}

function storeIcon(): L.DivIcon {
  return L.divIcon({
    className: '', iconSize: [34, 34], iconAnchor: [17, 17], popupAnchor: [0, -18],
    html: '<div title="Loja — origem da rota" style="display:grid;place-items:center;width:34px;height:34px;border-radius:8px;background:#0f172a;color:white;border:3px solid white;box-shadow:0 4px 12px rgba(15,23,42,.25)"><svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9l2-5h14l2 5"/><path d="M5 13v7h14v-7"/><path d="M9 20v-6h6v6"/><path d="M3 9a3 3 0 0 0 6 0 3 3 0 0 0 6 0 3 3 0 0 0 6 0"/></svg></div>',
  });
}

function dispatchOrderIcon(status: OrderDispatchItemDTO['status'], focused: boolean): L.DivIcon {
  const waiting = status === 'ready_for_delivery';
  return L.divIcon({
    className: '', iconSize: [34, 34], iconAnchor: [17, 17], popupAnchor: [0, -18],
    html: `<div title="${waiting ? 'Pedido aguardando despacho' : 'Pedido em rota'}" style="display:grid;place-items:center;width:34px;height:34px;border-radius:10px;background:${waiting ? '#ca8a04' : '#f97316'};color:white;border:${focused ? '4px solid #312e81' : '3px solid white'};box-shadow:0 4px 12px rgba(15,23,42,.24);font:900 10px/1 sans-serif">${waiting ? 'P' : 'R'}</div>`,
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

export function OperationalRouteMap({ drivers = [], run = null, routePoints = [], storePosition = null, focusedOrderId, dispatchOrders = [], className = 'h-[520px]' }: Props) {
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

  return (
    <div className={`relative overflow-hidden border border-border bg-muted ${className}`}>
      <MapContainer center={allPoints[0] ? [allPoints[0].lat, allPoints[0].lng] : DEFAULT_CENTER} zoom={13} className="theme-aware-map h-full w-full">
        <FitMap points={allPoints} />
        <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        {routePoints.length > 1 ? <Polyline positions={routePoints.map((point) => [point.lat, point.lng])} pathOptions={{ color: '#4f46e5', weight: 4, opacity: 0.82 }} /> : null}
        {storePosition ? <Marker position={[storePosition.lat, storePosition.lng]} icon={storeIcon()}><Popup><strong>Loja</strong><br />Origem da rota</Popup></Marker> : null}
        {visibleStops.map(({ stop, point }) => (
          <Marker key={stop.id} position={[point.lat, point.lng]} icon={stopIcon(stop.sequence, stop.orderId === focusedOrderId)}>
            <Popup><strong>Parada {stop.sequence} · Pedido {stop.orderNumber}</strong><br />{stop.customerName}<br />{formatStopAddress(stop.address)}<br />{stopStatusLabel(stop.status)}</Popup>
          </Marker>
        ))}
        {!run ? visibleOrders.map((order) => (
          <Marker key={order.id} position={[order.deliveryLat as number, order.deliveryLng as number]} icon={dispatchOrderIcon(order.status, order.id === focusedOrderId)}>
            <Popup><strong>Pedido {order.orderNumber}</strong><br />{order.customerName}<br />{order.status === 'ready_for_delivery' ? 'Aguardando despacho' : 'Em rota'}<br />{order.deliveryDriverName ? `Entregador: ${order.deliveryDriverName}` : 'Sem entregador atribuído'}</Popup>
          </Marker>
        )) : null}
        {visibleDrivers.map(({ driver, run: driverRun }) => {
          const freshness = driverMapState(driver);
          return (
            <Marker key={driver.id} position={[driver.currentLat as number, driver.currentLng as number]} icon={motorcycleIcon(freshness.status)}>
              <Popup><strong>{driver.name}</strong><br />{driverRun ? runStatusLabel(driverRun.status) : 'Sem rota ativa'}<br />{freshness.label}</Popup>
            </Marker>
          );
        })}
      </MapContainer>
      <div className="pointer-events-none absolute bottom-3 left-3 z-[400] max-w-[calc(100%-1.5rem)] rounded-md border border-border bg-card px-3 py-2 text-[11px] font-medium text-muted-foreground shadow-md">
        {run?.route?.quality === 'ROAD' ? 'A linha representa o trajeto viário calculado.' : 'A linha representa uma estimativa degradada em linha reta; não é ETA viário.'}
      </div>
    </div>
  );
}
