import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshCw, Clock, ArrowRight, LayoutGrid, Package, Truck, User, X } from 'lucide-react';
import type { OrderBoardItemDTO, OrderStatus, UpdateOrderStatusDTO, DriverDTO } from '@gestor/types';
import { api, ApiError } from '../../lib/api-client';

/* ─── Labels ────────────────────────────────────────────────── */

const STATUS_LABELS: Record<OrderStatus, string> = {
  pending: 'Novo',
  confirmed: 'Confirmado',
  preparing: 'Em Preparo',
  ready_for_pickup: 'Pronto / Retirada',
  ready_for_delivery: 'Pronto / Entrega',
  out_for_delivery: 'Em Rota',
  completed: 'Concluído',
  cancelled: 'Cancelado',
  draft: 'Rascunho',
};

const CHANNEL_LABELS: Record<string, string> = {
  storefront: 'Online',
  pos: 'PDV',
  whatsapp_ai: 'IA',
  whatsapp: 'WhatsApp',
  ifood: 'iFood',
};

/* ─── Driver Selection Modal ────────────────────────────────── */

const DriverSelectionModal = memo(function DriverSelectionModal(props: {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (driverId: string) => void;
  drivers: DriverDTO[];
  isSubmitting: boolean;
}) {
  const { isOpen, onClose, onSelect, drivers, isSubmitting } = props;

  if (!isOpen) return null;

  const availableDrivers = drivers.filter(d => d.isActive && d.status === 'available');

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden animate-in zoom-in-95 duration-200 border border-slate-200 dark:border-slate-800">
        <header className="px-6 py-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-800/50">
          <div>
            <h2 className="text-lg font-black text-slate-900 dark:text-white tracking-tight">Atribuir Entregador</h2>
            <p className="text-xs text-slate-500 font-medium mt-0.5">Selecione quem fará a entrega</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-xl transition-colors">
            <X className="w-5 h-5 text-slate-500" />
          </button>
        </header>

        <div className="p-4 max-h-[60vh] overflow-y-auto custom-scrollbar">
          {availableDrivers.length === 0 ? (
            <div className="py-10 text-center">
              <div className="w-12 h-12 bg-slate-100 dark:bg-slate-800 rounded-2xl flex items-center justify-center mx-auto mb-3">
                <User className="w-6 h-6 text-slate-400" />
              </div>
              <p className="text-sm font-bold text-slate-900 dark:text-white">Nenhum entregador disponível</p>
              <p className="text-xs text-slate-500 mt-1 px-6">Todos os entregadores estão offline ou ocupados no momento.</p>
            </div>
          ) : (
            <div className="grid gap-2">
              {availableDrivers.map((d) => (
                <button
                  key={d.id}
                  disabled={isSubmitting}
                  onClick={() => onSelect(d.id)}
                  className="flex items-center gap-4 p-4 rounded-2xl hover:bg-primary-50 dark:hover:bg-primary-900/20 border border-transparent hover:border-primary-100 dark:hover:border-primary-800 transition-all text-left active:scale-[0.98] group"
                >
                  <div className="w-10 h-10 bg-primary-100 dark:bg-primary-900/40 text-primary-600 rounded-xl flex items-center justify-center font-black group-hover:bg-primary-600 group-hover:text-white transition-colors">
                    {d.name.substring(0, 1).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-black text-slate-900 dark:text-white truncate">{d.name}</p>
                    <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mt-0.5">{d.vehicleType}</p>
                  </div>
                  <div className="w-2 h-2 rounded-full bg-emerald-500 shadow-sm shadow-emerald-500/50" />
                </button>
              ))}
            </div>
          )}
        </div>

        <footer className="p-4 bg-slate-50 dark:bg-slate-800/30 border-t border-slate-100 dark:border-slate-800">
          <button
            onClick={onClose}
            className="w-full py-3 text-sm font-black text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 transition-colors uppercase tracking-widest"
          >
            Cancelar
          </button>
        </footer>
      </div>
    </div>
  );
});

/* ─── Badge de status — usa classes do design system ────────── */

type StatusTone = {
  cls: string;      // classe .status-badge-* ou classes compostas
  dot?: string;     // cor do dot indicador
};

const STATUS_TONE: Record<OrderStatus, StatusTone> = {
  pending:            { cls: 'status-badge-pending',  dot: 'bg-amber-400' },
  confirmed:          { cls: 'status-badge-confirmed', dot: 'bg-blue-400' },
  preparing:          { cls: 'status-badge-preparing', dot: 'bg-orange-400' },
  ready_for_pickup:   { cls: 'status-badge-success',  dot: 'bg-emerald-400' },
  ready_for_delivery: { cls: 'status-badge-success',  dot: 'bg-emerald-400' },
  out_for_delivery:   { cls: 'status-badge-indigo',   dot: 'bg-violet-400' },
  completed:          { cls: 'status-badge-neutral',  dot: 'bg-slate-400' },
  cancelled:          { cls: 'status-badge-danger',   dot: 'bg-red-400' },
  draft:              { cls: 'status-badge-neutral',  dot: 'bg-slate-300' },
};

