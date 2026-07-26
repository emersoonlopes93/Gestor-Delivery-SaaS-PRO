import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, BellRing, WifiOff } from 'lucide-react';
import toast from 'react-hot-toast';
import { getNotificationPermission, showWebNotification } from '../lib/notification-support';
import {
  NotificationDeduper,
  type NotificationEvent,
  emitNotificationEvent,
  subscribeNotificationEvents,
} from './notificationEvents';
import { useSoundManager } from './useSoundManager';
import { useTenantAuth } from '../hooks/use-tenant-auth';
import { createTabLeader, type TabLeader } from './tabLeader';

function shouldShowBrowserNotification(event: NotificationEvent) {
  if (typeof document === 'undefined') return false;
  if (document.visibilityState !== 'hidden') return false;
  if (getNotificationPermission() !== 'granted') return false;

  return event.priority === 'high' || event.priority === 'critical';
}

function showToastForEvent(event: NotificationEvent) {
  const message = event.message ? `${event.title}\n${event.message}` : event.title;

  if (event.type === 'connection.lost') {
    toast.error(message, { duration: Infinity, id: 'tenant-connection-lost' });
    return;
  }

  if (event.type === 'connection.restored') {
    toast.dismiss('tenant-connection-lost');
    toast.success(message, { duration: 4000, id: 'tenant-connection-restored' });
    return;
  }

  if (event.priority === 'critical' || event.priority === 'high') {
    toast.error(message, { duration: 6000, id: event.id });
    return;
  }

  toast.success(message, { duration: 5000, id: event.id });
}

export function NotificationCenter() {
  const { user } = useTenantAuth();
  const deduperRef = useRef(new NotificationDeduper());
  const soundManager = useSoundManager();
  const [connectionBanner, setConnectionBanner] = useState<string | null>(null);
  const leaderRef = useRef<TabLeader | null>(null);

  // Inicializa o líder de aba quando temos o tenantId
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
      if (!deduperRef.current.shouldProcess(event)) {
        return;
      }

      if (event.type === 'connection.lost') {
        setConnectionBanner(event.message || 'A conexao com o painel foi perdida.');
      } else if (event.type === 'connection.restored') {
        setConnectionBanner(null);
      }

      // Toast é local (cada aba mostra o seu se quiser, o deduplicador já limita)
      showToastForEvent(event);

      // Som e Browser Notification devem acontecer apenas na aba líder
      const isLeader = leaderRef.current?.isLeader() ?? false;

      // Se outra aba líder já tocou este evento, não tentamos tocar novamente,
      // mesmo que a aba atual acabe de se tornar líder.
      if (leaderRef.current?.wasEventPlayed(event.id)) {
        return;
      }

      if (isLeader) {
        leaderRef.current?.markEventPlayed(event.id);

        if (shouldShowBrowserNotification(event)) {
          showWebNotification(event.title, {
            body: event.message,
            icon: '/favicon.ico',
            tag: event.type,
          });
        }

        await soundManager.playEvent(event.type);
      }
    });

    return unsubscribe;
  }, [soundManager]);

  useEffect(() => {
    const onOffline = () => {
      emitNotificationEvent({
        id: 'browser:connection.lost',
        type: 'connection.lost',
        title: 'Conexao instavel',
        message: 'Voce ficou offline. Novos pedidos podem atrasar.',
        priority: 'critical',
        createdAt: new Date().toISOString(),
        source: 'connection',
      });
    };

    const onOnline = () => {
      emitNotificationEvent({
        id: `browser:connection.restored:${Date.now()}`,
        type: 'connection.restored',
        title: 'Conexao restaurada',
        message: 'O painel voltou a receber atualizacoes em tempo real.',
        priority: 'low',
        createdAt: new Date().toISOString(),
        source: 'connection',
      });
    };

    window.addEventListener('offline', onOffline);
    window.addEventListener('online', onOnline);

    return () => {
      window.removeEventListener('offline', onOffline);
      window.removeEventListener('online', onOnline);
    };
  }, []);

  const audioWarning = useMemo(() => {
    if (!soundManager.needsAudioUnlock) return null;
    if (soundManager.lastPlaybackError) return 'O navegador ainda nao liberou os sons automaticamente.';
    return 'Ative as notificacoes sonoras para nao perder novos pedidos.';
  }, [soundManager.needsAudioUnlock, soundManager.lastPlaybackError]);

  return (
    <>
      {audioWarning ? (
        <div className="fixed left-1/2 top-4 z-[70] w-[min(92vw,680px)] -translate-x-1/2" role="alert" aria-live="assertive">
          <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 shadow-lg backdrop-blur">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-3">
                <div className="rounded-xl bg-amber-500/15 p-2 text-amber-700">
                  <BellRing className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-sm font-black text-foreground">Ative as notificacoes sonoras</p>
                  <p className="text-xs font-medium text-muted-foreground">{audioWarning}</p>
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  aria-label="Ativar notificacoes sonoras"
                  onClick={() => void soundManager.unlockAudio()}
                  className="rounded-xl bg-primary px-3 py-2 text-xs font-black text-primary-foreground transition hover:bg-primary/90"
                >
                  Ativar sons
                </button>
                <button
                  type="button"
                  aria-label="Testar som"
                  onClick={() => void soundManager.testSound()}
                  className="rounded-xl border border-border bg-card px-3 py-2 text-xs font-black text-foreground transition hover:bg-muted"
                >
                  Testar som
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {connectionBanner ? (
        <div className="fixed left-1/2 top-24 z-[69] w-[min(92vw,720px)] -translate-x-1/2" role="alert" aria-live="assertive">
          <div className="rounded-2xl border border-destructive/30 bg-destructive/10 px-4 py-3 shadow-lg backdrop-blur">
            <div className="flex items-start gap-3">
              <div className="rounded-xl bg-destructive/10 p-2 text-destructive">
                <WifiOff className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-black text-foreground">Conexao perdida</p>
                <p className="text-xs font-medium text-muted-foreground">{connectionBanner}</p>
              </div>
            </div>
          </div>
        </div>
      ) : null}



      {soundManager.lastPlaybackError && !soundManager.needsAudioUnlock ? (
        <div className="fixed bottom-4 left-1/2 z-[68] w-[min(92vw,560px)] -translate-x-1/2" role="status" aria-live="polite">
          <div className="rounded-2xl border border-border bg-card px-4 py-3 shadow-lg">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 h-4 w-4 text-amber-500" />
              <div>
                <p className="text-sm font-bold text-foreground">Audio aguardando permissao do navegador</p>
                <p className="text-xs text-muted-foreground">
                  Voce ainda continuara vendo os alertas visuais, mesmo sem som. Erro: {soundManager.lastPlaybackError}
                </p>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
