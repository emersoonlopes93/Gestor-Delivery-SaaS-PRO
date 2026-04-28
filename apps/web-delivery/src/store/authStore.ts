import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { DriverUserSession } from '@gestor/types';

interface AuthState {
  accessToken: string | null;
  refreshToken: string | null;
  user: DriverUserSession | null;
  isAuthenticated: boolean;
  setAuth: (accessToken: string, refreshToken: string, user: DriverUserSession) => void;
  setTokens: (accessToken: string, refreshToken: string) => void;
  updateUser: (user: DriverUserSession) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      accessToken: null,
      refreshToken: null,
      user: null,
      isAuthenticated: false,

      setAuth: (accessToken, refreshToken, user) =>
        set({
          accessToken,
          refreshToken,
          user,
          isAuthenticated: true,
        }),

      setTokens: (accessToken, refreshToken) =>
        set((state) => ({
          ...state,
          accessToken,
          refreshToken,
        })),

      updateUser: (user) =>
        set((state) => ({
          ...state,
          user,
        })),

      logout: () =>
        set({
          accessToken: null,
          refreshToken: null,
          user: null,
          isAuthenticated: false,
        }),
    }),
    {
      name: 'gestor-web-delivery-auth',
    }
  )
);
