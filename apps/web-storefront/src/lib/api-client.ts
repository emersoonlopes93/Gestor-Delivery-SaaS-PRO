import type { ApiErrorResponse, ApiResponse, CustomerDTO, CustomerLoginResponse } from '@gestor/types';
import { useCustomerStore } from '../store/useCustomerStore';

const API_BASE = (
  import.meta.env.VITE_API_URL
  || import.meta.env.VITE_API_BASE_URL
  || '/api/v1'
).replace(/\/$/, '');

let refreshPromise: Promise<boolean> | null = null;

async function apiFetch<T>(
  endpoint: string,
  options: RequestInit = {},
  mayRetryAfterRefresh = true,
): Promise<ApiResponse<T>> {
  const token = useCustomerStore.getState().accessToken;
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...options.headers,
  };

  const response = await fetch(`${API_BASE}${endpoint}`, { ...options, headers });

  if (
    response.status === 401
    && mayRetryAfterRefresh
    && shouldAttemptRefresh(endpoint)
    && useCustomerStore.getState().refreshToken
  ) {
    const refreshed = await refreshCustomerSession();
    if (refreshed) return apiFetch<T>(endpoint, options, false);
  }

  if (!response.ok) {
    if (response.status === 401 && !mayRetryAfterRefresh) {
      useCustomerStore.getState().logout();
    }
    const errorBody: ApiErrorResponse = await response.json().catch(() => ({}));
    throw new ApiError(
      response.status,
      errorBody?.error?.message || 'Request failed',
      errorBody?.error?.code,
      errorBody?.error?.details,
    );
  }

  return response.json();
}

function shouldAttemptRefresh(endpoint: string): boolean {
  return !/\/otp\/(send|validate|google|refresh)$/.test(endpoint);
}

export async function refreshCustomerSession(): Promise<boolean> {
  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
    const state = useCustomerStore.getState();
    if (!state.refreshToken || !state.tenantSlug) return false;

    try {
      const response = await fetch(`${API_BASE}/public/auth/${state.tenantSlug}/otp/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: state.refreshToken }),
      });
      if (!response.ok) throw new Error('Customer refresh failed');

      const result = await response.json() as ApiResponse<CustomerLoginResponse>;
      const current = useCustomerStore.getState();
      if (current.tenantSlug !== state.tenantSlug) return false;
      current.setCustomer(
        result.data.customer as CustomerDTO,
        result.data.accessToken,
        result.data.refreshToken,
        state.tenantSlug,
      );
      return true;
    } catch {
      useCustomerStore.getState().logout();
      return false;
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

export async function bootstrapCustomerSession(): Promise<void> {
  const state = useCustomerStore.getState();
  if (!state.accessToken || !state.refreshToken || !state.tenantSlug) {
    if (state.accessToken || state.refreshToken || state.customer) state.logout();
    return;
  }

  try {
    const response = await api.get<CustomerDTO>(`/public/auth/${state.tenantSlug}/otp/me`);
    const current = useCustomerStore.getState();
    if (current.tenantSlug !== state.tenantSlug) return;
    current.setCustomer(
      response.data,
      current.accessToken,
      current.refreshToken,
      state.tenantSlug,
    );
  } catch {
    useCustomerStore.getState().logout();
  }
}

export async function logoutCustomerSession(): Promise<void> {
  const state = useCustomerStore.getState();
  try {
    if (state.accessToken && state.tenantSlug) {
      await api.post(`/public/auth/${state.tenantSlug}/otp/logout`);
    }
  } catch {
    // Local credentials are always cleared even if the server is unavailable.
  } finally {
    useCustomerStore.getState().logout();
  }
}

export async function switchCustomerTenant(nextTenantSlug: string): Promise<void> {
  const state = useCustomerStore.getState();
  if (state.tenantSlug && state.tenantSlug !== nextTenantSlug && state.accessToken) {
    await logoutCustomerSession();
  }
  useCustomerStore.getState().setTenantSlug(nextTenantSlug);
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
    public details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export const api = {
  get: <T>(
    endpoint: string,
    options: RequestInit & {
      params?: Record<string, string | number | boolean | undefined | null>;
    } = {},
  ) => {
    let url = endpoint;
    if (options.params) {
      const searchParams = new URLSearchParams();
      Object.entries(options.params).forEach(([key, value]) => {
        if (value !== undefined && value !== null) searchParams.append(key, String(value));
      });
      const query = searchParams.toString();
      if (query) url += (url.includes('?') ? '&' : '?') + query;
    }
    return apiFetch<T>(url, options);
  },
  post: <T>(endpoint: string, body?: unknown) => apiFetch<T>(endpoint, {
    method: 'POST',
    body: body ? JSON.stringify(body) : undefined,
  }),
  patch: <T>(endpoint: string, body?: unknown) => apiFetch<T>(endpoint, {
    method: 'PATCH',
    body: body ? JSON.stringify(body) : undefined,
  }),
};
