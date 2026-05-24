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

    const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3333';
    const socketUrl = API_URL.replace(/\/api\/v1\/?$/, '').replace(/\/api\/?$/, '');
    const socket = io(`${socketUrl}/orders`, {
      reconnection: true,
      reconnectionAttempts: 10,
    });

    const refresh = () => invalidateLogisticsQueries(queryClient);

    socket.on('connect', () => {
      socket.emit('joinTenant', { tenantId });
    });

    socket.on('driverAssigned', refresh);
    socket.on('orderUpdated', refresh);
    socket.on('statusUpdated', refresh);

    return () => {
      socket.disconnect();
    };
  }, [tenantId, queryClient]);
}
