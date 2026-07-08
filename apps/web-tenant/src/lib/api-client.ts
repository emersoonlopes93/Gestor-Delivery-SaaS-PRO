import type { ApiResponse, ApiErrorResponse } from '@gestor/types';

/**
 * URL base da API.
 * Prioridade (primeira encontrada vence):
 *   1. VITE_API_URL        — variável padrão do projeto (definida em .env / .env.local)
 *   2. VITE_API_BASE_URL   — alias alternativo (compatibilidade / futuros .env)
 *   3. '/api/v1'           — fallback APENAS para dev local com proxy Vite ativo
 *
 * ATENÇÃO: o proxy Vite só funciona no navegador local.
 * Para builds Android via Capacitor, VITE_API_URL DEVE ser uma URL absoluta HTTPS.
 * Exemplo: VITE_API_URL=https://sua-api.onrender.com/api/v1
 */
const API_BASE = (
  import.meta.env.VITE_API_URL ||
  import.meta.env.VITE_API_BASE_URL ||
  '/api/v1'
).replace(/\/$/, '');

const TOKEN_REFRESH_LEEWAY_MS = 60_000;

if (import.meta.env.DEV) {
  // Log seguro: exibe apenas a URL base, nunca tokens, senhas ou payloads.
  console.info('[api-client] API_BASE:', API_BASE);
}

function isAuthEndpoint(endpoint: string): boolean {
  return (
    endpoint.startsWith('/auth/tenant/login') ||
    endpoint.startsWith('/auth/tenant/refresh')
  );
}

/**
 * Typed fetch wrapper for API calls.
 */
async function apiFetch<T>(
  endpoint: string,
  options: RequestInit = {},
): Promise<ApiResponse<T>> {
  const token = await getAccessTokenForRequest(endpoint);

  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...options.headers,
  };

  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers,
  });

  if (response.status === 401) {
    // Do not attempt refresh / redirect for auth endpoints
    if (isAuthEndpoint(endpoint)) {
      const errorBody: ApiErrorResponse = await response
        .json()
        .catch(() => ({}));
      throw new ApiError(
        response.status,
        errorBody?.error?.message || 'Unauthorized',
        errorBody?.error?.code,
      );
    }

    // Try refresh token
    const refreshed = await tryRefreshToken();
    if (refreshed) {
      // Retry the request with the new token
      const newToken = localStorage.getItem('accessToken');
      const retryHeaders = {
        ...headers,
        Authorization: `Bearer ${newToken}`,
      };
      const retryResponse = await fetch(`${API_BASE}${endpoint}`, {
        ...options,
        headers: retryHeaders,
      });
      if (!retryResponse.ok) {
        // Se o retry também falhou com 401, a sessão é irrecuperável:
        // limpar tokens e redirecionar para o login.
        if (retryResponse.status === 401) {
          localStorage.removeItem('accessToken');
          localStorage.removeItem('refreshToken');
          if (typeof window !== 'undefined') {
            window.location.href = '/login?expired=1';
          }
          throw new ApiError(401, 'Session expired');
        }
        const retryErrorBody: ApiErrorResponse = await retryResponse.json().catch(() => ({}));
        throw new ApiError(
          retryResponse.status,
          retryErrorBody?.error?.message || 'Request failed after refresh',
          retryErrorBody?.error?.code,
        );
      }
      return retryResponse.json();
    }
    // Refresh failed — clear local auth and redirect
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');

    // Redirect to login with a flag to show the expired message
    if (typeof window !== 'undefined') {
      window.location.href = '/login?expired=1';
    }

    throw new ApiError(401, 'Session expired');
  }

  if (!response.ok) {
    const errorBody: ApiErrorResponse = await response.json().catch(() => ({}));
    throw new ApiError(
      response.status,
      errorBody?.error?.message || 'Request failed',
      errorBody?.error?.code,
    );
  }

  return response.json();
}

let isRefreshing = false;
let refreshPromise: Promise<boolean> | null = null;

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const [, payload] = token.split('.');
    if (!payload) return null;
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), '=');
    const decoded = atob(padded);
    return JSON.parse(decoded) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function isTokenExpiringSoon(token: string): boolean {
  const payload = decodeJwtPayload(token);
  const exp = typeof payload?.exp === 'number' ? payload.exp : null;
  if (!exp) return false;
  return exp * 1000 <= Date.now() + TOKEN_REFRESH_LEEWAY_MS;
}

async function getAccessTokenForRequest(endpoint: string): Promise<string | null> {
  const token = localStorage.getItem('accessToken');
  if (!token || isAuthEndpoint(endpoint)) {
    return token;
  }

  if (isTokenExpiringSoon(token)) {
    const refreshed = await tryRefreshToken();
    if (refreshed) {
      return localStorage.getItem('accessToken');
    }
  }

  return token;
}

async function tryRefreshToken(): Promise<boolean> {
  const refreshToken = localStorage.getItem('refreshToken');
  if (!refreshToken) return false;

  // Se já houver um refresh em andamento, retorna a promise dele
  if (isRefreshing && refreshPromise) {
    return refreshPromise;
  }

  isRefreshing = true;
  refreshPromise = fetch(`${API_BASE}/auth/tenant/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken }),
  })
    .then(async (res) => {
      if (!res.ok) return false;
      const data: ApiResponse<{ accessToken: string; refreshToken?: string }> = await res.json();
      if (data?.success && data?.data?.accessToken) {
        localStorage.setItem('accessToken', data.data.accessToken);
        if (data.data.refreshToken) {
          localStorage.setItem('refreshToken', data.data.refreshToken);
        }
        return true;
      }
      return false;
    })
    .catch(() => false)
    .finally(() => {
      isRefreshing = false;
      refreshPromise = null;
    });

  return refreshPromise;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export const api = {
  get: <T>(endpoint: string) => apiFetch<T>(endpoint),
  post: <T>(endpoint: string, body?: unknown) =>
    apiFetch<T>(endpoint, {
      method: 'POST',
      body: body ? JSON.stringify(body) : undefined,
    }),
  upload: async <T>(endpoint: string, formData: FormData): Promise<ApiResponse<T>> => {
    const token = await getAccessTokenForRequest(endpoint);
    const headers: HeadersInit = {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };

    const response = await fetch(`${API_BASE}${endpoint}`, {
      method: 'POST',
      headers,
      body: formData,
    });

    if (!response.ok) {
      const errorBody: ApiErrorResponse = await response.json().catch(() => ({}));
      throw new ApiError(
        response.status,
        errorBody?.error?.message || 'Upload failed',
        errorBody?.error?.code,
      );
    }

    return response.json();
  },
  put: <T>(endpoint: string, body?: unknown) =>
    apiFetch<T>(endpoint, {
      method: 'PUT',
      body: body ? JSON.stringify(body) : undefined,
    }),
  patch: <T>(endpoint: string, body?: unknown) =>
    apiFetch<T>(endpoint, {
      method: 'PATCH',
      body: body ? JSON.stringify(body) : undefined,
    }),
  delete: <T>(endpoint: string) =>
    apiFetch<T>(endpoint, { method: 'DELETE' }),
};
