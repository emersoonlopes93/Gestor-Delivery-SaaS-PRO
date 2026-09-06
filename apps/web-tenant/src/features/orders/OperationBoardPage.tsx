import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { RefreshCw, LayoutGrid, Package, Truck, Volume2, VolumeX, Search, SlidersHorizontal } from 'lucide-react';
import type { DeliveryRunBuilderDataDTO, OrderBoardItemDTO, OrderOperationalAction, OrderStatus, UpdateOrderStatusDTO, DriverDTO, OrderResponseDTO } from '@gestor/types';
import { api, ApiError } from '../../lib/api-client';
import { invalidateLogisticsQueries } from '../delivery/lib/invalidate-logistics';
import { DndContext, DragOverlay, closestCorners, KeyboardSensor, PointerSensor, useSensor, useSensors, DragStartEvent, DragEndEvent } from '@dnd-kit/core';
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { OrderCard } from './components/OrderCard';
import { KanbanColumn, KanbanColumnSpec, BoardViewMode } from './components/KanbanColumn';
import { OrderDrawer } from './components/OrderDrawer';
import { DriverSelectionModal } from './components/DriverSelectionModal';
import { EditOrderModal } from './components/EditOrderModal';
import { OrderPrintTemplate } from './components/OrderPrintTemplate';
import { useOrderNotifications } from './hooks/useOrderNotifications';
import { printTicketViaPrimaryBluetooth } from '../../lib/bluetooth';
import { printThermalText } from '../../lib/thermal-print';
import { Capacitor } from '@capacitor/core';
import toast from 'react-hot-toast';
import { resolveKanbanDropAction } from './operational-actions';
import { matchesBoardFilter, matchesBoardSearch, ORDER_TIME_THRESHOLDS_MINUTES, type BoardFilter } from './order-presenters';

/* ─── Kanban columns spec ───────────────────────────────────── */

const KANBAN_COLUMNS: KanbanColumnSpec[] = [
  {
    id: 'entry',
    title: 'Entrada',
    subtitle: 'Novos + Confirmados',
    statuses: ['pending', 'confirmed'],
    icon: Package,
    accentCol: 'kanban-accent-entry',
    headerCol: 'kanban-col-header-entry',
    countCls: 'kanban-count-entry',
    colCls: 'kanban-col-entry',
    headerBorder: 'border-slate-200 dark:border-slate-800',
  },
  {
    id: 'production',
    title: 'Produção',
    subtitle: 'Em preparo na cozinha',
    statuses: ['preparing'],
    icon: LayoutGrid,
    accentCol: 'kanban-accent-production',
    headerCol: 'kanban-col-header-production',
    countCls: 'kanban-count-production',
    colCls: 'kanban-col-production',
    headerBorder: 'border-orange-200/70 dark:border-orange-900/40',
  },
  {
    id: 'delivery',
    title: 'Entrega',
    subtitle: 'Despacho + Em rota',
    statuses: ['ready_for_pickup', 'ready_for_delivery', 'out_for_delivery'],
    icon: Truck,
    accentCol: 'kanban-accent-delivery',
    headerCol: 'kanban-col-header-delivery',
    countCls: 'kanban-count-delivery',
    colCls: 'kanban-col-delivery',
    headerBorder: 'border-emerald-200/60 dark:border-emerald-900/30',
  },
];

const BOARD_FILTERS: { id: BoardFilter; label: string; core?: boolean }[] = [
  { id: 'all', label: 'Todos', core: true },
  { id: 'PEDEHUB', label: 'PedeHub', core: true },
  { id: 'IFOOD', label: 'iFood', core: true },
  { id: 'FOOD_99', label: '99Food' },
  { id: 'action', label: 'Aguardando ação', core: true },
  { id: 'delayed', label: 'Atrasados' },
  { id: 'sync_failed', label: 'Falha de sincronização' },
  { id: 'merchant', label: 'Entrega própria' },
  { id: 'provider', label: 'Entrega marketplace' },
];

/* ─── Segmented Control ─────────────────────────────────────── */

