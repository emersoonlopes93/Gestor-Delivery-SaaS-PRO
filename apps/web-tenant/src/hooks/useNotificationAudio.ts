import { useCallback, useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
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

    socket.on('newOrder', (data: { order: { id?: string; orderNumber: string; customerName: string; total: number } }) => {
      const totalFmt = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(data.order.total);

      emitNotificationEvent(createNotificationEvent({
        id: `socket:order.new:${data.order.id ?? data.order.orderNumber}`,
        type: 'order.new',
        orderId: data.order.id ?? data.order.orderNumber,
        title: `Novo pedido #${data.order.orderNumber}`,
        message: `${data.order.customerName} - ${totalFmt}`,
        priority: 'critical',
        source: 'socket',
      }));

      showNewOrderNotification({
        id: data.order.id,
        orderNumber: data.order.orderNumber,
        customerName: data.order.customerName,
        total: data.order.total,
      }).catch((err) => {
        console.warn('[NativeNotifications] Falha ao exibir notificacao de novo pedido:', err);
      });
    });

    socket.on('orderAutoAccepted', (data: { orderId: string; orderNumber: string; customerName?: string; total?: number | string }) => {
      emitNotificationEvent(createNotificationEvent({
        id: `socket:order.auto_accepted:${data.orderId ?? data.orderNumber}`,
        type: 'order.auto_accepted',
        orderId: data.orderId ?? data.orderNumber,
        title: `Pedido ${data.orderNumber} aceito automaticamente`,
        message: `${data.customerName || 'Cliente'} - pronto para seguir no fluxo operacional.`,
        priority: 'high',
        source: 'socket',
      }));
    });

    socket.on('orderCancelled', (data: { orderId?: string; orderNumber?: string }) => {
      emitNotificationEvent(createNotificationEvent({
        id: `socket:order.cancelled:${data.orderId ?? data.orderNumber ?? 'unknown'}`,
        type: 'order.cancelled',
        orderId: data.orderId ?? data.orderNumber,
        title: data.orderNumber ? `Pedido #${data.orderNumber} cancelado` : 'Pedido cancelado',
        message: 'Revise o pedido e a operacao no painel.',
        priority: 'high',
        source: 'socket',
      }));
    });

    socket.on('aiHandoff', (data: { sessionId: string; customerName?: string }) => {
      emitNotificationEvent(createNotificationEvent({
        id: `socket:whatsapp.handoff:${data.sessionId}`,
        type: 'whatsapp.handoff',
        title: 'Transferencia para atendimento humano',
        message: `${data.customerName || 'Cliente'} aguardando atendimento.`,
        priority: 'high',
        source: 'socket',
      }));
    });

    socket.on('orderReady', (data: { orderId?: string; orderNumber: string; customerName?: string; fulfillmentType?: string }) => {
      const fulfillmentText = data.fulfillmentType === 'delivery' ? 'para entrega' : 'para retirada';

      emitNotificationEvent(createNotificationEvent({
        id: `socket:order.kds_ready:${data.orderId ?? data.orderNumber}`,
        type: 'order.kds_ready',
        orderId: data.orderId ?? data.orderNumber,
        title: `Pedido #${data.orderNumber} pronto`,
        message: `${data.customerName || 'Cliente'} - ${fulfillmentText}.`,
        priority: 'high',
        source: 'socket',
      }));
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

  const playTestNewOrder = useCallback(() => playNotificationSound('order.new', 1), []);
  const playTestCancellation = useCallback(() => playNotificationSound('order.cancelled', 1), []);
  const playTestHandoff = useCallback(() => playNotificationSound('whatsapp.handoff', 1), []);
  const playTestReady = useCallback(() => playNotificationSound('order.kds_ready', 1), []);

  return { requestPermission, playTestNewOrder, playTestCancellation, playTestHandoff, playTestReady };
}
