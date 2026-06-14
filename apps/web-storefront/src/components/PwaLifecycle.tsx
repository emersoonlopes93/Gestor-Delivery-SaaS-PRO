import { useEffect, useState } from 'react';
import { App as CapacitorApp } from '@capacitor/app';
import { Download, Share, X } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useToast } from './Toast';

const APP_VERSION = import.meta.env.VITE_APP_VERSION || '0.1.0';
const IOS_BANNER_DISMISSED_KEY = 'pwa-ios-banner-dismissed';

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
};

function isStandalone() {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function isIosSafari(): boolean {
  const ua = window.navigator.userAgent;
  const isIos = /iphone|ipad|ipod/i.test(ua);
  // Exclui Chrome/Firefox em iOS (que usam WebKit mas não suportam PWA também)
  const isSafari = /safari/i.test(ua) && !/chrome|crios|fxios/i.test(ua);
  return isIos && isSafari;
}

/** Só mostra o banner iOS se estiver em rota de lojista (/slug/...) */
function isStorefrontRoute(pathname: string): boolean {
  const first = pathname.split('/').filter(Boolean)[0] ?? '';
  const landingPages = ['precos', 'cadastro', 'login', ''];
  return first !== '' && !landingPages.includes(first);
}

export function PwaLifecycle() {
  const { showToast } = useToast();
  const location = useLocation();
  const navigate = useNavigate();
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showIosBanner, setShowIosBanner] = useState(false);

  // Salva slug do último tenant visitado para deep links
  useEffect(() => {
    const tenantSlug = location.pathname.split('/').filter(Boolean)[0];
    if (tenantSlug && !['precos', 'cadastro', 'login'].includes(tenantSlug)) {
      localStorage.setItem('storefront:lastTenantSlug', tenantSlug);
    }
  }, [location.pathname]);

  // Registra Service Worker
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

  // Deep links via Capacitor
  useEffect(() => {
    let cleanup: (() => void) | undefined;

    CapacitorApp.addListener('appUrlOpen', ({ url }) => {
      const target = resolveDeepLink(url);
      if (target) navigate(target);
    }).then((handle) => {
      cleanup = () => handle.remove();
    }).catch(() => undefined);

    return () => cleanup?.();
  }, [navigate]);

  // Android: evento nativo beforeinstallprompt
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

  // iOS: banner customizado com instruções manuais
  useEffect(() => {
    if (!isIosSafari()) return;
    if (isStandalone()) return;
    if (localStorage.getItem(IOS_BANNER_DISMISSED_KEY)) return;
    if (!isStorefrontRoute(location.pathname)) return;

    // Pequeno delay para não aparecer imediatamente ao entrar na página
    const timer = setTimeout(() => setShowIosBanner(true), 3000);
    return () => clearTimeout(timer);
  }, [location.pathname]);

  async function installApp() {
    if (!installPrompt) return;
    await installPrompt.prompt();
    const choice = await installPrompt.userChoice;
    if (choice.outcome === 'accepted') setInstallPrompt(null);
  }

  function dismissIosBanner() {
    setShowIosBanner(false);
    localStorage.setItem(IOS_BANNER_DISMISSED_KEY, '1');
  }

  // Android: botão flutuante nativo
  if (installPrompt) {
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

  // iOS: banner com instruções de "Adicionar à Tela Inicial"
  if (showIosBanner) {
    return (
      <div className="fixed bottom-0 left-0 right-0 z-50 animate-slide-up">
        <div className="mx-3 mb-4 rounded-2xl bg-gray-950 p-4 shadow-2xl">
          {/* Header */}
          <div className="mb-3 flex items-start justify-between">
            <div className="flex items-center gap-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/10">
                <Share className="h-4 w-4 text-white" />
              </div>
              <div>
                <p className="text-sm font-bold text-white">Instalar o app</p>
                <p className="text-xs text-gray-400">Adicione à sua tela inicial</p>
              </div>
            </div>
            <button
              type="button"
              onClick={dismissIosBanner}
              className="flex h-7 w-7 items-center justify-center rounded-full bg-white/10 text-gray-400"
              aria-label="Fechar"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Passos */}
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white/10 text-xs font-bold text-white">1</span>
              <p className="text-sm text-gray-300">
                Toque no ícone{' '}
                <span className="inline-flex h-5 w-5 items-center justify-center rounded bg-white/20 px-0.5 text-xs font-black text-white align-middle">
                  ↑
                </span>{' '}
                <strong className="text-white">Compartilhar</strong> na barra do Safari
              </p>
            </div>
            <div className="flex items-center gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white/10 text-xs font-bold text-white">2</span>
              <p className="text-sm text-gray-300">
                Role para baixo e toque em{' '}
                <strong className="text-white">"Adicionar à Tela Inicial"</strong>
              </p>
            </div>
            <div className="flex items-center gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white/10 text-xs font-bold text-white">3</span>
              <p className="text-sm text-gray-300">
                Toque em <strong className="text-white">"Adicionar"</strong> para confirmar
              </p>
            </div>
          </div>

          {/* Seta apontando para baixo (onde fica a barra do Safari) */}
          <div className="absolute -bottom-2 left-1/2 -translate-x-1/2">
            <div className="h-3 w-3 rotate-45 bg-gray-950" />
          </div>
        </div>
      </div>
    );
  }

  return null;
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

