import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertCircle,
  AlertTriangle,
  Bike,
  Building2,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Crosshair,
  ExternalLink,
  Eye,
  MapPin,
  MapPinOff,
  Navigation,
  RefreshCw,
  Search,
  ShoppingBag,
  Trophy,
  Truck,
  User,
  X,
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import type { DeliveryRunDTO, DriverDTO, OrderDispatchItemDTO, OrderResponseDTO, Tenant } from '@gestor/types';
import { api } from '@/lib/api-client';
import { OperationalRouteMap, type OperationalDriver } from './components/OperationalRouteMap';
import { LOGISTICS_QUERY_KEYS } from './lib/invalidate-logistics';
import { driverMapState, remainingRunStops } from './tracking-map.utils';

type FilterTab = 'all' | 'waiting' | 'en_route' | 'delivered';
type MapTileStyle = 'dark' | 'standard' | 'satellite';

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}

function getElapsedTimeMinutes(createdAtStr?: string, now = new Date()): number {
  if (!createdAtStr) return 0;
  const created = new Date(createdAtStr);
  if (Number.isNaN(created.getTime())) return 0;
  return Math.max(0, Math.floor((now.getTime() - created.getTime()) / 60_000));
}

function formatElapsedTime(createdAtStr?: string, now = new Date()): string {
  const mins = getElapsedTimeMinutes(createdAtStr, now);
  if (mins < 1) return 'Agora';
  if (mins < 60) return `${mins} min`;
  const hours = Math.floor(mins / 60);
  const remMins = mins % 60;
  return `${hours}h ${remMins}m`;
}

function getChannelBadge(sourceChannel?: string): { label: string; bg: string; text: string } {
  const ch = (sourceChannel ?? 'pedehub').toLowerCase();
  if (ch.includes('ifood')) {
    return { label: 'iFood', bg: 'bg-red-500/15 border-red-500/30', text: 'text-red-400 font-black' };
  }
  if (ch.includes('99')) {
    return { label: '99Food', bg: 'bg-yellow-500/15 border-yellow-500/30', text: 'text-yellow-400 font-black' };
  }
  return { label: 'PedeHub', bg: 'bg-blue-500/15 border-blue-500/30', text: 'text-blue-400 font-black' };
}

function getDriverInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  return (parts[0]?.substring(0, 2) ?? 'ENT').toUpperCase();
}

