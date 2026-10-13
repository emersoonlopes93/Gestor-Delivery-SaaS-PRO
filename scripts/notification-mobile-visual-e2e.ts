import { strict as assert } from 'node:assert';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium, type Browser, type BrowserContext, type Page, type Route } from '@playwright/test';
import type { DashboardOperationalDTO } from '@gestor/types';

const baseUrl = process.env.WEB_TENANT_URL || 'http://127.0.0.1:5173';
const artifactDir = join(process.cwd(), 'tmp', 'notification-visual-proof');
const user = {
  userId: 'visual-user',
  tenantId: 'visual-tenant',
  email: 'visual@example.invalid',
  name: 'Operador Visual',
  roles: ['owner'],
  permissions: ['billing.read', 'dashboard.view', 'orders.read', 'settings.read', 'settings.manage'],
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

function dashboardOperationalFixture(url: URL): DashboardOperationalDTO {
  const byStatus: DashboardOperationalDTO['orders']['byStatus'] = {
    pending: 0,
    confirmed: 0,
    preparing: 0,
    ready_for_pickup: 0,
    ready_for_delivery: 0,
    out_for_delivery: 0,
    completed: 0,
    cancelled: 0,
    draft: 0,
  };
  return {
    period: {
      from: url.searchParams.get('from') ?? '2026-01-01',
      to: url.searchParams.get('to') ?? '2026-01-01',
      timezone: 'America/Sao_Paulo',
    },
    orders: { total: 0, byStatus, cancelled: 0, cancellationRate: 0 },
    completedSales: { orderCount: 0, grossOrderTotal: 0, averageTicket: 0 },
  };
}

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
  if (url.pathname.endsWith('/dashboard/operational')) return dashboardOperationalFixture(url);
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

async function saveActivationDiagnostic(page: Page, phase: 'before-role-wait' | 'on-failure'): Promise<void> {
  const prefix = join(artifactDir, `activation-${phase}`);
  try {
    await page.screenshot({ path: `${prefix}.png`, fullPage: true });
    process.stdout.write(`VISUAL_DIAGNOSTIC_SCREENSHOT phase=${phase} path=${prefix}.png\n`);
  } catch (error: unknown) {
    process.stderr.write(`VISUAL_DIAGNOSTIC_SCREENSHOT_FAILED phase=${phase} reason=${error instanceof Error ? error.message : String(error)}\n`);
  }

  try {
    const snapshot = await page.evaluate(() => {
      const title = 'Receba alertas de novos pedidos';
      const describe = (element: Element) => {
        const style = window.getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        const closestAlert = element.closest('[role="alert"]');
        return {
          tagName: element.tagName,
          isConnected: element.isConnected,
          className: element.getAttribute('class'),
          role: element.getAttribute('role'),
          ariaHidden: element.getAttribute('aria-hidden'),
          display: style.display,
          visibility: style.visibility,
          opacity: style.opacity,
          rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
          closestAlert: closestAlert
            ? { tagName: closestAlert.tagName, className: closestAlert.getAttribute('class'), role: closestAlert.getAttribute('role') }
            : null,
        };
      };
      const titleNodes = Array.from(document.querySelectorAll('p'))
        .filter((element) => element.textContent?.trim() === title)
        .map(describe);
      const alerts = Array.from(document.querySelectorAll('[role="alert"]'));
      const alertCandidates = alerts.map((element) => ({
        ...describe(element),
        containsActivationTitle: element.textContent?.includes(title) ?? false,
        textLength: element.textContent?.trim().length ?? 0,
        containsTitleNode: Array.from(element.querySelectorAll('p')).some((node) => node.textContent?.trim() === title),
      }));
      const activationButton = Array.from(document.querySelectorAll('button')).find((button) => (
        button.textContent?.includes('ativar som') || button.textContent?.includes('Tentar novamente')
      ));

      return {
        capturedAt: new Date().toISOString(),
        location: window.location.pathname,
        readyState: document.readyState,
        titleNodeCount: titleNodes.length,
        titleNodes,
        alertCount: alerts.length,
        divAlertCount: document.querySelectorAll('div[role="alert"]').length,
        alertsContainingTitleCount: alertCandidates.filter((candidate) => candidate.containsActivationTitle).length,
        alertCandidates,
        activationButton: activationButton ? describe(activationButton) : null,
      };
    });
    await writeFile(`${prefix}.json`, JSON.stringify(snapshot, null, 2));
    process.stdout.write(`VISUAL_DIAGNOSTIC_DOM phase=${phase} path=${prefix}.json\n`);
  } catch (error: unknown) {
    process.stderr.write(`VISUAL_DIAGNOSTIC_DOM_FAILED phase=${phase} reason=${error instanceof Error ? error.message : String(error)}\n`);
  }
}

async function main() {
  process.stdout.write('VISUAL_STAGE prepare\n');
  await mkdir(artifactDir, { recursive: true });
  let browser: Browser | undefined;
  let context: BrowserContext | undefined;
  let page: Page | undefined;
  let testFailure: unknown;

  try {
    browser = await chromium.launch({ headless: true });
    process.stdout.write('VISUAL_STAGE browser-launched\n');
    context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      colorScheme: 'light',
    });
    await context.route('**/api/v1/**', mockApi);
    await context.addInitScript(() => {
      localStorage.setItem('accessToken', 'visual-local-token');
    });

    page = await context.newPage();
    process.stdout.write('VISUAL_STAGE page-created\n');
    if (process.env.NOTIFICATION_MOBILE_VISUAL_E2E_FORCE_FAILURE === '1') {
      throw new Error('Controlled notification mobile visual E2E failure');
    }
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
    await saveActivationDiagnostic(page, 'before-role-wait');
    const activationBanner = page.locator('div[role="alert"]').filter({ hasText: 'Receba alertas de novos pedidos' });
    await activationBanner.waitFor({ state: 'visible' });
    await page.screenshot({ path: join(artifactDir, 'dashboard-mobile-light-activation-banner.png'), fullPage: true });
    const activationBox = await activationBanner.boundingBox();
    assert.ok(activationBox, `activation banner must have a layout box (matches=${await activationBanner.count()})`);
    assert.ok(
    activationBox.y + activationBox.height <= 844 - 24,
    `activation banner overlaps bottom safe area: ${JSON.stringify(activationBox)}`,
    );
    process.stdout.write('VISUAL_STAGE activation-captured\n');
    await assertNoOverflow(page);

  await activationBanner.getByRole('button', { name: /Permitir notificacoes e ativar som|Tentar novamente/ }).click();
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
  process.stdout.write(`NOTIFICATION_MOBILE_VISUAL_E2E_PASS artifacts=${artifactDir}\n`);
  } catch (error: unknown) {
    testFailure = error;
    if (page && !page.isClosed()) {
      await saveActivationDiagnostic(page, 'on-failure');
    }
    throw error;
  } finally {
    const cleanupFailures: unknown[] = [];
    if (context) {
      try {
        await context.close();
      } catch (error: unknown) {
        cleanupFailures.push(error);
      }
    }
    if (browser) {
      try {
        await browser.close();
      } catch (error: unknown) {
        cleanupFailures.push(error);
      }
    }
    for (const cleanupFailure of cleanupFailures) {
      process.stderr.write(`Notification mobile visual E2E cleanup failed: ${cleanupFailure instanceof Error ? cleanupFailure.message : String(cleanupFailure)}\n`);
    }
    if (testFailure === undefined && cleanupFailures.length > 0) {
      throw cleanupFailures[0];
    }
  }
}

void main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.stack || error.message : String(error)}\n`);
  process.exitCode = 1;
});
