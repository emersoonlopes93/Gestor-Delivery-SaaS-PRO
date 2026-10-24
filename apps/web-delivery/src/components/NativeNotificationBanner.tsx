import { useEffect, useState } from 'react';
import { Bell, BellOff } from 'lucide-react';
import {
  getNativeNotificationStatus,
  requestNativeLocalNotifications,
  type NativeNotificationStatus,
} from '../lib/nativeDriverNotifications';

export function NativeNotificationBanner() {
  const [status, setStatus] = useState<NativeNotificationStatus | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    void getNativeNotificationStatus().then(setStatus).catch(() => undefined);
  }, []);

  if (!status?.isNative) return null;

  const enableLocalAlerts = async () => {
    setLoading(true);
    try {
      setStatus(await requestNativeLocalNotifications());
    } finally {
      setLoading(false);
    }
  };

  return (
    <aside className="mx-3 mt-3 rounded-xl border border-orange-200 bg-orange-50 p-3 text-slate-800 dark:border-orange-900/70 dark:bg-orange-950/40 dark:text-slate-100">
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-orange-100 dark:bg-orange-900/60">
          {status.localNotifications === 'granted'
            ? <Bell className="h-5 w-5 text-orange-600" />
            : <BellOff className="h-5 w-5 text-orange-600" />}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold leading-tight">
            {status.localNotifications === 'granted' ? 'Alertas locais ativos' : 'Ativar alertas locais'}
          </p>
          <p className="text-xs text-slate-600 dark:text-slate-300">
            {status.nativePush === 'not_configured'
              ? 'Push remoto nativo ainda não configurado; o Web Push continua disponível na PWA.'
              : 'Push remoto nativo indisponível neste dispositivo.'}
          </p>
        </div>
        {status.localNotifications !== 'granted' && status.localNotifications !== 'unavailable' && (
          <button
            type="button"
            onClick={enableLocalAlerts}
            disabled={loading || status.localNotifications === 'denied'}
            className="shrink-0 rounded-lg bg-orange-500 px-3 py-2 text-xs font-bold text-white disabled:opacity-50"
          >
            {status.localNotifications === 'denied' ? 'Bloqueado' : loading ? '...' : 'Ativar'}
          </button>
        )}
      </div>
    </aside>
  );
}
