import { useState, useEffect, useCallback } from 'react';
import { api } from '../lib/api';

/**
 * Hook para gerenciar permissões e registro de Web Push.
 */
export function usePushNotifications() {
  const [isSupported, setIsSupported] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission>(
    typeof Notification !== 'undefined' ? Notification.permission : 'default'
  );
  const [isSubscribed, setIsSubscribed] = useState(false);

  useEffect(() => {
    const supported = 'serviceWorker' in navigator && 'PushManager' in window;
    setIsSupported(supported);
    
    if (supported) {
      navigator.serviceWorker.ready.then((registration) => {
        registration.pushManager.getSubscription().then((subscription) => {
          setIsSubscribed(!!subscription);
        });
      });
    }
  }, []);

  const subscribeUser = useCallback(async (tenantId: string, userId: string, userType: 'customer' | 'driver') => {
    if (!isSupported) return;

    try {
      // 1. Obter VAPID Public Key do backend
      const { data } = await api.get('/notifications/push/vapid-key');
      const publicKey = data.publicKey;

      if (!publicKey) {
        console.warn('VAPID Public Key não configurada no servidor.');
        return;
      }

      // 2. Solicitar permissão e registrar no PushManager
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });

      // 3. Enviar subscription para o backend
      await api.post('/notifications/push/subscribe', {
        tenantId,
        userType,
        userId,
        subscription,
      });

      setIsSubscribed(true);
      setPermission(Notification.permission);
      console.log('Web Push: Assinado com sucesso!');
    } catch (error) {
      console.error('Falha ao assinar para Web Push:', error);
    }
  }, [isSupported]);

  return {
    isSupported,
    permission,
    isSubscribed,
    subscribeUser,
  };
}

/**
 * Helper para converter VAPID Key string para Uint8Array
 */
function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}
