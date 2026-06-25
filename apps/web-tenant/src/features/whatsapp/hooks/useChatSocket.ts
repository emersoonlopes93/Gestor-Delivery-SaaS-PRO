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
    const hasToken = !!token;
    
    // Extrai a URL base da API removendo /api/v1 ou /api do final
    // Ex: "https://api.render.com/api/v1" → "https://api.render.com"
    const API_URL = import.meta.env.VITE_WS_URL || import.meta.env.VITE_API_URL || import.meta.env.VITE_API_BASE_URL || '';
    const socketOrigin = API_URL.replace(/\/api\/v1\/?$/, '').replace(/\/api\/?$/, '') || window.location.origin;
    const socketUrl = `${socketOrigin}/chat`;

    console.log(`[CHAT_WS] building_url socketUrl=${socketUrl} namespace=/chat hasToken=${hasToken} tenantId=${tenantId}`);

    if (!token) return;

    console.log(`[CHAT_WS] connecting socketUrl=${socketUrl}`);
    // socket.io-client: passar "origin/namespace" = connectar no namespace /chat
    const socket = io(socketUrl, {
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      timeout: 20000,
      auth: { token },
      transports: ['websocket', 'polling'],
    });

    try { (window as Window & typeof globalThis & { __CHAT_SOCKET: typeof socket | null }).__CHAT_SOCKET = socket; } catch { /* ignore */ }

    socket.on('connect', () => {
      console.log(`[CHAT_WS] connected id=${socket.id} tenantId=${tenantId}`);
      try { (window as Window & typeof globalThis & { __CHAT_SOCKET_CONNECTED: boolean }).__CHAT_SOCKET_CONNECTED = true; } catch { /* ignore */ }
      socket.emit('joinTenant', { tenantId });
    });

    socket.on('connect_error', (err) => {
      console.warn(`[CHAT_WS] connect_error message=${err?.message || err} socketUrl=${socketUrl}`);
      try { (window as Window & typeof globalThis & { __CHAT_SOCKET_CONNECTED: boolean }).__CHAT_SOCKET_CONNECTED = false; } catch { /* ignore */ }
    });

    socket.on('disconnect', (reason) => {
      console.log(`[CHAT_WS] disconnect reason=${reason}`);
      try { (window as Window & typeof globalThis & { __CHAT_SOCKET_CONNECTED: boolean }).__CHAT_SOCKET_CONNECTED = false; } catch { /* ignore */ }
    });

    socket.on('messageCreated', (event: MessageCreatedEvent) => {
      console.log(`[CHAT_WS] messageCreated received eventName=messageCreated sessionId=${event.sessionId}`);
      console.log(`[CHAT_WS] messageCreated_payload messageId=${event.message?.id || ''} sessionId=${event.message?.sessionId || ''} externalId=${event.message?.externalId || ''} direction=${event.message?.direction || ''} senderType=${event.message?.senderType || ''} fromMe=${event.message?.direction === 'outbound'} contentPreview=${typeof event.message?.content === 'string' ? event.message.content.substring(0, 20) : ''}`);

      // Atualiza o cache de mensagens instantaneamente via setQueryData (sem aguardar refetch)
      queryClient.setQueryData<ChatMessage[]>(
        ['chat-messages', event.sessionId],
        (old) => {
          if (!old) {
            console.log(`[CHAT_WS] cache updated action=set_new array_size=1 sessionId=${event.sessionId}`);
            return [event.message];
          }
          // Evita duplicatas pelo id
          const exists = old.some((m) => m.id === event.message.id);
          if (exists) {
            console.log(`[CHAT_WS] cache updated action=duplicate_skipped sessionId=${event.sessionId}`);
            return old;
          }
          console.log(`[CHAT_WS] cache updated action=append array_size=${old.length + 1} sessionId=${event.sessionId}`);
          return [...old, event.message];
        },
      );

      // Invalida lista lateral (preview da última mensagem) e stats
      queryClient.invalidateQueries({ queryKey: ['chat-sessions'] });
      queryClient.invalidateQueries({ queryKey: ['chat-stats'] });

      try {
        window.dispatchEvent(new CustomEvent('chat:messageCreated', { detail: event }));
      } catch { /* ignore */ }
    });

    socket.on('sessionUpdated', (event: SessionUpdatedEvent) => {
      console.log(`[CHAT_WS] sessionUpdated received eventName=sessionUpdated sessionId=${event.session.id}`);

      // Invalida a sessão individual e a lista
      queryClient.invalidateQueries({ queryKey: ['chat-session', event.session.id] });
      queryClient.invalidateQueries({ queryKey: ['chat-sessions'] });
      queryClient.invalidateQueries({ queryKey: ['chat-stats'] });

      try {
        window.dispatchEvent(new CustomEvent('chat:sessionUpdated', { detail: event }));
      } catch { /* ignore */ }
    });

    return () => {
      try { (window as Window & typeof globalThis & { __CHAT_SOCKET: typeof socket | null }).__CHAT_SOCKET = null; } catch { /* ignore */ }
      try { (window as Window & typeof globalThis & { __CHAT_SOCKET_CONNECTED: boolean }).__CHAT_SOCKET_CONNECTED = false; } catch { /* ignore */ }
      socket.disconnect();
    };
  }, [tenantId, queryClient]);
}