export function DeliveryMapPage() {
  const navigate = useNavigate();

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDriverId, setSelectedDriverId] = useState<string>('all');
  const [activeTab, setActiveTab] = useState<FilterTab>('all');
  const [tileStyle, setTileStyle] = useState<MapTileStyle>('dark');
  const [focusedOrderId, setFocusedOrderId] = useState<string | null>(null);
  const [focusedDriverId, setFocusedDriverId] = useState<string | null>(null);
  const [selectedOrderDetailsId, setSelectedOrderDetailsId] = useState<string | null>(null);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(timer);
  }, []);

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

  const activeOrderDetailsQuery = useQuery({
    queryKey: ['order-details', selectedOrderDetailsId],
    queryFn: async () => {
      if (!selectedOrderDetailsId) return null;
      const res = await api.get<OrderResponseDTO>(`/orders/${selectedOrderDetailsId}`);
      return res.data;
    },
    enabled: Boolean(selectedOrderDetailsId),
  });

  const handleRefresh = useCallback(() => {
    driversQuery.refetch();
    runsQuery.refetch();
    ordersQuery.refetch();
  }, [driversQuery, ordersQuery, runsQuery]);

  const operationalDrivers = useMemo<OperationalDriver[]>(() => {
    const runsByDriver = new Map((runsQuery.data ?? []).map((run) => [run.driverId, run]));
    return (driversQuery.data ?? [])
      .filter((driver) => driver.isActive)
      .map((driver) => ({ driver, run: runsByDriver.get(driver.id) ?? null }))
      .sort((a, b) => Number(Boolean(b.run)) - Number(Boolean(a.run)) || a.driver.name.localeCompare(b.driver.name));
  }, [driversQuery.data, runsQuery.data]);

  const allDispatchOrders = useMemo(() => ordersQuery.data ?? [], [ordersQuery.data]);

  const waitingOrdersCount = useMemo(
    () => allDispatchOrders.filter((order) => order.status === 'ready_for_delivery').length,
    [allDispatchOrders],
  );

  const enRouteOrdersCount = useMemo(
    () => allDispatchOrders.filter((order) => order.status === 'out_for_delivery').length,
    [allDispatchOrders],
  );

  const deliveredOrdersCount = useMemo(
    () => allDispatchOrders.filter((order) => order.status === 'completed').length,
    [allDispatchOrders],
  );

  const totalActiveOrdersCount = useMemo(
    () => allDispatchOrders.filter((order) => ['ready_for_delivery', 'out_for_delivery', 'completed'].includes(order.status)).length,
    [allDispatchOrders],
  );

  const filteredOrders = useMemo(() => {
    let result = allDispatchOrders;

    if (activeTab === 'waiting') {
      result = result.filter((order) => order.status === 'ready_for_delivery');
    } else if (activeTab === 'en_route') {
      result = result.filter((order) => order.status === 'out_for_delivery');
    } else if (activeTab === 'delivered') {
      result = result.filter((order) => order.status === 'completed');
    } else {
      result = result.filter((order) => ['ready_for_delivery', 'out_for_delivery', 'completed'].includes(order.status));
    }

    if (selectedDriverId !== 'all') {
      result = result.filter((order) => order.deliveryDriverId === selectedDriverId);
    }

    if (focusedDriverId) {
      result = result.filter((order) => order.deliveryDriverId === focusedDriverId);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      result = result.filter((order) => {
        const numMatch = order.orderNumber.toLowerCase().includes(q);
        const nameMatch = order.customerName.toLowerCase().includes(q);
        const streetMatch = (order.deliveryAddress?.street ?? '').toLowerCase().includes(q);
        const neighMatch = (order.deliveryAddress?.neighborhood ?? '').toLowerCase().includes(q);
        return numMatch || nameMatch || streetMatch || neighMatch;
      });
    }

    return result;
  }, [activeTab, allDispatchOrders, focusedDriverId, searchQuery, selectedDriverId]);

  const activeDriverCount = operationalDrivers.length;

  const noGpsCount = useMemo(() => {
    return operationalDrivers.filter(({ driver }) => {
      const freshness = driverMapState(driver, now);
      return freshness.status === 'unavailable' || driver.status === 'offline';
    }).length;
  }, [now, operationalDrivers]);

  const staleLocationCount = useMemo(() => {
    return operationalDrivers.filter(({ driver }) => {
      const freshness = driverMapState(driver, now);
      return freshness.status === 'stale';
    }).length;
  }, [now, operationalDrivers]);

  const storePosition = useMemo(() => {
    const lat = tenantQuery.data?.settings?.lat;
    const lng = tenantQuery.data?.settings?.lng;
    return typeof lat === 'number' && typeof lng === 'number' ? { lat, lng } : null;
  }, [tenantQuery.data]);

  const isLoading = driversQuery.isLoading || runsQuery.isLoading || ordersQuery.isLoading;
  const isRefreshing = driversQuery.isFetching || runsQuery.isFetching || ordersQuery.isFetching;
  const isError = driversQuery.isError || runsQuery.isError || ordersQuery.isError;

  const focusedDriver = useMemo(
    () => operationalDrivers.find(({ driver }) => driver.id === focusedDriverId) ?? null,
    [focusedDriverId, operationalDrivers],
  );

  return (
    <main className="mx-auto flex h-full w-full max-w-[1700px] flex-col p-3 sm:p-5 lg:p-6 text-foreground">
      {/* Header Section */}
      <header className="mb-4 flex flex-col gap-4 border-b border-border/80 pb-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="mb-1 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.14em] text-primary">
            <Navigation className="h-4 w-4" />
            <span>Entregas</span>
            <span className="text-muted-foreground/60">•</span>
            <span className="text-muted-foreground font-semibold lowercase">Acompanhe e gerencie sua operação de delivery</span>
          </div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-black tracking-tight text-foreground sm:text-3xl">Radar da frota</h1>
            <span className="flex h-3 w-3 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500" />
            </span>
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground sm:text-sm">
            Acompanhe suas entregas em tempo real e otimize suas rotas.
          </p>
        </div>

        {/* Top Header Controls */}
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          {/* Driver Select */}
          <div className="relative">
            <select
              value={selectedDriverId}
              onChange={(e) => setSelectedDriverId(e.target.value)}
              className="h-10 rounded-xl border border-border bg-card px-3.5 pr-8 text-xs font-bold text-foreground transition focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              aria-label="Filtrar por entregador"
            >
              <option value="all">Todos os entregadores</option>
              {operationalDrivers.map(({ driver }) => (
                <option key={driver.id} value={driver.id}>
                  {driver.name}
                </option>
              ))}
            </select>
          </div>

          {/* Search Box */}
          <div className="relative min-w-[240px] flex-1 sm:flex-none">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar pedido, cliente ou endereço…"
              className="h-10 w-full rounded-xl border border-border bg-card pl-9 pr-12 text-xs text-foreground placeholder:text-muted-foreground transition focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary sm:w-[260px]"
            />
            <kbd className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 rounded border border-border bg-muted/50 px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
              Ctrl K
            </kbd>
          </div>

          {/* Refresh Button */}
          <button
            type="button"
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-border bg-card px-3.5 text-xs font-bold text-foreground transition hover:bg-muted focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50"
            title="Atualizar dados do radar"
          >
            <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin text-primary' : ''}`} />
            <span className="hidden sm:inline">Atualizar</span>
          </button>

          {/* Operation Link Button */}
          <button
            type="button"
            onClick={() => navigate('/delivery/dispatch')}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-primary/40 bg-primary/10 px-4 text-xs font-black text-primary transition hover:bg-primary/20 focus:outline-none focus:ring-2 focus:ring-primary"
          >
            <ExternalLink className="h-4 w-4" />
            <span>Ver operação</span>
          </button>
        </div>
      </header>

      {/* Alert Notifications */}
      {isError ? (
        <div role="alert" className="mb-4 flex items-center gap-2 rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-xs font-bold text-destructive">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>Não foi possível conectar com o servidor para atualizar a localização da frota. A última informação visível pode estar desatualizada.</span>
        </div>
      ) : null}

      {/* Operational Filter Tabs */}
      <nav aria-label="Filtros operacionais" className="mb-4 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setActiveTab('all')}
          className={`inline-flex items-center gap-2 rounded-xl border px-3.5 py-2 text-xs font-black transition ${
            activeTab === 'all'
              ? 'border-primary bg-primary text-primary-foreground shadow-md'
              : 'border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground'
          }`}
        >
          <Trophy className="h-3.5 w-3.5" />
          <span>Todos ({totalActiveOrdersCount})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('waiting')}
          className={`inline-flex items-center gap-2 rounded-xl border px-3.5 py-2 text-xs font-black transition ${
            activeTab === 'waiting'
              ? 'border-amber-500 bg-amber-500 text-white shadow-md'
              : 'border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground'
          }`}
        >
          <Clock3 className="h-3.5 w-3.5" />
          <span>Aguardando despacho ({waitingOrdersCount})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('en_route')}
          className={`inline-flex items-center gap-2 rounded-xl border px-3.5 py-2 text-xs font-black transition ${
            activeTab === 'en_route'
              ? 'border-blue-500 bg-blue-500 text-white shadow-md'
              : 'border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground'
          }`}
        >
          <Truck className="h-3.5 w-3.5" />
          <span>Em rota ({enRouteOrdersCount})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('delivered')}
          className={`inline-flex items-center gap-2 rounded-xl border px-3.5 py-2 text-xs font-black transition ${
            activeTab === 'delivered'
              ? 'border-emerald-500 bg-emerald-500 text-white shadow-md'
              : 'border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground'
          }`}
        >
          <CheckCircle2 className="h-3.5 w-3.5" />
          <span>Entregues ({deliveredOrdersCount})</span>
        </button>
      </nav>

      {/* Main Three-Column Grid */}
      <div className="grid flex-1 gap-4 lg:grid-cols-[350px_minmax(0,1fr)_330px]">
        {/* Left Column: Orders Panel */}
        <section className="flex flex-col rounded-2xl border border-border bg-card p-3.5 shadow-sm">
          <div className="mb-3 flex items-center justify-between border-b border-border/60 pb-3">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-black text-foreground">
                {activeTab === 'waiting'
                  ? `Aguardando despacho (${filteredOrders.length})`
                  : activeTab === 'en_route'
                  ? `Em rota (${filteredOrders.length})`
                  : activeTab === 'delivered'
                  ? `Entregues (${filteredOrders.length})`
                  : `Pedidos (${filteredOrders.length})`}
              </h2>
            </div>
            <span className="text-[11px] font-bold text-muted-foreground">Mais antigos</span>
          </div>

          <div className="flex-1 space-y-3 overflow-y-auto max-h-[620px] pr-1">
            {isLoading ? (
              <div className="flex h-48 flex-col items-center justify-center gap-2 text-xs font-semibold text-muted-foreground">
                <RefreshCw className="h-5 w-5 animate-spin text-primary" />
                <span>Carregando lista de pedidos…</span>
              </div>
            ) : filteredOrders.length === 0 ? (
              <div className="flex h-56 flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border p-6 text-center">
                <ShoppingBag className="h-8 w-8 text-muted-foreground/50" />
                <p className="text-xs font-bold text-foreground">Nenhum pedido encontrado</p>
                <p className="text-[11px] text-muted-foreground">
                  Não há pedidos com o filtro ou busca selecionados no momento.
                </p>
              </div>
            ) : (
              filteredOrders.map((order) => {
                const sourceChan = (order as { sourceChannel?: string }).sourceChannel;
                const channel = getChannelBadge(sourceChan);
                const isFocused = focusedOrderId === order.id;
                const elapsedStr = formatElapsedTime(order.createdAt, now);
                const addressStr = order.deliveryAddress
                  ? [order.deliveryAddress.street, order.deliveryAddress.number, order.deliveryAddress.neighborhood]
                      .filter(Boolean)
                      .join(', ')
                  : 'Endereço não informado';

                return (
                  <article
                    key={order.id}
                    onClick={() => {
                      setFocusedOrderId(isFocused ? null : order.id);
                      if (order.deliveryDriverId) setFocusedDriverId(order.deliveryDriverId);
                    }}
                    className={`group cursor-pointer rounded-xl border p-3.5 transition ${
                      isFocused
                        ? 'border-primary bg-primary/10 shadow-md'
                        : 'border-border/80 bg-muted/40 hover:border-border hover:bg-muted/80'
                    }`}
                  >
                    {/* Top Row: Badge, Order #, Elapsed time */}
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className={`rounded-md border px-2 py-0.5 text-[10px] ${channel.bg} ${channel.text}`}>
                          {channel.label}
                        </span>
                        <span className="text-xs font-black text-foreground">#{order.orderNumber}</span>
                      </div>
                      <div className="flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[11px] font-bold text-amber-500">
                        <Clock3 className="h-3 w-3" />
                        <span>{elapsedStr}</span>
                      </div>
                    </div>

                    {/* Customer Name */}
                    <div className="mb-1 text-sm font-black text-foreground group-hover:text-primary transition-colors">
                      {order.customerName || 'Cliente'}
                    </div>

                    {/* Address & Fulfillment */}
                    <div className="mb-3 space-y-1 text-xs text-muted-foreground">
                      <div className="flex items-start gap-1.5">
                        <MapPin className="h-3.5 w-3.5 shrink-0 mt-0.5 text-primary" />
                        <span className="line-clamp-2 leading-tight">{addressStr}</span>
                      </div>
                      <div className="flex items-center gap-1.5 pt-0.5">
                        {order.fulfillmentType === 'delivery' ? (
                          <span className="inline-flex items-center gap-1 rounded border border-border bg-card px-2 py-0.5 text-[10px] font-bold text-foreground">
                            <Bike className="h-3 w-3 text-primary" /> Delivery
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded border border-border bg-card px-2 py-0.5 text-[10px] font-bold text-foreground">
                            <Building2 className="h-3 w-3 text-amber-500" /> Retirada
                          </span>
                        )}
                        {order.deliveryDriverName ? (
                          <span className="truncate text-[11px] font-semibold text-muted-foreground">
                            • {order.deliveryDriverName}
                          </span>
                        ) : null}
                      </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex items-center gap-2 pt-1 border-t border-border/40">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedOrderDetailsId(order.id);
                        }}
                        className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs font-bold text-foreground hover:bg-muted transition"
                      >
                        <Eye className="h-3.5 w-3.5" />
                        <span>Abrir pedido</span>
                      </button>

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate('/delivery/dispatch');
                        }}
                        className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg border border-primary bg-primary text-primary-foreground px-2.5 py-1.5 text-xs font-black hover:bg-primary/90 transition shadow-sm"
                      >
                        <Navigation className="h-3.5 w-3.5" />
                        <span>Despachar</span>
                      </button>
                    </div>
                  </article>
                );
              })
            )}
          </div>
        </section>

        {/* Center Column: Map Container */}
        <section className="relative flex flex-col rounded-2xl border border-border bg-card overflow-hidden shadow-sm">
          {/* Map Top Overlay Controls */}
          <div className="absolute top-3 left-3 right-3 z-[400] flex flex-wrap items-center justify-between gap-2 pointer-events-none">
            {/* Tile Layer Selector */}
            <div className="pointer-events-auto flex items-center rounded-xl border border-border/80 bg-background/90 p-1 shadow-md backdrop-blur">
              <button
                type="button"
                onClick={() => setTileStyle('dark')}
                className={`rounded-lg px-2.5 py-1 text-xs font-bold transition ${
                  tileStyle === 'dark' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Escuro
              </button>
              <button
                type="button"
                onClick={() => setTileStyle('standard')}
                className={`rounded-lg px-2.5 py-1 text-xs font-bold transition ${
                  tileStyle === 'standard' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Mapa
              </button>
              <button
                type="button"
                onClick={() => setTileStyle('satellite')}
                className={`rounded-lg px-2.5 py-1 text-xs font-bold transition ${
                  tileStyle === 'satellite' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Satélite
              </button>
            </div>

            {/* Reset Focus / Overview Button */}
            <button
              type="button"
              onClick={() => {
                setFocusedDriverId(null);
                setFocusedOrderId(null);
              }}
              disabled={!focusedDriverId && !focusedOrderId}
              className="pointer-events-auto inline-flex items-center gap-1.5 rounded-xl border border-border/80 bg-background/90 px-3 py-1.5 text-xs font-bold text-foreground shadow-md backdrop-blur transition hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Crosshair className="h-3.5 w-3.5" />
              <span>Ver toda a operação</span>
            </button>
          </div>

          {/* Map Component */}
          <OperationalRouteMap
            drivers={focusedDriver ? [focusedDriver] : operationalDrivers}
            storePosition={storePosition}
            focusedOrderId={focusedOrderId ?? undefined}
            dispatchOrders={filteredOrders}
            className="h-full min-h-[520px] w-full"
            tileStyle={tileStyle}
          />
        </section>

        {/* Right Column: Drivers Panel */}
        <section className="flex flex-col rounded-2xl border border-border bg-card p-3.5 shadow-sm">
          <div className="mb-3 flex items-center justify-between border-b border-border/60 pb-3">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              <h2 className="text-sm font-black text-foreground">
                Entregadores ativos ({activeDriverCount})
              </h2>
            </div>
            <span className="text-[11px] font-bold text-muted-foreground">Todos</span>
          </div>

          <div className="flex-1 space-y-2.5 overflow-y-auto max-h-[620px] pr-1">
            {isLoading ? (
              <div className="flex h-48 flex-col items-center justify-center gap-2 text-xs font-semibold text-muted-foreground">
                <RefreshCw className="h-5 w-5 animate-spin text-primary" />
                <span>Carregando entregadores…</span>
              </div>
            ) : operationalDrivers.length === 0 ? (
              <div className="flex h-56 flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border p-6 text-center">
                <Bike className="h-8 w-8 text-muted-foreground/50" />
                <p className="text-xs font-bold text-foreground">Nenhum entregador cadastrado</p>
                <p className="text-[11px] text-muted-foreground">
                  Os entregadores cadastrados e ativos aparecerão nesta coluna.
                </p>
              </div>
            ) : (
              operationalDrivers.map(({ driver, run }) => {
                const freshness = driverMapState(driver, now);
                const activeStops = run ? remainingRunStops(run) : 0;
                const isSelected = focusedDriverId === driver.id;

                let statusBadge = { label: 'Disponível', bg: 'bg-slate-500/15 border-slate-500/30', text: 'text-slate-300' };
                if (freshness.status === 'unavailable' || driver.status === 'offline') {
                  statusBadge = { label: 'Sem GPS', bg: 'bg-red-500/15 border-red-500/30', text: 'text-red-400 font-bold' };
                } else if (run || driver.status === 'busy') {
                  statusBadge = { label: 'Em rota', bg: 'bg-blue-500/15 border-blue-500/30', text: 'text-blue-400 font-bold' };
                }

                return (
                  <article
                    key={driver.id}
                    onClick={() => {
                      setFocusedDriverId(isSelected ? null : driver.id);
                    }}
                    className={`group flex cursor-pointer items-center justify-between rounded-xl border p-3 transition ${
                      isSelected
                        ? 'border-primary bg-primary/10 shadow-md'
                        : 'border-border/80 bg-muted/40 hover:border-border hover:bg-muted/80'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      {/* Driver Avatar with Status Indicator */}
                      <div className="relative">
                        <div className="grid h-10 w-10 place-items-center rounded-full border border-border bg-card font-black text-xs text-foreground shadow-sm">
                          {getDriverInitials(driver.name)}
                        </div>
                        <span
                          className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-card ${
                            freshness.status === 'unavailable'
                              ? 'bg-red-500'
                              : freshness.status === 'stale'
                              ? 'bg-amber-500'
                              : 'bg-emerald-500'
                          }`}
                        />
                      </div>

                      {/* Driver Info */}
                      <div>
                        <div className="text-xs font-black text-foreground group-hover:text-primary transition-colors">
                          {driver.name}
                        </div>
                        <div className="mt-0.5 flex items-center gap-2 text-[11px] text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Bike className="h-3 w-3 text-muted-foreground" />
                            {activeStops} {activeStops === 1 ? 'entrega' : 'entregas'}
                          </span>
                          <span>•</span>
                          <span className="flex items-center gap-1">
                            <MapPin className="h-3 w-3 text-muted-foreground" />
                            {freshness.status === 'unavailable' ? 'Sem GPS' : freshness.label.replace('Localização ', '')}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Status Pill & Arrow */}
                    <div className="flex items-center gap-2">
                      <span className={`rounded-md border px-2 py-0.5 text-[10px] ${statusBadge.bg} ${statusBadge.text}`}>
                        {statusBadge.label}
                      </span>
                      <ChevronRight className="h-4 w-4 text-muted-foreground/60 group-hover:text-foreground transition-transform group-hover:translate-x-0.5" />
                    </div>
                  </article>
                );
              })
            )}
          </div>
        </section>
      </div>

      {/* Bottom Metrics Bar (Footer Cards) */}
      <footer className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {/* Card 1: Em rota */}
        <div className="flex items-center gap-3.5 rounded-xl border border-border/80 bg-card p-3.5 shadow-sm">
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-blue-500/15 text-blue-500">
            <Truck className="h-5.5 w-5.5" />
          </div>
          <div>
            <div className="flex items-baseline gap-2">
              <span className="text-xl font-black text-foreground">{enRouteOrdersCount}</span>
              <span className="text-xs font-bold text-foreground">Em rota</span>
            </div>
            <p className="text-[11px] text-muted-foreground">Entregas em andamento</p>
          </div>
        </div>

        {/* Card 2: Aguardando despacho */}
        <div className="flex items-center gap-3.5 rounded-xl border border-border/80 bg-card p-3.5 shadow-sm">
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-amber-500/15 text-amber-500">
            <Clock3 className="h-5.5 w-5.5" />
          </div>
          <div>
            <div className="flex items-baseline gap-2">
              <span className="text-xl font-black text-foreground">{waitingOrdersCount}</span>
              <span className="text-xs font-bold text-foreground">Aguardando despacho</span>
            </div>
            <p className="text-[11px] text-muted-foreground">Pedidos prontos para sair</p>
          </div>
        </div>

        {/* Card 3: Sem GPS */}
        <div className="flex items-center gap-3.5 rounded-xl border border-border/80 bg-card p-3.5 shadow-sm">
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-red-500/15 text-red-500">
            <AlertCircle className="h-5.5 w-5.5" />
          </div>
          <div>
            <div className="flex items-baseline gap-2">
              <span className="text-xl font-black text-foreground">{noGpsCount}</span>
              <span className="text-xs font-bold text-foreground">Sem GPS</span>
            </div>
            <p className="text-[11px] text-muted-foreground">Entregador offline</p>
          </div>
        </div>

        {/* Card 4: Localização desatualizada */}
        <div className="flex items-center gap-3.5 rounded-xl border border-border/80 bg-card p-3.5 shadow-sm">
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-amber-600/15 text-amber-600">
            <MapPinOff className="h-5.5 w-5.5" />
          </div>
          <div>
            <div className="flex items-baseline gap-2">
              <span className="text-xl font-black text-foreground">{staleLocationCount}</span>
              <span className="text-xs font-bold text-foreground">Localização desatualizada</span>
            </div>
            <p className="text-[11px] text-muted-foreground">Última posição há mais de 90s</p>
          </div>
        </div>
      </footer>

      {/* Embedded Order Details Modal */}
      {selectedOrderDetailsId ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="flex max-h-[85vh] w-full max-w-lg flex-col rounded-2xl border border-border bg-card shadow-2xl overflow-hidden">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-border/80 p-4">
              <div>
                <h3 className="text-lg font-black text-foreground">
                  Detalhes do Pedido #{activeOrderDetailsQuery.data?.orderNumber ?? '...'}
                </h3>
                <p className="text-xs text-muted-foreground">
                  Informações completas do pedido de delivery
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedOrderDetailsId(null)}
                className="grid h-8 w-8 place-items-center rounded-xl border border-border bg-muted/50 text-muted-foreground hover:text-foreground transition"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Modal Content */}
            <div className="flex-1 space-y-4 overflow-y-auto p-4">
              {activeOrderDetailsQuery.isLoading ? (
                <div className="flex h-32 flex-col items-center justify-center gap-2 text-xs font-semibold text-muted-foreground">
                  <RefreshCw className="h-5 w-5 animate-spin text-primary" />
                  <span>Buscando detalhes do pedido…</span>
                </div>
              ) : activeOrderDetailsQuery.data ? (
                <>
                  {/* Customer Info Box */}
                  <div className="rounded-xl border border-border/80 bg-muted/30 p-3 space-y-1">
                    <div className="flex items-center gap-2 text-sm font-black text-foreground">
                      <User className="h-4 w-4 text-primary" />
                      <span>{activeOrderDetailsQuery.data.customerName || 'Cliente sem nome'}</span>
                    </div>
                    {activeOrderDetailsQuery.data.customerPhone ? (
                      <p className="text-xs text-muted-foreground pl-6">
                        Telefone: {activeOrderDetailsQuery.data.customerPhone}
                      </p>
                    ) : null}
                    {activeOrderDetailsQuery.data.deliveryAddress ? (
                      <p className="text-xs text-muted-foreground pl-6">
                        Endereço:{' '}
                        {[
                          activeOrderDetailsQuery.data.deliveryAddress.street,
                          activeOrderDetailsQuery.data.deliveryAddress.number,
                          activeOrderDetailsQuery.data.deliveryAddress.neighborhood,
                          activeOrderDetailsQuery.data.deliveryAddress.city,
                        ]
                          .filter(Boolean)
                          .join(', ')}
                      </p>
                    ) : null}
                  </div>

                  {/* Items List */}
                  <div>
                    <h4 className="mb-2 text-xs font-black uppercase tracking-wider text-muted-foreground">
                      Itens do pedido
                    </h4>
                    <div className="space-y-2 divide-y divide-border/40 border-t border-b border-border/60 py-2">
                      {activeOrderDetailsQuery.data.items?.map((item) => (
                        <div key={item.id} className="flex items-center justify-between pt-2 text-xs">
                          <div>
                            <span className="font-bold text-foreground">
                              {item.quantity}x {item.snapshotName}
                            </span>
                            {item.notes ? (
                              <p className="text-[11px] text-muted-foreground">Obs: {item.notes}</p>
                            ) : null}
                          </div>
                          <span className="font-bold text-foreground">
                            {formatCurrency(item.lineTotal)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Order Financial Summary */}
                  <div className="space-y-1.5 text-xs text-muted-foreground pt-1">
                    <div className="flex justify-between">
                      <span>Subtotal dos itens:</span>
                      <span>{formatCurrency(activeOrderDetailsQuery.data.itemsSubtotal)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Taxa de entrega:</span>
                      <span>{formatCurrency(activeOrderDetailsQuery.data.deliveryFee ?? 0)}</span>
                    </div>
                    <div className="flex justify-between font-black text-sm text-foreground pt-2 border-t border-border/60">
                      <span>Total final:</span>
                      <span className="text-primary">{formatCurrency(activeOrderDetailsQuery.data.total)}</span>
                    </div>
                  </div>
                </>
              ) : (
                <p className="text-xs text-muted-foreground text-center py-6">
                  Não foi possível carregar os detalhes deste pedido.
                </p>
              )}
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-end gap-2 border-t border-border/80 p-3 bg-muted/20">
              <button
                type="button"
                onClick={() => setSelectedOrderDetailsId(null)}
                className="rounded-xl border border-border bg-card px-4 py-2 text-xs font-bold text-foreground hover:bg-muted transition"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
