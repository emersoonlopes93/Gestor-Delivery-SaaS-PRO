import { useEffect, useRef } from 'react';
import type { OrderBoardItemDTO } from '@gestor/types';
import { createNotificationEvent, emitNotificationEvent } from '../../../notifications/notificationEvents';
import { useSoundManager } from '../../../notifications/useSoundManager';

export function useOrderNotifications(orders: OrderBoardItemDTO[]) {
  const prevOrdersRef = useRef<OrderBoardItemDTO[]>([]);
  const soundManager = useSoundManager();

  useEffect(() => {
    if (prevOrdersRef.current.length === 0) {
      prevOrdersRef.current = orders;
      return;
    }

    const prevOrders = prevOrdersRef.current;
    const newOrders = orders.filter((order) => !prevOrders.some((previous) => previous.id === order.id));

    // Polling is only a transport fallback for missed socket domain events.
    for (const order of newOrders) {
      emitNotificationEvent(createNotificationEvent({
        id: `polling:order.created:${order.id}`,
        type: 'order.created',
        orderId: order.id,
        title: `Novo pedido #${order.orderNumber}`,
        message: `${order.customerName} - fallback do painel operacional.`,
        priority: 'critical',
        source: 'polling',
      }));
    }

    for (const order of orders) {
      const previous = prevOrders.find((prevOrder) => prevOrder.id === order.id);
      if (!previous || previous.status === order.status) continue;

      if (order.status === 'cancelled') {
        emitNotificationEvent(createNotificationEvent({
          id: `polling:order.cancelled:${order.id}`,
          type: 'order.cancelled',
          orderId: order.id,
          title: `Pedido #${order.orderNumber} cancelado`,
          message: 'Atualizacao recebida pelo polling do painel.',
          priority: 'high',
          source: 'polling',
        }));
      }

      if (order.status === 'ready_for_delivery' || order.status === 'ready_for_pickup') {
        emitNotificationEvent(createNotificationEvent({
          id: `polling:order.ready:${order.id}`,
          type: 'order.ready',
          orderId: order.id,
          title: `Pedido #${order.orderNumber} pronto`,
          message: 'Atualizacao recebida pelo polling do painel.',
          priority: 'high',
          source: 'polling',
        }));
      }
    }

    prevOrdersRef.current = orders;
  }, [orders]);

  return {
    isAudioEnabled: soundManager.soundPreferenceEnabled,
    enableAudio: () => soundManager.setSoundPreferenceEnabled(!soundManager.soundPreferenceEnabled),
  };
}
