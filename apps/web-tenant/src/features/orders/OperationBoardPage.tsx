import { useState, useEffect, useCallback } from 'react';
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

const KANBAN_BOARD_COLUMNS = [
  { id: 'col-new', title: 'Novos', statuses: ['pending'] as OrderStatus[] },
  { id: 'col-conf', title: 'Confirmados', statuses: ['confirmed'] as OrderStatus[] },
  { id: 'col-prep', title: 'Produção', statuses: ['preparing'] as OrderStatus[] },
  { id: 'col-ready', title: 'Despacho', statuses: ['ready_for_pickup', 'ready_for_delivery'] as OrderStatus[] },
  { id: 'col-route', title: 'Em Rota', statuses: ['out_for_delivery'] as OrderStatus[] },
];

export function OperationBoardPage() {
  const [orders, setOrders] = useState<OrderBoardItemDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const token = localStorage.getItem('accessToken');

  const fetchBoard = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/orders/operation/board`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const json = await res.json();
        setOrders(json || []);
      }
    } catch {
      // Ignore
    } finally {
      if (loading) setLoading(false);
    }
  }, [token, loading]);

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

  // Grouping orders by column
  const getOrdersForColumn = (statuses: OrderStatus[]) => {
    return orders.filter(o => statuses.includes(o.status as OrderStatus));
  };

  // Determine next quick action
  const getNextAction = (status: OrderStatus, fulfillmentType: string) => {
    const transitions = ORDER_STATUS_TRANSITIONS[status] || [];
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
        <button onClick={fetchBoard} className="p-2 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors" title="Atualizar">
          <RefreshCw className="w-5 h-5 text-gray-600" />
        </button>
      </header>

      {loading ? (
        <div className="text-center py-12 text-gray-400">Carregando painel operacional...</div>
      ) : (
        <div className="flex gap-4 overflow-x-auto pb-4 grow items-start">
          {KANBAN_BOARD_COLUMNS.map(column => {
            const colOrders = getOrdersForColumn(column.statuses);
            
            return (
              <div key={column.id} className="min-w-[300px] w-[300px] bg-gray-50/50 rounded-2xl flex flex-col max-h-full border border-gray-100">
                <header className="p-4 border-b border-gray-200/50 flex items-center justify-between shrink-0">
                  <h2 className="font-bold text-sm text-gray-700 uppercase tracking-wide">{column.title}</h2>
                  <span className="bg-white text-gray-600 text-xs font-black px-2 py-0.5 rounded-full border border-gray-200">
                    {colOrders.length}
                  </span>
                </header>

                <div className="p-3 overflow-y-auto space-y-3 grow">
                  {colOrders.map(order => {
                    const nextActionStatus = getNextAction(order.status as OrderStatus, order.fulfillmentType);
                    const isUrgent = getElapsedMin(order.createdAt) > 30; // 30+ minutos = urgente na cor
                    
                    return (
                      <div key={order.id} className="bg-white border text-left border-gray-200 shadow-sm rounded-xl p-3 flex flex-col group hover:border-blue-300 transition-colors">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-sm font-black text-gray-900">{order.orderNumber}</span>
                          <span className={`text-[10px] flex items-center gap-1 font-bold px-1.5 py-0.5 rounded ${isUrgent ? 'bg-red-50 text-red-600' : 'bg-gray-50 text-gray-500'}`}>
                            <Clock className="w-3 h-3" /> {getElapsedMin(order.createdAt)}m
                          </span>
                        </div>
                        
                        <div className="mb-3">
                          <h3 className="font-bold text-gray-800 text-xs line-clamp-1">{order.customerName}</h3>
                          <p className="text-[11px] text-gray-500 mt-0.5 flex justify-between">
                            <span>{order.fulfillmentType === 'delivery' ? '📦 Entrega' : '🏪 Retirada'}</span>
                            <span className="font-bold text-gray-700">{fmt(order.total)}</span>
                          </p>
                        </div>

                        <div className="bg-gray-50 rounded p-2 mb-3">
                          <p className="text-[11px] text-gray-600 italic line-clamp-2">
                            {order.itemsSummary || `${order.itemCount} itens`}
                          </p>
                        </div>

                        {nextActionStatus && (
                          <button
                            onClick={() => handleStatusUpdate(order.id, nextActionStatus as OrderStatus)}
                            disabled={updatingId === order.id}
                            className="w-full mt-auto bg-blue-50 hover:bg-blue-600 hover:text-white text-blue-700 font-bold py-2 rounded-lg text-xs tracking-wider uppercase transition-colors flex items-center justify-center gap-1 disabled:opacity-50"
                          >
                            <span>Avançar</span>
                            <ArrowRight className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    );
                  })}
                  {colOrders.length === 0 && (
                    <div className="h-20 flex items-center justify-center">
                      <span className="text-xs font-medium text-gray-300">Vazio</span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
