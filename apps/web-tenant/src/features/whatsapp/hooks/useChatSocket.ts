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

    try { window.__CHAT_SOCKET = socket; } catch (e) {}

    socket.on('connect', () => {
      // Mark global connected flag for consumers (fallback polling)
      try { window.__CHAT_SOCKET_CONNECTED = true; } catch (e) {};
      socket.emit('joinTenant', { tenantId });
    });

    socket.on('connect_error', (err) => {
      console.warn('[CHAT_WS] connect_error', err?.message || err);
      try { window.__CHAT_SOCKET_CONNECTED = false; } catch (e) {};
    });

    socket.on('disconnect', (reason) => {
      console.log('[CHAT_WS] disconnected', reason);
      try { window.__CHAT_SOCKET_CONNECTED = false; } catch (e) {};
    });

    socket.on('messageCreated', (event: MessageCreatedEvent) => {
      // Invalidate messages query for the specific session
      queryClient.invalidateQueries({ queryKey: ['chat-messages', event.sessionId] });
      // Invalidate sessions list to update last message
      queryClient.invalidateQueries({ queryKey: ['chat-sessions'] });
      try {
        window.dispatchEvent(new CustomEvent('chat:messageCreated', { detail: event }));
      } catch (e) {}
    });

    socket.on('sessionUpdated', (event: SessionUpdatedEvent) => {
      // Invalidate sessions list to update session state
      queryClient.invalidateQueries({ queryKey: ['chat-sessions'] });
      // Invalidate specific session if it's currently loaded
      queryClient.invalidateQueries({ queryKey: ['chat-session', event.session.id] });
      try {
        window.dispatchEvent(new CustomEvent('chat:sessionUpdated', { detail: event }));
      } catch (e) {}
    });

    return () => {
      try { window.__CHAT_SOCKET = null; } catch (e) {};
      socket.disconnect();
    };
  }, [tenantId, queryClient]);
}
