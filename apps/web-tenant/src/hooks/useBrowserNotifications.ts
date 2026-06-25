import { useEffect, useRef } from 'react';
import {
  getNotificationPermission,
  requestNotificationPermission,
  showWebNotification,
  supportsWebNotifications,
} from '../lib/notification-support';

/**
 * Hook para gerenciar permissões e registro de notificações do navegador.
 * Integra-se com o service worker para permitir notificações em segundo plano.
 */
export function useBrowserNotifications(
  enabled: boolean = true,
  tenantId: string | undefined,
) {
  const swRegistrationRef = useRef<ServiceWorkerRegistration | null>(null);
  const permissionCheckedRef = useRef(false);

  useEffect(() => {
    if (!enabled || !tenantId || permissionCheckedRef.current) return;

    permissionCheckedRef.current = true;

    // Check if service workers are supported
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
      console.warn('[BrowserNotifications] Service Workers not supported');
      return;
    }

    // Check if Notifications API is supported
    if (!supportsWebNotifications()) {
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
        const currentPermission = getNotificationPermission();

        if (currentPermission === 'default') {
          console.log('[BrowserNotifications] Requesting notification permission...');
          const permission = await requestNotificationPermission();
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
        } else if (currentPermission === 'granted') {
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
      if (getNotificationPermission() !== 'granted') {
        console.warn('[BrowserNotifications] Permission not granted');
        return false;
      }

      if (!swRegistrationRef.current) {
        // Fallback to direct notification if SW not available
        return showWebNotification(title, options);
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
    isSupported:
      supportsWebNotifications() &&
      typeof navigator !== 'undefined' &&
      'serviceWorker' in navigator,
    permission: getNotificationPermission(),
    sendNotification,
  };
}
