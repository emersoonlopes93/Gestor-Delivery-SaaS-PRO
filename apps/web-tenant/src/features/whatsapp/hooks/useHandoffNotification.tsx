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
  const notifiedRef = useRef<Record<string, boolean>>({});
  const settingsRef = useRef<{ soundFile: string; volume: number }>({
    soundFile: '/sounds/notification.mp3',
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
      const soundFile = settings.handoffSound || 'notification.mp3';
      const volume = settings.notificationVolume || 0.6;
      settingsRef.current = {
        soundFile: `/sounds/${soundFile}`,
        volume: Math.max(0, Math.min(1, volume)),
      };
    }
  }, [settings]);

  useEffect(() => {
    if (!enabled) return;

    const handler = (ev: CustomEvent<{ session: ChatSession }>) => {
      const session = ev.detail?.session;
      if (!session || !session.id) return;

      const already = !!notifiedRef.current[session.id];

      if (session.handoffActive && !already) {
        // mark notified so we don't loop
        notifiedRef.current[session.id] = true;

        // Play audio
        try {
          const audio = new Audio(settingsRef.current.soundFile);
          audio.volume = settingsRef.current.volume;
          audio.play().catch(() => {
            // ignore autoplay block
            console.warn('[useHandoffNotification] Autoplay blocked by browser');
          });
        } catch (err) {
          console.error('[useHandoffNotification] Error playing sound:', err);
        }

        // Show toast
        toast(`👤 ${session.displayName || 'Cliente'} aguardando atendimento humano`, {
          duration: 6000,
          style: { fontWeight: 'bold' },
        });

        // Show browser notification if the optional Web Notification API exists.
        showWebNotification('Transferência para Atendimento Humano', {
          body: `${session.displayName || 'Cliente'} foi transferido para um agente humano.`,
          icon: '/favicon.ico',
          tag: `handoff-${session.id}`,
        });
      }

      // If handoff was deactivated, clear notified state so future handoffs can notify again
      if (!session.handoffActive && notifiedRef.current[session.id]) {
        delete notifiedRef.current[session.id];
      }
    };

    window.addEventListener('chat:sessionUpdated', handler as EventListener);
    return () => {
      window.removeEventListener('chat:sessionUpdated', handler as EventListener);
    };
  }, [enabled]);
}
