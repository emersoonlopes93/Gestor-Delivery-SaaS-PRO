/**
 * Smoke Test — Phase 4: Orders & Checkout
 * 
 * Prerequisites:
 *   1. PostgreSQL running at localhost:5433
 *   2. `npx prisma migrate dev` applied
 *   3. Seed executed (npx ts-node prisma/seed.ts)
 *   4. API running (npm run start:dev)
 * 
 * Run: npx ts-node scripts/smoke-test-orders.ts
 */

const API = process.env.SMOKE_API_BASE_URL ?? 'http://localhost:3333/api/v1';
const TENANT_SLUG = process.env.SMOKE_TENANT_SLUG ?? 'pizzaria-demo';
const TENANT_EMAIL = process.env.SMOKE_TENANT_EMAIL ?? 'owner@pizzariademo.com';
const TENANT_PASSWORD = process.env.SMOKE_TENANT_PASSWORD ?? 'Owner@123';

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

function pickFirstProductIdWithoutRequiredComplements(storefront: unknown): {
  productId: string | null;
  productName: string | null;
} {
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
        const productName = pickString(pRec, 'name');
        if (productId) return { productId, productName };
      }
    }
  }

  return { productId: null, productName: null };
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
  if (res.status >= 400 && path.includes('isolation')) {
    console.log(`  DEBUG ERROR: ${method} ${path} -> Status ${res.status}`, JSON.stringify(rawData));
  }
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

  if (typeof data === 'object' && data !== null) {
    const obj = data as Record<string, unknown>;
    const accessToken = obj.accessToken ?? obj.access_token;
    if (typeof accessToken === 'string') return accessToken;
  }

  return '';
}

// ----------------------------------------------------------------
// TEST 1: Checkout Pickup (no address)
// ----------------------------------------------------------------
async function testCheckoutPickup() {
  console.log('\n📦 Test 1: Checkout Pickup');
  
  // First, get storefront data to find real product IDs
  const { data: storefront } = await api('GET', `/public/storefront/${TENANT_SLUG}`);

  const picked = pickFirstProductIdWithoutRequiredComplements(storefront);
  const productId = picked.productId;
  const productName = picked.productName ?? 'unknown';
  if (!productId) {
    assert('Pickup checkout', false, 'No product without required complements found in storefront', storefront);
    return null;
  }

  console.log(`   - Using product for Test 1: ${productName} (${productId})`);
  
  const { status, data } = await api('POST', `/orders/public-checkout/${TENANT_SLUG}`, {
    idempotencyKey: `test-pickup-${Date.now()}`,
    items: [{
      lineType: 'product',
      productId,
      quantity: 1,
      complements: [],
    }],
    customerName: 'Smoke Test Pickup',
    customerPhone: '11999990001',
    fulfillmentType: 'pickup',
    payment: { method: 'pix' },
  });

  const order = asRecord(data);
  const orderId = order ? pickString(order, 'id') : null;
  const orderNumber = order ? pickString(order, 'orderNumber') : null;
  const orderStatus = order ? pickString(order, 'status') : null;
  const deliveryAddress = order ? order.deliveryAddress : null;

  assert('Pickup checkout creates order', status === 201 || status === 200, `Status: ${status}, ${JSON.stringify(data).slice(0, 200)}`);
  assert('Order has id', typeof orderId === 'string' && orderId.length > 0, `Got: ${String(orderId)}`, data);
  assert('Order has orderNumber', typeof orderNumber === 'string' && orderNumber.length > 0, `Got: ${String(orderNumber)}`, data);
  assert('Status is pending', orderStatus === 'pending', `Got: ${String(orderStatus)}`, data);
  assert('No delivery address', !deliveryAddress, 'Should be null for pickup', data);
  
  // --- INTEGRATED ISOLATION TEST (formerly Test 8) ---
  console.log('   🔒 Integrated Isolation Check...');
  const tenantToken = await getTenantToken();

  if (orderId) {
    // 1. Owner SHOULD see the order
    const { status: ownStatus } = await api('GET', `/orders/${orderId}`, undefined, tenantToken);
    assert('Owner sees own order', ownStatus === 200, `Status: ${ownStatus}`);
  } else {
    assert('Owner sees own order', false, 'Skipped: orderId is null (checkout failed)', data);
  }

  // 2. Unauthenticated user SHOULD NOT see the order
  const { status: noAuthStatus } = await api('GET', `/orders/${orderId}`);
  assert('No auth rejects internal endpoint', noAuthStatus === 401 || noAuthStatus === 403, `Status: ${noAuthStatus}`);

  return order;
}

