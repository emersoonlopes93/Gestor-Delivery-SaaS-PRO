import { strict as assert } from 'node:assert';
import { mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { chromium, type Page, type Route } from '@playwright/test';

const webBase = process.env.ORDERS_UX_V2_WEB_BASE ?? 'http://127.0.0.1:5173';
const artifacts = resolve('..', 'pedehub-orders-ux-v2-artifacts');
const executablePath = process.env.ORDERS_UX_V2_CHROME_PATH;
const viewports = [
  { width: 1440, height: 900 }, { width: 1024, height: 768 }, { width: 768, height: 1024 }, { width: 390, height: 844 },
];

const operational = {
  origin: 'PEDEHUB', provider: null, displayChannel: 'PedeHub', deliveryOwnership: 'MERCHANT', fulfillmentMode: 'delivery',
  capabilities: { canConfirm: true, canStartPreparation: true, canMarkReady: true, canCancel: true, canAssignDriver: true, canDispatch: true, canRecalculateRoute: true, canComplete: true, canPrint: true, canEdit: true },
  availableActions: [
    { type: 'CONFIRM', targetStatus: 'confirmed', mode: 'LOCAL', enabled: true, label: 'Confirmar pedido', reason: null },
    { type: 'PRINT', targetStatus: null, mode: 'LOCAL', enabled: true, label: 'Imprimir', reason: null },
  ],
  marketplaceOperation: { state: 'NONE' }, syncState: 'NONE',
  financialSummary: { operationalValue: 42, operationalValueLabel: 'Venda', saleAmount: 42, customerPaid: null, paymentState: 'UNKNOWN', paymentLabel: 'Pagamento não confirmado' },
  deliverySummary: { ownership: 'MERCHANT', label: 'Entrega própria', driverName: 'Mário' }, productionSummary: { state: 'NOT_SENT', label: 'Aguardando cozinha' },
  primaryAction: { type: 'CONFIRM', targetStatus: 'confirmed', mode: 'LOCAL', enabled: true, label: 'Confirmar pedido', reason: null },
  secondaryActions: [{ type: 'PRINT', targetStatus: null, mode: 'LOCAL', enabled: true, label: 'Imprimir', reason: null }],
};

const boardOrder = {
  id: 'order-1', orderNumber: '1042', status: 'pending', fulfillmentType: 'delivery', customerName: 'Ana Souza', customerPhone: '11999990000', total: 42, itemsSubtotal: 38, itemCount: 2, itemsSummary: '2x Pizza especial', sourceChannel: 'storefront', createdAt: '2026-09-06T12:00:00.000Z', notes: 'Sem cebola', deliveryDriverId: 'driver-1', deliveryDriverName: 'Mário', isScheduled: false, operational,
};

const ifoodOperational = {
  ...operational, origin: 'IFOOD', provider: 'IFOOD', displayChannel: 'iFood', deliveryOwnership: 'PROVIDER',
  marketplaceOperation: { state: 'PENDING', friendlyMessage: 'Sincronizando com iFood…' }, syncState: 'PENDING',
  deliverySummary: { ownership: 'PROVIDER', label: 'Entrega pelo iFood' }, primaryAction: null, secondaryActions: [],
};
const food99Operational = {
  ...operational, origin: 'FOOD_99', provider: 'FOOD_99', displayChannel: '99Food', deliveryOwnership: 'PROVIDER',
  marketplaceOperation: { state: 'FAILED', friendlyMessage: 'Não foi possível sincronizar com 99Food' }, syncState: 'FAILED',
  deliverySummary: { ownership: 'PROVIDER', label: 'Entrega pelo 99Food' }, primaryAction: null, secondaryActions: [],
};
const boardOrders = [
  boardOrder,
  { ...boardOrder, id: 'order-2', orderNumber: '1043', status: 'preparing', customerName: 'Bruno Lima', customerPhone: '11988880000', createdAt: '2026-09-06T12:20:00.000Z', notes: null, deliveryDriverId: undefined, deliveryDriverName: undefined, operational: ifoodOperational },
  { ...boardOrder, id: 'order-3', orderNumber: '1044', status: 'ready_for_delivery', customerName: 'Carla Reis', customerPhone: '11977770000', createdAt: '2026-09-06T11:15:00.000Z', notes: 'Conferir endereço', deliveryDriverId: undefined, deliveryDriverName: undefined, operational: food99Operational },
];

const orderDetail = {
  ...boardOrder, customerEmail: null, deliveryFee: 4, normalDeliveryFee: 4, serviceFee: 0, discountTotal: 0, paymentMethod: 'pix', changeFor: null, couponId: null, cashbackUsed: null, deliveryAddress: { street: 'Rua das Flores', number: '42', neighborhood: 'Centro', city: 'São Paulo', state: 'SP', zipCode: '01000-000' }, timeline: [{ id: 't-1', status: 'pending', note: 'Pedido recebido', createdAt: '2026-09-06T12:00:00.000Z' }], items: [{ id: 'item-1', quantity: 2, snapshotName: 'Pizza especial', snapshotComposition: '{"options":[{"name":"Bacon"}]}', notes: 'Sem cebola', lineTotal: 38 }],
};

function envelope(data: unknown) { return { success: true, data }; }

async function fulfillApi(route: Route) {
  const pathname = new URL(route.request().url()).pathname;
  const payload = pathname.endsWith('/auth/tenant/me')
    ? { userId: 'user-1', tenantId: 'tenant-1', email: 'qa@example.test', name: 'QA', roles: ['owner'], permissions: ['orders.read', 'orders.use_kanban'], enabledModules: ['orders'], onboardingCompletedAt: '2026-09-01T12:00:00.000Z', tenant: { id: 'tenant-1', name: 'Pizzaria QA', slug: 'qa', status: 'active' } }
    : pathname.includes('/orders/operation/board') ? boardOrders
      : /^\/api\/v1\/orders\/?$/.test(pathname) ? { items: boardOrders, total: boardOrders.length }
        : pathname.endsWith('/orders/order-1') ? orderDetail
          : pathname.endsWith('/delivery/runs/order/order-1') ? { id: 'run-1', driverId: 'driver-1', driverName: 'Mário', status: 'IN_PROGRESS', version: 1, assignedAt: null, acceptedAt: null, startedAt: '2026-09-06T12:00:00.000Z', returningAt: null, completedAt: null, createdAt: '2026-09-06T12:00:00.000Z', route: { provider: 'fallback', quality: 'DEGRADED', version: 1, distanceMeters: 2200, durationSeconds: 660, calculatedAt: '2026-09-06T12:00:00.000Z', geometry: [] }, stops: [{ id: 'stop-1', orderId: 'order-1', sequence: 1, status: 'PENDING', attempts: 0, orderNumber: '1042', customerName: 'Ana Souza', customerPhone: '11999990000', address: null, arrivedAt: null, deliveredAt: null, failedAt: null, failureReason: null, returnRequiredAt: null, returnedAt: null, cancelledAt: null, cancellationReason: null, payAmount: null, payCurrency: null, routeDistanceMeters: 2200, routeDurationSeconds: 660, estimatedArrivalAt: '2026-09-06T12:20:00.000Z' }] }
            : pathname.endsWith('/delivery/runs/builder') ? { drivers: [] }
              : {};
  await route.fulfill({ contentType: 'application/json', body: JSON.stringify(envelope(payload)) });
}

async function assertNoPageOverflow(page: Page, label: string) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  assert.ok(overflow <= 1, `${label}: page overflow ${overflow}px`);
}

