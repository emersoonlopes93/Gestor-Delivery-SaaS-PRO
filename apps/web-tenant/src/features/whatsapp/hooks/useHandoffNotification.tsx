import { useEffect, useRef } from 'react';
import toast from 'react-hot-toast';
import type { ChatSession } from '@gestor/types';

export function useHandoffNotification(enabled: boolean, soundFile = '/sounds/notification.mp3', volume = 0.6) {
  const notifiedRef = useRef<Record<string, boolean>>({});

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
          const audio = new Audio(soundFile);
          audio.volume = Math.max(0, Math.min(1, volume));
          audio.play().catch(() => {
            // ignore autoplay block
          });
        } catch (err) {
          // ignore
        }

        // Show toast
        toast(`Cliente aguardando atendimento humano`, { duration: 6000 });
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
  }, [enabled, soundFile, volume]);
}
