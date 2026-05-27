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

  useEffect(() => {
    if (!tenantId) return;

    const token = localStorage.getItem('accessToken');
    if (!token) return;

    const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3333';
    const socketUrl = API_URL.replace(/\/api\/v1\/?$/, '').replace(/\/api\/?$/, '');
    const socket = io(`${socketUrl}/chat`, {
      reconnection: true,
      reconnectionAttempts: 10,
      auth: { token },
    });

    socket.on('connect', () => {
      socket.emit('joinTenant', { tenantId });
    });

    socket.on('messageCreated', (event: MessageCreatedEvent) => {
      // Invalidate messages query for the specific session
      queryClient.invalidateQueries({ queryKey: ['chat-messages', event.sessionId] });
      // Invalidate sessions list to update last message
      queryClient.invalidateQueries({ queryKey: ['chat-sessions'] });
    });

    socket.on('sessionUpdated', (event: SessionUpdatedEvent) => {
      // Invalidate sessions list to update session state
      queryClient.invalidateQueries({ queryKey: ['chat-sessions'] });
      // Invalidate specific session if it's currently loaded
      queryClient.invalidateQueries({ queryKey: ['chat-session', event.session.id] });
    });

    return () => {
      socket.disconnect();
    };
  }, [tenantId, queryClient]);
}
