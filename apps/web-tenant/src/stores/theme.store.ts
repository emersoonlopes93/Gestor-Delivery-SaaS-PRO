import { create } from 'zustand';

type Theme = 'light' | 'dark' | 'system';
type ResolvedTheme = Exclude<Theme, 'system'>;

interface ThemeState {
  theme: Theme;
  resolvedTheme: ResolvedTheme;
  setTheme: (theme: Theme) => void;
  initializeTheme: () => void;
}

const THEME_STORAGE_KEY = 'gestor-delivery:tenant-panel-theme';
let systemPreference: MediaQueryList | null = null;
let systemPreferenceListener: (() => void) | null = null;

function isTheme(value: string | null): value is Theme {
  return value === 'light' || value === 'dark' || value === 'system';
}

export const useThemeStore = create<ThemeState>((set) => {
  const syncTheme = (theme: Theme, persist: boolean) => {
    const resolvedTheme = applyTheme(theme);
    set({ theme, resolvedTheme });
    if (persist) localStorage.setItem(THEME_STORAGE_KEY, theme);
    watchSystemPreference(theme, (nextResolvedTheme) => set({ resolvedTheme: nextResolvedTheme }));
  };

  return {
    theme: 'system',
    resolvedTheme: 'light',
    setTheme: (theme) => syncTheme(theme, true),
    initializeTheme: () => {
      const storedTheme = localStorage.getItem(THEME_STORAGE_KEY);
      syncTheme(isTheme(storedTheme) ? storedTheme : 'system', false);
    },
  };
});

function watchSystemPreference(theme: Theme, onChange: (resolvedTheme: ResolvedTheme) => void) {
  if (systemPreference && systemPreferenceListener) {
    systemPreference.removeEventListener('change', systemPreferenceListener);
  }

  systemPreference = null;
  systemPreferenceListener = null;
  if (theme !== 'system') return;

  systemPreference = window.matchMedia('(prefers-color-scheme: dark)');
  systemPreferenceListener = () => onChange(applyTheme('system'));
  systemPreference.addEventListener('change', systemPreferenceListener);
}

function applyTheme(theme: Theme): ResolvedTheme {
  const root = window.document.documentElement;
  const isDark =
    theme === 'dark' ||
    (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);

  // Usar atributo data-theme para melhor isolamento entre domínios
  if (isDark) {
    root.setAttribute('data-theme', 'dark');
    return 'dark';
  } else {
    root.setAttribute('data-theme', 'light');
    return 'light';
  }
}