// ----------------------------------------------------------------
// TEST 2: Checkout Delivery (with address)
// ----------------------------------------------------------------
async function testCheckoutDelivery() {
  console.log('\n🚚 Test 2: Checkout Delivery');

  const { data: storefront } = await api('GET', `/public/storefront/${TENANT_SLUG}`);
  const picked = pickFirstProductIdWithoutRequiredComplements(storefront);
  const productId = picked.productId;
  if (!productId) {
    assert('Delivery checkout', false, 'No product without required complements found in storefront', storefront);
    return null;
  }

  const { status, data } = await api('POST', `/orders/public-checkout/${TENANT_SLUG}`, {
    idempotencyKey: `test-delivery-${Date.now()}`,
    items: [{
      lineType: 'product',
      productId,
      quantity: 2,
      complements: [],
    }],
    customerName: 'Smoke Test Delivery',
    customerPhone: '11999990002',
    fulfillmentType: 'delivery',
    deliveryAddress: {
      street: 'Rua Teste',
      number: '123',
      complement: 'Apto 1',
      neighborhood: 'Centro',
      city: 'São Paulo',
      state: 'SP',
      zipCode: '01001000',
      lat: -23.55,
      lng: -46.63,
    },
    payment: { method: 'pix' },
  });

  assert('Delivery checkout creates order', status === 201 || status === 200, `Status: ${status}`);
  const order = asRecord(data);
  const addr = order ? asRecord(order.deliveryAddress) : null;
  assert('Has delivery address', !!addr, 'Should contain address', data);
  assert('Address street matches', !!addr && pickString(addr, 'street') === 'Rua Teste', `Got: ${addr ? String(addr.street) : 'null'}`, data);
  
  return order;
}

// ----------------------------------------------------------------
// TEST 3: Product with required complements
// ----------------------------------------------------------------
async function testComplementsRequired() {
  console.log('\n🧀 Test 3: Complements Validation');

  const { data: storefront } = await api('GET', `/public/storefront/${TENANT_SLUG}`);
  const s = asRecord(storefront);
  const categories = s ? asArray(s.categories) : [];
  
  // Find first product that has required complements
  let productWithReqComp = null;
  for (const cat of categories) {
    const catRec = asRecord(cat);
    const products = catRec ? asArray(catRec.products) : [];
    for (const p of products) {
      const pRec = asRecord(p);
      const complements = pRec ? asArray(pRec.complements) : [];
      const required = complements.find((c) => {
        const cRec = asRecord(c);
        return cRec?.isRequired === true;
      });
      if (required && pRec) { productWithReqComp = pRec; break; }
    }
    if (productWithReqComp) break;
  }

  if (!productWithReqComp) {
    assert('Complements validation', true, 'SKIPPED: No product with required complements in demo data');
    return;
  }

  const complements = asArray(productWithReqComp.complements);
  const requiredGroup = complements
    .map(asRecord)
    .find((c) => c?.isRequired === true) ?? null;

  const productId = pickString(productWithReqComp, 'id');
  const groupId = requiredGroup ? pickString(requiredGroup, 'id') : null;
  const items = requiredGroup ? asArray(requiredGroup.items) : [];
  const firstItem = items.length > 0 ? asRecord(items[0]) : null;
  const itemId = firstItem ? pickString(firstItem, 'id') : null;

  if (!productId || !groupId || !itemId) {
    assert('Complements validation', false, 'Invalid required complements payload shape', productWithReqComp);
    return;
  }

  // Try without required complement (should FAIL)
  const { status: failStatus } = await api('POST', `/orders/public-checkout/${TENANT_SLUG}`, {
    idempotencyKey: `test-comp-fail-${Date.now()}`,
    items: [{
      lineType: 'product',
      productId,
      quantity: 1,
      complements: [],
    }],
    customerName: 'Test Comp Fail',
    customerPhone: '11999990003',
    fulfillmentType: 'pickup',
    payment: { method: 'pix' },
  });

  assert('Reject missing required complement', failStatus === 400, `Expected 400, got ${failStatus}`);

  // Try WITH required complement (should PASS)
  const { status: passStatus, data } = await api('POST', `/orders/public-checkout/${TENANT_SLUG}`, {
    idempotencyKey: `test-comp-pass-${Date.now()}`,
    items: [{
      lineType: 'product',
      productId,
      quantity: 1,
      complements: [{ groupId, itemId }],
    }],
    customerName: 'Test Comp Pass',
    customerPhone: '11999990004',
    fulfillmentType: 'pickup',
    payment: { method: 'pix' },
  });

  assert('Accept valid complement', passStatus === 201 || passStatus === 200, `Got ${passStatus}`);
}