/* ─── Kanban columns spec ───────────────────────────────────── */

type BoardViewMode = 'compact' | 'standard' | 'focus_production';

type KanbanColumnSpec = {
  id: 'entry' | 'production' | 'delivery';
  title: string;
  subtitle: string;
  statuses: OrderStatus[];
  icon: typeof LayoutGrid;
  accentCol: string;
  headerCol: string;
  countCls: string;
  colCls: string;
  headerBorder: string;
};

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

/* ─── Status badge ──────────────────────────────────────────── */

const StatusBadge = memo(function StatusBadge({ status }: { status: OrderStatus }) {
  const tone = STATUS_TONE[status];
  return (
    <span className={`badge-premium ${tone.cls}`}>
      {STATUS_LABELS[status]}
    </span>
  );
});

/* ─── Timer badge ───────────────────────────────────────────── */

const TimerBadge = memo(function TimerBadge({ minutes, compact }: { minutes: number; compact: boolean }) {
  const urgent = minutes > 30;
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-black ring-1 ${
        urgent
          ? 'bg-red-50 text-red-700 ring-red-200 dark:bg-red-900/30 dark:text-red-400 dark:ring-red-800/50'
          : 'bg-slate-50 text-slate-600 ring-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:ring-slate-700'
      }`}
    >
      <Clock className={compact ? 'w-2.5 h-2.5' : 'w-3 h-3'} />
      {minutes}m
    </span>
  );
});

/* ─── Order Card ────────────────────────────────────────────── */

const OrderCard = memo(function OrderCard(props: {
  order: OrderBoardItemDTO;
  compact: boolean;
  updating: boolean;
  onAdvance: (orderId: string, nextStatus: OrderStatus) => void;
  nextStatus: OrderStatus | null;
  elapsedMin: number;
  totalLabel: string;
}) {
  const { order, compact, updating, onAdvance, nextStatus, elapsedMin, totalLabel } = props;

  return (
    <div className="kanban-card animate-slide-in-up">
      {/* ── Conteúdo principal ── */}
      <div className={compact ? 'p-2.5 md:p-3' : 'p-3 md:p-3.5'}>

        {/* Linha 1: Número + Timer */}
        <div className="flex items-center justify-between mb-2">
          <span className={`font-black text-slate-900 dark:text-slate-100 ${compact ? 'text-[12px] md:text-[13px]' : 'text-sm'}`}>
            #{order.orderNumber}
          </span>
          <TimerBadge minutes={elapsedMin} compact={compact} />
        </div>

        {/* Linha 2: Cliente + Status + Valor */}
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <h3
              className={`font-bold text-slate-900 dark:text-slate-100 leading-tight line-clamp-1 ${
                compact ? 'text-[11px]' : 'text-xs md:text-sm'
              }`}
            >
              {order.customerName}
            </h3>
            <p className={`text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-1 ${compact ? 'text-[9px]' : 'text-[10px] md:text-[11px]'}`}>
              {order.fulfillmentType === 'delivery' ? 'Entrega' : 'Retirada'}
              {' · '}
              {CHANNEL_LABELS[order.sourceChannel || ''] || order.sourceChannel || 'Online'}
            </p>
          </div>
          <div className="shrink-0 flex flex-col items-end gap-1.5">
            <StatusBadge status={order.status as OrderStatus} />
            <span className={`font-black text-slate-900 dark:text-slate-100 ${compact ? 'text-[10px] md:text-[11px]' : 'text-xs md:text-sm'}`}>
              {totalLabel}
            </span>
          </div>
        </div>

        {/* Linha 3: Entregador (Se houver) */}
        {order.fulfillmentType === 'delivery' && (
          <div className="mt-2.5 flex items-center gap-1.5 text-[10px] md:text-[11px] font-bold">
            <div className={`shrink-0 w-5 h-5 rounded-md flex items-center justify-center ${order.deliveryDriverName ? 'bg-indigo-100 text-indigo-600 dark:bg-indigo-900/40 dark:text-indigo-400' : 'bg-slate-100 text-slate-400 dark:bg-slate-800'}`}>
              <User className="w-3 h-3" />
            </div>
            <span className={order.deliveryDriverName ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-400 italic'}>
              {order.deliveryDriverName || 'Sem entregador atribuído'}
            </span>
            {order.deliveryDriverStatus === 'busy' && (
              <span className="ml-auto w-1.5 h-1.5 rounded-full bg-amber-500 shadow-sm shadow-amber-500/50" title="Entregador em rota" />
            )}
          </div>
        )}

        {/* Resumo de itens (apenas modo standard) */}
        {!compact && (
          <div
            className="mt-2.5 rounded-lg px-2.5 py-1.5 md:px-3 md:py-2"
            style={{ background: 'var(--surface-inset)', border: '1px solid var(--border-subtle)' }}
          >
            <p className="text-[10px] md:text-[11px] text-slate-600 dark:text-slate-400 italic line-clamp-2">
              {order.itemsSummary || `${order.itemCount} ${order.itemCount === 1 ? 'item' : 'itens'}`}
            </p>
          </div>
        )}
      </div>

      {/* ── Botão Avançar (CTA principal) ── */}
      {nextStatus && (
        <div
          className="px-2.5 pb-2.5 md:px-3 md:pb-3"
          style={{ borderTop: compact ? undefined : '1px solid var(--border-subtle)' }}
        >
          <button
            type="button"
            onClick={() => onAdvance(order.id, nextStatus)}
            disabled={updating}
            className={`w-full flex items-center justify-center gap-2 py-2.5 md:py-2 rounded-xl md:rounded-lg font-black uppercase tracking-wider transition-all duration-200 active:scale-[0.97] ${
              compact ? 'btn-advance-compact' : 'btn-advance-primary'
            }`}
          >
            <ArrowRight className="w-3.5 h-3.5 md:w-3 md:h-3" />
            <span className="text-[11px] md:text-[10px]">Avançar — {STATUS_LABELS[nextStatus]}</span>
          </button>
        </div>
      )}
    </div>
  );
});

/* ─── Coluna do Kanban ──────────────────────────────────────── */

const KanbanColumn = memo(function KanbanColumn(props: {
  column: KanbanColumnSpec;
  orders: OrderBoardItemDTO[];
  compact: boolean;
  updatingId: string | null;
  elapsedMinById: Map<string, number>;
  onAdvance: (orderId: string, nextStatus: OrderStatus) => void;
  getNextAction: (status: OrderStatus, fulfillmentType: string) => OrderStatus | null;
  fmt: (v: number) => string;
  getElapsedMin: (createdAt: string) => number;
  viewMode: BoardViewMode;
}) {
  const {
    column, orders, compact, updatingId, elapsedMinById,
    onAdvance, getNextAction, fmt, getElapsedMin, viewMode,
  } = props;

  const Icon = column.icon;
  const isEmpty = orders.length === 0;

  return (
    <section className={`kanban-col ${column.colCls} ${column.accentCol}`}>
      {/* ── Header da coluna ── */}
      <header className={`flex items-start justify-between shrink-0 px-4 py-3 border-b ${column.headerBorder}`}>
        <div className="min-w-0 flex items-center gap-2.5">
          <Icon className={`shrink-0 opacity-60 ${compact ? 'w-3.5 h-3.5' : 'w-4 h-4'} text-slate-600 dark:text-slate-400`} />
          <div className="min-w-0">
            <h2 className={`font-black text-slate-900 dark:text-slate-100 uppercase tracking-wide ${compact ? 'text-[11px]' : 'text-[13px]'}`}>
              {column.title}
            </h2>
            {!compact && (
              <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5 font-medium">
                {column.subtitle}
              </p>
            )}
          </div>
        </div>
        <span className={`text-[11px] font-black px-2 py-0.5 rounded-full ${column.countCls} ml-2 shrink-0`}>
          {orders.length}
        </span>
      </header>

      {/* ── Cards ── */}
      <div className={`${compact ? 'p-2' : 'p-3'} overflow-y-auto space-y-2.5 grow min-h-0 custom-scrollbar`}>
        {isEmpty ? (
          viewMode === 'standard' ? (
            <div className="h-16 flex items-center justify-center">
              <span className="text-[11px] font-bold text-slate-400 dark:text-slate-600">
                Sem pedidos
              </span>
            </div>
          ) : null
        ) : (
          orders.map((order) => {
            const nextActionStatus = getNextAction(order.status as OrderStatus, order.fulfillmentType);
            const elapsed = elapsedMinById.get(order.id) ?? getElapsedMin(order.createdAt);
            return (
              <OrderCard
                key={order.id}
                order={order}
                compact={compact}
                updating={updatingId === order.id}
                onAdvance={onAdvance}
                nextStatus={nextActionStatus as OrderStatus | null}
                elapsedMin={elapsed}
                totalLabel={fmt(order.total)}
              />
            );
          })
        )}
      </div>
    </section>
  );
});

/* ─── Page ──────────────────────────────────────────────────── */

export function OperationBoardPage() {
  const [orders, setOrders] = useState<OrderBoardItemDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<BoardViewMode>('standard');
  const [activeColumn, setActiveColumn] = useState<KanbanColumnSpec['id']>('entry');

  const [drivers, setDrivers] = useState<DriverDTO[]>([]);
  const [isDriverModalOpen, setIsDriverModalOpen] = useState(false);
  const [orderToDispatch, setOrderToDispatch] = useState<string | null>(null);

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
        setIsDriverModalOpen(false);
        setOrderToDispatch(null);
      }
    } catch (err) {
      console.error('[OperationBoardPage] Erro ao atualizar status:', err);
      const msg = err instanceof ApiError ? err.message : 'Erro ao atualizar pedido';
      alert(msg);
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
      {loading && (
        <div className="flex-1 flex flex-col items-center justify-center gap-4">
          <div className="w-12 h-12 rounded-full border-2 border-primary-600/20 border-t-primary-600 animate-spin" />
          <p className="text-sm text-slate-500 dark:text-slate-400 font-medium">
            Carregando pedidos...
          </p>
        </div>
      )}

      {/* ── Board ── */}
      {!loading && !error && (
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
    </div>
  );
}
