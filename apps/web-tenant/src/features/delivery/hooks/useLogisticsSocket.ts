import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { io } from 'socket.io-client';
import { invalidateLogisticsQueries } from '../lib/invalidate-logistics';

/**
 * Mantém Despacho/Mapa/Entregadores sincronizados via eventos do namespace /orders.
 */

export function useLogisticsSocket(tenantId: string | undefined) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!tenantId) return;

    const API_URL = import.meta.env.VITE_WS_URL || import.meta.env.VITE_API_URL || import.meta.env.VITE_API_BASE_URL || '';
    const socketUrlBase = API_URL.replace(/\/api\/v1\/?$/, '').replace(/\/api\/?$/, '');
    const socketPath = socketUrlBase ? `${socketUrlBase}/orders` : '/orders';
    const socket = io(socketPath, {
      auth: (callback) => callback({ token: localStorage.getItem('accessToken') }),
      reconnection: true,
      reconnectionAttempts: 3,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 4000,
    });
    const refresh = () => invalidateLogisticsQueries(queryClient);

    socket.on('connect', () => {
      socket.emit('joinTenant', { tenantId });
    });

    socket.on('driverAssigned', refresh);
    socket.on('orderUpdated', refresh);
    socket.on('statusUpdated', refresh);
    socket.on('orderCancelled', refresh);

    return () => {
      socket.disconnect();
    };
  }, [tenantId, queryClient]);
}
