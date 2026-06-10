import axios from 'axios';
import { useAuthStore } from '../store/authStore';

const configuredApiUrl = import.meta.env.VITE_API_URL?.trim();

if (import.meta.env.PROD && !configuredApiUrl) {
  throw new Error('VITE_API_URL precisa estar configurado para o app entregador em produÃ§Ã£o.');
}

const API_BASE_URL = configuredApiUrl || 'http://localhost:3333/api/v1';

export const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

let refreshPromise: Promise<{ accessToken: string; refreshToken?: string }> | null = null;

api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().accessToken;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;
      try {
        const refreshTokenStr = useAuthStore.getState().refreshToken;
        if (!refreshTokenStr) throw new Error('No refresh token');

        if (!refreshPromise) {
          const baseUrl = API_BASE_URL.replace(/\/+$/, '');
          refreshPromise = axios.post(`${baseUrl}/auth/driver/refresh`, {
            refreshToken: refreshTokenStr,
          }).then(({ data: raw }) => (
            raw && typeof raw === 'object' && 'success' in raw && raw.success && 'data' in raw
              ? (raw as { data: { accessToken: string; refreshToken?: string } }).data
              : (raw as { accessToken: string; refreshToken?: string })
          )).finally(() => {
            refreshPromise = null;
          });
        }

        const payload = await refreshPromise;

        if (!payload?.accessToken) {
          throw new Error('Invalid refresh response');
        }

        useAuthStore.getState().setTokens(payload.accessToken, payload.refreshToken || refreshTokenStr);
        originalRequest.headers.Authorization = `Bearer ${payload.accessToken}`;
        return api(originalRequest);
      } catch (refreshError) {
        useAuthStore.getState().logout();
        return Promise.reject(refreshError);
      }
    }
    return Promise.reject(error);
  }
);
