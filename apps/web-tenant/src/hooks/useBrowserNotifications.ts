import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';

/**
 * Hook para gerenciar permissões e registro de notificações do navegador.
 * Integra-se com o service worker para permitir notificações em segundo plano.
 */
export function useBrowserNotifications(
  enabled: boolean = true,
  tenantId: string | undefined,
) {
  const queryClient = useQueryClient();
  const swRegistrationRef = useRef<ServiceWorkerRegistration | null>(null);
  const permissionCheckedRef = useRef(false);

  useEffect(() => {
    if (!enabled || !tenantId || permissionCheckedRef.current) return;

    permissionCheckedRef.current = true;

    // Check if service workers are supported
    if (!('serviceWorker' in navigator)) {
      console.warn('[BrowserNotifications] Service Workers not supported');
      return;
    }

    // Check if Notifications API is supported
    if (!('Notification' in window)) {
      console.warn('[BrowserNotifications] Notifications API not supported');
      return;
    }

    const setupNotifications = async () => {
      try {
        // Register service worker if not already registered
        if (!swRegistrationRef.current) {
          swRegistrationRef.current = await navigator.serviceWorker.register('/sw.js', {
            scope: '/',
          });
          console.log('[BrowserNotifications] Service Worker registered:', swRegistrationRef.current);
        }

        // Request permission if not already granted
        if (Notification.permission === 'default') {
          console.log('[BrowserNotifications] Requesting notification permission...');
          const permission = await Notification.requestPermission();
          console.log('[BrowserNotifications] Permission result:', permission);

          if (permission === 'granted') {
            // Show a test notification to confirm setup
            if (swRegistrationRef.current) {
              swRegistrationRef.current.showNotification('Notificações Ativadas', {
                body: 'Você receberá alertas de pedidos, transferências e eventos importantes.',
                icon: '/favicon.ico',
                badge: '/favicon.ico',
                tag: 'setup-confirmation',
              });
            }
          }
        } else if (Notification.permission === 'granted') {
          console.log('[BrowserNotifications] Notification permission already granted');
        } else {
          console.warn('[BrowserNotifications] Notification permission denied');
        }
      } catch (error) {
        console.error('[BrowserNotifications] Setup failed:', error);
      }
    };

    setupNotifications();

    // Cleanup
    return () => {
      // Keep service worker registered for background notifications
    };
  }, [enabled, tenantId]);

  /**
   * Send a notification through the service worker
   */
  const sendNotification = async (
    title: string,
    options?: NotificationOptions & { soundUrl?: string; volume?: number },
  ) => {
    try {
      if (Notification.permission !== 'granted') {
        console.warn('[BrowserNotifications] Permission not granted');
        return false;
      }

      if (!swRegistrationRef.current) {
        // Fallback to direct notification if SW not available
        new Notification(title, options);
        return true;
      }

      // Send through service worker for better background handling
      swRegistrationRef.current.showNotification(title, options);
      return true;
    } catch (error) {
      console.error('[BrowserNotifications] Failed to send notification:', error);
      return false;
    }
  };

  return {
    isSupported: 'Notification' in window && 'serviceWorker' in navigator,
    permission: Notification.permission,
    sendNotification,
  };
}