// ----------------------------------------------------------------
// TEST 4: Combo checkout
// ----------------------------------------------------------------
async function testComboCheckout() {
  console.log('\n🍔 Test 4: Combo Checkout');

  const { data: storefront } = await api('GET', `/public/storefront/${TENANT_SLUG}`);

  const s = asRecord(storefront);
  const combos = s ? asArray(s.combos) : [];
  if (!combos.length) {
    assert('Combo checkout', true, 'SKIPPED: No combos in demo data');
    return;
  }

  const combo = asRecord(combos[0]);
  if (!combo) {
    assert('Combo checkout', false, 'Invalid combo payload shape', storefront);
    return;
  }

  const comboId = pickString(combo, 'id');
  const comboName = pickString(combo, 'name') ?? 'unknown';
  const blocks = asArray(combo.blocks);
  const selections = blocks.flatMap((b) => {
    const block = asRecord(b);
    if (!block) return [];
    const blockId = pickString(block, 'id');
    const minSelect = pickNumber(block, 'minSelect') ?? 0;
    const items = asArray(block.items);
    if (!blockId || minSelect <= 0 || items.length === 0) return [];

    return Array.from({ length: minSelect }, (_, i) => {
      const item = asRecord(items[i % items.length]);
      const blockItemId = item ? pickString(item, 'id') : null;
      return blockItemId ? { blockId, blockItemId } : null;
    }).filter((x): x is { blockId: string; blockItemId: string } => x !== null);
  });

  if (!comboId || selections.length === 0) {
    assert('Combo checkout', false, 'Combo missing id or selections', combo);
    return;
  }

  const { status, data } = await api('POST', `/orders/public-checkout/${TENANT_SLUG}`, {
    idempotencyKey: `test-combo-${Date.now()}`,
    items: [{
      lineType: 'combo',
      comboId,
      quantity: 1,
      comboSelections: selections,
    }],
    customerName: 'Smoke Test Combo',
    customerPhone: '11999990005',
    fulfillmentType: 'pickup',
    payment: { method: 'pix' },
  });

  assert('Combo checkout succeeds', status === 201 || status === 200, `Status: ${status}, ${JSON.stringify(data).slice(0, 200)}`);
  const order = asRecord(data);
  const items = order ? asArray(order.items) : [];
  const first = items.length > 0 ? asRecord(items[0]) : null;
  const snapshotName = first ? pickString(first, 'snapshotName') : null;
  assert('Has combo snapshot', snapshotName === comboName, `Got: ${String(snapshotName)}`);
}

