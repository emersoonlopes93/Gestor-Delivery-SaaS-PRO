import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshCw, Clock, ArrowRight } from 'lucide-react';
import type { OrderBoardItemDTO, OrderStatus, UpdateOrderStatusDTO } from '@gestor/types';
import { ORDER_STATUS_TRANSITIONS } from '@gestor/types';

const API_BASE = '/api/v1';

const STATUS_LABELS: Record<OrderStatus, string> = {
  pending: 'Novos',
  confirmed: 'Confirmados',
  preparing: 'Em Preparo',
  ready_for_pickup: 'Pronto p/ Retirada',
  ready_for_delivery: 'Pronto p/ Entrega',
  out_for_delivery: 'Em Rota',
  completed: 'Concluído',
  cancelled: 'Cancelado',
};

const STATUS_TONE: Record<OrderStatus, { ring: string; bg: string; text: string }> = {
  pending: { ring: 'ring-amber-200', bg: 'bg-amber-50', text: 'text-amber-800' },
  confirmed: { ring: 'ring-blue-200', bg: 'bg-blue-50', text: 'text-blue-800' },
  preparing: { ring: 'ring-orange-200', bg: 'bg-orange-50', text: 'text-orange-800' },
  ready_for_pickup: { ring: 'ring-emerald-200', bg: 'bg-emerald-50', text: 'text-emerald-800' },
  ready_for_delivery: { ring: 'ring-emerald-200', bg: 'bg-emerald-50', text: 'text-emerald-800' },
  out_for_delivery: { ring: 'ring-violet-200', bg: 'bg-violet-50', text: 'text-violet-800' },
  completed: { ring: 'ring-gray-200', bg: 'bg-gray-50', text: 'text-gray-700' },
  cancelled: { ring: 'ring-red-200', bg: 'bg-red-50', text: 'text-red-800' },
};

type BoardViewMode = 'compact' | 'standard' | 'focus_production';

type KanbanColumnSpec = {
  id: 'entry' | 'production' | 'delivery';
  title: string;
  subtitle?: string;
  statuses: OrderStatus[];
  emphasis?: boolean;
};

const KANBAN_GROUPED_COLUMNS: KanbanColumnSpec[] = [
  { id: 'entry', title: 'Entrada', subtitle: 'Novos + Confirmados', statuses: ['pending', 'confirmed'] },
  { id: 'production', title: 'Produção', subtitle: 'Em preparo', statuses: ['preparing'], emphasis: true },
  {
    id: 'delivery',
    title: 'Entrega',
    subtitle: 'Despacho + Em rota',
    statuses: ['ready_for_pickup', 'ready_for_delivery', 'out_for_delivery'],
  },
];

const SegmentedControl = memo(function SegmentedControl(props: {
  value: BoardViewMode;
  onChange: (v: BoardViewMode) => void;
}) {
  const { value, onChange } = props;
  const base =
    'px-3 py-2 text-xs font-black rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2';
  const active = 'bg-gray-900 text-white';
  const idle = 'bg-white text-gray-700 hover:bg-gray-50 ring-1 ring-gray-200';

  return (
    <div className="inline-flex items-center gap-2 rounded-xl bg-gray-50 p-1 ring-1 ring-gray-200">
      <button type="button" className={`${base} ${value === 'compact' ? active : idle}`} onClick={() => onChange('compact')}>
        Compacto
      </button>
      <button
        type="button"
        className={`${base} ${value === 'standard' ? active : idle}`}
        onClick={() => onChange('standard')}
      >
        Padrão
      </button>
      <button
        type="button"
        className={`${base} ${value === 'focus_production' ? active : idle}`}
        onClick={() => onChange('focus_production')}
      >
        Foco Produção
      </button>
    </div>
  );
});

