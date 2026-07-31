import { strict as assert } from 'node:assert';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium, type Page, type Route } from '@playwright/test';

const baseUrl = process.env.WEB_TENANT_URL || 'http://127.0.0.1:5173';
const artifactDir = join(process.cwd(), 'tmp', 'notification-visual-proof');
const user = {
  userId: 'visual-user',
  tenantId: 'visual-tenant',
  email: 'visual@example.invalid',
  name: 'Operador Visual',
  roles: ['owner'],
  permissions: ['billing.read', 'orders.read', 'settings.read', 'settings.manage'],
  enabledModules: [],
  onboardingCompletedAt: '2026-01-01T00:00:00.000Z',
  tenant: { id: 'visual-tenant', name: 'Loja Visual', slug: 'loja-visual', status: 'active' },
};
const tenant = {
  id: 'visual-tenant',
  name: 'Loja Visual',
  slug: 'loja-visual',
  status: 'active',
  settings: {
    browserNotificationsEnabled: true,
    whatsappNotificationsEnabled: false,
    storePaused: false,
  },
  operatingHours: [],
};

function responseFor(url: URL) {
  if (url.pathname.endsWith('/auth/tenant/me')) return user;
  if (url.pathname.endsWith('/tenant/me')) return tenant;
  if (url.pathname.endsWith('/tenant/operating-hours')) return [];
  if (url.pathname.endsWith('/tenant/platform-branding')) return {};
  if (url.pathname.endsWith('/tenant/capabilities')) return { enabledFeatures: [], enabledModules: [] };
  if (url.pathname.endsWith('/tenant/readiness-score')) return {};
  if (url.pathname.endsWith('/billing/state')) return { subscriptionStatus: 'active', warning: null };
  if (url.pathname.endsWith('/billing/me/invoices')) return [];
  if (url.pathname.endsWith('/billing/me')) return {
    subscription: null,
    plan: null,
    currentCycle: null,
    usagePreview: null,
    selectedTier: null,
    nextTier: null,
    estimatedMonthlyPrice: null,
    revenueUntilNextTier: null,
    latestInvoice: null,
    paymentModeInfo: {
      paymentsEnabled: false,
      provider: 'none',
      mode: 'disabled',
      productionAllowed: false,
      supportedProviders: [],
      automaticBillingActive: false,
      message: 'Mock visual local',
    },
    source: 'none',
    warning: null,
    entitlements: {
      commercialStatus: 'active',
      billableRevenue: 0,
      estimatedBasePrice: 0,
      addonsAmount: 0,
      estimatedTotalPrice: 0,
      activeAddons: [],
      ai: { canUse: false, source: 'none', monthlyLimit: 0, usedThisMonth: 0, remainingThisMonth: 0 },
      flags: {
        canUseAiAgent: false,
        canUseIfoodIntegration: false,
        canUseAdvancedReports: false,
        canUseCampaigns: false,
        canUseCustomDomain: false,
        canUsePrioritySupport: false,
      },
      channelsIncludedInBilling: [],
      trialAvailable: false,
    },
    partners: [],
  };
  if (url.pathname.endsWith('/health/ready/websocket')) return { status: 'ok', gateways: {} };
  if (url.pathname.endsWith('/orders')) return { items: [], total: 0 };
  return {};
}

async function mockApi(route: Route) {
  const url = new URL(route.request().url());
  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ success: true, data: responseFor(url) }),
  });
}

async function setTheme(page: Page, theme: 'light' | 'dark') {
  await page.evaluate((nextTheme) => {
    localStorage.setItem('gestor-delivery:tenant-panel-theme', nextTheme);
  }, theme);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await applySafeAreaSimulation(page);
}

async function applySafeAreaSimulation(page: Page) {
  await page.evaluate(() => {
    document.documentElement.classList.add('is-capacitor');
    document.documentElement.style.setProperty('--safe-area-top', '28px');
    document.documentElement.style.setProperty('--safe-area-bottom', '24px');
    document.documentElement.style.setProperty('--safe-area-left', '0px');
    document.documentElement.style.setProperty('--safe-area-right', '0px');
  });
}

async function emit(page: Page, event: Record<string, unknown>) {
  await page.evaluate((detail) => {
    window.dispatchEvent(new CustomEvent('tenant:notification-event', { detail }));
  }, event);
}

async function assertNoOverflow(page: Page) {
  const dimensions = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  assert.ok(dimensions.scrollWidth <= dimensions.clientWidth + 2, `horizontal overflow: ${JSON.stringify(dimensions)}`);
}

