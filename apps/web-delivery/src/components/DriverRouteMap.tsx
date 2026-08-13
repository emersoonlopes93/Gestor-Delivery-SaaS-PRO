import { useEffect, useMemo } from 'react';
import L from 'leaflet';
import { MapContainer, Marker, Polyline, useMap } from 'react-leaflet';
import type { LatLngBoundsExpression, LatLngExpression } from 'leaflet';
import { DeliveryRunStatus, DeliveryStopStatus, type DeliveryRunOriginDTO, type DeliveryStopDTO } from '@gestor/types';
import { ExternalLink, MapPin, Navigation, RotateCcw } from 'lucide-react';
import { geocodedStops, navigationUrl, type NavigationProvider, type RouteCoordinate } from '../lib/routeNavigation';

const DEFAULT_CENTER: LatLngExpression = [-14.235, -51.9253];

function stopIcon(sequence: number, status: DeliveryStopStatus) {
  const done = status === DeliveryStopStatus.DELIVERED || status === DeliveryStopStatus.RETURNED_TO_STORE || status === DeliveryStopStatus.CANCELLED;
  const returning = status === DeliveryStopStatus.RETURN_TO_STORE;
  const active = status === DeliveryStopStatus.CURRENT || status === DeliveryStopStatus.ARRIVED;
  const tone = done ? 'route-pin--done' : returning ? 'route-pin--return' : active ? 'route-pin--active' : '';
  return L.divIcon({ className: 'route-pin-shell', html: `<span class="route-pin ${tone}">${sequence}</span>`, iconSize: [34, 34], iconAnchor: [17, 17] });
}

const courierIcon = L.divIcon({ className: 'route-pin-shell', html: '<span class="route-courier" aria-hidden="true">&#9679;</span>', iconSize: [28, 28], iconAnchor: [14, 14] });
const originIcon = L.divIcon({ className: 'route-pin-shell', html: '<span class="route-origin" aria-hidden="true">L</span>', iconSize: [34, 34], iconAnchor: [17, 17] });

function FitRoute({ points }: { points: LatLngExpression[] }) {
  const map = useMap();
  useEffect(() => {
    if (points.length === 1) map.setView(points[0], 15);
    if (points.length > 1) map.fitBounds(points as LatLngBoundsExpression, { padding: [28, 28], maxZoom: 16 });
  }, [map, points]);
  return null;
}

type Props = {
  status: DeliveryRunStatus;
  stops: DeliveryStopDTO[];
  currentStop: DeliveryStopDTO | undefined;
  currentPosition: RouteCoordinate | null;
  origin: DeliveryRunOriginDTO | null | undefined;
  nativePlatform: boolean;
  addressText: (address: Record<string, unknown> | null) => string;
};

const providers: Array<{ id: NavigationProvider; label: string }> = [
  { id: 'google', label: 'Google Maps' },
  { id: 'waze', label: 'Waze' },
  { id: 'system', label: 'Sistema ou navegador' },
];

