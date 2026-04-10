import type { ApiResponse, ApiErrorResponse } from '@gestor/types';

const API_BASE = '/api/v1';

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
  const token = localStorage.getItem('accessToken');

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
        throw new ApiError(retryResponse.status, 'Request failed after refresh');
      }
      return retryResponse.json();
    }
    // Refresh failed — clear local auth and let the UI decide redirection
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
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

async function tryRefreshToken(): Promise<boolean> {
  const refreshToken = localStorage.getItem('refreshToken');
  if (!refreshToken) return false;

  try {
    const res = await fetch(`${API_BASE}/auth/tenant/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });

    if (!res.ok) return false;

    const data: ApiResponse<{ accessToken: string }> = await res.json();
    if (data?.success && data?.data?.accessToken) {
      localStorage.setItem('accessToken', data.data.accessToken);
      return true;
    }
    return false;
  } catch {
    return false;
  }
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
