import type { ApiResponse, ApiErrorResponse } from '@gestor/types';

const API_BASE = '/api/v1';

function isAuthEndpoint(endpoint: string): boolean {
  return (
    endpoint.startsWith('/auth/admin/login') ||
    endpoint.startsWith('/auth/admin/refresh')
  );
}

async function apiFetch<T>(
  endpoint: string,
  options: RequestInit = {},
): Promise<ApiResponse<T>> {
  const token = localStorage.getItem('admin_accessToken');

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

    const refreshed = await tryRefreshToken();
    if (refreshed) {
      const newToken = localStorage.getItem('admin_accessToken');
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
    localStorage.removeItem('admin_accessToken');
    localStorage.removeItem('admin_refreshToken');
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

let refreshPromise: Promise<boolean> | null = null;

async function tryRefreshToken(): Promise<boolean> {
  const refreshToken = localStorage.getItem('admin_refreshToken');
  if (!refreshToken) return false;
  if (refreshPromise) return refreshPromise;

  refreshPromise = fetch(`${API_BASE}/auth/admin/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    })
    .then(async (res) => {
      if (!res.ok) return false;

      const data: ApiResponse<{ accessToken: string; refreshToken?: string }> = await res.json();
      if (data?.success && data?.data?.accessToken) {
        localStorage.setItem('admin_accessToken', data.data.accessToken);
        if (data.data.refreshToken) {
          localStorage.setItem('admin_refreshToken', data.data.refreshToken);
        }
        return true;
      }
      return false;
    })
    .catch(() => false)
    .finally(() => {
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
    const token = localStorage.getItem('admin_accessToken');
    const response = await fetch(`${API_BASE}${endpoint}`, {
      method: 'POST',
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
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
