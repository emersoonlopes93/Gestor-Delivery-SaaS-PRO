import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BellRing, Loader2, ServerCrash, WifiOff, X } from 'lucide-react';
import {
  getNotificationPermission,
  requestNotificationPermission,
  showWebNotification,
} from '../lib/notification-support';
import {
  checkNativeNotificationPermission,
  requestNativeNotificationPermission,
} from '../lib/native-notifications';
import {
  NotificationDeduper,
  type NotificationEvent,
  subscribeNotificationEvents,
} from './notificationEvents';
import { useSoundManager } from './useSoundManager';
import { useTenantAuth } from '../hooks/use-tenant-auth';
import { createTabLeader, type TabLeader } from './tabLeader';
import { traceNotificationE2E } from './e2eTrace';
import { browserSpeechProvider, isVoiceAlertsEnabled, sharedOrderAlertCoordinator } from '../features/orders/v2/order-alert-coordinator';

const MAX_TRANSIENT_TOASTS = 2;

type ConnectionBanner = {
  title: string;
  message: string;
  offline: boolean;
};

function isConnectionEvent(event: NotificationEvent) {
  return event.type === 'connection.lost' || event.type === 'connection.restored';
}

function shouldShowBrowserNotification(event: NotificationEvent) {
  if (typeof document === 'undefined' || document.visibilityState !== 'hidden') return false;
  if (getNotificationPermission() !== 'granted' || isConnectionEvent(event)) return false;
  return event.priority === 'high' || event.priority === 'critical';
}

function transientPriority(event: NotificationEvent) {
  if (event.type === 'order.created') return 100;
  if (event.priority === 'critical') return 80;
  if (event.priority === 'high') return 60;
  if (event.priority === 'medium') return 40;
  return 20;
}

