/**
 * Web Notification API is optional at runtime. Capacitor Android WebView may not
 * expose it, so callers must not assume the global Notification object exists.
 * Native push/notifications should be handled later through a Capacitor plugin.
 */
export function supportsWebNotifications(): boolean {
  return (
    typeof window !== 'undefined' &&
    'Notification' in window &&
    typeof window.Notification !== 'undefined'
  );
}

export function getNotificationPermission(): NotificationPermission | 'unsupported' {
  if (!supportsWebNotifications()) return 'unsupported';
  return window.Notification.permission;
}

export async function requestNotificationPermission(): Promise<NotificationPermission | 'unsupported'> {
  if (!supportsWebNotifications()) return 'unsupported';
  return window.Notification.requestPermission();
}

export function showWebNotification(title: string, options?: NotificationOptions): boolean {
  if (!supportsWebNotifications()) return false;
  if (window.Notification.permission !== 'granted') return false;

  new window.Notification(title, options);
  return true;
}
