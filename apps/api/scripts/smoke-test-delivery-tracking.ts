export {};

declare const process: {
  env: Record<string, string | undefined>;
  exit: (code?: number) => void;
};

const API = process.env.SMOKE_API_BASE_URL ?? 'http://localhost:3333/api/v1';
const TENANT_SLUG = process.env.SMOKE_TENANT_SLUG ?? 'pizzaria-demo';
const TENANT_EMAIL = process.env.SMOKE_TENANT_EMAIL ?? 'demo@demo.com';
const TENANT_PASSWORD = process.env.SMOKE_TENANT_PASSWORD ?? 'demo123';

interface TestResult {
  name: string;
  passed: boolean;
  detail: string;
}

const results: TestResult[] = [];

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function pickString(obj: Record<string, unknown>, key: string): string | null {
  const v = obj[key];
  return typeof v === 'string' ? v : null;
}

function pickNumber(obj: Record<string, unknown>, key: string): number | null {
  const v = obj[key];
  return typeof v === 'number' ? v : null;
}

async function api(method: string, path: string, body?: unknown, token?: string) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${API}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const rawData: unknown = await res.json().catch(() => ({}));

  const data =
    typeof rawData === 'object' &&
    rawData !== null &&
    'success' in rawData &&
    'data' in rawData
      ? (rawData as { data: unknown }).data
      : rawData;

  return { status: res.status, data };
}

function assert(name: string, condition: boolean, detail: string, data?: unknown) {
  const fullDetail = data ? `${detail} | Payload: ${JSON.stringify(data)}` : detail;
  results.push({ name, passed: condition, detail: fullDetail });
  console.log(condition ? `  ✅ ${name}` : `  ❌ ${name}: ${fullDetail}`);
}

async function getTenantToken(): Promise<string> {
  const { data } = await api('POST', '/auth/tenant/login', {
    email: TENANT_EMAIL,
    password: TENANT_PASSWORD,
    tenantSlug: TENANT_SLUG,
  });

  const obj = asRecord(data);
  const accessToken = obj ? (obj.accessToken ?? obj.access_token) : null;
  return typeof accessToken === 'string' ? accessToken : '';
}

function pickFirstProductIdWithoutRequiredComplements(storefront: unknown): string | null {
  const s = asRecord(storefront);
  const categories = s ? asArray(s.categories) : [];

  for (const cat of categories) {
    const catRec = asRecord(cat);
    const products = catRec ? asArray(catRec.products) : [];

    for (const p of products) {
      const pRec = asRecord(p);
      if (!pRec) continue;

      const complements = asArray(pRec.complements);
      const hasRequiredComplementGroup = complements.some((g) => {
        const gRec = asRecord(g);
        return gRec?.isRequired === true;
      });

      if (!hasRequiredComplementGroup) {
        const productId = pickString(pRec, 'id');
        if (productId) return productId;
      }
    }
  }

  return null;
}

