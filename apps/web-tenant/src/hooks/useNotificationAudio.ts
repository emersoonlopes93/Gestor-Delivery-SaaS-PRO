import { useCallback, useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import type { OrderChangedEvent, TenantNotificationEventPayload } from '@gestor/types';
import { requestNotificationPermission } from '../lib/notification-support';
import { requestNativeNotificationPermission, showNewOrderNotification } from '../lib/native-notifications';
import { createNotificationEvent, emitNotificationEvent } from '../notifications/notificationEvents';
import { playNotificationSound } from '../notifications/soundEngine';
import { traceNotificationE2E } from '../notifications/e2eTrace';
import {
  CONNECTION_GRACE_PERIOD_MS,
  OFFLINE_DEBOUNCE_MS,
  connectionIssueCopy,
  type ConnectivityIssue,
} from '../notifications/connectivityState';
import { emitOrdersRealtimeEvent } from '../notifications/ordersRealtimeEvents';

export function useNotificationAudio(
  tenantId: string | undefined,
) {
  const socketRef = useRef<Socket | null>(null);
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
      auth: (callback) => callback({ token: localStorage.getItem('accessToken') }),
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 4000,
    });
    emitOrdersRealtimeEvent({ type: 'connection', state: 'connecting', occurredAt: new Date().toISOString() });
    let disposed = false;
    let appActive = document.visibilityState !== 'hidden';
    let activeIssue: ConnectivityIssue | null = null;
    let alertTimer: number | null = null;

    const clearAlertTimer = () => {
      if (alertTimer !== null) {
        window.clearTimeout(alertTimer);
        alertTimer = null;
      }
    };

    const emitRestored = () => {
      if (!activeIssue) return;
      activeIssue = null;
      emitNotificationEvent(createNotificationEvent({
        id: `orders:connection.restored:${tenantId}:${Date.now()}`,
        type: 'connection.restored',
        title: 'Conexao restaurada',
        message: 'O painel voltou a receber atualizacoes em tempo real.',
        priority: 'low',
        source: 'connection',
      }));
    };

    const emitIssue = (issue: ConnectivityIssue) => {
      if (disposed || !appActive || activeIssue === issue) return;
      activeIssue = issue;
      const copy = connectionIssueCopy(issue);
      emitNotificationEvent(createNotificationEvent({
        id: `orders:connection.${issue}:${tenantId}:${Date.now()}`,
        type: 'connection.lost',
        title: copy.title,
        message: copy.message,
        priority: issue === 'offline' ? 'critical' : 'high',
        source: 'connection',
      }));
    };

    const serviceIsReachable = async () => {
      const apiBase = (import.meta.env.VITE_API_URL || import.meta.env.VITE_API_BASE_URL || '/api/v1').replace(/\/$/, '');
      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), 3_000);
      try {
        const response = await fetch(`${apiBase}/health/ready/websocket`, {
          method: 'GET',
          cache: 'no-store',
          signal: controller.signal,
        });
        return response.ok;
      } catch {
        return false;
      } finally {
        window.clearTimeout(timeout);
      }
    };

    const scheduleConnectionCheck = (delayMs = CONNECTION_GRACE_PERIOD_MS) => {
      clearAlertTimer();
      alertTimer = window.setTimeout(async () => {
        alertTimer = null;
        if (disposed || !appActive || socket.connected) return;
        if (!navigator.onLine) {
          emitIssue('offline');
          return;
        }
        const serviceReachable = await serviceIsReachable();
        if (!disposed && appActive && !socket.connected && navigator.onLine) {
          emitIssue(serviceReachable ? 'reconnecting' : 'service_unavailable');
        }
      }, delayMs);
    };

    socket.on('connect', () => {
      emitOrdersRealtimeEvent({ type: 'connection', state: 'reconnecting', occurredAt: new Date().toISOString() });
      socket.emit('joinTenant', { tenantId });
      clearAlertTimer();
      emitRestored();
    });

    socket.on('joinedTenant', (data: { tenantId?: string }) => {
      if (data.tenantId !== tenantId) return;
      emitOrdersRealtimeEvent({ type: 'connection', state: 'connected', occurredAt: new Date().toISOString() });
    });

    socket.on('connect_error', () => {
      emitOrdersRealtimeEvent({ type: 'connection', state: 'reconnecting', occurredAt: new Date().toISOString() });
      scheduleConnectionCheck();
    });

    socket.on('disconnect', () => {
      emitOrdersRealtimeEvent({ type: 'connection', state: socket.active ? 'reconnecting' : 'disconnected', occurredAt: new Date().toISOString() });
      scheduleConnectionCheck();
    });

    const onOffline = () => {
      if (appActive) scheduleConnectionCheck(OFFLINE_DEBOUNCE_MS);
    };

    const onOnline = () => {
      if (!appActive) return;
      clearAlertTimer();
      socket.connect();
      if (socket.connected) emitRestored();
      else scheduleConnectionCheck();
    };

    const onVisibilityChange = () => {
      appActive = document.visibilityState !== 'hidden';
      clearAlertTimer();
      if (!appActive) {
        emitRestored();
        return;
      }
      if (!navigator.onLine) {
        scheduleConnectionCheck(OFFLINE_DEBOUNCE_MS);
        return;
      }
      socket.connect();
      if (!socket.connected) scheduleConnectionCheck();
    };

    window.addEventListener('offline', onOffline);
    window.addEventListener('online', onOnline);
    document.addEventListener('visibilitychange', onVisibilityChange);

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
      sourceEventName: 'order.created' | 'newOrder',
    ) => {
      const orderId = data.orderId ?? data.orderNumber;
      traceNotificationE2E({
        stage: 'socket.received',
        eventType: 'order.created',
        tenantId,
        orderId,
        sourceEventName,
        source: 'socket',
      });
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
      }, 'order.created');
    });

    socket.on('newOrder', (data: { order: { id?: string; orderNumber: string; customerName: string; total: number } }) => {
      emitOrderCreated({
        orderId: data.order.id,
        orderNumber: data.order.orderNumber,
        customerName: data.order.customerName,
        total: data.order.total,
      }, 'newOrder');
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

    socket.on('order.changed', (data: OrderChangedEvent) => {
      if (
        !data
        || typeof data.eventId !== 'string'
        || typeof data.orderId !== 'string'
        || typeof data.occurredAt !== 'string'
        || typeof data.reason !== 'string'
      ) return;
      emitOrdersRealtimeEvent({ type: 'order.changed', hint: data });
    });

    socketRef.current = socket;

    return () => {
      disposed = true;
      clearAlertTimer();
      window.removeEventListener('offline', onOffline);
      window.removeEventListener('online', onOnline);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      socket.disconnect();
      emitOrdersRealtimeEvent({ type: 'connection', state: 'disconnected', occurredAt: new Date().toISOString() });
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
