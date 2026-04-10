import { create } from 'zustand';
import type { AdminUserSession } from '@gestor/types';

interface AuthState {
  user: AdminUserSession | null;
  isAuthenticated: boolean;
  isLoading: boolean;

  setUser: (user: AdminUserSession) => void;
  clearUser: () => void;
  setLoading: (loading: boolean) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isAuthenticated: false,
  isLoading: true,

  setUser: (user) =>
    set({ user, isAuthenticated: true, isLoading: false }),

  clearUser: () =>
    set({ user: null, isAuthenticated: false, isLoading: false }),

  setLoading: (isLoading) => set({ isLoading }),
}));
