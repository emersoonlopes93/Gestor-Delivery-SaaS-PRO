import { useMemo, useState } from 'react';
import { AlertTriangle, Bike, Crosshair, MapPin, Navigation, RefreshCw, Route } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import type { DeliveryRunDTO, DriverDTO, OrderDispatchItemDTO, Tenant } from '@gestor/types';
import { DeliveryRunStatus } from '@gestor/types';
import { api } from '@/lib/api-client';
import { OperationalRouteMap, type OperationalDriver } from './components/OperationalRouteMap';
import { LOGISTICS_QUERY_KEYS } from './lib/invalidate-logistics';
import { driverMapState, formatStopAddress, nextRunStop, remainingRunStops, runStatusLabel } from './tracking-map.utils';

export function DeliveryMapPage() {
  const [focusedDriverId, setFocusedDriverId] = useState<string | null>(null);
  const [focusedOrderId, setFocusedOrderId] = useState<string | null>(null);
  const [isPanelOpen, setIsPanelOpen] = useState(false);

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
  const ordersQuery = useQuery({
    queryKey: LOGISTICS_QUERY_KEYS.mapOrders,
    queryFn: async () => (await api.get<OrderDispatchItemDTO[]>('/orders/operation/dispatch')).data ?? [],
    refetchInterval: 5_000,
  });
  const tenantQuery = useQuery({
    queryKey: ['tenant', 'me'],
    queryFn: async () => (await api.get<Tenant>('/tenant/me')).data,
    staleTime: 60_000,
  });

  const operationalDrivers = useMemo<OperationalDriver[]>(() => {
    const runsByDriver = new Map((runsQuery.data ?? []).map((run) => [run.driverId, run]));
    return (driversQuery.data ?? [])
      .filter((driver) => driver.isActive)
      .map((driver) => ({ driver, run: runsByDriver.get(driver.id) ?? null }))
      .sort((a, b) => Number(Boolean(b.run)) - Number(Boolean(a.run)) || a.driver.name.localeCompare(b.driver.name));
  }, [driversQuery.data, runsQuery.data]);

  const focused = operationalDrivers.find(({ driver }) => driver.id === focusedDriverId) ?? null;
  const dispatchOrders = useMemo(() => (ordersQuery.data ?? []).filter((order) => order.status === 'ready_for_delivery' || order.status === 'out_for_delivery'), [ordersQuery.data]);
  const waitingOrders = dispatchOrders.filter((order) => order.status === 'ready_for_delivery');
  const enRouteOrders = dispatchOrders.filter((order) => order.status === 'out_for_delivery');
  const shownDrivers = focused ? [focused] : operationalDrivers;
  const storePosition = typeof tenantQuery.data?.settings?.lat === 'number' && typeof tenantQuery.data.settings.lng === 'number'
    ? { lat: tenantQuery.data.settings.lat, lng: tenantQuery.data.settings.lng }
    : null;
  const isLoading = driversQuery.isLoading || runsQuery.isLoading || ordersQuery.isLoading;
  const isError = driversQuery.isError || runsQuery.isError || ordersQuery.isError;

  return (
    <main className="mx-auto h-full w-full max-w-[1600px] p-4 sm:p-6">
      <header className="mb-4 flex flex-col gap-3 border-b border-border pb-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="mb-1 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.16em] text-primary">
            <Navigation className="h-4 w-4" /> Central de despacho
          </div>
          <h1 className="text-2xl font-black tracking-tight text-foreground sm:text-3xl">Mapa da operação</h1>
          <p className="mt-1 text-sm text-muted-foreground">Posições conciliadas em tempo real e por consulta a cada 5 segundos.</p>
        </div>
        <button type="button" onClick={() => { setFocusedDriverId(null); setFocusedOrderId(null); }} disabled={!focusedDriverId && !focusedOrderId} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-border bg-card px-4 text-sm font-bold text-foreground transition hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-45">
          <Crosshair className="h-4 w-4" /> Ver toda a operação
        </button>
      </header>

      {isLoading ? <div role="status" className="mb-4 flex min-h-11 items-center gap-2 text-sm font-semibold text-muted-foreground"><RefreshCw className="h-4 w-4 animate-spin" /> Carregando entregadores e rotas…</div> : null}
      {isError ? <div role="alert" className="mb-4 flex min-h-11 items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-4 text-sm font-bold text-destructive"><AlertTriangle className="h-4 w-4" /> Não foi possível atualizar o mapa. A última informação disponível não deve ser considerada ao vivo.</div> : null}

      <div className="grid gap-4 lg:grid-cols-[340px_minmax(0,1fr)]">
        <aside className={`${isPanelOpen ? 'block' : 'hidden'} safe-sheet lg:static fixed bottom-0 left-0 right-0 z-40 order-2 max-h-[72vh] overflow-hidden rounded-t-xl border border-border bg-card lg:order-1 lg:block lg:max-h-none lg:rounded-xl`}>
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <div>
              <h2 className="font-black text-foreground">Entregadores</h2>
              <p className="text-xs text-muted-foreground">Selecione para isolar uma rota</p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-black text-foreground">{operationalDrivers.length}</span>
              <button type="button" onClick={() => setIsPanelOpen(false)} className="min-h-11 px-2 text-sm font-bold text-muted-foreground lg:hidden">Fechar</button>
            </div>
          </div>
          <div className="max-h-[560px] overflow-y-auto">
            <section className="border-b border-border" aria-labelledby="map-drivers-title">
              <h3 id="map-drivers-title" className="px-4 pt-3 text-[11px] font-black uppercase tracking-[0.14em] text-muted-foreground">Entregadores</h3>
            {operationalDrivers.map(({ driver, run }) => {
              const freshness = driverMapState(driver);
              const nextStop = run ? nextRunStop(run) : null;
              const active = focusedDriverId === driver.id;
              return (
                <button key={driver.id} type="button" onClick={() => { setFocusedOrderId(null); setFocusedDriverId(active ? null : driver.id); }} className={`w-full min-h-11 border-t border-border px-4 py-3 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary ${active ? 'bg-primary/10' : 'hover:bg-muted/70'}`}>
                  <div className="flex items-start gap-3">
                    <div className={`mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-lg ${freshness.status === 'fresh' ? 'bg-primary text-primary-foreground' : freshness.status === 'stale' ? 'bg-amber-600 text-white' : 'bg-muted text-muted-foreground'}`}><Bike className="h-5 w-5" aria-hidden="true" /></div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2"><span className="truncate text-sm font-black text-foreground">{driver.name}</span><span className="shrink-0 text-[11px] font-bold uppercase text-muted-foreground">{run ? runStatusLabel(run.status) : 'Sem rota'}</span></div>
                      <p className={`mt-0.5 text-xs font-semibold ${freshness.status === 'fresh' ? 'text-primary' : freshness.status === 'stale' ? 'text-amber-700 dark:text-amber-400' : 'text-muted-foreground'}`}>{freshness.label}</p>
                      {run ? <p className="mt-2 text-xs text-foreground"><strong>{remainingRunStops(run)}</strong> entrega(s) restante(s){nextStop ? ` · Próxima: parada ${nextStop.sequence}, pedido ${nextStop.orderNumber}` : ''}</p> : <p className="mt-2 text-xs text-muted-foreground">Nenhuma rota operacional vinculada.</p>}
                    </div>
                  </div>
                </button>
              );
            })}
            {!isLoading && operationalDrivers.length === 0 ? <div className="px-6 py-8 text-center"><Bike className="mx-auto mb-3 h-7 w-7 text-muted-foreground" /><p className="text-sm font-bold text-foreground">Nenhum entregador ativo</p><p className="mt-1 text-xs text-muted-foreground">As rotas aparecerão aqui quando a operação começar.</p></div> : null}
            </section>
            <section className="border-b border-border" aria-labelledby="map-waiting-title">
              <div className="flex items-center justify-between px-4 pb-2 pt-3"><h3 id="map-waiting-title" className="text-[11px] font-black uppercase tracking-[0.14em] text-muted-foreground">Aguardando despacho</h3><strong className="text-xs text-foreground">{waitingOrders.length}</strong></div>
              {waitingOrders.map((order) => <button key={order.id} type="button" onClick={() => { setFocusedDriverId(null); setFocusedOrderId(order.id); }} className={`w-full min-h-11 border-t border-border px-4 py-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary ${focusedOrderId === order.id ? 'bg-amber-500/10' : 'hover:bg-muted/70'}`}><span className="text-sm font-black text-foreground">Pedido {order.orderNumber}</span><span className="block truncate text-xs text-muted-foreground">{order.customerName} · {order.deliveryDriverName ?? 'Sem entregador'}</span></button>)}
              {waitingOrders.length === 0 ? <p className="px-4 pb-4 text-xs text-muted-foreground">Nenhum pedido pronto aguardando despacho.</p> : null}
            </section>
            <section aria-labelledby="map-route-orders-title">
              <div className="flex items-center justify-between px-4 pb-2 pt-3"><h3 id="map-route-orders-title" className="text-[11px] font-black uppercase tracking-[0.14em] text-muted-foreground">Pedidos em rota</h3><strong className="text-xs text-foreground">{enRouteOrders.length}</strong></div>
              {enRouteOrders.map((order) => <button key={order.id} type="button" onClick={() => { setFocusedDriverId(order.deliveryDriverId ?? null); setFocusedOrderId(order.id); }} className={`w-full min-h-11 border-t border-border px-4 py-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary ${focusedOrderId === order.id ? 'bg-orange-500/10' : 'hover:bg-muted/70'}`}><span className="text-sm font-black text-foreground">Pedido {order.orderNumber}</span><span className="block truncate text-xs text-muted-foreground">{order.customerName} · {order.deliveryDriverName ?? 'Entregador não informado'}</span></button>)}
              {enRouteOrders.length === 0 ? <p className="px-4 pb-4 text-xs text-muted-foreground">Nenhum pedido em rota.</p> : null}
            </section>
          </div>
        </aside>

        {!isPanelOpen ? (
          <button type="button" onClick={() => setIsPanelOpen(true)} className="safe-sheet fixed bottom-0 left-4 right-4 z-30 min-h-11 rounded-t-xl bg-primary px-4 font-bold text-primary-foreground shadow-lg lg:hidden">
            Ver painel operacional
          </button>
        ) : null}

        <section className="order-1 min-w-0 lg:order-2" aria-label="Mapa de entregas">
          <OperationalRouteMap drivers={shownDrivers} run={focused?.run ?? null} storePosition={storePosition} focusedOrderId={focusedOrderId ?? undefined} dispatchOrders={focused?.run ? [] : dispatchOrders} className="h-[58vh] min-h-[460px] rounded-xl" />
          {focused?.run ? <div className="mt-3 flex flex-col gap-2 border-l-4 border-orange-500 bg-card px-4 py-3 sm:flex-row sm:items-center sm:justify-between"><div><p className="flex items-center gap-2 text-sm font-black text-foreground"><Route className="h-4 w-4 text-orange-600" /> Rota de {focused.driver.name}</p><p className="mt-1 text-xs text-muted-foreground">Os números indicam a ordem operacional das paradas, sem otimização ou previsão de chegada.</p></div>{nextRunStop(focused.run) ? <div className="flex items-center gap-2 text-xs text-foreground"><MapPin className="h-4 w-4 text-orange-600" /><span><strong>Próxima:</strong> {formatStopAddress(nextRunStop(focused.run)?.address ?? null)}</span></div> : null}</div> : null}
        </section>
      </div>

      <footer className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground">
        <span>{operationalDrivers.filter(({ run }) => run?.status === DeliveryRunStatus.IN_PROGRESS).length} em rota</span>
        <span>{operationalDrivers.filter(({ run }) => run?.status === DeliveryRunStatus.RETURNING).length} retornando</span>
        <span>{operationalDrivers.filter(({ driver }) => driverMapState(driver).status === 'stale').length} com localização desatualizada</span>
        <span>{operationalDrivers.filter(({ driver }) => driverMapState(driver).status === 'unavailable').length} sem GPS</span>
        <span>{waitingOrders.length} aguardando despacho</span>
      </footer>
    </main>
  );
}
