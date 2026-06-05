import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { io } from 'socket.io-client';
import type { ChatMessage, ChatSession } from '@gestor/types';

interface MessageCreatedEvent {
  sessionId: string;
  message: ChatMessage;
}

interface SessionUpdatedEvent {
  session: ChatSession;
}

/**
 * Mantém a Inbox sincronizada via eventos do namespace /chat.
 */
export function useChatSocket(tenantId: string | undefined) {
  const queryClient = useQueryClient();

  // `window.__CHAT_SOCKET` and `window.__CHAT_SOCKET_CONNECTED` are declared in src/global.d.ts

  useEffect(() => {
    if (!tenantId) return;

    const token = localStorage.getItem('accessToken');
    if (!token) return;

    const API_URL = import.meta.env.VITE_WS_URL || import.meta.env.VITE_API_URL || 'http://localhost:3333';
    const socketUrl = API_URL.replace(/\/api\/v1\/?$/, '').replace(/\/api\/?$/, '');
    const socket = io(`${socketUrl}/chat`, {
      reconnection: true,
      reconnectionAttempts: 10,
      auth: { token },
    });

    try { window.__CHAT_SOCKET = socket; } catch { /* ignore */ }

    socket.on('connect', () => {
      // Mark global connected flag for consumers (fallback polling)
      try { window.__CHAT_SOCKET_CONNECTED = true; } catch { /* ignore */ }
      socket.emit('joinTenant', { tenantId });
    });

    socket.on('connect_error', (err) => {
      console.warn('[CHAT_WS] connect_error', err?.message || err);
      try { window.__CHAT_SOCKET_CONNECTED = false; } catch { /* ignore */ }
    });

    socket.on('disconnect', (reason) => {
      console.log('[CHAT_WS] disconnected', reason);
      try { window.__CHAT_SOCKET_CONNECTED = false; } catch { /* ignore */ }
    });

    socket.on('messageCreated', (event: MessageCreatedEvent) => {
      // Invalidate messages query for the specific session
      queryClient.invalidateQueries({ queryKey: ['chat-messages', event.sessionId] });
      // Para as sessões (lista paginada), apenas revalidamos silenciosamente para evitar perder paginação
      queryClient.invalidateQueries({ queryKey: ['chat-sessions'] });
      // Invalida status gerais (counters)
      queryClient.invalidateQueries({ queryKey: ['chat-stats'] });

      try {
        window.dispatchEvent(new CustomEvent('chat:messageCreated', { detail: event }));
      } catch { /* ignore */ }
    });

    socket.on('sessionUpdated', (event: SessionUpdatedEvent) => {
      // Invalidate specific session se estiver aberta
      queryClient.invalidateQueries({ queryKey: ['chat-session', event.session.id] });
      // Invalidate list e counters
      queryClient.invalidateQueries({ queryKey: ['chat-sessions'] });
      queryClient.invalidateQueries({ queryKey: ['chat-stats'] });

      try {
        window.dispatchEvent(new CustomEvent('chat:sessionUpdated', { detail: event }));
      } catch { /* ignore */ }
    });

    return () => {
      try { window.__CHAT_SOCKET = null; } catch { /* ignore */ }
      socket.disconnect();
    };
  }, [tenantId, queryClient]);
}
