import { create } from 'zustand';

type StorefrontTheme = 'light' | 'dark' | 'system';

interface StorefrontThemeState {
  theme: StorefrontTheme;
  setTheme: (theme: StorefrontTheme) => void;
  initializeTheme: () => void;
}

const THEME_STORAGE_KEY = 'gestor-delivery:storefront-theme';
let systemPreference: MediaQueryList | null = null;
let systemPreferenceListener: (() => void) | null = null;

function isTheme(value: string | null): value is StorefrontTheme {
  return value === 'light' || value === 'dark' || value === 'system';
}

export const useStorefrontThemeStore = create<StorefrontThemeState>((set) => ({
  theme: 'system',
  setTheme: (theme) => {
    set({ theme });
    localStorage.setItem(THEME_STORAGE_KEY, theme);
    applyStorefrontTheme(theme);
    watchSystemPreference(theme);
  },
  initializeTheme: () => {
    const storedTheme = localStorage.getItem(THEME_STORAGE_KEY);
    const savedTheme = isTheme(storedTheme) ? storedTheme : 'system';
    set({ theme: savedTheme });
    applyStorefrontTheme(savedTheme);
    watchSystemPreference(savedTheme);
  },
}));

function watchSystemPreference(theme: StorefrontTheme) {
  if (systemPreference && systemPreferenceListener) {
    systemPreference.removeEventListener('change', systemPreferenceListener);
  }

  systemPreference = null;
  systemPreferenceListener = null;
  if (theme !== 'system') return;

  systemPreference = window.matchMedia('(prefers-color-scheme: dark)');
  systemPreferenceListener = () => applyStorefrontTheme('system');
  systemPreference.addEventListener('change', systemPreferenceListener);
}

function applyStorefrontTheme(theme: StorefrontTheme) {
  const root = window.document.documentElement;
  const isDark =
    theme === 'dark' ||
    (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);

  // Usar atributo data- específico para storefront, não classe .dark global
  if (isDark) {
    root.setAttribute('data-storefront-theme', 'dark');
  } else {
    root.setAttribute('data-storefront-theme', 'light');
  }
}
