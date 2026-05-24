import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { RefreshCw, LayoutGrid, Package, Truck, Volume2, VolumeX } from 'lucide-react';
import type { OrderBoardItemDTO, OrderStatus, UpdateOrderStatusDTO, DriverDTO } from '@gestor/types';
import { api, ApiError } from '../../lib/api-client';
import { invalidateLogisticsQueries } from '../delivery/lib/invalidate-logistics';
import { DndContext, DragOverlay, closestCorners, KeyboardSensor, PointerSensor, useSensor, useSensors, DragStartEvent, DragEndEvent } from '@dnd-kit/core';
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { OrderCard } from './components/OrderCard';
import { KanbanColumn, KanbanColumnSpec, BoardViewMode } from './components/KanbanColumn';
import { OrderDrawer } from './components/OrderDrawer';
import { DriverSelectionModal } from './components/DriverSelectionModal';
import { useOrderNotifications } from './hooks/useOrderNotifications';
import toast from 'react-hot-toast';

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

/* ─── Segmented Control ─────────────────────────────────────── */

const SegmentedControl = memo(function SegmentedControl(props: {
  value: BoardViewMode;
  onChange: (v: BoardViewMode) => void;
}) {
  const { value, onChange } = props;

  const items: { id: BoardViewMode; label: string }[] = [
    { id: 'compact', label: 'Compacto' },
    { id: 'standard', label: 'Padrão' },
    { id: 'focus_production', label: 'Foco Cozinha' },
  ];

  return (
    <div
      className="inline-flex items-center p-1 rounded-xl gap-1"
      style={{ background: 'var(--surface-inset)', border: '1px solid var(--border-default)' }}
    >
      {items.map((item) => {
        const active = value === item.id;
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onChange(item.id)}
            className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all duration-200 focus:outline-none ${
              active
                ? 'bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 shadow-sm'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            {item.label}
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

  const [drivers, setDrivers] = useState<DriverDTO[]>([]);
  const [isDriverModalOpen, setIsDriverModalOpen] = useState(false);
  const [orderToDispatch, setOrderToDispatch] = useState<string | null>(null);
  
  const [activeOrderId, setActiveOrderId] = useState<string | null>(null);
  const [activeDragOrder, setActiveDragOrder] = useState<OrderBoardItemDTO | null>(null);

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
      const res = await api.get<OrderBoardItemDTO[]>('/orders/operation/board');
      setOrders(res.data || []);
      setError(null);
    } catch (err) {
      console.error('[OperationBoardPage] Erro ao buscar board:', err);
      const msg = err instanceof ApiError ? err.message : 'Erro ao carregar quadro de pedidos';
      setError(msg);
      setOrders([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchDrivers = useCallback(async () => {
    try {
      const res = await api.get<DriverDTO[]>('/delivery/drivers');
      setDrivers(res.data || []);
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
    const DELAY_THRESHOLD_MIN = 30;
    const ACTIVE_STATUSES: OrderStatus[] = ['pending', 'confirmed', 'preparing'];

    const check = () => {
      const now = Date.now();
      for (const order of orders) {
        if (!ACTIVE_STATUSES.includes(order.status as OrderStatus)) continue;
        const elapsedMin = Math.floor((now - new Date(order.createdAt).getTime()) / 60000);
        if (elapsedMin >= DELAY_THRESHOLD_MIN && !alreadyAlertedDelayed.current.has(order.id)) {
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

  const handleStatusUpdate = async (orderId: string, newStatus: OrderStatus, driverId?: string) => {
    if (updatingId) return;
    
    // If delivery and going to out_for_delivery, check if driver is assigned
    if (newStatus === 'out_for_delivery') {
      const order = orders.find(o => o.id === orderId);
      if (order?.fulfillmentType === 'delivery' && !order.deliveryDriverId && !driverId) {
        setOrderToDispatch(orderId);
        setIsDriverModalOpen(true);
        return;
      }
    }

    setUpdatingId(orderId);
    try {
      if (driverId) {
        await api.post(`/orders/${orderId}/assign-driver`, { driverId });
      }

      const body: UpdateOrderStatusDTO = { status: newStatus };
      const res = await api.patch(`/orders/${orderId}/status`, body);
      if (res.success) {
        await fetchBoard();
        await fetchDrivers();
        invalidateLogisticsQueries(queryClient);
        setIsDriverModalOpen(false);
        setOrderToDispatch(null);
        toast.success(`Status atualizado para ${newStatus.replace(/_/g, ' ')}`, { duration: 3000 });
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
      handleStatusUpdate(orderToDispatch, 'out_for_delivery', driverId);
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

  const ordersByColumnId = useMemo(() => {
    const out: Record<KanbanColumnSpec['id'], OrderBoardItemDTO[]> = {
      entry: [],
      production: [],
      delivery: [],
    };
    for (const o of orders) {
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
  }, [orders]);

  const getNextAction = (status: OrderStatus, fulfillmentType: string): OrderStatus | null => {
    if (status === 'pending') return 'confirmed';
    if (status === 'confirmed') return 'preparing';
    if (status === 'preparing')
      return fulfillmentType === 'delivery' ? 'ready_for_delivery' : 'ready_for_pickup';
    if (status === 'ready_for_delivery') return 'out_for_delivery';
    if (status === 'out_for_delivery' || status === 'ready_for_pickup') return 'completed';
    return null;
  };

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
    const targetColId = over.id as KanbanColumnSpec['id'];

    const order = orders.find(o => o.id === orderId);
    if (!order) return;

    // Discover the mapped status for the target column
    let newStatus: OrderStatus | null = null;
    if (targetColId === 'entry') newStatus = 'confirmed';
    else if (targetColId === 'production') {
      if (order.status === 'pending') {
        alert('O pedido está pendente! Por favor, confirme-o primeiro antes de enviar para a produção.');
        return;
      }
      newStatus = 'preparing';
    }
    else if (targetColId === 'delivery') {
      // Fix: delivery orders should go to ready_for_delivery to await dispatch, not out_for_delivery immediately
      newStatus = order.fulfillmentType === 'delivery' ? 'ready_for_delivery' : 'ready_for_pickup';
    }

    if (newStatus && newStatus !== order.status) {
      handleStatusUpdate(orderId, newStatus);
    }
  };

  return (
    <div className="p-3 md:p-6 h-screen md:h-[calc(100vh-64px)] flex flex-col overflow-hidden bg-slate-50/50 dark:bg-transparent">
      {/* ── Toolbar / Header ── */}
      <header className="flex flex-col sm:flex-row sm:items-center justify-between mb-4 md:mb-5 shrink-0 gap-4">
        <div className="flex items-center justify-between sm:block">
          <div>
            <h1 className="text-xl md:text-2xl font-black text-slate-900 dark:text-slate-100 tracking-tight">
              Kanban Operacional
            </h1>
            <p className="text-[11px] md:text-sm text-slate-500 dark:text-slate-400 font-medium">
              Atualizado a cada 15s
            </p>
          </div>
          <button
            onClick={fetchBoard}
            disabled={loading}
            className="sm:hidden btn-icon w-8 h-8"
            title="Atualizar agora"
            type="button"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1 sm:pb-0">
          <div className="shrink-0">
            <SegmentedControl value={viewMode} onChange={setViewMode} />
          </div>
          
          <button
            onClick={enableAudio}
            className={`btn-icon ${isAudioEnabled ? 'text-primary-600' : 'text-slate-400'}`}
            title={isAudioEnabled ? 'Sons Ativados' : 'Ativar Sons (Clique aqui)'}
          >
            {isAudioEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
          </button>

          <button
            onClick={fetchBoard}
            disabled={loading}
            className="hidden sm:inline-flex btn-icon"
            title="Atualizar agora"
            type="button"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </header>

      {/* ── Mobile Tabs Selector ── */}
      <div className="md:hidden flex items-center gap-1.5 p-1 bg-slate-200/50 dark:bg-slate-900/50 rounded-xl mb-4 shrink-0">
        {KANBAN_COLUMNS.map((col) => {
          const isActive = activeColumn === col.id;
          const count = ordersByColumnId[col.id]?.length || 0;
          return (
            <button
              key={col.id}
              onClick={() => setActiveColumn(col.id)}
              className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg transition-all duration-200 ${
                isActive
                  ? 'bg-white dark:bg-slate-800 shadow-sm text-slate-900 dark:text-white'
                  : 'text-slate-500 dark:text-slate-400'
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
        <div className="alert-danger rounded-2xl p-4 mb-4 flex items-start gap-3">
          <span className="text-lg leading-none">⚠</span>
          <div className="flex-1">
            <h3 className="text-sm font-black mb-1">Erro ao carregar quadro de pedidos</h3>
            <p className="text-sm opacity-80">{error}</p>
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
          <p className="text-sm text-slate-500 dark:text-slate-400 font-medium">
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
        {!error && (
          <div className="grow min-h-0">
          <div
            className={`h-full grid gap-3 md:gap-4 items-start ${
              viewMode === 'focus_production'
                ? 'lg:grid-cols-[minmax(280px,1fr)_minmax(380px,1.4fr)_minmax(280px,1fr)]'
                : 'grid-cols-1 md:grid-cols-3'
            }`}
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
                  className={`h-full min-h-0 flex-col ${
                    isVisibleOnMobile ? 'flex' : 'hidden md:flex'
                  }`}
                >
                  <KanbanColumn
                    column={column}
                    orders={colOrders}
                    compact={compact}
                    updatingId={updatingId}
                    elapsedMinById={elapsedMinById}
                    onAdvance={handleStatusUpdate}
                    onClickCard={setActiveOrderId}
                    getNextAction={getNextAction}
                    fmt={fmt}
                    getElapsedMin={getElapsedMin}
                    viewMode={viewMode}
                  />
                </div>
              );
            })}
          </div>
        </div>
      )}
        <DragOverlay>
          {activeDragOrder ? (
            <OrderCard
              order={activeDragOrder}
              compact={compact}
              updating={false}
              onAdvance={handleStatusUpdate}
              onClick={() => {}}
              nextStatus={getNextAction(activeDragOrder.status as OrderStatus, activeDragOrder.fulfillmentType)}
              elapsedMin={elapsedMinById.get(activeDragOrder.id) ?? 0}
              totalLabel={fmt(activeDragOrder.total)}
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
    </div>
  );
}
