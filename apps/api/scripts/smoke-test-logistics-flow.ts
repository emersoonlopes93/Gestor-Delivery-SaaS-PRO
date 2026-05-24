/**
 * Smoke Test — Fluxo logístico completo (API-first)
 *
 * Prerequisites:
 *   1. PostgreSQL + migrations + seed
 *   2. API running: pnpm --filter @gestor/api dev
 *
 * Run:
 *   pnpm --filter @gestor/api smoke:logistics
 *
 * Env:
 *   SMOKE_API_BASE_URL, SMOKE_TENANT_SLUG, SMOKE_TENANT_EMAIL, SMOKE_TENANT_PASSWORD
 */

export {};

declare const process: {
  env: Record<string, string | undefined>;
  exit: (code?: number) => void;
};

import type { OrderStatus } from '@gestor/types';

interface SmokeDispatchItem {
  id: string;
  orderNumber: string;
  status: string;
  deliveryDriverId?: string;
  deliveryDriverName?: string;
}

interface SmokeBoardItem {
  id: string;
  orderNumber: string;
  status: string;
  deliveryDriverId?: string;
  deliveryDriverName?: string;
}

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
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
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function pickBoolean(obj: Record<string, unknown>, key: string): boolean | null {
  const v = obj[key];
  return typeof v === 'boolean' ? v : null;
}

async function api(
  method: string,
  path: string,
  body?: unknown,
  token?: string,
): Promise<{ status: number; data: unknown; raw: unknown }> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${API}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const raw: unknown = await res.json().catch(() => ({}));

  const data =
    isRecord(raw) && 'success' in raw && raw.success === true && 'data' in raw
      ? raw.data
      : raw;

  return { status: res.status, data, raw };
}

function assert(name: string, condition: boolean, detail: string, payload?: unknown): void {
  const fullDetail = payload !== undefined ? `${detail} | ${JSON.stringify(payload)}` : detail;
  results.push({ name, passed: condition, detail: fullDetail });
  console.log(condition ? `  ✅ ${name}` : `  ❌ ${name}: ${fullDetail}`);
}

async function getTenantToken(): Promise<string> {
  const { status, data } = await api('POST', '/auth/tenant/login', {
    email: TENANT_EMAIL,
    password: TENANT_PASSWORD,
    tenantSlug: TENANT_SLUG,
  });

  if (status !== 200 && status !== 201) return '';

  if (!isRecord(data)) return '';
  const accessToken = data.accessToken;
  return typeof accessToken === 'string' ? accessToken : '';
}

function pickFirstProductIdWithoutRequiredComplements(storefront: unknown): string | null {
  if (!isRecord(storefront)) return null;
  const categories = asArray(storefront.categories);

  for (const cat of categories) {
    if (!isRecord(cat)) continue;
    for (const p of asArray(cat.products)) {
      if (!isRecord(p)) continue;
      const complements = asArray(p.complements);
      const hasRequired = complements.some((g) => isRecord(g) && g.isRequired === true);
      if (!hasRequired) {
        const id = pickString(p, 'id');
        if (id) return id;
      }
    }
  }
  return null;
}

function parseDispatchItem(o: unknown): SmokeDispatchItem | null {
  if (!isRecord(o)) return null;
  const id = pickString(o, 'id');
  const orderNumber = pickString(o, 'orderNumber');
  const status = pickString(o, 'status');
  if (!id || !orderNumber || !status) return null;
  const deliveryDriverId = pickString(o, 'deliveryDriverId') ?? undefined;
  const deliveryDriverName = pickString(o, 'deliveryDriverName') ?? undefined;
  return { id, orderNumber, status, deliveryDriverId, deliveryDriverName };
}

function parseBoardItem(o: unknown): SmokeBoardItem | null {
  if (!isRecord(o)) return null;
  const id = pickString(o, 'id');
  const orderNumber = pickString(o, 'orderNumber');
  const status = pickString(o, 'status');
  if (!id || !orderNumber || !status) return null;
  const deliveryDriverId = pickString(o, 'deliveryDriverId') ?? undefined;
  const deliveryDriverName = pickString(o, 'deliveryDriverName') ?? undefined;
  return { id, orderNumber, status, deliveryDriverId, deliveryDriverName };
}

