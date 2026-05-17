const API = process.env.SMOKE_API_BASE_URL ?? 'http://localhost:3333/api/v1';
const TENANT_SLUG = process.env.SMOKE_TENANT_SLUG ?? 'pizzaria-demo';
const TENANT_EMAIL = process.env.SMOKE_TENANT_EMAIL ?? 'owner@pizzariademo.com';
const TENANT_PASSWORD = process.env.SMOKE_TENANT_PASSWORD ?? 'Owner@123';

type TestResult = {
  name: string;
  passed: boolean;
  detail: string;
};

const results: TestResult[] = [];

function assert(name: string, condition: boolean, detail: string, payload?: unknown) {
  const fullDetail = payload ? `${detail} | Payload: ${JSON.stringify(payload)}` : detail;
  results.push({ name, passed: condition, detail: fullDetail });
  process.stdout.write(condition ? `  OK  ${name}\n` : `  ERR ${name}: ${fullDetail}\n`);
}

async function api(method: string, path: string, body?: unknown, token?: string) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${API}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const raw: unknown = await res.json().catch(() => ({}));
  const data =
    typeof raw === 'object' &&
    raw !== null &&
    'success' in raw &&
    'data' in raw
      ? (raw as { data: unknown }).data
      : raw;

  return { status: res.status, data, raw };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null;
}

function pickString(obj: Record<string, unknown>, key: string): string | null {
  const v = obj[key];
  return typeof v === 'string' ? v : null;
}

async function getTenantToken(): Promise<string | null> {
  const login = await api('POST', '/auth/tenant/login', {
    email: TENANT_EMAIL,
    password: TENANT_PASSWORD,
    tenantSlug: TENANT_SLUG,
  });

  const loginData = asRecord(login.data);
  const accessToken = loginData ? pickString(loginData, 'accessToken') : null;
  assert('login status 200/201', login.status === 200 || login.status === 201, `Status=${login.status}`, login.raw);
  assert('login returns token', typeof accessToken === 'string' && accessToken.length > 10, 'missing token', login.raw);

  return accessToken;
}

async function main() {
  process.stdout.write('SMOKE INVENTORY\n');

  const token = await getTenantToken();
  if (!token) {
    process.exitCode = 1;
    return;
  }

  const ingredientName = `Smoke Ingredient ${Date.now()}`;

  const createdIngredient = await api(
    'POST',
    '/inventory/ingredients',
    { name: ingredientName, unit: 'g', currentCost: 3.5, minStock: 100 },
    token,
  );

  assert(
    'create ingredient status 200/201',
    createdIngredient.status === 200 || createdIngredient.status === 201,
    `Status=${createdIngredient.status}`,
    createdIngredient.raw,
  );

  const ingData = asRecord(createdIngredient.data);
  const ingredientId = ingData ? pickString(ingData, 'id') : null;
  assert('ingredient has id', typeof ingredientId === 'string' && ingredientId.length > 0, 'missing id', createdIngredient.data);

  const storefront = await api('GET', `/public/storefront/${TENANT_SLUG}`);
  assert('storefront status 200', storefront.status === 200, `Status=${storefront.status}`, storefront.raw);

  const sData = asRecord(storefront.data);
  const categories = sData && Array.isArray(sData.categories) ? sData.categories : [];
  let productId: string | null = null;

  for (const cat of categories) {
    if (typeof cat !== 'object' || cat === null) continue;
    const catRec = cat as Record<string, unknown>;
    const products = Array.isArray(catRec.products) ? catRec.products : [];

    for (const p of products) {
      if (typeof p !== 'object' || p === null) continue;
      const pRec = p as Record<string, unknown>;

      const complements = Array.isArray(pRec.complements) ? pRec.complements : [];
      const hasRequiredComplementGroup = complements.some((g) => {
        if (typeof g !== 'object' || g === null) return false;
        const gRec = g as Record<string, unknown>;
        return gRec.isRequired === true;
      });

      if (!hasRequiredComplementGroup) {
        const id = pickString(pRec, 'id');
        if (id) {
          productId = id;
          break;
        }
      }
    }

    if (productId) break;
  }

  assert('found productId in storefront', typeof productId === 'string' && productId.length > 0, 'missing productId');

  if (!ingredientId || !productId) {
    process.exitCode = 1;
    return;
  }

  const upsertRecipe = await api(
    'POST',
    `/inventory/recipes/product/${productId}`,
    [{ ingredientId, quantity: 50 }],
    token,
  );

  assert('upsert recipe status 200/201', upsertRecipe.status === 200 || upsertRecipe.status === 201, `Status=${upsertRecipe.status}`, upsertRecipe.raw);

  const getRecipe = await api('GET', `/inventory/recipes/product/${productId}`, undefined, token);
  assert('get recipe status 200', getRecipe.status === 200, `Status=${getRecipe.status}`, getRecipe.raw);

  const recipeItems = Array.isArray(getRecipe.data) ? getRecipe.data : [];
  const hasIngredient = recipeItems.some((ri) => {
    if (typeof ri !== 'object' || ri === null) return false;
    const rec = ri as Record<string, unknown>;
    return rec.ingredientId === ingredientId;
  });
  assert('recipe includes created ingredient', hasIngredient, 'ingredient not found in recipe', getRecipe.data);

  // Runtime check: create order -> confirm -> cancel (exercise depletion/reversal paths; verify no exception)
  const orderCreate = await api(
    'POST',
    `/orders/public-checkout/${TENANT_SLUG}`,
    {
      idempotencyKey: `smoke-inv-${Date.now()}`,
      items: [{ lineType: 'product', productId, quantity: 1, complements: [] }],
      customerName: 'Smoke Inventory',
      customerPhone: '11999990111',
      fulfillmentType: 'pickup',
      payment: { method: 'pix' },
    },
  );

  assert('create order status 200/201', orderCreate.status === 200 || orderCreate.status === 201, `Status=${orderCreate.status}`, orderCreate.raw);

  const orderData = asRecord(orderCreate.data);
  const orderId = orderData ? pickString(orderData, 'id') : null;
  assert('order has id', typeof orderId === 'string' && orderId.length > 0, 'missing orderId', orderCreate.data);

  if (orderId) {
    const confirm = await api('PATCH', `/orders/${orderId}/status`, { status: 'confirmed' }, token);
    assert('confirm order status 200', confirm.status === 200, `Status=${confirm.status}`, confirm.raw);

    const cancel = await api('PATCH', `/orders/${orderId}/status`, { status: 'cancelled' }, token);
    assert('cancel order status 200', cancel.status === 200, `Status=${cancel.status}`, cancel.raw);
  }

  const failed = results.filter((r) => !r.passed);
  process.stdout.write(`\nResults: ${results.length - failed.length} passed, ${failed.length} failed\n`);
  if (failed.length) {
    failed.forEach((f) => process.stdout.write(`- ${f.name}: ${f.detail}\n`));
  }
  process.exitCode = failed.length ? 1 : 0;
}

main().catch((err: unknown) => {
  process.stderr.write(`SMOKE INVENTORY crashed: ${String(err)}\n`);
  process.exitCode = 1;
});