const SegmentedControl = memo(function SegmentedControl(props: {
  value: BoardViewMode;
  onChange: (v: BoardViewMode) => void;
}) {
  const { value, onChange } = props;

  const items: { id: BoardViewMode; label: string; mobileLabel: string }[] = [
    { id: 'compact', label: 'Compacto', mobileLabel: 'Compacto' },
    { id: 'standard', label: 'Padrão', mobileLabel: 'Padrão' },
    { id: 'focus_production', label: 'Foco Cozinha', mobileLabel: 'Cozinha' },
  ];

  return (
    <div
      className="grid w-full grid-cols-3 items-center gap-1 rounded-xl p-1"
      style={{ background: 'var(--surface-inset)', border: '1px solid var(--border-default)' }}
    >
      {items.map((item) => {
        const active = value === item.id;
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onChange(item.id)}
            className={`min-w-0 truncate rounded-lg px-1.5 py-1.5 text-[10px] font-black uppercase tracking-wider transition-all duration-200 focus:outline-none sm:px-3 ${active
              ? 'bg-primary text-primary-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
              }`}
          >
            <span className="sm:hidden">{item.mobileLabel}</span><span className="hidden sm:inline">{item.label}</span>
          </button>
        );
      })}
    </div>
  );
});

/* ─── Page ──────────────────────────────────────────────────── */