export function DriverRouteMap({ status, stops, currentStop, currentPosition, origin, nativePlatform, addressText }: Props) {
  const mappedStops = useMemo(() => geocodedStops(stops), [stops]);
  const returning = status === DeliveryRunStatus.RETURNING;
  const originPosition = origin ? { lat: origin.lat, lng: origin.lng } : null;
  const destinationStop = returning ? undefined : currentStop;
  const deliveryDestination = destinationStop ? geocodedStops([destinationStop])[0]?.position ?? null : null;
  const destination = returning ? originPosition : deliveryDestination;
  const destinationLabel = returning ? origin?.label ?? 'Loja' : destinationStop ? `Pedido ${destinationStop.orderNumber}` : '';
  const stopPoints = mappedStops.map(({ position }) => [position.lat, position.lng] as LatLngExpression);
  // During returns only the genuine store coordinate is drawn: never suggest a customer is the destination.
  const schematicPoints = returning ? (originPosition ? [[originPosition.lat, originPosition.lng] as LatLngExpression] : []) : [
    ...(originPosition ? [[originPosition.lat, originPosition.lng] as LatLngExpression] : []), ...stopPoints,
  ];
  const allPoints = [...(currentPosition ? [[currentPosition.lat, currentPosition.lng] as LatLngExpression] : []), ...schematicPoints];
  const canRenderMap = !returning || originPosition !== null;

  return <section className="overflow-hidden rounded-2xl border border-[var(--delivery-border)] bg-[var(--delivery-card)] shadow-sm" aria-labelledby="driver-map-title">
    <div className="flex items-center justify-between gap-3 px-4 py-3">
      <div><p className={`text-[11px] font-bold uppercase tracking-[0.16em] ${returning ? 'text-amber-600' : 'text-orange-600'}`}>{returning ? 'Caminho de retorno' : 'Sequência da rota'}</p><h2 id="driver-map-title" className="mt-0.5 font-black text-[var(--delivery-foreground)]">Minha rota</h2></div>
      <span className="rounded-lg bg-[var(--delivery-muted)] px-2.5 py-1 text-xs font-bold text-[var(--delivery-muted-foreground)]">{returning ? (originPosition ? 'Loja no mapa' : 'Loja sem coordenada') : `${mappedStops.length}/${stops.length} no mapa`}</span>
    </div>

    {canRenderMap && allPoints.length > 0 ? <div className="driver-route-schematic relative h-64 border-y border-[var(--delivery-border)]" role="region" aria-label={returning ? 'Esquema de retorno para a loja e posição atual' : 'Esquema da rota com a posição atual e paradas numeradas na ordem registrada'}>
      <MapContainer center={allPoints[0] ?? DEFAULT_CENTER} zoom={14} className="h-full w-full" zoomControl={false} attributionControl={false}>
        <FitRoute points={allPoints} />
        {schematicPoints.length > 1 && <Polyline positions={schematicPoints} pathOptions={{ color: returning ? '#d97706' : '#f97316', weight: 4, opacity: 0.82, dashArray: '8 7' }} />}
        {currentPosition && <Marker position={[currentPosition.lat, currentPosition.lng]} icon={courierIcon} title="Sua posição atual" />}
        {originPosition && <Marker position={[originPosition.lat, originPosition.lng]} icon={originIcon} title={origin?.label ?? 'Loja'} />}
        {!returning && mappedStops.map(({ stop, position }) => <Marker key={stop.id} position={[position.lat, position.lng]} icon={stopIcon(stop.sequence, stop.status)} title={`Parada ${stop.sequence}: pedido ${stop.orderNumber}`} />)}
      </MapContainer>
    </div> : <div className="border-y border-[var(--delivery-border)] bg-[var(--delivery-muted)] px-5 py-8 text-center">
      <MapPin className="mx-auto h-7 w-7 text-[var(--delivery-muted-foreground)]" aria-hidden="true" />
      <p className="mt-2 text-sm font-bold text-[var(--delivery-foreground)]">{returning ? 'Localização da loja indisponível' : 'Mapa indisponível para estas paradas'}</p>
      <p className="mt-1 text-xs text-[var(--delivery-muted-foreground)]">{returning ? 'A rota de retorno não será desenhada sem uma coordenada real da loja. Siga a orientação da loja e confirme a devolução ao chegar.' : 'Os endereços e a ordem completa continuam disponíveis abaixo.'}</p>
    </div>}

    <div className="sr-only" aria-label="Resumo textual completo do esquema de rota">
      {originPosition && <p>Origem: {origin?.label ?? 'Loja'}.</p>}
      {returning && !originPosition && <p>Destino de retorno: loja sem coordenada disponível.</p>}
      {!returning && <ol>{stops.map((stop) => <li key={stop.id}>Parada {stop.sequence}, pedido {stop.orderNumber}, {addressText(stop.address)}, status {stop.status}.</li>)}</ol>}
    </div>

    <div className="p-4"><div className={`border-l-4 pl-3 ${returning ? 'border-amber-500' : 'border-orange-500'}`}>
      <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--delivery-muted-foreground)]">{returning ? 'Agora' : 'Próxima entrega'}</p>
      {returning && originPosition ? <><p className="mt-1 font-black text-[var(--delivery-foreground)]">{origin?.label ?? 'Loja'}</p><p className="mt-1 text-sm leading-5 text-[var(--delivery-muted-foreground)]">Destino de retorno confirmado pela coordenada da loja.</p></> : destinationStop ? <><p className="mt-1 font-black text-[var(--delivery-foreground)]">Pedido #{destinationStop.orderNumber}</p><p className="mt-1 text-sm leading-5 text-[var(--delivery-muted-foreground)]">{addressText(destinationStop.address)}</p></> : <p className="mt-1 text-sm font-semibold text-[var(--delivery-foreground)]">{returning ? 'Retorne à loja. A localização da loja ainda não está disponível neste mapa.' : 'Aguarde a próxima parada da rota.'}</p>}
    </div>
      <p className="mt-3 text-xs leading-5 text-[var(--delivery-muted-foreground)]">A linha mostra somente a ordem registrada das paradas. Não representa trajeto por ruas, otimização ou previsão de chegada.</p>
      {destination && <details className="mt-4 rounded-xl border border-[var(--delivery-border)] bg-[var(--delivery-muted)]"><summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-3 text-sm font-bold text-[var(--delivery-foreground)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-500"><span className="inline-flex items-center gap-2"><Navigation className="h-4 w-4 text-orange-600" aria-hidden="true" />Abrir navegação</span><ExternalLink className="h-4 w-4 text-[var(--delivery-muted-foreground)]" aria-hidden="true" /></summary><div className="grid gap-2 border-t border-[var(--delivery-border)] p-2" aria-label="Escolha um aplicativo de navegação">{providers.map((provider) => <a key={provider.id} href={navigationUrl(provider.id, destination, destinationLabel, nativePlatform)} target={nativePlatform ? undefined : '_blank'} rel={nativePlatform ? undefined : 'noreferrer'} className="flex min-h-11 items-center justify-between rounded-lg bg-[var(--delivery-card)] px-3 text-sm font-bold text-[var(--delivery-foreground)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-500">{provider.label}<ExternalLink className="h-4 w-4 text-[var(--delivery-muted-foreground)]" aria-hidden="true" /></a>)}<p className="px-1 pb-1 text-xs text-[var(--delivery-muted-foreground)]">Opcional: você pode continuar acompanhando tudo no PedeHub.</p></div></details>}
      {returning && <p className="mt-4 flex items-start gap-2 rounded-xl bg-amber-50 p-3 text-xs font-semibold leading-5 text-amber-900 dark:bg-amber-950/30 dark:text-amber-100"><RotateCcw className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />Mantenha os pedidos de retorno com você até a confirmação na loja.</p>}
    </div>
  </section>;
}