function driverHasGps(driver: Record<string, unknown>): boolean {
  const lat = driver.currentLat;
  const lng = driver.currentLng;
  return typeof lat === 'number' && typeof lng === 'number';
}

function driverAwaitingLocation(driver: Record<string, unknown>): boolean {
  return !driverHasGps(driver);
}

async function patchStatus(orderId: string, token: string, status: OrderStatus, note?: string): Promise<number> {
  const { status: httpStatus } = await api(
    'PATCH',
    `/orders/${orderId}/status`,
    { status, note },
    token,
  );
  return httpStatus;
}

async function ensureAvailableDriver(token: string): Promise<{
  driverId: string;
  phone: string;
  pin: string;
} | null> {
  const { status, data } = await api('GET', '/delivery/drivers', undefined, token);
  if (status === 200) {
    for (const row of asArray(data)) {
      if (!isRecord(row)) continue;
      const id = pickString(row, 'id');
      const phone = pickString(row, 'phone');
      const driverStatus = pickString(row, 'status');
      const isActive = pickBoolean(row, 'isActive');
      if (id && phone && driverStatus === 'available' && isActive === true) {
        const reset = await api('POST', `/delivery/drivers/${id}/reset-pin`, undefined, token);
        if (reset.status === 200 || reset.status === 201) {
          const resetData = isRecord(reset.data) ? reset.data : null;
          const pin = resetData ? pickString(resetData, 'pin') : null;
          if (pin) return { driverId: id, phone, pin };
        }
      }
    }
  }

  const suffix = `${Date.now()}`.slice(-8);
  const phone = `11988${suffix}`;
  const create = await api(
    'POST',
    '/delivery/drivers',
    { name: `Smoke Logistics ${suffix}`, phone },
    token,
  );

  if (create.status !== 200 && create.status !== 201) return null;
  if (!isRecord(create.data)) return null;

  const driverId = pickString(create.data, 'id');
  const pin = pickString(create.data, 'pin');
  const normalizedPhone = pickString(create.data, 'phone') ?? phone;

  if (!driverId || !pin) return null;
  return { driverId, phone: normalizedPhone, pin };
}

