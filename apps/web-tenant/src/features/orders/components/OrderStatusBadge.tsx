import { memo } from 'react';
import type { OrderStatus } from '@gestor/types';
import { ORDER_STATUS_PRESENTATION } from '../order-presenters';

export const OrderStatusBadge = memo(function OrderStatusBadge({ status }: { status: OrderStatus }) {
  const presentation = ORDER_STATUS_PRESENTATION[status];
  return <span className={`badge-premium ${presentation.tone}`}>{presentation.label}</span>;
});
