const API = 'http://localhost:3333/api/v1';
const TENANT_SLUG = 'pizzaria-demo';

async function api(method: string, path: string, body?: unknown, token?: string) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  
  const res = await fetch(`${API}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  
  const rawData: unknown = await res.json().catch(() => ({}));
  if (res.status >= 400) {
    console.log(`DEBUG ERROR: ${method} ${path} -> Status ${res.status}`, JSON.stringify(rawData, null, 2));
  }
  const data =
    typeof rawData === 'object' &&
    rawData !== null &&
    'success' in rawData &&
    'data' in rawData
      ? (rawData as { data: unknown }).data
      : rawData;
  return { status: res.status, data };
}

async function getTenantToken(): Promise<string> {
  const { data } = await api('POST', '/auth/tenant/login', {
    email: 'owner@pizzariademo.com',
    password: 'Owner@123',
    tenantSlug: TENANT_SLUG,
  });
  return data.accessToken || data.access_token || '';
}

async function main() {
  const token = await getTenantToken();
  const { data: storefront } = await api('GET', `/public/storefront/${TENANT_SLUG}`);
  const product = storefront.categories[0].products[0];

  console.log('--- RUNNING ISOLATION TEST ---');
  const { status: orderStatus, data: order } = await api('POST', `/orders/public-checkout/${TENANT_SLUG}`, {
    idempotencyKey: `test-isolation-${Date.now()}`,
    items: [{
      lineType: 'product',
      productId: product.id,
      quantity: 1,
      complements: [],
    }],
    customerName: 'Isolation Test',
    customerPhone: '11999990007',
    fulfillmentType: 'pickup',
  });

  console.log('Order creation status:', orderStatus);
  console.log('Order data:', JSON.stringify(order, null, 2));
}

main();