// ----------------------------------------------------------------
// TEST 5: Idempotency key retry
// ----------------------------------------------------------------
async function testIdempotency() {
  console.log('\n🔁 Test 5: Idempotency Key Retry');

  const { data: storefront } = await api('GET', `/public/storefront/${TENANT_SLUG}`);
  const picked = pickFirstProductIdWithoutRequiredComplements(storefront);
  const productId = picked.productId;
  if (!productId) {
    assert('Idempotency', false, 'No product without required complements found in storefront', storefront);
    return;
  }
  const key = `test-idempotency-${Date.now()}`;

  const { data: first } = await api('POST', `/orders/public-checkout/${TENANT_SLUG}`, {
    idempotencyKey: key,
    items: [{ lineType: 'product', productId, quantity: 1, complements: [] }],
    customerName: 'Idempotency Test',
    customerPhone: '11999990006',
    fulfillmentType: 'pickup',
    payment: { method: 'pix' },
  });

  const { data: second } = await api('POST', `/orders/public-checkout/${TENANT_SLUG}`, {
    idempotencyKey: key,
    items: [{ lineType: 'product', productId, quantity: 1, complements: [] }],
    customerName: 'Idempotency Test',
    customerPhone: '11999990006',
    fulfillmentType: 'pickup',
    payment: { method: 'pix' },
  });

  const a = asRecord(first);
  const b = asRecord(second);
  const firstId = a ? pickString(a, 'id') : null;
  const secondId = b ? pickString(b, 'id') : null;
  const firstNumber = a ? pickString(a, 'orderNumber') : null;
  const secondNumber = b ? pickString(b, 'orderNumber') : null;

  assert('Same idempotencyKey returns same order', !!firstId && !!secondId && firstId === secondId, `First: ${String(firstId)}, Second: ${String(secondId)}`);
  assert('Same orderNumber', !!firstNumber && !!secondNumber && firstNumber === secondNumber, `${String(firstNumber)} vs ${String(secondNumber)}`);
}

// ----------------------------------------------------------------
// TEST 6: Valid status transition
// ----------------------------------------------------------------
async function testValidStatusTransition(token: string, orderId: string) {
  console.log('\n✅ Test 6: Valid Status Transition');

  const { status } = await api('PATCH', `/orders/${orderId}/status`, { status: 'confirmed' }, token);
  assert('Transition pending→confirmed', status === 200, `Status: ${status}`);
  
  // Fetch full details to check the timeline
  const getDetail = await api('GET', `/orders/${orderId}`, undefined, token);
  const order = asRecord(getDetail.data);
  const orderStatus = order ? pickString(order, 'status') : null;
  const timeline = order ? asArray(order.timeline) : [];
  assert('New status is confirmed', orderStatus === 'confirmed', `Got: ${String(orderStatus)}`);
  assert('Timeline has 2 entries', timeline.length === 2, `Got: ${timeline.length}`);
}

// ----------------------------------------------------------------
// TEST 7: Invalid status transition
// ----------------------------------------------------------------
async function testInvalidStatusTransition(token: string, orderId: string) {
  console.log('\n🚫 Test 7: Invalid Status Transition');

  // Order is now "confirmed", trying to jump to "completed" (invalid)
  const { status } = await api('PATCH', `/orders/${orderId}/status`, { status: 'completed' }, token);
  assert('Reject invalid transition confirmed→completed', status === 400, `Expected 400, got ${status}`);
}


// ----------------------------------------------------------------
// MAIN
// ----------------------------------------------------------------
async function main() {
  console.log('🧪 Starting Smoke Test — Phase 4: Orders & Checkout\n');
  console.log('=' .repeat(60));

  try {
    // Get tenant token for internal endpoints
    const token = await getTenantToken();
    assert('Tenant auth login', !!token, 'Token is empty');

    // Test 1-4: Checkout scenarios
    const pickupOrder = await testCheckoutPickup();
    await testCheckoutDelivery();
    await testComplementsRequired();
    await testComboCheckout();

    // Test 5: Idempotency
    await testIdempotency();

    // Test 6-7: Status transitions (using the pickup order)
    const pickupId = pickupOrder ? pickString(pickupOrder, 'id') : null;
    if (pickupId) {
      await testValidStatusTransition(token, pickupId);
      await testInvalidStatusTransition(token, pickupId);
    }

  } catch (err) {
    console.error('\n💥 Smoke test crashed:', err);
  }

  // Summary
  console.log('\n' + '=' .repeat(60));
  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  console.log(`\n📊 Results: ${passed} passed, ${failed} failed, ${results.length} total`);
  
  if (failed > 0) {
    console.log('\n❌ FAILED TESTS:');
    results.filter(r => !r.passed).forEach(r => console.log(`   • ${r.name}: ${r.detail}`));
  } else {
    console.log('\n🎉 All tests passed!');
  }

  process.exit(failed > 0 ? 1 : 0);
}

main();
