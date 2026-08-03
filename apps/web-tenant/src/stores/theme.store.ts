import { create } from 'zustand';

type Theme = 'light' | 'dark' | 'system';

interface ThemeState {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  initializeTheme: () => void;
}

const THEME_STORAGE_KEY = 'gestor-delivery:tenant-panel-theme';
let systemPreference: MediaQueryList | null = null;
let systemPreferenceListener: (() => void) | null = null;

function isTheme(value: string | null): value is Theme {
  return value === 'light' || value === 'dark' || value === 'system';
}

export const useThemeStore = create<ThemeState>((set) => ({
  theme: 'system',
  setTheme: (theme) => {
    set({ theme });
    localStorage.setItem(THEME_STORAGE_KEY, theme);
    applyTheme(theme);
    watchSystemPreference(theme);
  },
  initializeTheme: () => {
    const storedTheme = localStorage.getItem(THEME_STORAGE_KEY);
    const savedTheme = isTheme(storedTheme) ? storedTheme : 'system';
    set({ theme: savedTheme });
    applyTheme(savedTheme);
    watchSystemPreference(savedTheme);
  },
}));

function watchSystemPreference(theme: Theme) {
  if (systemPreference && systemPreferenceListener) {
    systemPreference.removeEventListener('change', systemPreferenceListener);
  }

  systemPreference = null;
  systemPreferenceListener = null;
  if (theme !== 'system') return;

  systemPreference = window.matchMedia('(prefers-color-scheme: dark)');
  systemPreferenceListener = () => applyTheme('system');
  systemPreference.addEventListener('change', systemPreferenceListener);
}

function applyTheme(theme: Theme) {
  const root = window.document.documentElement;
  const isDark =
    theme === 'dark' ||
    (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);

  // Usar atributo data-theme para melhor isolamento entre domínios
  if (isDark) {
    root.setAttribute('data-theme', 'dark');
  } else {
    root.setAttribute('data-theme', 'light');
  }
}
