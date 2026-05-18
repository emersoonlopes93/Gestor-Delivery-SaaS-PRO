import { useEffect } from 'react';
import { io, Socket } from 'socket.io-client';
import { logger } from '../lib/logger';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3333';
const socketUrl = API_URL.replace(/\/api\/v1\/?$/, '').replace(/\/api\/?$/, '');

export function useDeliverySocket(token: string | null, onLocationUpdate: (data: any) => void) {
  useEffect(() => {
    if (!token) return;

    const socket: Socket = io(`${socketUrl}/delivery`, {
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });

    socket.on('connect', () => {
      logger.log('Connected to delivery websocket', { socketId: socket.id });
      socket.emit('joinTracking', { token });
    });

    socket.on('locationUpdate', (data) => {
      onLocationUpdate(data);
    });

    socket.on('connect_error', (err) => {
      logger.error('Delivery Websocket connection error', err);
    });

    return () => {
      socket.disconnect();
    };
  }, [token, onLocationUpdate]);
}
