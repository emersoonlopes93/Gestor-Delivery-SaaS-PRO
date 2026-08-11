import { useState, useEffect, useCallback, useRef } from 'react';
import { api } from '../lib/api';

type PermissionState = 'default' | 'granted' | 'denied' | 'unsupported';

interface UsePushNotificationsReturn {
  permissionState: PermissionState;
  isSubscribed: boolean;
  isLoading: boolean;
  error: string | null;
  requestPermissionAndSubscribe: () => Promise<void>;
  unsubscribe: () => Promise<void>;
  cleanupForLogout: () => Promise<void>;
}

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length) as Uint8Array<ArrayBuffer>;
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

async function getVapidPublicKey(): Promise<string | null> {
  try {
    const { data } = await api.get<{ publicKey: string }>('/notifications/push/vapid-key');
    return data.publicKey || null;
  } catch {
    return null;
  }
}

export async function cleanupDriverPushForLogout(
  registration?: ServiceWorkerRegistration | null,
): Promise<void> {
  await api.post('/notifications/push/unsubscribe-all').catch(() => undefined);
  if (!('serviceWorker' in navigator)) return;
  const activeRegistration = registration ?? await navigator.serviceWorker.ready.catch(() => null);
  const subscription = await activeRegistration?.pushManager.getSubscription().catch(() => null);
  await subscription?.unsubscribe().catch(() => false);
}

export function usePushNotifications(): UsePushNotificationsReturn {
  const [permissionState, setPermissionState] = useState<PermissionState>('default');
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const swRegistrationRef = useRef<ServiceWorkerRegistration | null>(null);

  // Verificar suporte e estado inicial
  useEffect(() => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      setPermissionState('unsupported');
      return;
    }

    setPermissionState(Notification.permission as PermissionState);

    navigator.serviceWorker.ready
      .then((registration) => {
        swRegistrationRef.current = registration;
        return registration.pushManager.getSubscription();
      })
      .then((sub) => {
        setIsSubscribed(!!sub);
      })
      .catch(() => {
        setIsSubscribed(false);
      });
  }, []);

  // Escutar mensagens do SW (ex: subscription renovada)
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      if (event.data?.type === 'PUSH_SUBSCRIPTION_CHANGED') {
        const newSub = event.data.subscription;
        api.post('/notifications/push/subscribe', {
          endpoint: newSub.endpoint,
          keys: newSub.keys,
          userAgent: navigator.userAgent,
        }).catch(() => {/* silencioso */});
      }
    };
    navigator.serviceWorker?.addEventListener('message', handler);
    return () => navigator.serviceWorker?.removeEventListener('message', handler);
  }, []);

  const requestPermissionAndSubscribe = useCallback(async () => {
    if (permissionState === 'unsupported') return;

    setIsLoading(true);
    setError(null);

    try {
      // 1. Solicitar permissão
      const permission = await Notification.requestPermission();
      setPermissionState(permission as PermissionState);

      if (permission !== 'granted') {
        setError('Permissão de notificação negada.');
        return;
      }

      // 2. Obter a chave VAPID
      const vapidKey = await getVapidPublicKey();
      if (!vapidKey) {
        setError('Serviço de notificações não configurado.');
        return;
      }

      // 3. Subscrever no PushManager
      const registration = swRegistrationRef.current ?? await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey),
      });

      // 4. Enviar subscription para o backend
      const subJson = subscription.toJSON();
      await api.post('/notifications/push/subscribe', {
        endpoint: subJson.endpoint,
        keys: subJson.keys,
        userAgent: navigator.userAgent,
      });

      setIsSubscribed(true);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Erro ao ativar notificações';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, [permissionState]);

  const unsubscribe = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const registration = swRegistrationRef.current ?? await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();

      if (subscription) {
        await api.delete(`/notifications/push/subscribe?endpoint=${encodeURIComponent(subscription.endpoint)}`);
        await subscription.unsubscribe();
      }

      setIsSubscribed(false);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Erro ao desativar notificações';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const cleanupForLogout = useCallback(async () => {
    await cleanupDriverPushForLogout(swRegistrationRef.current);
    setIsSubscribed(false);
  }, []);

  return {
    permissionState,
    isSubscribed,
    isLoading,
    error,
    requestPermissionAndSubscribe,
    unsubscribe,
    cleanupForLogout,
  };
}
