class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();
  get length() { return this.values.size; }
  clear() { this.values.clear(); }
  getItem(key: string) { return this.values.get(key) ?? null; }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
  removeItem(key: string) { this.values.delete(key); }
  setItem(key: string, value: string) { this.values.set(key, value); }
}

const customer = {
  id: 'customer-1',
  tenantId: 'tenant-1',
  name: 'Cliente',
  phone: '5511999999999',
};

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function loadModules() {
  vi.resetModules();
  vi.stubGlobal('localStorage', new MemoryStorage());
  const storeModule = await import('../store/useCustomerStore');
  const clientModule = await import('./api-client');
  storeModule.useCustomerStore.getState().setCustomer(
    customer as never,
    'access-old',
    'refresh-old',
    'loja-a',
  );
  return { ...storeModule, ...clientModule };
}

describe('customer storefront session transport', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('uses one single-flight refresh for concurrent 401 responses', async () => {
    const modules = await loadModules();
    let refreshCalls = 0;
    let protectedCalls = 0;
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/otp/refresh')) {
        refreshCalls += 1;
        await Promise.resolve();
        return jsonResponse({ data: {
          customer,
          accessToken: 'access-new',
          refreshToken: 'refresh-new',
        } });
      }
      protectedCalls += 1;
      const authorization = new Headers(init?.headers).get('Authorization');
      return authorization === 'Bearer access-new'
        ? jsonResponse({ data: { ok: true } })
        : jsonResponse({ error: { message: 'expired' } }, 401);
    }));

    await Promise.all([
      modules.api.get('/public/customer-profile'),
      modules.api.get('/public/orders/history'),
      modules.api.get('/public/customer/wallet'),
    ]);

    expect(refreshCalls).toBe(1);
    expect(protectedCalls).toBe(6);
    expect(modules.useCustomerStore.getState()).toEqual(expect.objectContaining({
      accessToken: 'access-new',
      refreshToken: 'refresh-new',
      isLoggedIn: true,
    }));
  });

  it('retries a request only once and clears credentials after the retry is still unauthorized', async () => {
    const modules = await loadModules();
    let refreshCalls = 0;
    let protectedCalls = 0;
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).endsWith('/otp/refresh')) {
        refreshCalls += 1;
        return jsonResponse({ data: { customer, accessToken: 'access-new', refreshToken: 'refresh-new' } });
      }
      protectedCalls += 1;
      return jsonResponse({ error: { message: 'unauthorized' } }, 401);
    }));

    await expect(modules.api.get('/public/customer-profile')).rejects.toEqual(expect.objectContaining({ status: 401 }));
    expect(refreshCalls).toBe(1);
    expect(protectedCalls).toBe(2);
    expect(modules.useCustomerStore.getState().isLoggedIn).toBe(false);
  });

  it('clears credentials without a loop when refresh fails', async () => {
    const modules = await loadModules();
    let calls = 0;
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      calls += 1;
      return String(input).endsWith('/otp/refresh')
        ? jsonResponse({ error: { message: 'invalid refresh' } }, 401)
        : jsonResponse({ error: { message: 'expired' } }, 401);
    }));

    await expect(modules.api.get('/public/orders/history')).rejects.toEqual(expect.objectContaining({ status: 401 }));
    expect(calls).toBe(2);
    expect(modules.useCustomerStore.getState()).toEqual(expect.objectContaining({
      accessToken: null,
      refreshToken: null,
      isLoggedIn: false,
    }));
  });

  it('revokes the old tenant session before switching tenant', async () => {
    const modules = await loadModules();
    const fetchMock = vi.fn(async () => jsonResponse({ data: { revoked: true } }));
    vi.stubGlobal('fetch', fetchMock);

    await modules.switchCustomerTenant('loja-b');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toContain('/public/auth/loja-a/otp/logout');
    expect(modules.useCustomerStore.getState()).toEqual(expect.objectContaining({
      tenantSlug: 'loja-b',
      accessToken: null,
      refreshToken: null,
      isLoggedIn: false,
    }));
  });

  it('does not clear cart or address draft storage when login state changes', async () => {
    const modules = await loadModules();
    localStorage.setItem('cart-storage', 'cart-preserved');
    localStorage.setItem('checkout:address-draft', 'address-preserved');

    modules.useCustomerStore.getState().setCustomer(
      customer as never,
      'access-new',
      'refresh-new',
      'loja-a',
    );

    expect(localStorage.getItem('cart-storage')).toBe('cart-preserved');
    expect(localStorage.getItem('checkout:address-draft')).toBe('address-preserved');
  });
});
