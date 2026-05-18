
const API = 'http://localhost:3333/api/v1';
const TENANT_SLUG = 'pizzaria-demo';
const TENANT_EMAIL = 'owner@pizzariademo.com';
const TENANT_PASSWORD = 'Owner@123';

async function api(method: string, path: string, body?: any, token?: string) {
  const headers: any = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  
  const res = await fetch(`${API}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  
  const rawData = await res.json().catch(() => ({}));
  const data = (rawData as any).data || rawData;
  return { status: res.status, data, raw: rawData };
}

async function getTenantToken() {
  const { data } = await api('POST', '/auth/tenant/login', {
    email: TENANT_EMAIL,
    password: TENANT_PASSWORD,
    tenantSlug: TENANT_SLUG,
  });
  return data?.accessToken;
}

async function runValidation() {
  console.log('🚀 Iniciando Validação Final E2E do Checkout (DEBUG)\n');
  
  const token = await getTenantToken();
  if (!token) {
    console.error('❌ Falha ao obter token de acesso do tenant');
    return;
  }

  const { data: storefront } = await api('GET', `/public/storefront/${TENANT_SLUG}`);
  const simpleProduct = storefront.categories[0].products[0];

  console.log('\n--- DEBUG Cenário 2: Delivery ---');
  const payload2 = {
    idempotencyKey: `val-delivery-debug-${Date.now()}`,
    items: [{ lineType: 'product', productId: simpleProduct.id, quantity: 1, complements: [] }],
    customerName: 'Cliente Delivery',
    customerPhone: '11999992222',
    fulfillmentType: 'delivery',
    deliveryAddress: {
      street: 'Av Paulista',
      number: '1000',
      neighborhood: 'Bela Vista',
      city: 'São Paulo',
      state: 'SP',
      zipCode: '01310100',
      lat: -23.5614,
      lng: -46.6559,
    },
    payment: { method: 'cash', changeFor: 100 },
  };
  const res2 = await api('POST', `/orders/public-checkout/${TENANT_SLUG}`, payload2);
  console.log(`Status: ${res2.status}`);
  if (res2.status >= 400) {
    console.log('Erro:', JSON.stringify(res2.raw, null, 2));
  }

  console.log('\n--- DEBUG Cenário 6: PIX Config ---');
  const { data: settings } = await api('GET', '/settings/tenant', undefined, token);
  console.log('Métodos de pagamento aceitos:', settings?.paymentMethods);

  console.log('\n🏁 Fim do Debug');
}

runValidation();
