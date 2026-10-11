// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import type { ApiResponse, DashboardOperationalDTO } from '@gestor/types';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from '../../lib/api-client';
import { useAuthStore } from '../../stores/auth.store';
import type { TenantOverview } from './useDashboardOverview';
import { useDashboardOverview } from './useDashboardOverview';

const tenant = {
  id: 'tenant-a',
  name: 'Loja A',
  slug: 'loja-a',
  settings: { timezone: 'America/Sao_Paulo', isStorePaused: false },
  operatingHours: [],
} as TenantOverview;

const snapshot: DashboardOperationalDTO = {
  period: { from: '2026-10-10', to: '2026-10-10', timezone: 'America/Sao_Paulo' },
  orders: {
    total: 4,
    byStatus: { pending: 2, confirmed: 0, preparing: 1, ready_for_pickup: 0, ready_for_delivery: 0, out_for_delivery: 0, completed: 1, cancelled: 0, draft: 0 },
    cancelled: 0,
    cancellationRate: 0,
  },
  completedSales: { orderCount: 1, grossOrderTotal: 4500, averageTicket: 4500 },
};

const clients: QueryClient[] = [];

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  clients.push(client);
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

function setSession(permissions: string[], enabledModules?: string[], tenantId = 'tenant-a', userId = 'user-a') {
  useAuthStore.setState({
    user: {
      userId,
      tenantId,
      email: 'operator@example.test',
      name: 'Operador',
      roles: ['staff'],
      permissions,
      enabledModules,
    },
    isAuthenticated: true,
    isLoading: false,
  });
}

function response<T>(data: T): ApiResponse<T> {
  return { success: true, data };
}

function mockRequests() {
  return vi.spyOn(api, 'get').mockImplementation(async <T,>(endpoint: string): Promise<ApiResponse<T>> => {
    if (endpoint === '/tenant/me') return response(tenant) as ApiResponse<T>;
    if (endpoint.startsWith('/dashboard/operational?')) return response(snapshot) as ApiResponse<T>;
    throw new Error(`Unexpected dashboard request: ${endpoint}`);
  });
}

afterEach(async () => {
  cleanup();
  await Promise.all(clients.splice(0).map((client) => client.cancelQueries()));
  vi.restoreAllMocks();
  await act(async () => {
    useAuthStore.setState({ user: null, isAuthenticated: false, isLoading: false });
  });
});

describe('useDashboardOverview operational authorization', () => {
  it('loads real operational KPIs for dashboard.view without requesting restricted analytics', async () => {
    await act(async () => setSession(['dashboard.view']));
    const get = mockRequests();
    const { result } = renderHook(() => useDashboardOverview('today'), { wrapper });

    await waitFor(() => expect(result.current.current).toEqual(snapshot));

    expect(result.current.canReadReports).toBe(false);
    expect(get.mock.calls.map(([endpoint]) => endpoint)).toEqual(expect.arrayContaining([
      '/tenant/me',
      expect.stringMatching(/^\/dashboard\/operational\?from=\d{4}-\d{2}-\d{2}&to=\d{4}-\d{2}-\d{2}$/),
    ]));
    expect(get.mock.calls.some(([endpoint]) => endpoint.startsWith('/analytics/'))).toBe(false);
  });

  it('keeps the reports CTA capability while using the same operational source for authorized users', async () => {
    await act(async () => setSession(['dashboard.view', 'reports.read'], ['reports']));
    const get = mockRequests();
    const { result } = renderHook(() => useDashboardOverview('today'), { wrapper });

    await waitFor(() => expect(result.current.current).toEqual(snapshot));

    expect(result.current.canReadReports).toBe(true);
    expect(get.mock.calls.some(([endpoint]) => endpoint.startsWith('/analytics/'))).toBe(false);
  });

  it('does not use Analytics when reports.read exists but the reports module is unavailable', async () => {
    await act(async () => setSession(['dashboard.view', 'reports.read'], []));
    const get = mockRequests();
    const { result } = renderHook(() => useDashboardOverview('today'), { wrapper });

    await waitFor(() => expect(result.current.current).toEqual(snapshot));

    expect(result.current.canReadReports).toBe(false);
    expect(get.mock.calls.some(([endpoint]) => endpoint.startsWith('/analytics/'))).toBe(false);
  });

  it('does not change the operational request or expose cost data for reports.view_costs', async () => {
    await act(async () => setSession(['dashboard.view', 'reports.view_costs']));
    const get = mockRequests();
    const { result } = renderHook(() => useDashboardOverview('today'), { wrapper });

    await waitFor(() => expect(result.current.current).toEqual(snapshot));

    expect(get.mock.calls.some(([endpoint]) => endpoint.startsWith('/analytics/costs'))).toBe(false);
    expect('costs' in (result.current.current ?? {})).toBe(false);
  });

  it('does not request operational data without dashboard.view', async () => {
    await act(async () => setSession(['reports.read'], ['reports']));
    const get = mockRequests();
    const { result } = renderHook(() => useDashboardOverview('today'), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(get.mock.calls.some(([endpoint]) => endpoint.startsWith('/dashboard/operational'))).toBe(false);
  });

  it('does not reuse an operational query after a tenant or user switch', async () => {
    await act(async () => setSession(['dashboard.view']));
    const get = mockRequests();
    const { result } = renderHook(() => useDashboardOverview('today'), { wrapper });

    await waitFor(() => expect(result.current.current).toEqual(snapshot));
    await act(async () => setSession(['dashboard.view'], undefined, 'tenant-b', 'user-b'));

    await waitFor(() => expect(get.mock.calls.filter(([endpoint]) => endpoint.startsWith('/dashboard/operational')).length).toBe(2));
  });

  it('keeps an operational API failure distinct from an empty operational result', async () => {
    await act(async () => setSession(['dashboard.view']));
    vi.spyOn(api, 'get').mockImplementation(async <T,>(endpoint: string): Promise<ApiResponse<T>> => {
      if (endpoint === '/tenant/me') return response(tenant) as ApiResponse<T>;
      throw new Error('Operational API unavailable');
    });
    const { result } = renderHook(() => useDashboardOverview('today'), { wrapper });

    await waitFor(() => expect(result.current.hasOperationalError).toBe(true), { timeout: 3_000 });

    expect(result.current.current).toBeNull();
  });
});
