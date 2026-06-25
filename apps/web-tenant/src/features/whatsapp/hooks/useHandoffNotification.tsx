import { useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import type { ChatSession } from '@gestor/types';
import { api } from '../../../lib/api-client';
import { showWebNotification } from '../../../lib/notification-support';
import { Tenant, TenantSettings } from '@gestor/types';

/**
 * Hook para notificar quando uma sessão de chat é transferida de IA para agente humano.
 * Lê as configurações de som e volume do TenantSettings.
 * Integra-se com o sistema de notificações do navegador.
 */
export function useHandoffNotification(enabled: boolean = true) {
  const previousHandoffBySession = useRef<Map<string, boolean>>(new Map());
  const initializedSessions = useRef<Set<string>>(new Set());
  const lastPlayedMessageIds = useRef<Set<string>>(new Set());

  const settingsRef = useRef<{ handoffSound: string; messageSound: string; volume: number }>({
    handoffSound: '/sounds/notification.mp3',
    messageSound: '/sounds/notification.mp3',
    volume: 0.6,
  });

  // Fetch tenant settings to get configured sound
  const { data: settings } = useQuery({
    queryKey: ['tenant-settings'],
    queryFn: async () => {
      const res = await api.get<Tenant & { settings: TenantSettings }>('/tenant/me');
      return res.data.settings;
    },
  });

  // Update settings ref when data changes
  useEffect(() => {
    if (settings) {
      const handoffSound = settings.handoffSound || 'notification.mp3';
      const volume = settings.notificationVolume || 0.6;
      settingsRef.current = {
        handoffSound: `/sounds/${handoffSound}`,
        messageSound: '/sounds/notification.mp3', // Usar som normal padrao
        volume: Math.max(0, Math.min(1, volume)),
      };
    }
  }, [settings]);

  useEffect(() => {
    if (!enabled) return;

    const playSound = (type: 'handoff' | 'message') => {
      try {
        const soundFile = type === 'handoff' ? settingsRef.current.handoffSound : settingsRef.current.messageSound;
        const audio = new Audio(soundFile);
        audio.volume = settingsRef.current.volume;
        audio.play().catch(() => {});
      } catch (err) {
        // ignore
      }
    };

    const handleSessionUpdated = (ev: CustomEvent<{ session: ChatSession }>) => {
      const session = ev.detail?.session;
      if (!session || !session.id) return;

      const sessionId = session.id;
      const current = Boolean(session.handoffActive);
      const previous = previousHandoffBySession.current.get(sessionId);

      previousHandoffBySession.current.set(sessionId, current);

      if (!initializedSessions.current.has(sessionId)) {
        initializedSessions.current.add(sessionId);
        return;
      }

      if (previous === false && current === true) {
        playSound('handoff');

        toast(`👤 ${session.displayName || 'Cliente'} aguardando atendimento humano`, {
          duration: 6000,
          style: { fontWeight: 'bold' },
        });

        showWebNotification('Transferência para Atendimento Humano', {
          body: `${session.displayName || 'Cliente'} foi transferido para um agente humano.`,
          icon: '/favicon.ico',
          tag: `handoff-${session.id}`,
        });
      }
    };

    const handleMessageCreated = (ev: CustomEvent<{ sessionId: string; message: any }>) => {
      const { message } = ev.detail;
      if (!message || !message.id) return;

      if (lastPlayedMessageIds.current.has(message.id)) return;
      lastPlayedMessageIds.current.add(message.id);

      const isCustomerInbound = message.direction === 'inbound' || message.fromMe === false || message.senderType === 'customer';
      const isOperatorOrAi = message.senderType === 'operator' || message.senderType === 'ai' || message.fromMe === true;

      if (isCustomerInbound && !isOperatorOrAi) {
        playSound('message');
      }
    };

    window.addEventListener('chat:sessionUpdated', handleSessionUpdated as EventListener);
    window.addEventListener('chat:messageCreated', handleMessageCreated as EventListener);

    return () => {
      window.removeEventListener('chat:sessionUpdated', handleSessionUpdated as EventListener);
      window.removeEventListener('chat:messageCreated', handleMessageCreated as EventListener);
    };
  }, [enabled]);
}
