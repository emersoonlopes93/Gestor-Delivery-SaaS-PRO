import { useEffect, useRef } from 'react';
import {
  getNotificationPermission,
  showWebNotification,
  supportsWebNotifications,
} from '../lib/notification-support';

/**
 * Prepares browser notifications without opening a permission prompt.
 * Permission requests are handled only by an explicit onboarding/settings click.
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

    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
      console.warn('[BrowserNotifications] Service Workers not supported');
      return;
    }
    if (!supportsWebNotifications()) {
      console.warn('[BrowserNotifications] Notifications API not supported');
      return;
    }

    const setupNotifications = async () => {
      try {
        if (!swRegistrationRef.current) {
          swRegistrationRef.current = await navigator.serviceWorker.register('/sw.js', {
            scope: '/',
          });
          console.log('[BrowserNotifications] Service Worker registered:', swRegistrationRef.current);
        }

        const currentPermission = getNotificationPermission();
        if (currentPermission === 'granted') {
          console.log('[BrowserNotifications] Notification permission already granted');
        } else if (currentPermission === 'default') {
          console.log('[BrowserNotifications] Notification permission awaits user action');
        } else {
          console.warn('[BrowserNotifications] Notification permission denied');
        }
      } catch (error) {
        console.error('[BrowserNotifications] Setup failed:', error);
      }
    };

    void setupNotifications();
  }, [enabled, tenantId]);

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
        return showWebNotification(title, options);
      }

      await swRegistrationRef.current.showNotification(title, options);
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
