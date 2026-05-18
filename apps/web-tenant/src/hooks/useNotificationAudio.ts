import { useEffect, useRef, useCallback } from 'react';
import useSound from 'use-sound';
import { io, Socket } from 'socket.io-client';

// URLs dos áudios (lojista pode substituir os arquivos em public/sounds/)
const NEW_ORDER_URL = '/sounds/new-order.mp3';
const CANCELLED_URL = '/sounds/cancelled.mp3';

interface AudioSettings {
  enabled: boolean;
  volume: number;
  newOrderSound?: string;
  cancellationSound?: string;
}

export function useNotificationAudio(tenantId: string | undefined, settings: AudioSettings) {
  const socketRef = useRef<Socket | null>(null);

  const [playNewOrder] = useSound(NEW_ORDER_URL, {
    volume: settings.volume,
  });

  const [playCancelled] = useSound(CANCELLED_URL, {
    volume: settings.volume,
  });

  useEffect(() => {
    if (!tenantId || !settings.enabled) {
      if (socketRef.current) {
         socketRef.current.disconnect();
         socketRef.current = null;
      }
      return;
    }

    // Conecta ao namespace de pedidos
    const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3333';
    const socketUrl = API_URL.replace(/\/api\/v1\/?$/, '').replace(/\/api\/?$/, '');
    const socket = io(`${socketUrl}/orders`, {
      reconnection: true,
      reconnectionAttempts: 10,
    });

    socket.on('connect', () => {
      console.log('[Websocket] Connected to orders namespace');
      socket.emit('joinTenant', { tenantId });
    });

    socket.on('newOrder', (data) => {
      console.log('[Websocket] Novo pedido recebido!', data);
      playNewOrder();
      
      // Notificação nativa do navegador
      if (Notification.permission === 'granted') {
        new Notification(`Novo Pedido ${data.order.orderNumber}`, {
          body: `Cliente: ${data.order.customerName}\nTotal: ${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(data.order.total)}`,
          icon: '/favicon.ico'
        });
      }
    });

    socket.on('orderCancelled', (data) => {
      console.log('[Websocket] Pedido cancelado!', data);
      playCancelled();
    });

    socketRef.current = socket;

    return () => {
      socket.disconnect();
    };
  }, [tenantId, settings.enabled, settings.volume, playNewOrder, playCancelled]);

  const requestPermission = useCallback(() => {
    if (typeof Notification !== 'undefined') {
      Notification.requestPermission();
    }
  }, []);

  return { requestPermission };
}