const StatusBadge = memo(function StatusBadge(props: { status: OrderStatus }) {
  const tone = STATUS_TONE[props.status];
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-black ring-1 ${tone.bg} ${tone.text} ${tone.ring}`}>
      {STATUS_LABELS[props.status]}
    </span>
  );
});

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
  const isUrgent = elapsedMin > 30;
  const pad = compact ? 'p-2.5' : 'p-3.5';
  const gap = compact ? 'gap-2' : 'gap-3';
  const titleCls = compact ? 'text-[13px]' : 'text-sm';
  const mutedCls = compact ? 'text-[10px]' : 'text-[11px]';

  return (
    <div
      className={`bg-white border text-left border-gray-200/80 shadow-sm rounded-xl ${pad} flex flex-col ${gap} group hover:border-blue-300 hover:shadow-md transition-colors`}
    >
      <div className="flex items-center justify-between">
        <span className={`${titleCls} font-black text-gray-900`}>{order.orderNumber}</span>
        <span
          className={`text-[10px] inline-flex items-center gap-1 font-black px-1.5 py-0.5 rounded-md ring-1 ${
            isUrgent ? 'bg-red-50 text-red-700 ring-red-200' : 'bg-gray-50 text-gray-600 ring-gray-200'
          }`}
        >
          <Clock className="w-3 h-3" /> {elapsedMin}m
        </span>
      </div>

      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <h3 className={`font-black text-gray-900 ${compact ? 'text-[11px]' : 'text-xs'} line-clamp-1`}>
            {order.customerName}
          </h3>
          <p className={`${mutedCls} text-gray-500 mt-0.5 line-clamp-1`}>
            {order.fulfillmentType === 'delivery' ? 'Entrega' : 'Retirada'}
          </p>
        </div>
        <div className="shrink-0 flex flex-col items-end gap-1">
          <StatusBadge status={order.status as OrderStatus} />
          <span className={`${compact ? 'text-[11px]' : 'text-xs'} font-black text-gray-900`}>{totalLabel}</span>
        </div>
      </div>

      {!compact ? (
        <div className="bg-gray-50 rounded-lg p-2 ring-1 ring-gray-100">
          <p className="text-[11px] text-gray-600 italic line-clamp-2">{order.itemsSummary || `${order.itemCount} itens`}</p>
        </div>
      ) : null}

      {nextStatus ? (
        <button
          type="button"
          onClick={() => onAdvance(order.id, nextStatus)}
          disabled={updating}
          className={`w-full mt-auto font-black rounded-lg text-xs tracking-wider uppercase transition-colors flex items-center justify-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed ${
            compact
              ? 'py-2 bg-gray-900 text-white hover:bg-gray-800'
              : 'py-2.5 bg-blue-50 hover:bg-blue-600 hover:text-white text-blue-700'
          }`}
        >
          <span>Avançar</span>
          <ArrowRight className="w-3 h-3" />
        </button>
      ) : null}
    </div>
  );
});

export function OperationBoardPage() {
  const [orders, setOrders] = useState<OrderBoardItemDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<BoardViewMode>('standard');

  const token = localStorage.getItem('accessToken');

  const fetchBoard = useCallback(async () => {
    try {
      if (!token) {
        throw new Error('Token de autenticação não encontrado');
      }

      console.log('[OperationBoardPage] Buscando board...');

      const res = await fetch(`${API_BASE}/orders/operation/board`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        throw new Error(`Erro ${res.status}: ${res.statusText}`);
      }

      const json = await res.json();
      console.log('[OperationBoardPage] Resposta da API:', json);

      // Validar estrutura da resposta
      if (!json || typeof json !== 'object') {
        throw new Error('Resposta inválida da API');
      }

      setOrders(Array.isArray(json) ? json : []);
      setError(null);
    } catch (err) {
      console.error('[OperationBoardPage] Erro ao buscar board:', err);
      setError(err instanceof Error ? err.message : 'Erro ao carregar quadro de pedidos');
      setOrders([]);
    } finally {
      setLoading(false);
    }
  }, [token]);

  // Initial load & Polling (cada 15s)
  useEffect(() => {
    fetchBoard();
    const interval = setInterval(fetchBoard, 15000);
    return () => clearInterval(interval);
  }, [fetchBoard]);

  const handleStatusUpdate = async (orderId: string, newStatus: OrderStatus) => {
    if (updatingId) return;
    setUpdatingId(orderId);
    try {
      const body: UpdateOrderStatusDTO = { status: newStatus };
      const res = await fetch(`${API_BASE}/orders/${orderId}/status`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        // Optimistic local update via fetchBoard right after, or just let polling/fetch handle it
        await fetchBoard();
      }
    } catch {
      // Ignore
    } finally {
      setUpdatingId(null);
    }
  };

  const fmt = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);
  
  const getElapsedMin = (createdAt: string) => {
    const min = Math.floor((new Date().getTime() - new Date(createdAt).getTime()) / 60000);
    return min >= 0 ? min : 0;
  };

  const elapsedMinById = useMemo(() => {
    const now = new Date().getTime();
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
      else if (s === 'ready_for_pickup' || s === 'ready_for_delivery' || s === 'out_for_delivery') out.delivery.push(o);
    }
    return out;
  }, [orders]);

  // Determine next quick action
  const getNextAction = (status: OrderStatus, fulfillmentType: string) => {
    if (status === 'pending') return 'confirmed';
    if (status === 'confirmed') return 'preparing';
    if (status === 'preparing') return fulfillmentType === 'delivery' ? 'ready_for_delivery' : 'ready_for_pickup';
    if (status === 'ready_for_delivery') return 'out_for_delivery';
    if ((status === 'out_for_delivery') || (status === 'ready_for_pickup')) return 'completed';
    return null;
  };

  return (
    <div className="p-6 h-[calc(100vh-64px)] flex flex-col">
      <header className="flex items-center justify-between mb-6 shrink-0">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Kanban Operacional</h1>
          <p className="text-sm text-gray-500 mt-1">Atualizado a cada 15s</p>
        </div>
        <div className="flex items-center gap-3">
          <SegmentedControl value={viewMode} onChange={setViewMode} />
          <button
            onClick={fetchBoard}
            disabled={loading}
            className="p-2 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            title="Atualizar"
            type="button"
          >
            <RefreshCw className={`w-5 h-5 text-gray-600 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </header>

      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg">
          <div className="flex items-start">
            <div className="flex-shrink-0">
              <span className="text-red-400 text-xl">!</span>
            </div>
            <div className="ml-3">
              <h3 className="text-sm font-medium text-red-800">Erro ao carregar quadro de pedidos</h3>
              <div className="mt-2 text-sm text-red-700">{error}</div>
              <div className="mt-3">
                <button
                  onClick={fetchBoard}
                  className="text-sm font-medium text-red-600 hover:text-red-500 underline"
                >
                  Tentar novamente
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {loading && (
        <div className="flex-1 flex flex-col items-center justify-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
          <p className="mt-4 text-gray-500">Carregando quadro de pedidos...</p>
        </div>
      )}

      {!loading && !error && (
        <div className="grow min-h-0">
          <div
            className={`grid gap-4 items-start auto-rows-min overflow-x-hidden ${
              viewMode === 'focus_production'
                ? 'lg:[grid-template-columns:minmax(320px,1fr)_minmax(420px,1.35fr)_minmax(320px,1fr)]'
                : '[grid-template-columns:repeat(auto-fit,minmax(320px,1fr))]'
            }`}
          >
            {KANBAN_GROUPED_COLUMNS.map((column) => {
              const colOrders = ordersByColumnId[column.id] ?? [];
              const isEmpty = colOrders.length === 0;

              if (viewMode === 'compact' && isEmpty) return null;
              if (viewMode === 'focus_production' && column.id !== 'production' && isEmpty) return null;

              const isProduction = column.id === 'production';
              const compact = viewMode === 'compact';

              const columnTone = isProduction
                ? 'bg-orange-50/60 border-orange-200/60'
                : 'bg-gray-50/50 border-gray-200/60';

              return (
                <section
                  key={column.id}
                  className={`rounded-2xl flex flex-col max-h-full border ${columnTone} min-h-[140px]`}
                >
                  <header className={`border-b flex items-start justify-between shrink-0 ${isProduction ? 'border-orange-200/50' : 'border-gray-200/50'} ${compact ? 'p-3' : 'p-4'}`}>
                    <div className="min-w-0">
                      <h2 className="font-black text-sm text-gray-900 uppercase tracking-wide">{column.title}</h2>
                      {!compact && column.subtitle ? (
                        <p className="text-xs text-gray-500 mt-0.5 line-clamp-1">{column.subtitle}</p>
                      ) : null}
                    </div>
                    <span
                      className={`bg-white text-gray-700 text-xs font-black px-2 py-0.5 rounded-full ring-1 ${
                        isProduction ? 'ring-orange-200' : 'ring-gray-200'
                      }`}
                    >
                      {colOrders.length}
                    </span>
                  </header>

                  <div className={`${compact ? 'p-2.5' : 'p-3'} overflow-y-auto space-y-3 grow min-h-0`}>
                    {isEmpty ? (
                      viewMode === 'standard' ? (
                        <div className="h-16 flex items-center justify-center">
                          <span className="text-xs font-black text-gray-300">Sem pedidos</span>
                        </div>
                      ) : null
                    ) : (
                      colOrders.map((order) => {
                        const nextActionStatus = getNextAction(order.status as OrderStatus, order.fulfillmentType);
                        const elapsed = elapsedMinById.get(order.id) ?? getElapsedMin(order.createdAt);
                        const totalLabel = fmt(order.total);
                        return (
                          <OrderCard
                            key={order.id}
                            order={order}
                            compact={compact}
                            updating={updatingId === order.id}
                            onAdvance={handleStatusUpdate}
                            nextStatus={nextActionStatus as OrderStatus | null}
                            elapsedMin={elapsed}
                            totalLabel={totalLabel}
                          />
                        );
                      })
                    )}
                  </div>
                </section>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