export function NotificationCenter() {
  const { user } = useTenantAuth();
  const deduperRef = useRef(new NotificationDeduper());
  const soundManager = useSoundManager();
  const [connectionBanner, setConnectionBanner] = useState<ConnectionBanner | null>(null);
  const [transientEvents, setTransientEvents] = useState<NotificationEvent[]>([]);
  const [ownsActivationBanner, setOwnsActivationBanner] = useState(false);
  const [nativePermission, setNativePermission] = useState<string>('unsupported');
  const [permissionOnboardingHandled, setPermissionOnboardingHandled] = useState(true);
  const leaderRef = useRef<TabLeader | null>(null);
  const transientTimersRef = useRef<number[]>([]);

  const dismissTransient = useCallback((eventId: string) => {
    setTransientEvents((current) => current.filter((event) => event.id !== eventId));
  }, []);

  const enqueueTransient = useCallback((event: NotificationEvent) => {
    if (document.visibilityState === 'hidden') return;
    setTransientEvents((current) => {
      const next = [...current.filter((item) => item.id !== event.id), event];
      return next
        .sort((left, right) => transientPriority(right) - transientPriority(left))
        .slice(0, MAX_TRANSIENT_TOASTS);
    });
    const timer = window.setTimeout(
      () => dismissTransient(event.id),
      event.priority === 'critical' ? 8_000 : 6_000,
    );
    transientTimersRef.current.push(timer);
  }, [dismissTransient]);

  useEffect(() => () => {
    for (const timer of transientTimersRef.current) window.clearTimeout(timer);
    transientTimersRef.current = [];
  }, []);

  const onboardingKey = useMemo(
    () => user?.tenantId && user?.userId
      ? `gestor:notifications:onboarding:v1:${user.tenantId}:${user.userId}`
      : null,
    [user?.tenantId, user?.userId],
  );

  useEffect(() => {
    if (!onboardingKey) return;
    setPermissionOnboardingHandled(localStorage.getItem(onboardingKey) === 'handled');
    void checkNativeNotificationPermission().then(setNativePermission);
  }, [onboardingKey]);

  const markPermissionOnboardingHandled = useCallback(() => {
    if (onboardingKey) localStorage.setItem(onboardingKey, 'handled');
    setPermissionOnboardingHandled(true);
  }, [onboardingKey]);

  useEffect(() => {
    if (!soundManager.activationBannerEligible || soundManager.activationBannerShownForSession || ownsActivationBanner) return;
    soundManager.markActivationBannerShownForSession();
    setOwnsActivationBanner(true);
  }, [ownsActivationBanner, soundManager]);

  useEffect(() => {
    if (!user?.tenantId) return;
    const leader = createTabLeader(user.tenantId);
    leaderRef.current = leader;
    return () => {
      leader.destroy();
      leaderRef.current = null;
    };
  }, [user?.tenantId]);

  useEffect(() => {
    const unsubscribe = subscribeNotificationEvents(async (event) => {
      const dedupeAccepted = deduperRef.current.shouldProcess(event);
      traceNotificationE2E({
        stage: 'event.dedupe',
        eventType: event.type,
        eventId: event.id,
        tenantId: user?.tenantId,
        orderId: event.orderId,
        source: event.source,
        accepted: dedupeAccepted,
        reason: dedupeAccepted ? 'accepted' : 'duplicate',
      });
      if (!dedupeAccepted) return;

      if (event.type === 'connection.lost') {
        setConnectionBanner({
          title: event.title,
          message: event.message || 'O painel esta restabelecendo a conexao.',
          offline: event.title.toLowerCase().includes('internet'),
        });
      } else if (event.type === 'connection.restored') {
        setConnectionBanner(null);
      } else {
        enqueueTransient(event);
      }

      const isLeader = leaderRef.current?.isLeader() ?? false;
      traceNotificationE2E({
        stage: 'event.leader-check',
        eventType: event.type,
        eventId: event.id,
        tenantId: user?.tenantId,
        orderId: event.orderId,
        source: event.source,
        isLeader,
        lockStrategy: typeof navigator !== 'undefined' && 'locks' in navigator ? 'web-locks' : 'local-storage',
      });

      if (leaderRef.current?.wasEventPlayed(event.id)) return;
      const shouldAnnounce = isLeader || document.visibilityState === 'visible';
      if (shouldAnnounce && !isConnectionEvent(event)) {
        leaderRef.current?.markEventPlayed(event.id);
        if (shouldShowBrowserNotification(event)) {
          showWebNotification(event.title, {
            body: event.message,
            icon: '/favicon.ico',
            tag: event.orderId ? `${event.type}:${event.orderId}` : event.type,
          });
        }
        await soundManager.playEvent(event.type);
        const scopeKey = user ? `${user.tenantId}:${user.userId}` : undefined;
        const speech = browserSpeechProvider();
        if (speech && isVoiceAlertsEnabled(scopeKey)) {
          sharedOrderAlertCoordinator.enqueue(event, speech);
        }
      }
    });

    return unsubscribe;
  }, [enqueueTransient, soundManager, user]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setTransientEvents((current) => current.slice(1));
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const webPermission = getNotificationPermission();
  const permissionNeedsOnboarding = !permissionOnboardingHandled
    && (webPermission === 'default' || nativePermission === 'prompt');
  const permissionDenied = webPermission === 'denied' || nativePermission === 'denied';
  const audioWarning = ownsActivationBanner && soundManager.activationBannerEligible
    ? soundManager.activationError || 'Ative os sons para nao perder novos pedidos.'
    : null;
  const showActivationBanner = Boolean(audioWarning || permissionNeedsOnboarding);

  const dismissActivationBanner = () => {
    soundManager.dismissActivationBannerForSession();
    setOwnsActivationBanner(false);
    if (permissionNeedsOnboarding) markPermissionOnboardingHandled();
  };

  const activateNotifications = async () => {
    const permissionResults = await Promise.all([
      webPermission === 'default' ? requestNotificationPermission() : Promise.resolve(webPermission),
      requestNativeNotificationPermission(),
      soundManager.unlockAudio(),
    ]);
    setNativePermission(permissionResults[1]);
    markPermissionOnboardingHandled();
    if (permissionResults[0] === 'denied' || permissionResults[1] === 'denied') {
      enqueueTransient({
        id: 'permission-notifications',
        type: 'system.error',
        title: 'Permissão de notificações negada',
        message: 'Ative as notificações nas configurações do dispositivo.',
        priority: 'high',
        createdAt: new Date().toISOString(),
        source: 'system',
      });
    }
  };

  return (
    <>
      {transientEvents.length > 0 ? (
        <div
          className="pointer-events-none fixed left-1/2 z-[71] flex w-[min(92vw,420px)] -translate-x-1/2 flex-col gap-2"
          style={{ top: 'calc(var(--safe-area-top) + var(--mobile-header-height) + 12px)' }}
          aria-label="Notificações"
        >
          {transientEvents.map((event) => (
            <div
              key={event.id}
              role={event.priority === 'critical' ? 'alert' : 'status'}
              aria-live={event.priority === 'critical' ? 'assertive' : 'polite'}
              className="pointer-events-auto flex items-start gap-3 rounded-2xl border border-border bg-card p-3 text-foreground shadow-xl"
            >
              <BellRing className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-black">{event.title}</p>
                {event.message ? <p className="mt-0.5 text-xs font-medium text-muted-foreground">{event.message}</p> : null}
              </div>
              <button
                type="button"
                aria-label="Fechar notificação"
                onClick={() => dismissTransient(event.id)}
                className="grid min-h-11 min-w-11 place-items-center rounded-xl text-muted-foreground transition hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <X className="h-4 w-4" aria-hidden />
              </button>
            </div>
          ))}
        </div>
      ) : null}

      {showActivationBanner ? (
        <div
          className="fixed inset-x-3 z-[70] sm:left-1/2 sm:w-[min(92vw,680px)] sm:-translate-x-1/2"
          style={{ bottom: 'calc(12px + var(--safe-area-bottom))' }}
          role="alert"
          aria-live="assertive"
        >
          <div className="rounded-2xl border border-amber-500/30 bg-card px-4 py-3 text-foreground shadow-xl">
            <div className="flex items-start gap-3">
              <div className="rounded-xl bg-amber-500/15 p-2 text-amber-700">
                <BellRing className="h-4 w-4" aria-hidden />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-black">Receba alertas de novos pedidos</p>
                <p className="text-xs font-medium text-muted-foreground">
                  {permissionNeedsOnboarding
                    ? 'Ative notificacoes e som neste dispositivo. Alertas com a tela desligada exigem push nativo, que ainda nao existe.'
                    : audioWarning}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => void activateNotifications()}
                    disabled={soundManager.activationInProgress}
                    className="rounded-xl bg-primary px-3 py-2 text-xs font-black text-primary-foreground transition hover:bg-primary/90 disabled:opacity-60"
                  >
                    {soundManager.activationInProgress
                      ? <><Loader2 className="mr-1 inline h-3.5 w-3.5 animate-spin" />Ativando...</>
                      : permissionDenied ? 'Tentar novamente' : 'Permitir notificacoes e ativar som'}
                  </button>
                  {permissionNeedsOnboarding ? (
                    <button
                      type="button"
                      onClick={dismissActivationBanner}
                      className="rounded-xl border border-border px-3 py-2 text-xs font-black text-muted-foreground hover:bg-muted"
                    >
                      Agora nao
                    </button>
                  ) : null}
                </div>
              </div>
              <button
                type="button"
                aria-label="Fechar notificação"
                onClick={dismissActivationBanner}
                className="grid min-h-11 min-w-11 place-items-center rounded-xl text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <X className="h-4 w-4" aria-hidden />
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {connectionBanner ? (
        <div
          className="fixed left-1/2 z-[69] w-[min(92vw,720px)] -translate-x-1/2"
          style={{ top: 'calc(var(--safe-area-top) + var(--mobile-header-height) + 12px)' }}
          role="alert"
          aria-live="assertive"
        >
          <div className="rounded-2xl border border-destructive/30 bg-card px-4 py-3 text-foreground shadow-xl">
            <div className="flex items-start gap-3">
              <div className="rounded-xl bg-destructive/10 p-2 text-destructive">
                {connectionBanner.offline
                  ? <WifiOff className="h-4 w-4" aria-hidden />
                  : <ServerCrash className="h-4 w-4" aria-hidden />}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-black">{connectionBanner.title}</p>
                <p className="text-xs font-medium text-muted-foreground">{connectionBanner.message}</p>
              </div>
              <button
                type="button"
                aria-label="Fechar notificação"
                onClick={() => setConnectionBanner(null)}
                className="grid min-h-11 min-w-11 place-items-center rounded-xl text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <X className="h-4 w-4" aria-hidden />
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