async function main(): Promise<void> {
  console.log('🧪 Smoke Test — Fluxo Logístico Completo');
  console.log('='.repeat(60));
  console.log(`API: ${API}`);
  console.log(`Tenant: ${TENANT_SLUG}`);

  const token = await getTenantToken();
  assert('1. Tenant login', token.length > 20, `Token vazio (verifique API em ${API})`);
  if (!token) {
    printSummary();
    process.exit(1);
  }

  const { data: storefront } = await api('GET', `/public/storefront/${TENANT_SLUG}`);
  const productId = pickFirstProductIdWithoutRequiredComplements(storefront);
  assert('Storefront com produto', productId !== null, 'Nenhum produto simples no catálogo');
  if (!productId) {
    printSummary();
    process.exit(1);
  }

  const customerPhone = `11977${`${Date.now()}`.slice(-7)}`;
  const { status: checkoutStatus, data: orderData } = await api(
    'POST',
    `/orders/public-checkout/${TENANT_SLUG}`,
    {
      idempotencyKey: `smoke-logistics-${Date.now()}`,
      items: [
        {
          lineType: 'product',
          productId,
          quantity: 1,
          complements: [],
        },
      ],
      customerName: 'Smoke Logistics Flow',
      customerPhone,
      fulfillmentType: 'delivery',
      deliveryAddress: {
        street: 'Rua Logística',
        number: '100',
        neighborhood: 'Centro',
        city: 'São Paulo',
        state: 'SP',
        zipCode: '01001000',
        lat: -23.55052,
        lng: -46.633308,
      },
    },
  );

  assert('2. Criar pedido delivery', checkoutStatus === 200 || checkoutStatus === 201, `HTTP ${checkoutStatus}`, orderData);

  const orderRec = isRecord(orderData) ? orderData : null;
  const orderId = orderRec ? pickString(orderRec, 'id') : null;
  assert('Pedido possui id', orderId !== null, 'id ausente');
  if (!orderId) {
    printSummary();
    process.exit(1);
  }

  let st = await patchStatus(orderId, token, 'confirmed');
  assert('Status → confirmed', st === 200, `HTTP ${st}`);
  st = await patchStatus(orderId, token, 'preparing');
  assert('Status → preparing', st === 200, `HTTP ${st}`);
  st = await patchStatus(orderId, token, 'ready_for_delivery');
  assert('3. Status → ready_for_delivery', st === 200, `HTTP ${st}`);

  const driverCreds = await ensureAvailableDriver(token);
  assert('4. Entregador disponível (criado ou reutilizado)', driverCreds !== null, 'Falha ao obter entregador');
  if (!driverCreds) {
    printSummary();
    process.exit(1);
  }

  const { driverId, phone: driverPhone, pin: driverPin } = driverCreds;

  const { status: assignStatus, data: assignData } = await api(
    'POST',
    `/orders/${orderId}/assign-driver`,
    { driverId },
    token,
  );
  assert('5. Atribuir entregador', assignStatus === 200 || assignStatus === 201, `HTTP ${assignStatus}`, assignData);

  const assignItem = parseDispatchItem(assignData);
  assert(
    '5b. Assign retorna deliveryDriverId',
    assignItem?.deliveryDriverId === driverId,
    `Esperado ${driverId}, recebido ${String(assignItem?.deliveryDriverId)}`,
    assignData,
  );

  const { status: detailStatus1, data: detail1 } = await api('GET', `/orders/${orderId}`, undefined, token);
  assert('GET pedido após assign', detailStatus1 === 200, `HTTP ${detailStatus1}`);
  const detailRec1 = isRecord(detail1) ? detail1 : null;
  assert(
    '6. deliveryDriverId no pedido',
    pickString(detailRec1 ?? {}, 'deliveryDriverId') === driverId,
    `driverId=${String(detailRec1?.deliveryDriverId)}`,
  );

  const { status: driverGetStatus, data: driverAfterAssign } = await api(
    'GET',
    `/delivery/drivers/${driverId}`,
    undefined,
    token,
  );
  assert('GET entregador', driverGetStatus === 200, `HTTP ${driverGetStatus}`);
  const driverAssignRec = isRecord(driverAfterAssign) ? driverAfterAssign : null;
  assert(
    '7. Driver status busy',
    pickString(driverAssignRec ?? {}, 'status') === 'busy',
    `status=${String(driverAssignRec?.status)}`,
  );

  const { status: dispatchStatus, data: dispatchData } = await api(
    'GET',
    '/orders/operation/dispatch',
    undefined,
    token,
  );
  assert('GET dispatch', dispatchStatus === 200, `HTTP ${dispatchStatus}`);
  const dispatchList = asArray(dispatchData)
    .map(parseDispatchItem)
    .filter((o): o is SmokeDispatchItem => o !== null);
  const inDispatch = dispatchList.find((o) => o.id === orderId);
  assert(
    '8. Pedido no dispatch',
    inDispatch !== undefined && inDispatch.status === 'ready_for_delivery',
    `Encontrado=${Boolean(inDispatch)}, status=${String(inDispatch?.status)}`,
  );
  assert(
    '8b. Dispatch com nome do entregador',
    inDispatch?.deliveryDriverName !== undefined && inDispatch.deliveryDriverName.length > 0,
    `Nome=${String(inDispatch?.deliveryDriverName)}`,
  );

  const { status: boardStatus, data: boardData } = await api(
    'GET',
    '/orders/operation/board',
    undefined,
    token,
  );
  assert('GET board', boardStatus === 200, `HTTP ${boardStatus}`);
  const boardList = asArray(boardData)
    .map(parseBoardItem)
    .filter((o): o is SmokeBoardItem => o !== null);
  const inBoard = boardList.find((o) => o.id === orderId);
  assert('9. Pedido no board', inBoard !== undefined, 'Pedido ausente do board');
  assert(
    '9b. Board com deliveryDriverId',
    inBoard?.deliveryDriverId === driverId,
    `board driver=${String(inBoard?.deliveryDriverId)}`,
  );

  const { status: driversListStatus, data: driversListData } = await api(
    'GET',
    '/delivery/drivers',
    undefined,
    token,
  );
  assert('GET drivers (mapa/logística)', driversListStatus === 200, `HTTP ${driversListStatus}`);
  const driversList = asArray(driversListData);
  const driverInList = driversList.find((d) => isRecord(d) && pickString(d, 'id') === driverId);
  assert('10. Driver retornado na listagem', isRecord(driverInList), 'Driver não encontrado');
  const noGpsDetail = isRecord(driverInList)
    ? `lat/lng=${String(pickNumber(driverInList, 'currentLat'))},${String(pickNumber(driverInList, 'currentLng'))}`
    : 'driver ausente';
  assert(
    '10b. Aguardando localização (sem GPS)',
    isRecord(driverInList) && driverAwaitingLocation(driverInList),
    noGpsDetail,
  );

  const driverLogin = await api('POST', '/auth/driver/login', {
    phone: driverPhone,
    pin: driverPin,
    tenantSlug: TENANT_SLUG,
  });
  assert(
    '11. Login app entregador',
    driverLogin.status === 200 || driverLogin.status === 201,
    `HTTP ${driverLogin.status}`,
    driverLogin.raw,
  );

  const driverLoginRec = isRecord(driverLogin.data) ? driverLogin.data : null;
  const driverToken =
    driverLoginRec && typeof driverLoginRec.accessToken === 'string'
      ? driverLoginRec.accessToken
      : '';

  assert('11b. Driver accessToken', driverToken.length > 20, 'Token vazio');

  const { status: runsStatus, data: runsData } = await api(
    'GET',
    '/delivery/driver/active-runs',
    undefined,
    driverToken,
  );
  assert('GET active-runs', runsStatus === 200, `HTTP ${runsStatus}`);
  const runs = asArray(runsData);
  const runForOrder = runs.find((r) => isRecord(r) && pickString(r, 'id') === orderId);
  assert(
    '12. Entrega atribuída no app',
    isRecord(runForOrder) && pickString(runForOrder, 'status') === 'ready_for_delivery',
    `runs=${runs.length}`,
    runsData,
  );

  const dispatchOut = await patchStatus(
    orderId,
    token,
    'out_for_delivery',
    'Despachado para entrega (smoke).',
  );
  assert('Despacho → out_for_delivery', dispatchOut === 200, `HTTP ${dispatchOut}`);

  const testLat = -23.561684;
  const testLng = -46.625378;

  const { status: locDriverStatus } = await api(
    'POST',
    '/delivery/driver/location',
    { lat: testLat, lng: testLng },
    driverToken,
  );
  assert('13. Enviar localização (app)', locDriverStatus === 200 || locDriverStatus === 201, `HTTP ${locDriverStatus}`);

  const { status: driversAfterLocStatus, data: driversAfterLoc } = await api(
    'GET',
    '/delivery/drivers',
    undefined,
    token,
  );
  assert('GET drivers após GPS', driversAfterLocStatus === 200, `HTTP ${driversAfterLocStatus}`);
  const driverWithGps = asArray(driversAfterLoc).find((d) => isRecord(d) && pickString(d, 'id') === driverId);
  assert('14. Mapa/logística com lat/lng', isRecord(driverWithGps) && driverHasGps(driverWithGps), 'GPS ausente', driverWithGps);
  if (isRecord(driverWithGps)) {
    const lat = pickNumber(driverWithGps, 'currentLat');
    const lng = pickNumber(driverWithGps, 'currentLng');
    assert(
      '14b. Coordenadas próximas do envio',
      lat !== null && lng !== null && Math.abs(lat - testLat) < 0.01 && Math.abs(lng - testLng) < 0.01,
      `lat=${lat}, lng=${lng}`,
    );
  }

  const { status: completeStatus } = await api(
    'PATCH',
    `/delivery/driver/runs/${orderId}/complete`,
    undefined,
    driverToken,
  );
  assert('15. Concluir entrega (app)', completeStatus === 200, `HTTP ${completeStatus}`);

  const { status: detailFinalStatus, data: detailFinal } = await api(
    'GET',
    `/orders/${orderId}`,
    undefined,
    token,
  );
  assert('GET pedido final', detailFinalStatus === 200, `HTTP ${detailFinalStatus}`);
  const detailFinalRec = isRecord(detailFinal) ? detailFinal : null;
  assert(
    '16. Pedido completed',
    pickString(detailFinalRec ?? {}, 'status') === 'completed',
    `status=${String(detailFinalRec?.status)}`,
  );

  const { status: driverFinalStatus, data: driverFinal } = await api(
    'GET',
    `/delivery/drivers/${driverId}`,
    undefined,
    token,
  );
  assert('GET driver final', driverFinalStatus === 200, `HTTP ${driverFinalStatus}`);
  assert(
    '17. Driver available',
    pickString(isRecord(driverFinal) ? driverFinal : {}, 'status') === 'available',
    `status=${String(isRecord(driverFinal) ? driverFinal.status : null)}`,
  );

  const { status: dispatchFinalStatus, data: dispatchFinal } = await api(
    'GET',
    '/orders/operation/dispatch',
    undefined,
    token,
  );
  assert('GET dispatch final', dispatchFinalStatus === 200, `HTTP ${dispatchFinalStatus}`);
  const stillInDispatch = asArray(dispatchFinal).some(
    (o) => isRecord(o) && pickString(o, 'id') === orderId,
  );
  assert('18. Pedido saiu do dispatch', !stillInDispatch, 'Pedido ainda listado no dispatch');

  const outForDeliveryOnMap = asArray(dispatchFinal).filter(
    (o) => isRecord(o) && pickString(o, 'status') === 'out_for_delivery' && pickString(o, 'id') === orderId,
  );
  assert('18b. Pedido fora do mapa (dispatch/out_for_delivery)', outForDeliveryOnMap.length === 0, 'Ainda em rota');

  const timeline = asArray(detailFinalRec?.timeline);
  const timelineTexts: string[] = [];
  const timelineStatuses: string[] = [];
  for (const entry of timeline) {
    if (!isRecord(entry)) continue;
    const note = pickString(entry, 'note');
    const status = pickString(entry, 'status');
    if (note) timelineTexts.push(note);
    if (status) timelineStatuses.push(status);
  }

  const hasAssignNote = timelineTexts.some((n) => n.toLowerCase().includes('entregador atribuído'));
  const hasDispatchNote = timelineTexts.some(
    (n) => n.toLowerCase().includes('despach') || n.toLowerCase().includes('out_for_delivery'),
  );
  const hasComplete =
    timelineStatuses.includes('completed') ||
    timelineTexts.some((n) => n.toLowerCase().includes('conclu'));

  assert('19a. Timeline: atribuição', hasAssignNote, timelineTexts.join(' | '));
  assert('19b. Timeline: despacho', hasDispatchNote, timelineTexts.join(' | '));
  assert('19c. Timeline: conclusão', hasComplete, timelineTexts.join(' | '));

  printSummary();
  const failed = results.filter((r) => !r.passed).length;
  process.exit(failed > 0 ? 1 : 0);
}

function printSummary(): void {
  console.log('='.repeat(60));
  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;
  console.log(`Results: ${passed} passed, ${failed} failed, ${results.length} total`);
  if (failed > 0) {
    console.log('\nFailed:');
    for (const r of results.filter((x) => !x.passed)) {
      console.log(`  - ${r.name}: ${r.detail}`);
    }
  }
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  if (message.includes('fetch failed')) {
    console.error(`❌ API inacessível em ${API}`);
    console.error('   1. Copie .env.example → .env na raiz do monorepo');
    console.error('   2. Suba PostgreSQL e rode: pnpm db:migrate && pnpm db:seed');
    console.error('   3. Inicie a API: pnpm dev:api');
    console.error('   4. Execute: pnpm --filter @gestor/api smoke:logistics');
  } else {
    console.error('Fatal:', message);
  }
  process.exit(1);
});
