import type { ApiResponse, ApiErrorResponse } from '@gestor/types';

const API_BASE = '/api/v1';

/**
 * Typed fetch wrapper for Public Storefront API calls.
 */
async function apiFetch<T>(
  endpoint: string,
  options: RequestInit = {},
): Promise<ApiResponse<T>> {
  // Get token from storage (using the key defined in useCustomerStore)
  const customerStorage = localStorage.getItem('customer-storage');
  let token = null;
  if (customerStorage) {
    try {
      const parsed = JSON.parse(customerStorage);
      token = parsed.state.accessToken;
    } catch (e) {
      // Ignore parsing errors for malformed storage
    }
  }

  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
    ...options.headers,
  };

  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
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

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
    public details?: any,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export const api = {
  get: <T>(endpoint: string, options: RequestInit & { params?: Record<string, any> } = {}) => {
    let url = endpoint;
    if (options.params) {
      const searchParams = new URLSearchParams();
      Object.entries(options.params).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          searchParams.append(key, String(value));
        }
      });
      const qs = searchParams.toString();
      if (qs) {
        url += (url.includes('?') ? '&' : '?') + qs;
      }
    }
    return apiFetch<T>(url, options);
  },
  post: <T>(endpoint: string, body?: unknown) =>
    apiFetch<T>(endpoint, {
      method: 'POST',
      body: body ? JSON.stringify(body) : undefined,
    }),
  patch: <T>(endpoint: string, body?: unknown) =>
    apiFetch<T>(endpoint, {
      method: 'PATCH',
      body: body ? JSON.stringify(body) : undefined,
    }),
};
