import { useMemo, useState } from 'react';
import { Bike, MapPin, Navigation, Search, UsersRound } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { DriverStatus, type DeliveryRunDTO, type DriverDTO, type OrderBoardItemDTO, type OrderDispatchItemDTO, type Tenant } from '@gestor/types';
import { api } from '../../../lib/api-client';
import { OperationalRouteMap, type OperationalDriver } from '../../delivery/components/OperationalRouteMap';
import { LOGISTICS_QUERY_KEYS } from '../../delivery/lib/invalidate-logistics';
import { driverMapState, formatStopAddress, nextRunStop, remainingRunStops, runStatusLabel } from '../../delivery/tracking-map.utils';
import { ORDER_STATUS_PRESENTATION, formatOrderNumber } from '../order-presenters';
import { formatElapsed } from './order-manager-v2';
import { filterRadarOrders, RADAR_FILTERS, type RadarFilter } from './operational-radar';

type Props = {
  orders: readonly OrderBoardItemDTO[];
  onOpenOrder: (order: OrderBoardItemDTO) => void;
};

/**
 * A read-only operational surface. The board stays the status source; dispatch data only
 * augments it with canonical coordinates and address data for real map pins.
 */
export function OperationalRadar({ orders, onOpenOrder }: Props) {
  const [filter, setFilter] = useState<RadarFilter>('all');
  const [query, setQuery] = useState('');
  const [focusedDriverId, setFocusedDriverId] = useState<string | null>(null);
  const [focusedOrderId, setFocusedOrderId] = useState<string | null>(null);
  const driversQuery = useQuery({
    queryKey: LOGISTICS_QUERY_KEYS.mapDrivers,
    queryFn: async () => (await api.get<DriverDTO[]>('/delivery/drivers')).data ?? [],
    refetchInterval: 5_000,
  });
  const runsQuery = useQuery({
    queryKey: LOGISTICS_QUERY_KEYS.activeRuns,
    queryFn: async () => (await api.get<DeliveryRunDTO[]>('/delivery/runs/active')).data ?? [],
    refetchInterval: 5_000,
  });
  const dispatchQuery = useQuery({
    queryKey: LOGISTICS_QUERY_KEYS.mapOrders,
    queryFn: async () => (await api.get<OrderDispatchItemDTO[]>('/orders/operation/dispatch')).data ?? [],
    refetchInterval: 5_000,
  });
  const tenantQuery = useQuery({
    queryKey: ['tenant', 'me'],
    queryFn: async () => (await api.get<Tenant>('/tenant/me')).data,
    staleTime: 60_000,
  });

  const dispatchById = useMemo(() => new Map((dispatchQuery.data ?? []).map((order) => [order.id, order])), [dispatchQuery.data]);
  const radarOrders = useMemo(() => filterRadarOrders(orders, filter, query), [filter, orders, query]);
  const mapOrders = useMemo(() => radarOrders.flatMap((order) => {
    const dispatch = dispatchById.get(order.id);
    return dispatch ? [{ ...dispatch, status: order.status, deliveryDriverId: order.deliveryDriverId ?? dispatch.deliveryDriverId, deliveryDriverName: order.deliveryDriverName ?? dispatch.deliveryDriverName }] : [];
  }), [dispatchById, radarOrders]);
  const operationalDrivers = useMemo<OperationalDriver[]>(() => {
    const runsByDriver = new Map((runsQuery.data ?? []).map((run) => [run.driverId, run]));
    return (driversQuery.data ?? []).filter((driver) => driver.isActive).map((driver) => ({ driver, run: runsByDriver.get(driver.id) ?? null }))
      .sort((a, b) => Number(Boolean(b.run)) - Number(Boolean(a.run)) || a.driver.name.localeCompare(b.driver.name));
  }, [driversQuery.data, runsQuery.data]);
  const shownDrivers = useMemo(() => {
    const filtered = filter === 'drivers' ? operationalDrivers.filter(({ driver }) => driver.status === DriverStatus.available || driver.status === DriverStatus.busy) : operationalDrivers;
    const focused = filtered.find(({ driver }) => driver.id === focusedDriverId);
    return focused ? [focused] : filtered;
  }, [filter, focusedDriverId, operationalDrivers]);
  const focusedRun = shownDrivers.find(({ driver }) => driver.id === focusedDriverId)?.run ?? null;
  const waitingOrders = radarOrders.filter((order) => order.status === 'ready_for_delivery');
  const enRouteOrders = radarOrders.filter((order) => order.status === 'out_for_delivery');
  const storePosition = typeof tenantQuery.data?.settings?.lat === 'number' && typeof tenantQuery.data.settings.lng === 'number'
    ? { lat: tenantQuery.data.settings.lat, lng: tenantQuery.data.settings.lng }
    : null;
  const selectOrder = (order: OrderBoardItemDTO) => { setFocusedDriverId(order.deliveryDriverId ?? null); setFocusedOrderId(order.id); };

  return <main className="flex h-full min-h-0 flex-col bg-background" aria-label="Radar da frota">
    <header className="shrink-0 border-b border-border bg-card px-3 py-3 sm:px-4">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div><p className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[.16em] text-primary"><Navigation className="h-3.5 w-3.5" /> Radar operacional</p><p className="mt-1 text-sm font-black text-foreground">Frota, despacho e pedidos no mesmo cockpit</p></div>
        <label className="relative w-full xl:w-72"><span className="sr-only">Buscar no Radar</span><Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Pedido, cliente, telefone ou entregador" className="h-9 w-full rounded-lg border border-border bg-background pl-9 pr-3 text-xs font-semibold outline-none focus:border-primary" /></label>
      </div>
      <div className="mt-3 flex snap-x gap-1 overflow-x-auto pb-1" aria-label="Filtros do Radar">{RADAR_FILTERS.map((candidate) => <button key={candidate.id} type="button" onClick={() => setFilter(candidate.id)} className={`min-h-8 shrink-0 snap-start rounded-lg border px-2.5 text-[10px] font-black ${filter === candidate.id ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-background text-muted-foreground hover:bg-muted'}`}>{candidate.label}</button>)}</div>
    </header>
    <div className="grid min-h-0 flex-1 gap-3 overflow-y-auto p-3 xl:grid-cols-[280px_minmax(0,1fr)_320px] xl:overflow-hidden">
      <aside className="order-2 overflow-hidden rounded-xl border border-border bg-card xl:order-1 xl:overflow-y-auto">
        <PanelTitle icon={<UsersRound className="h-4 w-4" />} title="Despacho" detail={`${waitingOrders.length} aguardando · ${enRouteOrders.length} em rota`} />
        <RadarOrderList title="Aguardando despacho" orders={waitingOrders} dispatchById={dispatchById} focusedOrderId={focusedOrderId} onSelect={selectOrder} onOpenOrder={onOpenOrder} />
        <RadarOrderList title="Em rota" orders={enRouteOrders} dispatchById={dispatchById} focusedOrderId={focusedOrderId} onSelect={selectOrder} onOpenOrder={onOpenOrder} />
      </aside>
      <section className="order-1 min-h-[340px] overflow-hidden rounded-xl border border-border xl:order-2" aria-label="Mapa com pins canônicos">
        <OperationalRouteMap drivers={shownDrivers} run={focusedRun} routePoints={focusedRun?.route?.geometry ?? []} storePosition={storePosition} focusedOrderId={focusedOrderId ?? undefined} dispatchOrders={focusedRun ? [] : mapOrders} className="h-full min-h-[340px]" />
      </section>
      <aside className="order-3 overflow-hidden rounded-xl border border-border bg-card xl:overflow-y-auto">
        <PanelTitle icon={<Bike className="h-4 w-4" />} title="Entregadores" detail={`${operationalDrivers.filter(({ driver }) => driver.status === DriverStatus.available).length} disponíveis`} />
        {operationalDrivers.map(({ driver, run }) => {
          const freshness = driverMapState(driver);
          const active = focusedDriverId === driver.id;
          return <button key={driver.id} type="button" onClick={() => { setFocusedOrderId(null); setFocusedDriverId(active ? null : driver.id); }} className={`w-full border-b border-border px-3 py-3 text-left hover:bg-muted/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary ${active ? 'bg-primary/10' : ''}`}><div className="flex gap-2"><span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${freshness.status === 'fresh' ? 'bg-primary text-primary-foreground' : freshness.status === 'stale' ? 'bg-amber-600 text-white' : 'bg-muted text-muted-foreground'}`}><Bike className="h-4 w-4" /></span><span className="min-w-0 flex-1"><span className="flex items-center justify-between gap-2"><strong className="truncate text-xs text-foreground">{driver.name}</strong><em className="shrink-0 text-[9px] not-italic font-black uppercase text-muted-foreground">{run ? runStatusLabel(run.status) : 'Livre'}</em></span><span className={`mt-0.5 block text-[10px] font-semibold ${freshness.status === 'stale' ? 'text-amber-700 dark:text-amber-300' : 'text-muted-foreground'}`}>{freshness.label}</span>{run ? <span className="mt-1 block text-[10px] text-muted-foreground">{remainingRunStops(run)} restante(s){nextRunStop(run) ? ` · ${formatOrderNumber(nextRunStop(run)?.orderNumber ?? '')}` : ''}</span> : null}</span></div></button>;
        })}
        {operationalDrivers.length === 0 ? <p className="p-4 text-xs font-semibold text-muted-foreground">Nenhum entregador ativo para exibir.</p> : null}
      </aside>
    </div>
    <footer className="shrink-0 border-t border-border bg-card px-3 py-2 text-[10px] font-semibold text-muted-foreground">Pins aparecem apenas com coordenadas canônicas. Localização sem horário confiável é exibida como indisponível, nunca como tempo real.</footer>
  </main>;
}

function PanelTitle({ icon, title, detail }: { icon: JSX.Element; title: string; detail: string }) {
  return <div className="flex items-center justify-between border-b border-border px-3 py-2.5"><p className="flex items-center gap-1.5 text-xs font-black text-foreground">{icon}{title}</p><p className="text-[9px] font-bold text-muted-foreground">{detail}</p></div>;
}

function RadarOrderList({ title, orders, dispatchById, focusedOrderId, onSelect, onOpenOrder }: { title: string; orders: readonly OrderBoardItemDTO[]; dispatchById: ReadonlyMap<string, OrderDispatchItemDTO>; focusedOrderId: string | null; onSelect: (order: OrderBoardItemDTO) => void; onOpenOrder: (order: OrderBoardItemDTO) => void }) {
  return <section className="border-b border-border last:border-b-0"><div className="flex items-center justify-between px-3 pb-1 pt-3"><h3 className="text-[10px] font-black uppercase tracking-wide text-muted-foreground">{title}</h3><span className="text-xs font-black text-foreground">{orders.length}</span></div>{orders.map((order) => { const dispatch = dispatchById.get(order.id); return <div key={order.id} className={`border-t border-border px-3 py-2 ${focusedOrderId === order.id ? 'bg-primary/10' : ''}`}><button type="button" onClick={() => onSelect(order)} className="w-full text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"><p className="flex items-center justify-between gap-2"><strong className="text-xs text-foreground">{formatOrderNumber(order.orderNumber)}</strong><span className="text-[9px] font-black uppercase text-muted-foreground">{ORDER_STATUS_PRESENTATION[order.status].label}</span></p><p className="mt-0.5 truncate text-[11px] font-semibold text-foreground">{order.customerName}</p><p className="mt-0.5 line-clamp-1 text-[10px] text-muted-foreground"><MapPin className="mr-1 inline h-3 w-3" />{formatStopAddress(dispatch?.deliveryAddress ?? null)}</p><p className="mt-1 text-[10px] text-muted-foreground">{formatElapsed(order.createdAt, Date.now())} · {order.operational.displayChannel}{order.deliveryDriverName ? ` · ${order.deliveryDriverName}` : ''}</p></button><button type="button" onClick={() => onOpenOrder(order)} className="mt-1 text-[10px] font-black text-primary hover:underline">Abrir pedido</button></div>; })}{orders.length === 0 ? <p className="px-3 pb-3 text-[10px] font-semibold text-muted-foreground">Nenhum pedido nesta fila.</p> : null}</section>;
}
