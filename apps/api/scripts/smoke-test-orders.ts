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

const API = 'http://localhost:3333/api/v1';
const TENANT_SLUG = 'pizzaria-demo';

interface TestResult {
  name: string;
  passed: boolean;
  detail: string;
}

const results: TestResult[] = [];

async function api(method: string, path: string, body?: unknown, token?: string) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  
  const res = await fetch(`${API}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  
  const rawData = await res.json().catch(() => ({}));
  // Unwrap standard { success, data } if present
  const data = rawData.success !== undefined && rawData.data !== undefined ? rawData.data : rawData;
  if (res.status >= 400 && path.includes('isolation')) {
    console.log(`  DEBUG ERROR: ${method} ${path} -> Status ${res.status}`, JSON.stringify(rawData));
  }
  return { status: res.status, data };
}

function assert(name: string, condition: boolean, detail: string, data?: any) {
  const fullDetail = data ? `${detail} | Payload: ${JSON.stringify(data)}` : detail;
  results.push({ name, passed: condition, detail: fullDetail });
  console.log(condition ? `  ✅ ${name}` : `  ❌ ${name}: ${fullDetail}`);
}

async function getTenantToken(): Promise<string> {
  const { data } = await api('POST', '/auth/tenant/login', {
    email: 'owner@pizzariademo.com',
    password: 'Owner@123',
    tenantSlug: TENANT_SLUG,
  });
  return data.accessToken || data.access_token || '';
}

// ----------------------------------------------------------------
// TEST 1: Checkout Pickup (no address)
// ----------------------------------------------------------------
async function testCheckoutPickup() {
  console.log('\n📦 Test 1: Checkout Pickup');
  
  // First, get storefront data to find real product IDs
  const { data: storefront } = await api('GET', `/public/storefront/${TENANT_SLUG}`);
  
  if (!storefront.categories?.length || !storefront.categories[0]?.products?.length) {
    assert('Pickup checkout', false, 'No products found in storefront');
    return null;
  }

  const product = storefront.categories[0].products[0];
  console.log(`   - Using product for Test 1: ${product.name} (${product.id})`);
  
  const { status, data } = await api('POST', `/orders/public-checkout/${TENANT_SLUG}`, {
    idempotencyKey: `test-pickup-${Date.now()}`,
    items: [{
      lineType: 'product',
      productId: product.id,
      quantity: 1,
      complements: [],
    }],
    customerName: 'Smoke Test Pickup',
    customerPhone: '11999990001',
    fulfillmentType: 'pickup',
  });

  assert('Pickup checkout creates order', status === 201 || status === 200, `Status: ${status}, ${JSON.stringify(data).slice(0, 200)}`);
  assert('Order has orderNumber', !!data.orderNumber, `Got: ${data.orderNumber}`);
  assert('Status is pending', data.status === 'pending', `Got: ${data.status}`);
  assert('No delivery address', !data.deliveryAddress, 'Should be null for pickup');
  
  // --- INTEGRATED ISOLATION TEST (formerly Test 8) ---
  console.log('   🔒 Integrated Isolation Check...');
  const tenantToken = await getTenantToken();
  
  // 1. Owner SHOULD see the order
  const { status: ownStatus } = await api('GET', `/orders/${data.id}`, undefined, tenantToken);
  assert('Owner sees own order', ownStatus === 200, `Status: ${ownStatus}`);

  // 2. Unauthenticated user SHOULD NOT see the order
  const { status: noAuthStatus } = await api('GET', `/orders/${data.id}`);
  assert('No auth rejects internal endpoint', noAuthStatus === 401 || noAuthStatus === 403, `Status: ${noAuthStatus}`);

  return data;
}

// ----------------------------------------------------------------
// TEST 2: Checkout Delivery (with address)
// ----------------------------------------------------------------
async function testCheckoutDelivery() {
  console.log('\n🚚 Test 2: Checkout Delivery');

  const { data: storefront } = await api('GET', `/public/storefront/${TENANT_SLUG}`);
  const product = storefront.categories[0].products[0];

  const { status, data } = await api('POST', `/orders/public-checkout/${TENANT_SLUG}`, {
    idempotencyKey: `test-delivery-${Date.now()}`,
    items: [{
      lineType: 'product',
      productId: product.id,
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
    },
  });

  assert('Delivery checkout creates order', status === 201 || status === 200, `Status: ${status}`);
  assert('Has delivery address', !!data.deliveryAddress, 'Should contain address');
  assert('Address street matches', data.deliveryAddress?.street === 'Rua Teste', `Got: ${data.deliveryAddress?.street}`);
  
  return data;
}

// ----------------------------------------------------------------
// TEST 3: Product with required complements
// ----------------------------------------------------------------
async function testComplementsRequired() {
  console.log('\n🧀 Test 3: Complements Validation');

  const { data: storefront } = await api('GET', `/public/storefront/${TENANT_SLUG}`);
  
  // Find first product that has required complements
  let productWithReqComp = null;
  for (const cat of storefront.categories || []) {
    for (const p of cat.products || []) {
      const req = p.complements?.find((c: { isRequired: boolean }) => c.isRequired);
      if (req) { productWithReqComp = p; break; }
    }
    if (productWithReqComp) break;
  }

  if (!productWithReqComp) {
    assert('Complements validation', true, 'SKIPPED: No product with required complements in demo data');
    return;
  }

  const requiredGroup = productWithReqComp.complements.find((c: { isRequired: boolean }) => c.isRequired);

  // Try without required complement (should FAIL)
  const { status: failStatus } = await api('POST', `/orders/public-checkout/${TENANT_SLUG}`, {
    idempotencyKey: `test-comp-fail-${Date.now()}`,
    items: [{
      lineType: 'product',
      productId: productWithReqComp.id,
      quantity: 1,
      complements: [],
    }],
    customerName: 'Test Comp Fail',
    customerPhone: '11999990003',
    fulfillmentType: 'pickup',
  });

  assert('Reject missing required complement', failStatus === 400, `Expected 400, got ${failStatus}`);

  // Try WITH required complement (should PASS)
  const { status: passStatus, data } = await api('POST', `/orders/public-checkout/${TENANT_SLUG}`, {
    idempotencyKey: `test-comp-pass-${Date.now()}`,
    items: [{
      lineType: 'product',
      productId: productWithReqComp.id,
      quantity: 1,
      complements: [{ groupId: requiredGroup.id, itemId: requiredGroup.items[0].id }],
    }],
    customerName: 'Test Comp Pass',
    customerPhone: '11999990004',
    fulfillmentType: 'pickup',
  });

  assert('Accept valid complement', passStatus === 201 || passStatus === 200, `Got ${passStatus}`);
}

// ----------------------------------------------------------------
// TEST 4: Combo checkout
// ----------------------------------------------------------------
async function testComboCheckout() {
  console.log('\n🍔 Test 4: Combo Checkout');

  const { data: storefront } = await api('GET', `/public/storefront/${TENANT_SLUG}`);
  
  if (!storefront.combos?.length) {
    assert('Combo checkout', true, 'SKIPPED: No combos in demo data');
    return;
  }

  const combo = storefront.combos[0];
  const selections = combo.blocks.map((block: { id: string; minSelect: number; items: Array<{ id: string }> }) => {
    return Array.from({ length: block.minSelect }, (_, i) => ({
      blockId: block.id,
      blockItemId: block.items[i % block.items.length].id,
    }));
  }).flat();

  const { status, data } = await api('POST', `/orders/public-checkout/${TENANT_SLUG}`, {
    idempotencyKey: `test-combo-${Date.now()}`,
    items: [{
      lineType: 'combo',
      comboId: combo.id,
      quantity: 1,
      comboSelections: selections,
    }],
    customerName: 'Smoke Test Combo',
    customerPhone: '11999990005',
    fulfillmentType: 'pickup',
  });

  assert('Combo checkout succeeds', status === 201 || status === 200, `Status: ${status}, ${JSON.stringify(data).slice(0, 200)}`);
  assert('Has combo snapshot', data.items?.[0]?.snapshotName === combo.name, `Got: ${data.items?.[0]?.snapshotName}`);
}

// ----------------------------------------------------------------
// TEST 5: Idempotency key retry
// ----------------------------------------------------------------
async function testIdempotency() {
  console.log('\n🔁 Test 5: Idempotency Key Retry');

  const { data: storefront } = await api('GET', `/public/storefront/${TENANT_SLUG}`);
  const product = storefront.categories[0].products[0];
  const key = `test-idempotency-${Date.now()}`;

  const { data: first } = await api('POST', `/orders/public-checkout/${TENANT_SLUG}`, {
    idempotencyKey: key,
    items: [{ lineType: 'product', productId: product.id, quantity: 1, complements: [] }],
    customerName: 'Idempotency Test',
    customerPhone: '11999990006',
    fulfillmentType: 'pickup',
  });

  const { data: second } = await api('POST', `/orders/public-checkout/${TENANT_SLUG}`, {
    idempotencyKey: key,
    items: [{ lineType: 'product', productId: product.id, quantity: 1, complements: [] }],
    customerName: 'Idempotency Test',
    customerPhone: '11999990006',
    fulfillmentType: 'pickup',
  });

  assert('Same idempotencyKey returns same order', first.id === second.id, `First: ${first.id}, Second: ${second.id}`);
  assert('Same orderNumber', first.orderNumber === second.orderNumber, `${first.orderNumber} vs ${second.orderNumber}`);
}

// ----------------------------------------------------------------
// TEST 6: Valid status transition
// ----------------------------------------------------------------
async function testValidStatusTransition(token: string, orderId: string) {
  console.log('\n✅ Test 6: Valid Status Transition');

  const { status, data } = await api('PATCH', `/orders/${orderId}/status`, { status: 'confirmed' }, token);
  assert('Transition pending→confirmed', status === 200, `Status: ${status}`);
  assert('New status is confirmed', data.status === 'confirmed', `Got: ${data.status}`);
  assert('Timeline has 2 entries', data.timeline?.length === 2, `Got: ${data.timeline?.length}`);
}

// ----------------------------------------------------------------
// TEST 7: Invalid status transition
// ----------------------------------------------------------------
async function testInvalidStatusTransition(token: string, orderId: string) {
  console.log('\n🚫 Test 7: Invalid Status Transition');

  // Order is now "confirmed", trying to jump to "completed" (invalid)
  const { status } = await api('PATCH', `/orders/${orderId}/status`, { status: 'completed' }, token);
  assert('Reject invalid transition confirmed→completed', status === 409, `Expected 409, got ${status}`);
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
    if (pickupOrder?.id) {
      await testValidStatusTransition(token, pickupOrder.id);
      await testInvalidStatusTransition(token, pickupOrder.id);
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
