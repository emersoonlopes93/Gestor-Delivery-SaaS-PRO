import { useEffect, useState } from 'react';
import { App as CapacitorApp } from '@capacitor/app';
import { Download } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useToast } from './Toast';

const APP_VERSION = import.meta.env.VITE_APP_VERSION || '0.1.0';

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
};

function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
}

export function PwaLifecycle() {
  const { showToast } = useToast();
  const location = useLocation();
  const navigate = useNavigate();
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    const tenantSlug = location.pathname.split('/').filter(Boolean)[0];
    if (tenantSlug && !['precos', 'cadastro', 'login'].includes(tenantSlug)) {
      localStorage.setItem('storefront:lastTenantSlug', tenantSlug);
    }
  }, [location.pathname]);

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    const reloadKey = `pwa-reloaded:${APP_VERSION}`;

    navigator.serviceWorker
      .register(`/sw.js?v=${encodeURIComponent(APP_VERSION)}`)
      .then((registration) => {
        registration.update().catch(() => undefined);

        registration.addEventListener('updatefound', () => {
          const nextWorker = registration.installing;
          if (!nextWorker) return;

          nextWorker.addEventListener('statechange', () => {
            if (nextWorker.state === 'installed' && navigator.serviceWorker.controller) {
              showToast({ title: 'Atualizacao pronta', message: 'O app sera atualizado automaticamente.', type: 'info' });
              nextWorker.postMessage({ type: 'SKIP_WAITING' });
            }
          });
        });
      })
      .catch(() => {
        showToast({ title: 'Modo offline indisponivel', type: 'warning' });
      });

    const onControllerChange = () => {
      if (sessionStorage.getItem(reloadKey)) return;
      sessionStorage.setItem(reloadKey, '1');
      window.location.reload();
    };

    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);
    return () => navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
  }, [showToast]);

  useEffect(() => {
    let cleanup: (() => void) | undefined;

    CapacitorApp.addListener('appUrlOpen', ({ url }) => {
      const target = resolveDeepLink(url);
      if (target) {
        navigate(target);
      }
    }).then((handle) => {
      cleanup = () => handle.remove();
    }).catch(() => undefined);

    return () => cleanup?.();
  }, [navigate]);

  useEffect(() => {
    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      if (!isStandalone()) setInstallPrompt(event as BeforeInstallPromptEvent);
    };

    const onInstalled = () => setInstallPrompt(null);

    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  async function installApp() {
    if (!installPrompt) return;
    await installPrompt.prompt();
    const choice = await installPrompt.userChoice;
    if (choice.outcome === 'accepted') setInstallPrompt(null);
  }

  if (!installPrompt) return null;

  return (
    <button
      type="button"
      onClick={installApp}
      className="fixed bottom-24 right-4 z-40 flex h-12 items-center gap-2 rounded-xl bg-gray-950 px-4 text-sm font-black text-white shadow-lg active:scale-95"
    >
      <Download className="h-4 w-4" />
      Instalar app
    </button>
  );
}

function resolveDeepLink(rawUrl: string) {
  try {
    const url = new URL(rawUrl);
    const tenantSlug = localStorage.getItem('storefront:lastTenantSlug');
    if (!tenantSlug) return '/';

    const host = url.hostname.toLowerCase();
    const segments = url.pathname.split('/').filter(Boolean);
    const first = host || segments[0] || '';

    if (first === 'tracking') {
      const token = segments[0];
      return token ? `/${tenantSlug}/tracking/${encodeURIComponent(token)}` : `/${tenantSlug}/orders`;
    }

    if (first === 'profile' || first === 'wallet' || first === 'cashback' || first === 'offers') {
      return `/${tenantSlug}/profile`;
    }

    return `/${tenantSlug}`;
  } catch {
    return null;
  }
}
