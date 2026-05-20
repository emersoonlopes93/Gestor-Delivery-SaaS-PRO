import { useEffect } from 'react';
import { io, Socket } from 'socket.io-client';
import { logger } from '../lib/logger';
import { OrderStatusUpdatedEvent } from '@gestor/types';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3333';
const socketUrl = API_URL.replace(/\/api\/v1\/?$/, '').replace(/\/api\/?$/, '');

export function useOrderSocket(token: string | null, onStatusUpdate: (data: OrderStatusUpdatedEvent) => void) {
  useEffect(() => {
    if (!token) return;

    const socket: Socket = io(`${socketUrl}/orders`, {
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });

    socket.on('connect', () => {
      logger.log('Connected to orders websocket', { socketId: socket.id });
      socket.emit('joinOrder', { token });
    });

    socket.on('statusUpdated', (data) => {
      logger.log('Order status updated via websocket', data);
      onStatusUpdate(data);
    });

    socket.on('connect_error', (err) => {
      logger.error('Websocket connection error', err);
    });

    return () => {
      socket.disconnect();
    };
  }, [token, onStatusUpdate]);
}