async function main() {
  process.stdout.write('VISUAL_STAGE prepare\n');
  await mkdir(artifactDir, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  process.stdout.write('VISUAL_STAGE browser-launched\n');
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    colorScheme: 'light',
  });
  await context.route('**/api/v1/**', mockApi);
  await context.addInitScript(() => {
    localStorage.setItem('accessToken', 'visual-local-token');
  });

  const page = await context.newPage();
  process.stdout.write('VISUAL_STAGE page-created\n');
  const consoleErrors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => consoleErrors.push(error.message));

  await page.goto(`${baseUrl}/dashboard`, { waitUntil: 'domcontentloaded' });
  await applySafeAreaSimulation(page);
  process.stdout.write('VISUAL_STAGE dashboard-loaded\n');
  await page.getByText('Receba alertas de novos pedidos').waitFor();
  process.stdout.write('VISUAL_STAGE activation-visible\n');
  const activationBanner = page.getByRole('alert').filter({ hasText: 'Receba alertas de novos pedidos' });
  const activationBox = await activationBanner.boundingBox();
  assert.ok(activationBox);
  await page.screenshot({ path: join(artifactDir, 'dashboard-mobile-light-activation-banner.png'), fullPage: true });
  assert.ok(
    activationBox.y + activationBox.height <= 844 - 24,
    `activation banner overlaps bottom safe area: ${JSON.stringify(activationBox)}`,
  );
  process.stdout.write('VISUAL_STAGE activation-captured\n');
  await assertNoOverflow(page);

  await activationBanner.getByRole('button', { name: /Permitir e ativar|Tentar novamente/ }).click();
  await page.waitForTimeout(300);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await applySafeAreaSimulation(page);
  assert.equal(
    await page.getByText('Receba alertas de novos pedidos').count(),
    0,
    'activation banner must stay dismissed after confirmed audio activation and reload',
  );
  await emit(page, {
    id: 'visual:new-order:1',
    type: 'order.created',
    orderId: 'order-1',
    title: 'Novo pedido #1001',
    message: 'Cliente Visual - R$ 42,00',
    priority: 'critical',
    createdAt: new Date().toISOString(),
    source: 'local',
  });
  await emit(page, {
    id: 'visual:order-ready:2',
    type: 'order.ready',
    orderId: 'order-2',
    title: 'Pedido #1002 pronto',
    message: 'Pronto para retirada.',
    priority: 'high',
    createdAt: new Date().toISOString(),
    source: 'local',
  });
  await page.getByRole('button', { name: 'Fechar notificação' }).first().waitFor();
  await page.waitForTimeout(350);
  assert.equal(await page.getByRole('button', { name: 'Fechar notificação' }).count(), 2);
  const firstNotificationText = await page.getByLabel('Notificações').locator('[role="alert"], [role="status"]').first().innerText();
  assert.match(firstNotificationText, /Novo pedido #1001/, 'new order must lead the notification stack');
  const toastBoxes = await page.getByRole('button', { name: 'Fechar notificação' }).evaluateAll((buttons) => (
    buttons.map((button) => button.parentElement?.getBoundingClientRect()).filter(Boolean).map((box) => ({
      x: box?.x ?? 0,
      y: box?.y ?? 0,
      width: box?.width ?? 0,
      height: box?.height ?? 0,
    }))
  ));
  const sortedToastBoxes = toastBoxes.sort((left, right) => left.y - right.y);
  const firstToastBox = sortedToastBoxes[0];
  await page.screenshot({ path: join(artifactDir, 'dashboard-mobile-light-two-toasts.png'), fullPage: true });
  assert.ok(
    firstToastBox && firstToastBox.y >= 28 + 52,
    `top toast overlaps safe area/header: ${JSON.stringify(firstToastBox)}`,
  );
  assert.ok(
    sortedToastBoxes[0].y + sortedToastBoxes[0].height <= sortedToastBoxes[1].y,
    `transient toasts overlap: ${JSON.stringify(sortedToastBoxes)}`,
  );
  process.stdout.write('VISUAL_STAGE toasts-captured\n');
  await page.getByRole('button', { name: 'Fechar notificação' }).first().click();
  await page.waitForFunction(() => document.querySelectorAll('button[aria-label="Fechar notificação"]').length === 1);
  assert.equal(await page.getByRole('button', { name: 'Fechar notificação' }).count(), 1);
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => document.querySelectorAll('button[aria-label="Fechar notificação"]').length === 0);
  assert.equal(await page.getByRole('button', { name: 'Fechar notificação' }).count(), 0);

  await setTheme(page, 'dark');
  await page.goto(`${baseUrl}/orders`, { waitUntil: 'domcontentloaded' });
  await applySafeAreaSimulation(page);
  await page.screenshot({ path: join(artifactDir, 'orders-mobile-dark.png'), fullPage: true });
  process.stdout.write('VISUAL_STAGE orders-captured\n');
  await assertNoOverflow(page);

  await page.goto(`${baseUrl}/billing`, { waitUntil: 'domcontentloaded' });
  await applySafeAreaSimulation(page);
  await page.screenshot({ path: join(artifactDir, 'billing-mobile-dark.png'), fullPage: true });
  process.stdout.write('VISUAL_STAGE billing-captured\n');
  await assertNoOverflow(page);

  await page.setViewportSize({ width: 844, height: 390 });
  await page.goto(`${baseUrl}/dashboard`, { waitUntil: 'domcontentloaded' });
  await applySafeAreaSimulation(page);
  await page.screenshot({ path: join(artifactDir, 'dashboard-mobile-landscape-dark.png'), fullPage: true });
  process.stdout.write('VISUAL_STAGE landscape-captured\n');
  await assertNoOverflow(page);

  assert.deepEqual(consoleErrors, [], `browser errors: ${consoleErrors.join('\n')}`);
  await context.close();
  await browser.close();
  process.stdout.write(`NOTIFICATION_MOBILE_VISUAL_E2E_PASS artifacts=${artifactDir}\n`);
}

void main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.stack || error.message : String(error)}\n`);
  process.exitCode = 1;
});
