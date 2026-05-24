import { memo } from 'react';
import type { OrderStatus } from '@gestor/types';

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

const STATUS_TONE: Record<OrderStatus, string> = {
  pending: 'status-badge-pending',
  confirmed: 'status-badge-confirmed',
  preparing: 'status-badge-preparing',
  ready_for_pickup: 'status-badge-success',
  ready_for_delivery: 'status-badge-success',
  out_for_delivery: 'status-badge-indigo',
  completed: 'status-badge-neutral',
  cancelled: 'status-badge-danger',
  draft: 'status-badge-neutral',
};

export const OrderStatusBadge = memo(function OrderStatusBadge({ status }: { status: OrderStatus }) {
  const cls = STATUS_TONE[status] || 'status-badge-neutral';
  return (
    <span className={`badge-premium ${cls}`}>
      {STATUS_LABELS[status]}
    </span>
  );
});
