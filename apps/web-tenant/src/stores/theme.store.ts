import { create } from 'zustand';

type Theme = 'light' | 'dark' | 'system';

interface ThemeState {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  initializeTheme: () => void;
}

export const useThemeStore = create<ThemeState>((set) => ({
  theme: 'system',
  setTheme: (theme) => {
    set({ theme });
    localStorage.setItem('tenant_theme_preference', theme);
    applyTheme(theme);
  },
  initializeTheme: () => {
    const savedTheme = (localStorage.getItem('tenant_theme_preference') as Theme) || 'system';
    set({ theme: savedTheme });
    applyTheme(savedTheme);
  },
}));

function applyTheme(theme: Theme) {
  const root = window.document.documentElement;
  const isDark =
    theme === 'dark' ||
    (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);

  if (isDark) {
    root.classList.add('dark');
  } else {
    root.classList.remove('dark');
  }
}
