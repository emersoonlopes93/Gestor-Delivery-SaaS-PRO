const API = process.env.SMOKE_API_BASE_URL ?? 'http://localhost:3333/api/v1';
const TENANT_SLUG = process.env.SMOKE_TENANT_SLUG ?? 'pizzaria-demo';
const TENANT_EMAIL = process.env.SMOKE_TENANT_EMAIL ?? 'owner@pizzariademo.com';
const TENANT_PASSWORD = process.env.SMOKE_TENANT_PASSWORD ?? 'Owner@123';

type ApiResult = { status: number; data: unknown; raw: unknown };

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null ? value as Record<string, unknown> : null;
}

function pickString(value: unknown, key: string): string | null {
  const record = asRecord(value);
  const item = record?.[key];
  return typeof item === 'string' ? item : null;
}

async function api(method: string, path: string, body?: unknown, token?: string): Promise<ApiResult> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(`${API}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const raw: unknown = await response.json().catch(() => ({}));
  const data = asRecord(raw)?.data ?? raw;
  return { status: response.status, data, raw };
}

function assert(condition: boolean, detail: string, payload?: unknown): void {
  if (condition) {
    process.stdout.write(`  OK  ${detail}\n`);
    return;
  }
  process.stderr.write(`  ERR ${detail}${payload ? ` | Payload: ${JSON.stringify(payload)}` : ''}\n`);
  process.exitCode = 1;
}

async function main(): Promise<void> {
  process.stdout.write('SMOKE COMBO BUNDLE (current catalog contract)\n');
  const login = await api('POST', '/auth/tenant/login', { email: TENANT_EMAIL, password: TENANT_PASSWORD, tenantSlug: TENANT_SLUG });
  const token = pickString(login.data, 'accessToken');
  assert(login.status >= 200 && login.status < 300 && Boolean(token), 'tenant login', login.raw);
  if (!token) return;

  const products = await api('GET', '/catalog/products', undefined, token);
  const firstProduct = Array.isArray(products.data) ? asRecord(products.data[0]) : null;
  const productId = pickString(firstProduct, 'id');
  assert(products.status === 200 && Boolean(productId), 'catalog product available for bundle', products.raw);
  if (!productId) return;

  const combo = await api('POST', '/catalog/products', {
    name: `Smoke Bundle Combo ${Date.now()}`,
    shortDescription: 'Disposable smoke combo',
    basePrice: 49.9,
    type: 'combo',
    comboMode: 'bundle',
    comboPricingType: 'fixed_price',
    comboPricingValue: 49.9,
    isActive: true,
  }, token);
  const comboId = pickString(combo.data, 'id');
  assert(combo.status === 201 && Boolean(comboId), 'POST /catalog/products creates bundle combo', combo.raw);
  if (!comboId) return;

  const item = await api('POST', `/catalog/products/${comboId}/bundle-items`, { productId, qty: 1, sortOrder: 0 }, token);
  const itemId = pickString(item.data, 'id');
  assert(item.status === 201 && Boolean(itemId), 'POST bundle-items creates tenant-scoped item', item.raw);
  if (!itemId) return;

  const updated = await api('PATCH', `/catalog/products/${comboId}/bundle-items/${itemId}`, { qty: 2, sortOrder: 1 }, token);
  assert(updated.status === 200, 'PATCH bundle-item updates item', updated.raw);

  const list = await api('GET', `/catalog/products/${comboId}/bundle-items`, undefined, token);
  assert(list.status === 200 && Array.isArray(list.data) && list.data.some((entry) => pickString(entry, 'id') === itemId), 'GET bundle-items returns created item', list.raw);

  const removed = await api('DELETE', `/catalog/products/${comboId}/bundle-items/${itemId}`, undefined, token);
  assert(removed.status === 200, 'DELETE bundle-item removes item', removed.raw);

  const deletedCombo = await api('DELETE', `/catalog/products/${comboId}`, undefined, token);
  assert(deletedCombo.status === 200, 'DELETE bundle combo removes disposable product', deletedCombo.raw);
}

main().catch((error: unknown) => {
  process.stderr.write(`SMOKE COMBO BUNDLE crashed: ${String(error)}\n`);
  process.exitCode = 1;
});
