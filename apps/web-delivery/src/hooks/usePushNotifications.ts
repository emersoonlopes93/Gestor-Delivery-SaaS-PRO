import { useState, useEffect, useCallback, useRef } from 'react';
import { api } from '../lib/api';

type PermissionState = 'default' | 'granted' | 'denied' | 'unsupported';

interface UsePushNotificationsReturn {
  permissionState: PermissionState;
  isSubscribed: boolean;
  isLoading: boolean;
  error: string | null;
  requestPermissionAndSubscribe: () => Promise<boolean>;
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
    const response = await api.get<{ publicKey?: string } | { success: boolean; data: { publicKey?: string } }>(
      '/notifications/push/vapid-key',
    );
    // A API usa TransformInterceptor global que envolve respostas em { success, data }
    // mas o interceptor ignora objetos que já contêm 'success'. Tratamos ambos os casos.
    const raw = response.data as Record<string, unknown>;
    const publicKey =
      typeof raw['publicKey'] === 'string'
        ? raw['publicKey']
        : typeof (raw['data'] as Record<string, unknown> | undefined)?.['publicKey'] === 'string'
          ? ((raw['data'] as Record<string, unknown>)['publicKey'] as string)
          : '';

    if (!publicKey) {
      console.warn('[Push] VAPID public key não configurada no servidor. Verifique VAPID_PUBLIC_KEY na API.');
      return null;
    }
    return publicKey;
  } catch (err) {
    console.warn('[Push] Falha ao buscar chave VAPID:', err);
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
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
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

  const requestPermissionAndSubscribe = useCallback(async (): Promise<boolean> => {
    if (permissionState === 'unsupported') return false;
    if (isSubscribed) return true;

    setIsLoading(true);
    setError(null);

    try {
      // 1. Solicitar permissão
      const permission = Notification.permission === 'granted'
        ? 'granted'
        : await Notification.requestPermission();
      setPermissionState(permission as PermissionState);

      if (permission !== 'granted') {
        setError('Alertas desativados. Você pode ativá-los nas configurações do aparelho ou navegador.');
        return false;
      }

      // 2. Obter a chave VAPID
      const vapidKey = await getVapidPublicKey();
      if (!vapidKey) {
        setError('Notificações push não disponíveis: chaves VAPID não configuradas no servidor. Contacte o administrador.');
        return false;
      }

      // 3. Subscrever no PushManager
      const registration = swRegistrationRef.current ?? await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription()
        ?? await registration.pushManager.subscribe({
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
      return true;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Erro ao ativar notificações';
      setError(message);
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [isSubscribed, permissionState]);

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
