import axios from 'axios';
import { useAuthStore } from '../store/authStore';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

export const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

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
        
        const baseUrl = API_BASE_URL.replace(/\/+$/, '');
        const { data: raw } = await axios.post(`${baseUrl}/auth/driver/refresh`, {
          refreshToken: refreshTokenStr,
        });

        const payload =
          raw && typeof raw === 'object' && 'success' in raw && raw.success && 'data' in raw
            ? (raw as { data: { accessToken: string } }).data
            : (raw as { accessToken: string });

        if (!payload?.accessToken) {
          throw new Error('Invalid refresh response');
        }

        useAuthStore.getState().setTokens(payload.accessToken, refreshTokenStr);
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
