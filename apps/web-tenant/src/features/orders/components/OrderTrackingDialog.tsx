import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Bike, CheckCircle2, Clock3, Map, MapPin, RefreshCw, Route, X } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import {
  DeliveryRunStatus,
  type DeliveryRunDTO,
  type DeliveryRunLocationHistoryDTO,
  type DriverDTO,
  type OrderResponseDTO,
  type Tenant,
} from '@gestor/types';
import { api } from '@/lib/api-client';
import { OperationalRouteMap } from '../../delivery/components/OperationalRouteMap';
import { driverMapState, formatStopAddress, runStatusLabel, stopStatusLabel } from '../../delivery/tracking-map.utils';

type Props = { order: OrderResponseDTO; initialRun?: DeliveryRunDTO; onClose: () => void };

const ACTIVE_RUN_STATUSES = [DeliveryRunStatus.IN_PROGRESS, DeliveryRunStatus.RETURNING] as const;

export function OrderTrackingDialog({ order, initialRun, onClose }: Props) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  const [showCompletedPath, setShowCompletedPath] = useState(false);

  const runQuery = useQuery({
    queryKey: ['delivery-run', 'order', order.id],
    queryFn: async () => (await api.get<DeliveryRunDTO | null>(`/delivery/runs/order/${order.id}`)).data ?? null,
    initialData: initialRun,
  });
  const run = runQuery.data ?? null;
  const historyQuery = useQuery({
    queryKey: ['delivery-run', run?.id, 'locations'],
    enabled: Boolean(run?.id),
    queryFn: async () => (await api.get<DeliveryRunLocationHistoryDTO>(`/delivery/runs/${run?.id}/locations`)).data,
    refetchInterval: ACTIVE_RUN_STATUSES.includes(run?.status as typeof ACTIVE_RUN_STATUSES[number]) ? 5_000 : false,
  });
  const driverQuery = useQuery({
    queryKey: ['delivery-driver', run?.driverId],
    enabled: Boolean(run?.driverId),
    queryFn: async () => (await api.get<DriverDTO>(`/delivery/drivers/${run?.driverId}`)).data,
    refetchInterval: ACTIVE_RUN_STATUSES.includes(run?.status as typeof ACTIVE_RUN_STATUSES[number]) ? 5_000 : false,
  });
  const tenantQuery = useQuery({
    queryKey: ['tenant', 'me'],
    queryFn: async () => (await api.get<Tenant>('/tenant/me')).data,
    staleTime: 60_000,
  });

  useEffect(() => {
    restoreFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const panel = panelRef.current;
    const focusable = panel?.querySelector<HTMLElement>('button:not([tabindex="-1"]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
    focusable?.focus();
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== 'Tab' || !panel) return;
      const items = Array.from(panel.querySelectorAll<HTMLElement>('button:not(:disabled):not([tabindex="-1"]), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])'));
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('keydown', handleKey);
      const restoreFocus = restoreFocusRef.current;
      queueMicrotask(() => restoreFocus?.focus());
    };
  }, [onClose]);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const overlay = overlayRef.current;
    const siblings = overlay?.parentElement ? Array.from(overlay.parentElement.children).filter((child) => child !== overlay) : [];
    const previous = siblings.map((element) => ({
      element: element as HTMLElement,
      ariaHidden: element.getAttribute('aria-hidden'),
      inert: (element as HTMLElement & { inert?: boolean }).inert ?? false,
    }));
    for (const { element } of previous) {
      element.setAttribute('aria-hidden', 'true');
      (element as HTMLElement & { inert?: boolean }).inert = true;
    }
    return () => {
      document.body.style.overflow = previousOverflow;
      for (const item of previous) {
        if (item.ariaHidden === null) item.element.removeAttribute('aria-hidden');
        else item.element.setAttribute('aria-hidden', item.ariaHidden);
        (item.element as HTMLElement & { inert?: boolean }).inert = item.inert;
      }
    };
  }, []);

  const isOperational = Boolean(run && ACTIVE_RUN_STATUSES.includes(run.status as typeof ACTIVE_RUN_STATUSES[number]));
  const shouldShowMap = isOperational || showCompletedPath;
  const history = historyQuery.data;
  const routePoints = useMemo(() => history?.points.map(({ lat, lng }) => ({ lat, lng })) ?? [], [history]);
  const storePosition = typeof tenantQuery.data?.settings?.lat === 'number' && typeof tenantQuery.data.settings.lng === 'number'
    ? { lat: tenantQuery.data.settings.lat, lng: tenantQuery.data.settings.lng }
    : null;
  const driver = driverQuery.data;
  const freshness = driver ? driverMapState(driver) : null;

  return (
    <div ref={overlayRef} className="fixed inset-0 z-[70] flex items-end justify-center p-0 sm:items-center sm:p-5" role="presentation">
      <button type="button" tabIndex={-1} className="absolute inset-0 cursor-default bg-black/65" aria-label="Fechar acompanhamento pelo fundo" onClick={onClose} />
      <div ref={panelRef} role="dialog" aria-modal="true" aria-labelledby="order-tracking-title" aria-describedby="order-tracking-description" className="relative z-10 flex max-h-[95vh] w-full max-w-6xl flex-col overflow-hidden rounded-t-2xl border border-border bg-card shadow-2xl sm:max-h-[90vh] sm:rounded-xl">
        <header className="flex shrink-0 items-start justify-between gap-4 border-b border-border px-4 py-4 sm:px-6">
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">Acompanhamento da entrega</p>
            <h2 id="order-tracking-title" className="mt-1 truncate text-xl font-black text-foreground sm:text-2xl">Pedido {order.orderNumber}</h2>
            <p id="order-tracking-description" className="mt-1 text-sm text-muted-foreground">Posição do entregador, ordem das paradas e resumo operacional da rota.</p>
          </div>
          <button type="button" onClick={onClose} className="grid min-h-11 min-w-11 place-items-center rounded-lg text-muted-foreground transition hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary" aria-label="Fechar acompanhamento"><X className="h-5 w-5" /></button>
        </header>

        <div className="overflow-y-auto">
          {runQuery.isLoading ? <div role="status" className="flex min-h-[360px] items-center justify-center gap-2 text-sm font-bold text-muted-foreground"><RefreshCw className="h-5 w-5 animate-spin" /> Carregando a rota deste pedido…</div> : null}
          {runQuery.isError ? <div role="alert" className="m-5 flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive"><AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" /><div><strong>Não foi possível carregar a rota.</strong><p className="mt-1">Tente novamente antes de tomar uma decisão de despacho.</p></div></div> : null}
          {!runQuery.isLoading && !runQuery.isError && !run ? <div className="flex min-h-[360px] flex-col items-center justify-center px-6 text-center"><MapPin className="mb-3 h-8 w-8 text-muted-foreground" /><h3 className="font-black text-foreground">Pedido sem rota vinculada</h3><p className="mt-1 max-w-md text-sm text-muted-foreground">O acompanhamento ficará disponível depois que este pedido for incluído em uma rota de entrega.</p></div> : null}

          {run ? (
            <div className="grid lg:grid-cols-[minmax(0,1.7fr)_minmax(310px,.8fr)]">
              <section className="min-w-0 border-b border-border lg:border-b-0 lg:border-r">
                <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3 sm:px-5">
                  <span className="inline-flex min-h-8 items-center gap-2 rounded-md bg-primary/10 px-3 text-xs font-black text-primary"><Bike className="h-4 w-4" /> {run.driverName}</span>
                  <span className="inline-flex min-h-8 items-center gap-2 rounded-md bg-muted px-3 text-xs font-black text-foreground"><Route className="h-4 w-4" /> {runStatusLabel(run.status)}</span>
                  {freshness ? <span className={`inline-flex min-h-8 items-center gap-2 rounded-md px-3 text-xs font-black ${freshness.status === 'fresh' ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400' : freshness.status === 'stale' ? 'bg-amber-500/10 text-amber-700 dark:text-amber-400' : 'bg-muted text-muted-foreground'}`}><Clock3 className="h-4 w-4" /> {freshness.label}</span> : null}
                </div>

                {historyQuery.isLoading ? <div role="status" className="flex h-[430px] items-center justify-center gap-2 text-sm font-bold text-muted-foreground"><RefreshCw className="h-5 w-5 animate-spin" /> Carregando registros do trajeto…</div> : null}
                {historyQuery.isError ? <div role="alert" className="flex h-[430px] items-center justify-center px-6 text-center text-sm font-bold text-destructive">O resumo da rota está disponível, mas o trajeto não pôde ser carregado.</div> : null}
                {!historyQuery.isLoading && !historyQuery.isError && history && !history.detailedAvailable ? <div className="flex h-[430px] flex-col items-center justify-center px-6 text-center"><Clock3 className="mb-3 h-8 w-8 text-muted-foreground" /><h3 className="font-black text-foreground">Trajeto detalhado indisponível</h3><p className="mt-1 max-w-md text-sm text-muted-foreground">Os pontos detalhados são mantidos por 30 dias. O resumo operacional da rota continua disponível ao lado.</p></div> : null}
                {!historyQuery.isLoading && !historyQuery.isError && history?.detailedAvailable && run.status === DeliveryRunStatus.COMPLETED && !showCompletedPath ? <div className="flex h-[430px] flex-col items-center justify-center px-6 text-center"><CheckCircle2 className="mb-3 h-9 w-9 text-emerald-600" /><h3 className="font-black text-foreground">Rota concluída</h3><p className="mt-1 max-w-md text-sm text-muted-foreground">O trajeto detalhado desta rota ainda está dentro do período de retenção.</p><button type="button" onClick={() => setShowCompletedPath(true)} className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-black text-primary-foreground hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"><Map className="h-4 w-4" /> Ver trajeto no mapa</button></div> : null}
                {!historyQuery.isLoading && !historyQuery.isError && history?.detailedAvailable && shouldShowMap ? <OperationalRouteMap drivers={driver ? [{ driver, run }] : []} run={run} routePoints={routePoints} storePosition={storePosition} focusedOrderId={order.id} className="h-[430px] border-0" /> : null}
                {!historyQuery.isLoading && !historyQuery.isError && history?.detailedAvailable && !isOperational && run.status !== DeliveryRunStatus.COMPLETED ? <div className="flex h-[430px] flex-col items-center justify-center px-6 text-center"><Route className="mb-3 h-8 w-8 text-muted-foreground" /><h3 className="font-black text-foreground">Rota ainda não iniciada</h3><p className="mt-1 max-w-md text-sm text-muted-foreground">O mapa do trajeto aparecerá quando o entregador iniciar a rota.</p></div> : null}
              </section>

              <aside className="bg-muted/30 p-4 sm:p-5" aria-label="Resumo das paradas">
                <h3 className="text-sm font-black uppercase tracking-[0.12em] text-foreground">Resumo das paradas</h3>
                <p className="mt-1 text-xs text-muted-foreground">Ordem operacional definida no despacho — sem ETA ou otimização.</p>
                <ol className="mt-4 space-y-2">
                  {run.stops.map((stop) => {
                    const focused = stop.orderId === order.id;
                    return <li key={stop.id} className={`flex gap-3 border-l-4 p-3 ${focused ? 'border-orange-500 bg-orange-500/10' : 'border-border bg-card'}`}><span className={`grid h-7 w-7 shrink-0 place-items-center rounded-md text-xs font-black ${focused ? 'bg-orange-600 text-white' : 'bg-muted text-foreground'}`}>{stop.sequence}</span><div className="min-w-0"><div className="flex flex-wrap items-center gap-x-2"><strong className="text-sm text-foreground">Pedido {stop.orderNumber}</strong>{focused ? <span className="text-[10px] font-black uppercase text-orange-700 dark:text-orange-400">Este pedido</span> : null}</div><p className="mt-1 text-xs font-semibold text-foreground">{stop.customerName}</p><p className="mt-0.5 whitespace-normal break-words text-xs leading-relaxed text-muted-foreground">{formatStopAddress(stop.address)}</p><p className="mt-1 text-xs font-bold text-foreground">{stopStatusLabel(stop.status)}</p></div></li>;
                  })}
                </ol>
              </aside>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
