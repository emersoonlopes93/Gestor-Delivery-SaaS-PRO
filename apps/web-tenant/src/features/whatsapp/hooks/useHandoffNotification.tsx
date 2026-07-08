import { useEffect, useRef } from 'react';
import type { ChatSession } from '@gestor/types';
import { createNotificationEvent, emitNotificationEvent } from '../../../notifications/notificationEvents';

export function useHandoffNotification(enabled: boolean = true) {
  const previousHandoffBySession = useRef<Map<string, boolean>>(new Map());
  const initializedSessions = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!enabled) return;

    const handleSessionUpdated = (ev: CustomEvent<{ session: ChatSession }>) => {
      const session = ev.detail?.session;
      if (!session?.id) return;

      const current = Boolean(session.handoffActive);
      const previous = previousHandoffBySession.current.get(session.id);
      previousHandoffBySession.current.set(session.id, current);

      if (!initializedSessions.current.has(session.id)) {
        initializedSessions.current.add(session.id);
        return;
      }

      if (previous === false && current === true) {
        emitNotificationEvent(createNotificationEvent({
          id: `chat:whatsapp.handoff:${session.id}`,
          type: 'whatsapp.handoff',
          title: 'Transferencia para atendimento humano',
          message: `${session.displayName || 'Cliente'} aguarda um operador.`,
          priority: 'high',
          source: 'socket',
        }));
      }
    };

    window.addEventListener('chat:sessionUpdated', handleSessionUpdated as EventListener);
    return () => {
      window.removeEventListener('chat:sessionUpdated', handleSessionUpdated as EventListener);
    };
  }, [enabled]);
}
