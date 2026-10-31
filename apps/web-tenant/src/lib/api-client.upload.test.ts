import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from './api-client';

const storage = new Map<string, string>();
Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key),
    clear: () => storage.clear(),
  },
});

function token(exp: number, label: string) {
  const payload = btoa(JSON.stringify({ exp, label }))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
  return `header.${payload}.signature`;
}

describe('api.upload', () => {
  beforeEach(() => {
    storage.clear();
    storage.set('accessToken', token(Math.floor(Date.now() / 1000) + 3_600, 'old'));
    storage.set('refreshToken', 'refresh-token');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('refreshes an authenticated session after a 401 and retries the same upload once', async () => {
    const renewedToken = token(Math.floor(Date.now() / 1000) + 3_600, 'new');
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: { message: 'Unauthorized' } }), { status: 401 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        success: true,
        data: { accessToken: renewedToken },
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        success: true,
        data: { id: 'asset-1' },
      }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const formData = new FormData();
    formData.set('file', new File(['image'], 'produto.png', { type: 'image/png' }));

    const response = await api.upload<{ id: string }>('/media/upload', formData);

    expect(response.data.id).toBe('asset-1');
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[0]?.[1]?.body).toBe(formData);
    expect(fetchMock.mock.calls[2]?.[1]?.body).toBe(formData);
    expect(fetchMock.mock.calls[2]?.[1]?.headers).toEqual({ Authorization: `Bearer ${renewedToken}` });
  });
});