async function main() {
  console.log('🧪 Smoke Test — Delivery Tracking');
  console.log('='.repeat(60));

  const token = await getTenantToken();
  assert('Tenant auth login', !!token, 'Token is empty');
  if (!token) process.exit(1);

  const { data: storefront } = await api('GET', `/public/storefront/${TENANT_SLUG}`);
  const productId = pickFirstProductIdWithoutRequiredComplements(storefront);
  assert('Storefront provides productId', typeof productId === 'string' && !!productId, 'No product found');
  if (!productId) process.exit(1);

  const customerPhone = `1199999${Math.floor(Math.random() * 9000 + 1000)}`;

  const { status: checkoutStatus, data: orderData } = await api('POST', `/orders/public-checkout/${TENANT_SLUG}`, {
    idempotencyKey: `test-delivery-tracking-${Date.now()}`,
    items: [{
      lineType: 'product',
      productId,
      quantity: 1,
      complements: [],
    }],
    customerName: 'Smoke Test Tracking',
    customerPhone,
    fulfillmentType: 'delivery',
    deliveryAddress: {
      street: 'Rua Tracking',
      number: '10',
      neighborhood: 'Centro',
      city: 'São Paulo',
      state: 'SP',
      zipCode: '01001000',
      lat: -23.5614,
      lng: -46.6559,
    },
    payment: { method: 'pix' },
  });

  assert('Delivery checkout creates order', checkoutStatus === 201 || checkoutStatus === 200, `Status: ${checkoutStatus}`, orderData);
  const order = asRecord(orderData);
  const orderId = order ? pickString(order, 'id') : null;
  assert('Order has id', typeof orderId === 'string' && !!orderId, `Got: ${String(orderId)}`);
  if (!orderId) process.exit(1);

  const { status: listDriversStatus, data: driversData } = await api('GET', '/delivery/drivers', undefined, token);
  assert('List drivers', listDriversStatus === 200, `Status: ${listDriversStatus}`, driversData);

  let driversArr = asArray(driversData);
  let firstDriver: Record<string, unknown> | null = null;
  let driverId = firstDriver ? pickString(firstDriver, 'id') : null;
  const { status: createDriverStatus, data: createDriverData } = await api('POST', '/delivery/drivers', {
    name: 'Smoke Entregador',
    phone: `1198888${Date.now().toString().slice(-8)}`,
    vehicleType: 'motorcycle',
  }, token);
  assert('Create smoke driver', createDriverStatus === 200 || createDriverStatus === 201, `Status: ${createDriverStatus}`, createDriverData);
  driversArr = [createDriverData, ...driversArr];
  firstDriver = asRecord(driversArr[0]);
  driverId = firstDriver ? pickString(firstDriver, 'id') : null;
  assert('Has at least one driver', typeof driverId === 'string' && !!driverId, 'No driver in seed');
  if (!driverId) process.exit(1);

  const { status: activateDriverStatus, data: activateDriverData } = await api('PATCH', `/delivery/drivers/${driverId}`, {
    isActive: true,
    status: 'available',
  }, token);
  assert('Activate smoke driver', activateDriverStatus === 200, `Status: ${activateDriverStatus}`, activateDriverData);

  const { status: assignStatus, data: assignData } = await api('POST', `/orders/${orderId}/assign-driver`, { driverId }, token);
  assert('Assign driver', assignStatus === 200 || assignStatus === 201, `Status: ${assignStatus}`, assignData);

  for (const status of ['confirmed', 'preparing', 'ready_for_delivery']) {
    const { status: transitionStatus } = await api('PATCH', `/orders/${orderId}/status`, { status }, token);
    assert(`Update status to ${status}`, transitionStatus === 200, `Status: ${transitionStatus}`);
  }

  const { status: updateStatusStatus } = await api('PATCH', `/orders/${orderId}/status`, { status: 'out_for_delivery' }, token);
  assert('Update status to out_for_delivery', updateStatusStatus === 200, `Status: ${updateStatusStatus}`);

  const { status: locationStatus, data: locationData } = await api('POST', `/delivery/drivers/${driverId}/location`, { lat: -23.561684, lng: -46.625378 }, token);
  assert('Update driver location', locationStatus === 200 || locationStatus === 201, `Status: ${locationStatus}`, locationData);

  // Obter publicTrackingToken do pedido criado
  const { status: orderDetailStatus, data: orderDetailData } = await api('GET', `/orders/${orderId}`, undefined, token);
  assert('Get order detail for token', orderDetailStatus === 200, `Status: ${orderDetailStatus}`, orderDetailData);
  const orderDetail = asRecord(orderDetailData);
  const publicToken = orderDetail ? pickString(orderDetail, 'publicTrackingToken') : null;
  assert('Order has publicTrackingToken', typeof publicToken === 'string' && !!publicToken, `Token: ${String(publicToken)}`);
  if (!publicToken) process.exit(1);

  const { status: trackingStatus, data: trackingData } = await api('GET', `/public/orders/${publicToken}/tracking`);
  assert('Public tracking returns 200', trackingStatus === 200, `Status: ${trackingStatus}`, trackingData);

  const tracking = asRecord(trackingData);
  const driverLoc = tracking ? asRecord(tracking.driverLocation) : null;
  assert('Tracking contains driverLocation', !!driverLoc && pickNumber(driverLoc, 'lat') !== null && pickNumber(driverLoc, 'lng') !== null, 'driverLocation missing', trackingData);

  const { status: trackingWrongTokenStatus } = await api('GET', '/public/orders/TOKEN_INVALIDO/tracking');
  assert('Wrong token returns 404', trackingWrongTokenStatus === 404, `Status: ${trackingWrongTokenStatus}`);

  console.log('='.repeat(60));
  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  console.log(`Results: ${passed} passed, ${failed} failed, ${results.length} total`);

  process.exit(failed > 0 ? 1 : 0);
}

main();