async function assertFullyVisible(page: Page, locator: ReturnType<Page['getByRole']> | ReturnType<Page['getByText']>, label: string) {
  const box = await locator.first().boundingBox();
  const viewport = await page.viewportSize();
  assert.ok(box && viewport, `${label}: element has no bounding box`);
  const fullyVisible = box.x >= 0 && box.y >= 0 && box.x + box.width <= viewport.width && box.y + box.height <= viewport.height;
  if (!fullyVisible) console.error(`E2E_CLIPPED ${label} box=${JSON.stringify(box)} viewport=${JSON.stringify(viewport)}`);
  assert.ok(fullyVisible, `${label}: element is clipped`);
}

async function openDrawer(page: Page) {
  await page.getByRole('button', { name: /Abrir detalhes do pedido 1042/i }).first().click();
  await page.getByRole('dialog').waitFor();
  await expectVisible(page, /Confirmar pedido/i);
}

async function expectVisible(page: Page, name: RegExp) {
  try {
    await page.getByText(name).first().waitFor({ state: 'visible' });
  } catch (error) {
    console.error(`E2E_PAGE_URL=${page.url()}`);
    console.error(`E2E_PAGE_TEXT=${(await page.locator('body').innerText()).slice(0, 2_000)}`);
    throw error;
  }
}

