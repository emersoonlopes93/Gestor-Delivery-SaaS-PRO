// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { type PropsWithChildren } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  useConnectMarketplaceManual,
  useReconnectMarketplace,
  useStartFood99SelfServiceAuthorization,
  useVerifyFood99SelfServiceAuthorization,
} from './hooks';

function wrapper({ children }: PropsWithChildren) {
  return <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })}>{children}</QueryClientProvider>;
}

describe('marketplace mutation HTTP methods', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('sends Verify authorization as POST, never a browser GET', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ success: true, data: { authorized: true, connection: { id: 'connection-99' } } }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const { result } = renderHook(() => useVerifyFood99SelfServiceAuthorization(), { wrapper });

    result.current.mutate({ connectionId: 'connection-99' });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, request] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toMatch(/\/api\/v1\/marketplaces\/99food\/self-service\/verify$/);
    expect(request.method).toBe('POST');
    expect(fetchMock.mock.calls.some(([calledUrl, calledRequest]) => String(calledUrl).includes('/self-service/verify') && (calledRequest as RequestInit).method === 'GET')).toBe(false);
  });

  it('sends manual reconnect as POST, never a browser GET', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ success: true, data: { id: 'connection-99' } }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const { result } = renderHook(() => useReconnectMarketplace(), { wrapper });

    result.current.mutate('connection-99');
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, request] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toMatch(/\/api\/v1\/marketplaces\/connections\/connection-99\/connect\/manual$/);
    expect(request.method).toBe('POST');
  });

  it('sends the explicit manual 99Food support payload with POST', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ success: true, data: { id: 'connection-99' } }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const { result } = renderHook(() => useConnectMarketplaceManual('99food'), { wrapper });

    result.current.mutate({ externalMerchantId: '1152921645439779073', externalStoreId: 'connection-99', displayName: 'Loja suporte' });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, request] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toMatch(/\/api\/v1\/marketplaces\/99food\/connect\/manual$/);
    expect(request.method).toBe('POST');
    expect(String(request.body)).toContain('1152921645439779073');
  });

  it('starts self-service authorization without calling the manual endpoint', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ success: true, data: { authorizationUrl: 'https://auth.99food.test', connection: { id: 'connection-99' } } }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const { result } = renderHook(() => useStartFood99SelfServiceAuthorization(), { wrapper });

    result.current.mutate({ connectionId: 'connection-99', createNew: false });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, request] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toMatch(/\/api\/v1\/marketplaces\/99food\/self-service\/authorization$/);
    expect(url).not.toContain('/connect/manual');
    expect(request.method).toBe('POST');
  });
});
