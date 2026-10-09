import { useEffect, useState } from 'react';
import { Download, RefreshCw, WifiOff } from 'lucide-react';
import { PWA_UPDATE_AVAILABLE_EVENT } from '../lib/pwa';

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export function PwaStatusBanner() {
  const [online, setOnline] = useState(navigator.onLine);
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null);
  const [waitingRegistration, setWaitingRegistration] = useState<ServiceWorkerRegistration | null>(null);

  useEffect(() => {
    const handleInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as InstallPromptEvent);
    };
    const handleUpdate = (event: Event) => {
      setWaitingRegistration((event as CustomEvent<ServiceWorkerRegistration>).detail);
    };
    const handleOnline = () => setOnline(true);
    const handleOffline = () => setOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    window.addEventListener('beforeinstallprompt', handleInstallPrompt);
    window.addEventListener(PWA_UPDATE_AVAILABLE_EVENT, handleUpdate);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('beforeinstallprompt', handleInstallPrompt);
      window.removeEventListener(PWA_UPDATE_AVAILABLE_EVENT, handleUpdate);
    };
  }, []);

  const install = async () => {
    if (!installPrompt) return;
    await installPrompt.prompt();
    await installPrompt.userChoice;
    setInstallPrompt(null);
  };

  const update = () => {
    const waiting = waitingRegistration?.waiting;
    if (!waiting) return;
    let refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (refreshing) return;
      refreshing = true;
      window.location.reload();
    }, { once: true });
    waiting.postMessage({ type: 'SKIP_WAITING' });
  };

  if (online && !installPrompt && !waitingRegistration) return null;

  return (
    <aside className="fixed inset-x-3 top-[calc(env(safe-area-inset-top,0px)+0.75rem)] z-50 mx-auto flex max-w-md items-center gap-3 rounded-xl border border-slate-300 bg-white p-3 text-slate-800 shadow-lg dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">
      {!online ? (
        <><WifiOff className="h-5 w-5 text-amber-500" /><p className="flex-1 text-xs font-semibold">Sem conexão. A interface continua disponível; dados novos aguardam a rede.</p></>
      ) : waitingRegistration ? (
        <><RefreshCw className="h-5 w-5 text-blue-500" /><p className="flex-1 text-xs font-semibold">Uma atualização está pronta.</p><button onClick={update} className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-bold text-white">Atualizar</button></>
      ) : (
        <><Download className="h-5 w-5 text-orange-500" /><p className="flex-1 text-xs font-semibold">Instale o app para acesso rápido.</p><button onClick={install} className="rounded-lg bg-orange-500 px-3 py-2 text-xs font-bold text-white">Instalar</button></>
      )}
    </aside>
  );
}