async function capturePage(page: Page, label: string, route: '/orders' | '/orders/board') {
  await page.goto(`${webBase}${route}`, { waitUntil: 'domcontentloaded' });
  await expectVisible(page, route === '/orders' ? /Pedidos/i : /Painel de Operações/i);
  const notificationBannerClose = page.getByRole('button', { name: /Fechar notifica/i });
  if (await notificationBannerClose.isVisible().catch(() => false)) await notificationBannerClose.click();
  if (route === '/orders/board') {
    await page.getByLabel(/Buscar pedido/i).fill('Ana');
    await page.getByRole('button', { name: /Todos/i }).click();
    const tab = page.getByRole('tab', { name: /Produção/i });
    if (await tab.isVisible().catch(() => false)) await tab.focus();
    await page.keyboard.press('Enter');
    const entryTab = page.getByRole('tab', { name: /Entrada/i });
    if (await entryTab.isVisible().catch(() => false)) await entryTab.click();
    await page.getByRole('button', { name: /Abrir ações secundárias/i }).click();
    await page.keyboard.press('Escape');
    await assertFullyVisible(page, page.getByRole('heading', { name: /Painel de Operações/i }), `${label}: board title`);
    await assertFullyVisible(page, page.getByRole('button', { name: /Compacto/i }), `${label}: compact mode`);
    await assertFullyVisible(page, page.getByRole('button', { name: /Padrão/i }), `${label}: standard mode`);
    await assertFullyVisible(page, page.getByRole('button', { name: /Cozinha/i }), `${label}: kitchen mode`);
    await assertFullyVisible(page, page.getByRole('button', { name: /Sons de novos pedidos/i }), `${label}: audio control`);
    await assertFullyVisible(page, page.getByRole('button', { name: /Atualizar quadro agora/i }), `${label}: refresh control`);
    await assertFullyVisible(page, page.getByText(/Precisa confirmar/i), `${label}: priority band`);
    await assertFullyVisible(page, page.getByText(/há \d+ min/i), `${label}: time band`);
    await assertFullyVisible(page, page.getByText('#1042', { exact: true }), `${label}: identity band`);
    await assertFullyVisible(page, page.getByText(/Novo — precisa confirmar/i), `${label}: status band`);
    if ((await page.viewportSize())!.width >= 1280) {
      await expectVisible(page, /iFood/i);
      await expectVisible(page, /99Food/i);
      await expectVisible(page, /Falha de sincronização/i);
    }
  } else {
    await page.getByLabel(/Buscar por número/i).fill('1042');
  }
  await assertNoPageOverflow(page, `${label}-${route}`);
  await page.screenshot({ path: join(artifacts, `${label}-${route.replaceAll('/', '-')}.png`), fullPage: true });
  await openDrawer(page);
  const primary = page.getByRole('button', { name: /Confirmar pedido/i }).first();
  const box = await primary.boundingBox();
  assert.ok(box && box.y < (await page.viewportSize())!.height, `${label}-${route}: primary drawer action is not visible`);
  await assertNoPageOverflow(page, `${label}-${route}-drawer`);
  await page.screenshot({ path: join(artifacts, `${label}-${route.replaceAll('/', '-')}-drawer.png`), fullPage: true });
}

async function main() {
  await mkdir(artifacts, { recursive: true });
  const browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) });
  try {
    for (const viewport of viewports) {
      const themes = viewport.width === 1440 || viewport.width === 390 ? ['light', 'dark'] as const : ['light'] as const;
      for (const theme of themes) {
      const context = await browser.newContext({ viewport, colorScheme: theme });
      await context.addInitScript((selectedTheme) => {
        localStorage.setItem('accessToken', 'orders-ux-v2-deterministic-token');
        localStorage.setItem('gestor-delivery:tenant-panel-theme', selectedTheme);
      }, theme);
      await context.route('**/api/v1/**', fulfillApi);
      const page = await context.newPage();
      const label = `${viewport.width}x${viewport.height}-${theme}`;
      await capturePage(page, label, '/orders/board');
      await capturePage(page, label, '/orders');
      await context.close();
      console.log(`PASS ${label}`);
      }
    }
  } finally { await browser.close(); }
  console.log(`ORDERS_UX_V2_RESPONSIVE_E2E_PASS artifacts=${artifacts}`);
}

main().catch((error: unknown) => { console.error(error instanceof Error ? error.stack ?? error.message : String(error)); process.exitCode = 1; });
