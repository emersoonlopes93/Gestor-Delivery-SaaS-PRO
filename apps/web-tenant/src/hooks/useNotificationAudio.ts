import { useCallback, useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import type { TenantNotificationEventPayload } from '@gestor/types';
import { requestNotificationPermission } from '../lib/notification-support';
import { requestNativeNotificationPermission, showNewOrderNotification } from '../lib/native-notifications';
import { createNotificationEvent, emitNotificationEvent } from '../notifications/notificationEvents';
import { playNotificationSound } from '../notifications/soundEngine';

export function useNotificationAudio(
  tenantId: string | undefined,
) {
  const socketRef = useRef<Socket | null>(null);
  const hadConnectionRef = useRef(false);
  const isConnectionLostRef = useRef(false);
  const processedSocketEventsRef = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    if (!tenantId) {
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
      return;
    }

    const API_URL = import.meta.env.VITE_WS_URL || import.meta.env.VITE_API_URL || import.meta.env.VITE_API_BASE_URL || '';
    const socketUrlBase = API_URL.replace(/\/api\/v1\/?$/, '').replace(/\/api\/?$/, '');
    const socketPath = socketUrlBase ? `${socketUrlBase}/orders` : '/orders';

    const socket = io(socketPath, {
      reconnection: true,
      reconnectionAttempts: 3,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 4000,
    });

    socket.on('connect', () => {
      socket.emit('joinTenant', { tenantId });

      if (isConnectionLostRef.current) {
        emitNotificationEvent(createNotificationEvent({
          id: `orders:connection.restored:${tenantId}`,
          type: 'connection.restored',
          title: 'Conexao restaurada',
          message: 'O painel voltou a receber atualizacoes em tempo real.',
          priority: 'low',
          source: 'connection',
        }));
      }

      hadConnectionRef.current = true;
      isConnectionLostRef.current = false;
    });

    const emitConnectionLost = () => {
      if (isConnectionLostRef.current) return;
      isConnectionLostRef.current = true;
      emitNotificationEvent(createNotificationEvent({
        id: `orders:connection.lost:${tenantId}`,
        type: 'connection.lost',
        title: 'Conexao perdida',
        message: 'Novos pedidos podem atrasar enquanto a conexao estiver indisponivel.',
        priority: 'critical',
        source: 'connection',
      }));
    };

    socket.on('connect_error', () => {
      emitConnectionLost();
    });

    socket.on('disconnect', () => {
      if (hadConnectionRef.current) {
        emitConnectionLost();
      }
    });

    const shouldProcessSocketEvent = (key: string) => {
      const now = Date.now();
      for (const [eventKey, timestamp] of processedSocketEventsRef.current.entries()) {
        if (now - timestamp > 20_000) {
          processedSocketEventsRef.current.delete(eventKey);
        }
      }

      if (processedSocketEventsRef.current.has(key)) {
        return false;
      }

      processedSocketEventsRef.current.set(key, now);
      return true;
    };

    const emitOrderCreated = (
      data: { orderId?: string; orderNumber: string; customerName: string; total: number | string },
    ) => {
      const orderId = data.orderId ?? data.orderNumber;
      if (!shouldProcessSocketEvent(`order.created:${orderId}`)) return;
      const total = typeof data.total === 'number' ? data.total : Number(data.total);
      const safeTotal = Number.isFinite(total) ? total : 0;
      const totalFmt = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(safeTotal);

      emitNotificationEvent(createNotificationEvent({
        id: `socket:order.created:${orderId}`,
        type: 'order.created',
        orderId,
        title: `Novo pedido #${data.orderNumber}`,
        message: `${data.customerName} - ${totalFmt}`,
        priority: 'critical',
        source: 'socket',
      }));

      showNewOrderNotification({
        id: data.orderId,
        orderNumber: data.orderNumber,
        customerName: data.customerName,
        total: safeTotal,
      }).catch((err) => {
        console.warn('[NativeNotifications] Falha ao exibir notificacao de novo pedido:', err);
      });
    };

    socket.on('order.created', (data: TenantNotificationEventPayload) => {
      if (!data.orderNumber || !data.customerName || typeof data.total === 'undefined') return;
      emitOrderCreated({
        orderId: data.orderId,
        orderNumber: data.orderNumber,
        customerName: data.customerName,
        total: data.total,
      });
    });

    socket.on('newOrder', (data: { order: { id?: string; orderNumber: string; customerName: string; total: number } }) => {
      emitOrderCreated({
        orderId: data.order.id,
        orderNumber: data.order.orderNumber,
        customerName: data.order.customerName,
        total: data.order.total,
      });
    });

    socket.on('order.auto_accepted', (data: TenantNotificationEventPayload) => {
      const orderId = data.orderId ?? data.orderNumber;
      if (!orderId || !shouldProcessSocketEvent(`order.auto_accepted:${orderId}`)) return;
      emitNotificationEvent(createNotificationEvent({
        id: `socket:order.auto_accepted:${orderId}`,
        type: 'order.auto_accepted',
        orderId,
        title: `Pedido ${data.orderNumber} aceito automaticamente`,
        message: `${data.customerName || 'Cliente'} - pronto para seguir no fluxo operacional.`,
        priority: 'high',
        source: 'socket',
      }));
    });

    socket.on('orderAutoAccepted', (data: { orderId: string; orderNumber: string; customerName?: string; total?: number | string }) => {
      const orderId = data.orderId ?? data.orderNumber;
      if (!shouldProcessSocketEvent(`order.auto_accepted:${orderId}`)) return;
      emitNotificationEvent(createNotificationEvent({
        id: `socket:order.auto_accepted:${orderId}`,
        type: 'order.auto_accepted',
        orderId,
        title: `Pedido ${data.orderNumber} aceito automaticamente`,
        message: `${data.customerName || 'Cliente'} - pronto para seguir no fluxo operacional.`,
        priority: 'high',
        source: 'socket',
      }));
    });

    socket.on('order.cancelled', (data: TenantNotificationEventPayload) => {
      const orderId = data.orderId ?? data.orderNumber;
      if (!orderId || !shouldProcessSocketEvent(`order.cancelled:${orderId}`)) return;
      emitNotificationEvent(createNotificationEvent({
        id: `socket:order.cancelled:${orderId}`,
        type: 'order.cancelled',
        orderId,
        title: data.orderNumber ? `Pedido #${data.orderNumber} cancelado` : 'Pedido cancelado',
        message: 'Revise o pedido e a operacao no painel.',
        priority: 'high',
        source: 'socket',
      }));
    });

    socket.on('orderCancelled', (data: { orderId?: string; orderNumber?: string }) => {
      const orderId = data.orderId ?? data.orderNumber ?? 'unknown';
      if (!shouldProcessSocketEvent(`order.cancelled:${orderId}`)) return;
      emitNotificationEvent(createNotificationEvent({
        id: `socket:order.cancelled:${orderId}`,
        type: 'order.cancelled',
        orderId,
        title: data.orderNumber ? `Pedido #${data.orderNumber} cancelado` : 'Pedido cancelado',
        message: 'Revise o pedido e a operacao no painel.',
        priority: 'high',
        source: 'socket',
      }));
    });

    const emitWhatsAppHandoff = (data: { sessionId: string; customerName?: string }) => {
      if (!shouldProcessSocketEvent(`whatsapp.handoff:${data.sessionId}`)) return;
      emitNotificationEvent(createNotificationEvent({
        id: `socket:whatsapp.handoff:${data.sessionId}`,
        type: 'whatsapp.handoff',
        title: 'Transferencia para atendimento humano',
        message: `${data.customerName || 'Cliente'} aguardando atendimento.`,
        priority: 'high',
        source: 'socket',
      }));
    };

    socket.on('whatsapp.handoff', (data: TenantNotificationEventPayload) => {
      if (!data.sessionId) return;
      emitWhatsAppHandoff({ sessionId: data.sessionId, customerName: data.customerName ?? data.sessionName });
    });

    socket.on('aiHandoff', (data: { sessionId: string; customerName?: string }) => {
      emitWhatsAppHandoff(data);
    });

    const emitOrderReady = (data: { orderId?: string; orderNumber: string; customerName?: string; fulfillmentType?: string }) => {
      const orderId = data.orderId ?? data.orderNumber;
      if (!shouldProcessSocketEvent(`order.ready:${orderId}`)) return;
      const fulfillmentText = data.fulfillmentType === 'delivery' ? 'para entrega' : 'para retirada';

      emitNotificationEvent(createNotificationEvent({
        id: `socket:order.ready:${orderId}`,
        type: 'order.ready',
        orderId,
        title: `Pedido #${data.orderNumber} pronto`,
        message: `${data.customerName || 'Cliente'} - ${fulfillmentText}.`,
        priority: 'high',
        source: 'socket',
      }));
    };

    socket.on('order.ready', (data: TenantNotificationEventPayload) => {
      if (!data.orderNumber) return;
      emitOrderReady(data as { orderId?: string; orderNumber: string; customerName?: string; fulfillmentType?: string });
    });

    socket.on('orderReady', (data: { orderId?: string; orderNumber: string; customerName?: string; fulfillmentType?: string }) => {
      emitOrderReady(data);
    });

    socketRef.current = socket;

    return () => {
      socket.disconnect();
      if (socketRef.current === socket) {
        socketRef.current = null;
      }
    };
  }, [tenantId]);

  const requestPermission = useCallback(() => {
    requestNotificationPermission();
    requestNativeNotificationPermission().catch((err) => {
      console.warn('[NativeNotifications] Falha ao solicitar permissao:', err);
    });
  }, []);

  const playTestNewOrder = useCallback(() => playNotificationSound('order.created', 1), []);
  const playTestCancellation = useCallback(() => playNotificationSound('order.cancelled', 1), []);
  const playTestHandoff = useCallback(() => playNotificationSound('whatsapp.handoff', 1), []);
  const playTestReady = useCallback(() => playNotificationSound('order.ready', 1), []);

  return { requestPermission, playTestNewOrder, playTestCancellation, playTestHandoff, playTestReady };
}
