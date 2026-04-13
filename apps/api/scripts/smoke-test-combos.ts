/**
 * Smoke Test Combos (CRUD + Relational Integrity + Conflict)
 *
 * Prerequisites:
 *   1. PostgreSQL running at localhost:5433
 *   2. `npx prisma migrate dev` applied
 *   3. Seed executed (npx ts-node prisma/seed.ts)
 *   4. API running (npm run start:dev)
 *
 * Run: npx ts-node scripts/smoke-test-combos.ts
 *
 * Environment variables (optional):
 *   SMOKE_API_BASE_URL (default: http://localhost:3333/api/v1)
 *   SMOKE_TENANT_SLUG (default: pizzaria-demo)
 *   SMOKE_TENANT_EMAIL (default: owner@pizzariademo.com)
 *   SMOKE_TENANT_PASSWORD (default: Owner@123)
 */

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
  if (typeof v === 'number') return v;
  if (typeof v === 'string') {
    const n = Number(v);
    return !Number.isNaN(n) ? n : null;
  }
  return null;
}

function extractErrorMessage(payload: unknown): string | null {
  const rec = asRecord(payload);
  const direct = rec ? pickString(rec, 'message') : null;
  if (direct) return direct;
  const error = rec ? asRecord(rec.error) : null;
  return error ? pickString(error, 'message') : null;
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

async function tenantLogin(): Promise<string> {
  const { status, data } = await api('POST', '/auth/tenant/login', {
    email: TENANT_EMAIL,
    password: TENANT_PASSWORD,
    tenantSlug: TENANT_SLUG,
  });

  const loginData = asRecord(data);
  const accessToken = loginData ? pickString(loginData, 'accessToken') : null;

  if (!accessToken || status > 299) {
    throw new Error(`Login failed: status=${status} token=${accessToken}`);
  }

  return accessToken;
}

async function pickFirstProductId(token: string): Promise<string | null> {
  const { data } = await api('GET', '/catalog/products', undefined, token);
  const rec = asRecord(data);
  if (!Array.isArray(rec)) return null;
  const products = rec as unknown[];
  const first = asRecord(products[0]);
  return first ? pickString(first, 'id') : null;
}

// ----------------------------------------------------------------
// TESTS
// ----------------------------------------------------------------

async function testCreateCombo(token: string): Promise<string | null> {
  process.stdout.write('\n=== CREATE COMBO ===\n');

  const { status, data } = await api('POST', '/catalog/combos', {
    name: `Smoke Combo ${Date.now()}`,
    description: 'Combo para smoke test',
    basePrice: 49.9,
    isActive: true,
    isFeatured: false,
    order: 0,
  }, token);

  assert('POST /catalog/combos status 201/200', status === 201 || status === 200, `status=${status}`, data);

  const combo = asRecord(data);
  const comboId = combo ? pickString(combo, 'id') : null;
  const comboName = combo ? pickString(combo, 'name') : null;

  assert('combo has id', typeof comboId === 'string' && comboId.length > 0, `id=${comboId}`, data);
  assert('combo has name', typeof comboName === 'string' && comboName.length > 0, `name=${comboName}`, data);

  return comboId;
}

async function testCreateBlock(token: string, comboId: string): Promise<string | null> {
  process.stdout.write('\n=== CREATE BLOCK ===\n');

  const { status, data } = await api('POST', `/catalog/combos/${comboId}/blocks`, {
    name: 'Proteínas',
    description: 'Escolha sua proteína',
    minSelect: 1,
    maxSelect: 1,
    order: 0,
  }, token);

  assert('POST /catalog/combos/:id/blocks status 201/200', status === 201 || status === 200, `status=${status}`, data);

  const block = asRecord(data);
  const blockId = block ? pickString(block, 'id') : null;
  const blockName = block ? pickString(block, 'name') : null;

  assert('block has id', typeof blockId === 'string' && blockId.length > 0, `id=${blockId}`, data);
  assert('block has name', typeof blockName === 'string' && blockName.length > 0, `name=${blockName}`, data);

  return blockId;
}

async function testCreateItem(token: string, comboId: string, blockId: string, productId: string): Promise<string | null> {
  process.stdout.write('\n=== CREATE ITEM ===\n');

  const { status, data } = await api('POST', `/catalog/combos/${comboId}/blocks/${blockId}/items`, {
    productId,
    additionalPrice: 5.0,
    order: 0,
  }, token);

  assert('POST /catalog/combos/:id/blocks/:blockId/items status 201/200', status === 201 || status === 200, `status=${status}`, data);

  const item = asRecord(data);
  const itemId = item ? pickString(item, 'id') : null;
  const itemProductId = item ? pickString(item, 'productId') : null;
  const additionalPrice = item ? pickNumber(item, 'additionalPrice') : null;

  assert('item has id', typeof itemId === 'string' && itemId.length > 0, `id=${itemId}`, data);
  assert('item productId matches', itemProductId === productId, `expected=${productId}, got=${itemProductId}`, data);
  assert('additionalPrice matches', additionalPrice === 5.0, `expected=5.0, got=${additionalPrice}`, data);

  return itemId;
}

async function testEditBlock(token: string, comboId: string, blockId: string) {
  process.stdout.write('\n=== EDIT BLOCK ===\n');

  const { status, data } = await api('PATCH', `/catalog/combos/${comboId}/blocks/${blockId}`, {
    name: 'Proteínas (editado)',
    description: 'Escolha sua proteína - versão editada',
    minSelect: 1,
    maxSelect: 2,
    order: 1,
  }, token);

  assert('PATCH /catalog/combos/:id/blocks/:blockId status 200', status === 200, `status=${status}`, data);

  const block = asRecord(data);
  const name = block ? pickString(block, 'name') : null;
  const maxSelect = block ? pickNumber(block, 'maxSelect') : null;
  const order = block ? pickNumber(block, 'order') : null;

  assert('block name updated', name === 'Proteínas (editado)', `name=${name}`, data);
  assert('block maxSelect updated', maxSelect === 2, `maxSelect=${maxSelect}`, data);
  assert('block order updated', order === 1, `order=${order}`, data);
}

async function testEditItem(token: string, comboId: string, blockId: string, itemId: string) {
  process.stdout.write('\n=== EDIT ITEM ===\n');

  const { status, data } = await api('PATCH', `/catalog/combos/${comboId}/blocks/${blockId}/items/${itemId}`, {
    additionalPrice: 7.5,
    order: 1,
  }, token);

  assert('PATCH /catalog/combos/:id/blocks/:blockId/items/:itemId status 200', status === 200, `status=${status}`, data);

  const item = asRecord(data);
  const additionalPrice = item ? pickNumber(item, 'additionalPrice') : null;
  const order = item ? pickNumber(item, 'order') : null;

  assert('item additionalPrice updated', additionalPrice === 7.5, `additionalPrice=${additionalPrice}`, data);
  assert('item order updated', order === 1, `order=${order}`, data);
}

async function testDuplicateConflict(token: string, comboId: string, blockId: string, productId: string) {
  process.stdout.write('\n=== DUPLICATE CONFLICT ===\n');

  const { status, data } = await api('POST', `/catalog/combos/${comboId}/blocks/${blockId}/items`, {
    productId,
    additionalPrice: 3.0,
    order: 2,
  }, token);

  assert('duplicate item returns 409', status === 409, `status=${status}`, data);
  const finalMessage = extractErrorMessage(data);
  assert('conflict message meaningful', typeof finalMessage === 'string' && finalMessage.includes('já existe'), `message=${finalMessage}`, data);
}

async function testCrossComboBlockAccess(token: string, comboId: string, blockId: string) {
  process.stdout.write('\n=== CROSS-COMBO BLOCK ACCESS ===\n');

  // Create a second combo to use as "other combo"
  const { data: otherCombo } = await api('POST', '/catalog/combos', {
    name: `Other Combo ${Date.now()}`,
    description: 'Other combo for cross-access test',
    basePrice: 29.9,
    isActive: true,
    isFeatured: false,
    order: 0,
  }, token);
  const otherComboRec = asRecord(otherCombo);
  const otherComboId = otherComboRec ? pickString(otherComboRec, 'id') : null;

  if (!otherComboId) {
    assert('create other combo', false, 'Failed to create second combo', otherCombo);
    return;
  }

  // Try to access block from comboA using comboB endpoint
  const { status, data } = await api('PATCH', `/catalog/combos/${otherComboId}/blocks/${blockId}`, {
    name: 'Should Fail',
  }, token);

  assert('cross-combo block access returns 404', status === 404, `status=${status}`, data);
  const message = extractErrorMessage(data);
  assert('404 message meaningful', typeof message === 'string' && message.includes('Bloco não encontrado'), `message=${message}`, data);
}

async function testCrossBlockItemAccess(token: string, comboId: string, blockId: string, itemId: string) {
  process.stdout.write('\n=== CROSS-BLOCK ITEM ACCESS ===\n');

  // Create a second block in the same combo
  const { data: otherBlock } = await api('POST', `/catalog/combos/${comboId}/blocks`, {
    name: 'Acompanhamentos',
    description: 'Segundo bloco',
    minSelect: 0,
    maxSelect: 1,
    order: 2,
  }, token);
  const otherBlockRec = asRecord(otherBlock);
  const otherBlockId = otherBlockRec ? pickString(otherBlockRec, 'id') : null;

  if (!otherBlockId) {
    assert('create second block', false, 'Failed to create second block', otherBlock);
    return;
  }

  // Try to access item from blockA using blockB endpoint
  const { status, data } = await api('PATCH', `/catalog/combos/${comboId}/blocks/${otherBlockId}/items/${itemId}`, {
    additionalPrice: 1.0,
  }, token);

  assert('cross-block item access returns 404', status === 404, `status=${status}`, data);
  const message = extractErrorMessage(data);
  assert('404 message meaningful', typeof message === 'string' && message.includes('Item não encontrado'), `message=${message}`, data);
}

async function testDeleteItem(token: string, comboId: string, blockId: string, itemId: string) {
  process.stdout.write('\n=== DELETE ITEM ===\n');

  const { status, data } = await api('DELETE', `/catalog/combos/${comboId}/blocks/${blockId}/items/${itemId}`, undefined, token);

  assert('DELETE item returns 200', status === 200, `status=${status}`, data);

  // Verify item is gone
  const { status: getAfter } = await api('GET', `/catalog/combos/${comboId}/blocks/${blockId}/items`, undefined, token);
  const rec = asRecord(getAfter === 200 ? data : null);
  const items = rec ? asArray(rec.items) : [];
  const stillExists = items.some((it) => {
    const itRec = asRecord(it);
    return itRec && pickString(itRec, 'id') === itemId;
  });
  assert('item actually removed', !stillExists, `itemId=${itemId} still present`, data);
}

async function testDeleteBlock(token: string, comboId: string, blockId: string) {
  process.stdout.write('\n=== DELETE BLOCK ===\n');

  const { status, data } = await api('DELETE', `/catalog/combos/${comboId}/blocks/${blockId}`, undefined, token);

  assert('DELETE block returns 200', status === 200, `status=${status}`, data);

  // Verify block is gone
  const { status: getAfter } = await api('GET', `/catalog/combos/${comboId}/blocks`, undefined, token);
  const rec = asRecord(getAfter === 200 ? data : null);
  const blocks = rec ? asArray(rec) : [];
  const stillExists = blocks.some((blk) => {
    const blkRec = asRecord(blk);
    return blkRec && pickString(blkRec, 'id') === blockId;
  });
  assert('block actually removed', !stillExists, `blockId=${blockId} still present`, data);
}

// ----------------------------------------------------------------
// MAIN
// ----------------------------------------------------------------

async function main() {
  process.stdout.write('SMOKE COMBOS (CRUD + Relational Integrity)\n');

  let token: string;
  try {
    token = await tenantLogin();
    assert('tenant login', true, 'token obtained');
  } catch (err) {
    assert('tenant login', false, String(err));
    process.exitCode = 1;
    return;
  }

  const productId = await pickFirstProductId(token);
  assert('pick first product', typeof productId === 'string' && productId.length > 0, `productId=${productId}`);

  if (!productId) {
    process.stdout.write('Aborting: no products found.\n');
    process.exitCode = 1;
    return;
  }

  // 1. Create combo
  const comboId = await testCreateCombo(token);
  if (!comboId) {
    process.stdout.write('Aborting: failed to create combo.\n');
    process.exitCode = 1;
    return;
  }

  // 2. Create block
  const blockId = await testCreateBlock(token, comboId);
  if (!blockId) {
    process.stdout.write('Aborting: failed to create block.\n');
    process.exitCode = 1;
    return;
  }

  // 3. Create item
  const itemId = await testCreateItem(token, comboId, blockId, productId);
  if (!itemId) {
    process.stdout.write('Aborting: failed to create item.\n');
    process.exitCode = 1;
    return;
  }

  // 4. Edit block
  await testEditBlock(token, comboId, blockId);

  // 5. Edit item
  await testEditItem(token, comboId, blockId, itemId);

  // 6. Duplicate conflict
  await testDuplicateConflict(token, comboId, blockId, productId);

  // 7. Cross-combo block access
  await testCrossComboBlockAccess(token, comboId, blockId);

  // 8. Cross-block item access
  await testCrossBlockItemAccess(token, comboId, blockId, itemId);

  // 9. Delete item
  await testDeleteItem(token, comboId, blockId, itemId);

  // 10. Delete block
  await testDeleteBlock(token, comboId, blockId);

  // ----------------------------------------------------------------
  const failed = results.filter((r) => !r.passed);
  process.stdout.write(`\nResults: ${results.length - failed.length} passed, ${failed.length} failed\n`);
  if (failed.length) {
    failed.forEach((f) => process.stdout.write(`- ${f.name}: ${f.detail}\n`));
  }
  process.exitCode = failed.length ? 1 : 0;
}

main().catch((err: unknown) => {
  process.stderr.write(`SMOKE COMBOS crashed: ${String(err)}\n`);
  process.exitCode = 1;
});
