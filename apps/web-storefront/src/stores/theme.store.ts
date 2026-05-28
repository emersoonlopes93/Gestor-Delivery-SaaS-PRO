import { create } from 'zustand';

type StorefrontTheme = 'light' | 'dark' | 'system';

interface StorefrontThemeState {
  theme: StorefrontTheme;
  setTheme: (theme: StorefrontTheme) => void;
  initializeTheme: () => void;
}

const THEME_STORAGE_KEY = 'gestor-delivery:storefront-theme';

export const useStorefrontThemeStore = create<StorefrontThemeState>((set) => ({
  theme: 'system',
  setTheme: (theme) => {
    set({ theme });
    localStorage.setItem(THEME_STORAGE_KEY, theme);
    applyStorefrontTheme(theme);
  },
  initializeTheme: () => {
    const savedTheme = (localStorage.getItem(THEME_STORAGE_KEY) as StorefrontTheme) || 'system';
    set({ theme: savedTheme });
    applyStorefrontTheme(savedTheme);
  },
}));

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