export function OperationBoardPage() {
  const queryClient = useQueryClient();
  const [orders, setOrders] = useState<OrderBoardItemDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<BoardViewMode>('standard');
  const [activeColumn, setActiveColumn] = useState<KanbanColumnSpec['id']>('entry');
  const [search, setSearch] = useState('');
  const [activeFilter, setActiveFilter] = useState<BoardFilter>('all');
  const [showMoreFilters, setShowMoreFilters] = useState(false);

  const [drivers, setDrivers] = useState<DriverDTO[]>([]);
  const [isDriverModalOpen, setIsDriverModalOpen] = useState(false);
  const [orderToDispatch, setOrderToDispatch] = useState<string | null>(null);

  const [activeOrderId, setActiveOrderId] = useState<string | null>(null);
  const [activeDragOrder, setActiveDragOrder] = useState<OrderBoardItemDTO | null>(null);
  const [orderToPrint, setOrderToPrint] = useState<OrderResponseDTO | null>(null);
  const [orderToEdit, setOrderToEdit] = useState<OrderResponseDTO | null>(null);
  const [isPrinting, setIsPrinting] = useState(false);

  const handlePrintOrder = async (orderId: string) => {
    setIsPrinting(true);
    try {
      const loadToastId = toast.loading('Carregando dados para impressão...');
      const [orderRes, printRes] = await Promise.all([
        api.get<OrderResponseDTO>(`/orders/${orderId}`),
        api.get<{ content: string }>(`/pos/sales/${orderId}/print?type=customer`),
      ]);
      toast.dismiss(loadToastId);

      if (orderRes.data) {
        setOrderToPrint(orderRes.data);
        await api.post(`/orders/${orderId}/print-log`);
        const content = printRes.data?.content || '';
        if (Capacitor.isNativePlatform() && content.trim()) {
          await printTicketViaPrimaryBluetooth(content);
          setIsPrinting(false);
          setOrderToPrint(null);
          toast.success('Impressão enviada para a Bluetooth principal.');
          return;
        }
        printThermalText(content, { title: `Pedido #${orderRes.data.orderNumber}`, paperWidthMm: 58 });
        setIsPrinting(false);
        setOrderToPrint(null);
        toast.success('Imprimindo ticket...');
      } else {
        throw new Error('Pedido não encontrado');
      }
    } catch (err) {
      setIsPrinting(false);
      setOrderToPrint(null);
      console.error('[OperationBoardPage] Erro ao imprimir:', err);
      toast.error('Não foi possível imprimir o pedido.');
    }
  };

  const handleEditOrder = async (orderId: string) => {
    try {
      const loadToastId = toast.loading('Carregando pedido para edição...');
      const res = await api.get<OrderResponseDTO>(`/orders/${orderId}`);
      toast.dismiss(loadToastId);

      if (res.data) {
        setOrderToEdit(res.data);
      } else {
        throw new Error('Pedido não encontrado');
      }
    } catch (err) {
      console.error('[OperationBoardPage] Erro ao editar:', err);
      toast.error('Não foi possível carregar os detalhes do pedido para edição.');
    }
  };

  // Notifications
  const { isAudioEnabled, enableAudio } = useOrderNotifications(orders);

  // Track which orders have already triggered the "delayed" alert to avoid spamming
  const alreadyAlertedDelayed = useRef<Set<string>>(new Set());

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const fetchBoard = useCallback(async () => {
    try {
      const res = await api.get<OrderBoardItemDTO[]>(`/orders/operation/board?refresh=${Date.now()}`);
      setOrders(res.data || []);
      setError(null);
    } catch (err) {
      console.error('[OperationBoardPage] Erro ao buscar board:', err);
      const msg = err instanceof ApiError ? err.message : 'Erro ao carregar quadro de pedidos';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchDrivers = useCallback(async () => {
    try {
      const res = await api.get<DeliveryRunBuilderDataDTO>('/delivery/runs/builder');
      setDrivers(res.data?.drivers || []);
    } catch (err) {
      console.error('[OperationBoardPage] Erro ao buscar entregadores:', err);
    }
  }, []);

  useEffect(() => {
    fetchBoard();
    fetchDrivers();
    const interval = setInterval(() => {
      fetchBoard();
      fetchDrivers();
    }, 15000);
    return () => clearInterval(interval);
  }, [fetchBoard, fetchDrivers]);

  // Delayed order detection — checks every 60 seconds
  useEffect(() => {
    const ACTIVE_STATUSES: OrderStatus[] = ['pending', 'confirmed', 'preparing'];

    const check = () => {
      const now = Date.now();
      for (const order of orders) {
        if (!ACTIVE_STATUSES.includes(order.status as OrderStatus)) continue;
        const elapsedMin = Math.floor((now - new Date(order.createdAt).getTime()) / 60000);
        if (elapsedMin >= ORDER_TIME_THRESHOLDS_MINUTES.delayed && !alreadyAlertedDelayed.current.has(order.id)) {
          alreadyAlertedDelayed.current.add(order.id);
          toast(`⏰ Pedido #${order.orderNumber} está atrasado (${elapsedMin}m)`, {
            duration: 10000,
            icon: '⚠️',
            style: {
              background: '#f59e0b',
              color: '#fff',
              fontWeight: 'bold',
              borderRadius: '12px',
              maxWidth: '340px',
            },
          });
        }
      }
      // Clear alerts for orders that are no longer active (completed / cancelled)
      for (const id of alreadyAlertedDelayed.current) {
        const stillActive = orders.some(o => o.id === id && ACTIVE_STATUSES.includes(o.status as OrderStatus));
        if (!stillActive) alreadyAlertedDelayed.current.delete(id);
      }
    };

    check(); // Run immediately when orders change
    const interval = setInterval(check, 60000);
    return () => clearInterval(interval);
  }, [orders]);

  const handleOperationalAction = async (orderId: string, action: OrderOperationalAction, driverId?: string) => {
    if (updatingId) return;
    const order = orders.find((candidate) => candidate.id === orderId);
    if (!order) return;
    if (!action.enabled) {
      toast(action.reason ?? 'Ação indisponível para este pedido.', { duration: 4000 });
      return;
    }
    if (action.type === 'OPEN_DETAILS') { setActiveOrderId(orderId); return; }
    if (action.type === 'PRINT') { await handlePrintOrder(orderId); return; }
    if (action.type === 'EDIT') { await handleEditOrder(orderId); return; }

    if ((action.type === 'DISPATCH' || action.type === 'ASSIGN_DRIVER') && !driverId) {
      if (order.operational.deliveryOwnership !== 'MERCHANT') {
        toast(order.operational.deliverySummary.label, { duration: 4000 });
        return;
      }
      if (action.type === 'ASSIGN_DRIVER' || !order.deliveryDriverId) {
        setOrderToDispatch(orderId);
        setIsDriverModalOpen(true);
        return;
      }
    }

    setUpdatingId(orderId);
    try {
      if (driverId) {
        await api.post('/delivery/runs', { driverId, orderIds: [orderId] });
        await fetchBoard();
        await fetchDrivers();
        invalidateLogisticsQueries(queryClient);
        setIsDriverModalOpen(false);
        setOrderToDispatch(null);
        toast.success('Rota criada; o entregador deve seguir o fluxo de aceite e início.', { duration: 4000 });
        return;
      }

      if (!action.targetStatus) return;
      const body: UpdateOrderStatusDTO = { status: action.targetStatus };
      const res = await api.patch(`/orders/${orderId}/status`, body);
      if (res.success) {
        await fetchBoard();
        await fetchDrivers();
        invalidateLogisticsQueries(queryClient);
        setIsDriverModalOpen(false);
        setOrderToDispatch(null);
        toast.success(
          action.mode === 'PROVIDER_ASYNC'
            ? `Solicitação enviada. Sincronizando com ${order.operational.displayChannel}.`
            : `${action.label} concluído.`,
          { duration: 4000 },
        );
      }
    } catch (err) {
      console.error('[OperationBoardPage] Erro ao atualizar status:', err);
      const msg = err instanceof ApiError ? err.message : 'Erro ao atualizar pedido';
      toast.error(msg, { duration: 5000 });
    } finally {
      setUpdatingId(null);
    }
  };

  const handleDriverSelect = (driverId: string) => {
    if (orderToDispatch) {
      const order = orders.find((candidate) => candidate.id === orderToDispatch);
      const dispatchAction = order?.operational.availableActions.find((candidate) => candidate.type === 'DISPATCH');
      if (dispatchAction) handleOperationalAction(orderToDispatch, dispatchAction, driverId);
    }
  };

  const fmt = (v: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

  const getElapsedMin = (createdAt: string) => {
    const min = Math.floor((Date.now() - new Date(createdAt).getTime()) / 60000);
    return min >= 0 ? min : 0;
  };

  const elapsedMinById = useMemo(() => {
    const now = Date.now();
    const map = new Map<string, number>();
    for (const o of orders) {
      const min = Math.floor((now - new Date(o.createdAt).getTime()) / 60000);
      map.set(o.id, min >= 0 ? min : 0);
    }
    return map;
  }, [orders]);

  const visibleOrders = useMemo(
    () => orders.filter((order) => matchesBoardSearch(order, search) && matchesBoardFilter(order, activeFilter)),
    [activeFilter, orders, search],
  );

  const ordersByColumnId = useMemo(() => {
    const out: Record<KanbanColumnSpec['id'], OrderBoardItemDTO[]> = {
      entry: [],
      production: [],
      delivery: [],
    };
    for (const o of visibleOrders) {
      const s = o.status as OrderStatus;
      if (s === 'pending' || s === 'confirmed') out.entry.push(o);
      else if (s === 'preparing') out.production.push(o);
      else if (
        s === 'ready_for_pickup' ||
        s === 'ready_for_delivery' ||
        s === 'out_for_delivery'
      )
        out.delivery.push(o);
    }
    return out;
  }, [visibleOrders]);

  const compact = viewMode === 'compact';

  const handleDragStart = (event: DragStartEvent) => {
    const { active } = event;
    const order = orders.find(o => o.id === active.id);
    if (order) setActiveDragOrder(order);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveDragOrder(null);

    if (!over) return;

    const orderId = active.id as string;
    const order = orders.find(o => o.id === orderId);
    if (!order) return;
    const directColumn = KANBAN_COLUMNS.find((column) => column.id === over.id)?.id;
    const overOrder = orders.find((candidate) => candidate.id === over.id);
    const targetColumn = directColumn ?? KANBAN_COLUMNS.find((column) =>
      overOrder && column.statuses.includes(overOrder.status),
    )?.id;
    if (!targetColumn) return;

    const resolution = resolveKanbanDropAction(order, targetColumn);
    if (!resolution.action) {
      toast(resolution.message ?? 'Movimento indisponível.', { duration: 4000 });
      return;
    }
    handleOperationalAction(orderId, resolution.action);
  };

  return (
    <div className="box-border flex min-h-[100dvh] w-full max-w-[1600px] flex-col space-y-4 overflow-hidden bg-background p-4 pt-[calc(68px+var(--safe-area-top))] md:h-[calc(100dvh-64px)] md:min-h-0 md:p-6 md:pt-6 mx-auto">
      {/* ── Toolbar / Header Premium ── */}
      <header className="sticky top-[calc(52px+var(--safe-area-top))] z-20 -mx-4 flex shrink-0 flex-col gap-3 border-b border-border bg-background px-4 pb-4 md:static md:z-auto md:mx-0 md:bg-transparent md:px-0">
        <div className="min-w-0">
          <div>
            <h1 className="text-xl md:text-2xl font-black text-foreground tracking-tight flex items-center gap-2">
              <span>Painel de Operações</span>
            </h1>
            <p className="text-[11px] md:text-xs text-muted-foreground font-bold uppercase tracking-wider mt-1">
              {orders.length} ativos · {orders.filter((order) => order.operational.primaryAction).length} aguardando ação · atualização a cada 15s
            </p>
          </div>
        </div>

        <div className="grid w-full min-w-0 grid-cols-[minmax(0,1fr)_40px_40px] items-center gap-2">
          <div className="min-w-0">
            <SegmentedControl value={viewMode} onChange={setViewMode} />
          </div>

          <button
            onClick={enableAudio}
            className={`h-10 w-10 rounded-xl border flex items-center justify-center transition-all duration-200 active:scale-95 shadow-sm ${isAudioEnabled
              ? 'bg-primary/10 text-primary border-primary/20 hover:bg-primary/20'
              : 'bg-card text-muted-foreground border-border hover:bg-muted'
              }`}
            title={isAudioEnabled ? 'Sons Ativados' : 'Ativar Sons (Clique aqui)'}
            aria-label={isAudioEnabled ? 'Sons de novos pedidos ativados' : 'Ativar sons de novos pedidos'}
            type="button"
          >
            {isAudioEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
          </button>

          <button
            onClick={fetchBoard}
            disabled={loading}
            className="flex h-10 w-10 rounded-xl bg-card border border-border text-foreground hover:bg-muted items-center justify-center transition-all active:scale-95 shadow-sm"
            title="Atualizar agora"
            aria-label="Atualizar quadro agora"
            type="button"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </header>

      <section aria-label="Busca e filtros do quadro" className="shrink-0 space-y-3 rounded-2xl border border-border bg-card p-3 shadow-sm">
        <div className="relative">
          <label htmlFor="orders-board-search" className="sr-only">Buscar pedido por número, cliente, telefone ou motoboy</label>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input id="orders-board-search" type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar número, cliente, telefone ou motoboy" className="h-10 w-full rounded-xl border border-border bg-background pl-10 pr-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-primary" />
        </div>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Filtros rápidos">
          {BOARD_FILTERS.map((filter) => (
            <button key={filter.id} type="button" onClick={() => setActiveFilter(filter.id)} className={`${!filter.core && !showMoreFilters ? 'hidden sm:inline-flex' : 'inline-flex'} min-h-9 items-center rounded-lg border px-3 text-xs font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${activeFilter === filter.id ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-background text-muted-foreground hover:text-foreground'}`} aria-pressed={activeFilter === filter.id}>
              {filter.label}
            </button>
          ))}
          <button type="button" onClick={() => setShowMoreFilters((value) => !value)} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-border bg-background px-3 text-xs font-bold text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary sm:hidden" aria-expanded={showMoreFilters}>
            <SlidersHorizontal className="h-3.5 w-3.5" /> Mais filtros
          </button>
        </div>
      </section>

      {/* ── Mobile and tablet Tabs Selector ── */}
      <div role="tablist" aria-label="Colunas do quadro" className="xl:hidden flex items-center gap-1.5 p-1 bg-muted rounded-xl shrink-0">
        {KANBAN_COLUMNS.map((col) => {
          const isActive = activeColumn === col.id;
          const count = ordersByColumnId[col.id]?.length || 0;
          return (
            <button
              key={col.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              aria-controls={`orders-column-${col.id}`}
              onClick={() => setActiveColumn(col.id)}
              className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg transition-all duration-200 ${isActive
                ? 'bg-background shadow-sm text-foreground'
                : 'text-muted-foreground'
                }`}
            >
              <span className={`text-[10px] font-black uppercase tracking-wider ${isActive ? 'opacity-100' : 'opacity-60'}`}>
                {col.title}
              </span>
              {count > 0 && (
                <span className={`text-[10px] font-black px-1.5 py-0.5 rounded-full ${col.countCls}`}>
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* ── Erro ── */}

      {/* ── Erro ── */}
      {error && (
        <div role="status" className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 flex items-start gap-3 text-amber-800 dark:text-amber-300">
          <span className="text-lg leading-none" aria-hidden="true">⚠</span>
          <div className="flex-1">
            <h3 className="text-sm font-black mb-1">Atualização temporariamente indisponível</h3>
            <p className="text-xs opacity-80">Os últimos pedidos válidos continuam visíveis. {error}</p>
            <button
              onClick={fetchBoard}
              className="mt-2 text-xs font-black underline opacity-80 hover:opacity-100"
            >
              Tentar novamente
            </button>
          </div>
        </div>
      )}

      {/* ── Loading ── */}
      {loading && orders.length === 0 && (
        <div className="flex-1 flex flex-col items-center justify-center gap-4">
          <div className="w-12 h-12 rounded-full border-2 border-primary-600/20 border-t-primary-600 animate-spin" />
          <p className="text-sm text-muted-foreground font-medium">
            Carregando pedidos...
          </p>
        </div>
      )}

      {/* ── Board ── */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        {(orders.length > 0 || !loading) && (
          <div className="grow min-h-0 flex flex-col">
            {visibleOrders.length === 0 && (search.trim() || activeFilter !== 'all') ? (
              <div className="flex h-full items-center justify-center rounded-2xl border border-dashed border-border bg-card p-8 text-center text-sm font-bold text-muted-foreground">
                Nenhum pedido corresponde aos filtros
              </div>
            ) : (
            <div
              className={`flex-1 flex flex-row gap-4 items-stretch min-h-0 overflow-x-auto no-scrollbar`}
            >
              {KANBAN_COLUMNS.map((column) => {
                const colOrders = ordersByColumnId[column.id] ?? [];
                const isEmpty = colOrders.length === 0;

                // No mobile, só renderiza a coluna ativa
                const isVisibleOnMobile = activeColumn === column.id;

                if (viewMode === 'compact' && isEmpty) return null;
                if (viewMode === 'focus_production' && column.id !== 'production' && isEmpty)
                  return null;

                return (
                  <div
                    key={column.id}
                    id={`orders-column-${column.id}`}
                    role="tabpanel"
                    className={`h-full min-h-0 flex-col shrink-0 ${isVisibleOnMobile ? 'flex' : 'hidden xl:flex'
                      } w-full xl:w-[calc(33.333%-11px)]`}
                  >
                    <KanbanColumn
                      column={column}
                      orders={colOrders}
                      compact={compact}
                      updatingId={updatingId}
                      elapsedMinById={elapsedMinById}
                      onAction={handleOperationalAction}
                      onClickCard={setActiveOrderId}
                      fmt={fmt}
                      getElapsedMin={getElapsedMin}
                      viewMode={viewMode}
                      isActive={activeColumn === column.id}
                    />
                  </div>
                );
              })}
            </div>
            )}
          </div>
        )}
        <DragOverlay>
          {activeDragOrder ? (
            <OrderCard
              order={activeDragOrder}
              compact={compact}
              updating={false}
              onAction={handleOperationalAction}
              onClick={() => { }}
              elapsedMin={elapsedMinById.get(activeDragOrder.id) ?? 0}
              formattedValue={fmt(activeDragOrder.operational.financialSummary.operationalValue)}
            />
          ) : null}
        </DragOverlay>
      </DndContext>

      <DriverSelectionModal
        isOpen={isDriverModalOpen}
        onClose={() => {
          setIsDriverModalOpen(false);
          setOrderToDispatch(null);
        }}
        onSelect={handleDriverSelect}
        drivers={drivers}
        isSubmitting={!!updatingId}
      />

      <OrderDrawer
        orderId={activeOrderId}
        onClose={() => setActiveOrderId(null)}
        onUpdated={fetchBoard}
      />

      {orderToEdit && (
        <EditOrderModal
          order={orderToEdit}
          onClose={() => setOrderToEdit(null)}
          onSaved={() => {
            setOrderToEdit(null);
            fetchBoard();
          }}
        />
      )}

      {isPrinting && orderToPrint && (
        <div className="hidden print:block">
          <OrderPrintTemplate order={orderToPrint} />
        </div>
      )}
    </div>
  );
}
