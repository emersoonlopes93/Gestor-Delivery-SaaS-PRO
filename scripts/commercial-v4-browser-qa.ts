import { strict as assert } from 'node:assert';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import * as bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';
import { chromium, type BrowserContext, type Page } from '@playwright/test';
import { ensureDefaultTenantRoles } from '../apps/api/src/tenant/default-tenant-roles';

const allowedHosts = new Set(['localhost', '127.0.0.1', '::1', 'ephemeral-postgres']);
const apiBase = 'http://127.0.0.1:3333/api/v1';
const tenantUrl = 'http://127.0.0.1:5173';
const storefrontUrl = 'http://127.0.0.1:3000';
const artifactDir = resolve('qa-artifacts/commercial-v4-browser');
const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const password = `V4-${suffix}-test`;

type Fixture = { id: string; slug: string; categorySlug: string; productId: string; email: string; deliveryOnly: boolean };
type LoginResponse = { accessToken?: string; data?: { accessToken?: string } };
type Activation = { storefrontSlug: string; firstStorefrontOrder: unknown | null; operationallyReady: boolean };
type ScenarioStatus = 'PASS' | 'FAIL' | 'NOT_PROVEN';
type NetworkDiagnostic = {
  id: number;
  contextId: string;
  method: string;
  hostname: string;
  path: string;
  errorText: string;
  phase: string;
  route: string;
  timestampMs: number;
  responseStatus: number | null;
  requestFinished: boolean;
  pageContentReady: boolean;
  contentReadyEvidence: string | null;
  completedRequestId: number | null;
  visualEvidence: string | null;
};
type RequestTrace = Omit<NetworkDiagnostic, 'errorText' | 'pageContentReady' | 'contentReadyEvidence' | 'completedRequestId' | 'visualEvidence'> & {
  errorText: string | null;
};
type StorefrontProof = {
  slug: string;
  initialLoadPhases: readonly string[];
  flowCompleted: boolean;
  visualEvidence: string | null;
};
type PageProbe = {
  markStorefrontContentReady: (evidence: string) => void;
  finalize: (proof?: StorefrontProof) => void;
};
type Report = {
  qaResult: 'PASS' | 'FAIL';
  scenarios: Record<string, ScenarioStatus>;
  screenshots: string[];
  errors: string[];
  networkDiagnostics: NetworkDiagnostic[];
  expectedNavigationAborts: NetworkDiagnostic[];
  recoveredInitialLoadAborts: NetworkDiagnostic[];
  unexpectedNetworkFailures: number;
};

function assertEphemeralDatabase(): void {
  if (process.env.NODE_ENV !== 'test') throw new Error('Commercial V4 browser QA requires NODE_ENV=test.');
  const databaseUrl = process.env.DATABASE_URL;
  const directUrl = process.env.DIRECT_URL;
  if (!databaseUrl || !directUrl) throw new Error('DATABASE_URL and DIRECT_URL are required.');
  const database = new URL(databaseUrl);
  const direct = new URL(directUrl);
  if (!allowedHosts.has(database.hostname) || database.host !== direct.host || database.pathname !== direct.pathname) {
    throw new Error('Commercial V4 browser QA refused a non-ephemeral PostgreSQL database.');
  }
}

async function login(fixture: Fixture): Promise<string> {
  const response = await fetch(`${apiBase}/auth/tenant/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: fixture.email, password, tenantSlug: fixture.slug }),
  });
  assert.equal(response.status, 201, `tenant login failed with ${response.status}`);
  const payload = await response.json() as LoginResponse;
  const token = payload.accessToken ?? payload.data?.accessToken;
  assert.ok(token, 'tenant login did not return an access token');
  return token;
}

async function activation(token?: string): Promise<Response> {
  return fetch(`${apiBase}/tenant/activation-status`, {
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
}

let nextPageId = 1;

function classifyFailedTrace(trace: RequestTrace, traces: readonly RequestTrace[], proof: StorefrontProof | undefined, contentReadyEvidence: string | null): { kind: 'recovered-initial-load' | 'expected-navigation' | 'unexpected'; completed: RequestTrace | null } {
  const apiHost = new URL(apiBase).hostname;
  const expectedPath = proof ? `/api/v1/public/storefront/${proof.slug}` : '';
  const completed = traces.find((candidate) =>
    candidate.id !== trace.id &&
    candidate.contextId === trace.contextId &&
    candidate.method === trace.method &&
    candidate.hostname === trace.hostname &&
    candidate.path === trace.path &&
    candidate.responseStatus === 200 &&
    candidate.requestFinished,
  ) ?? null;
  const isStorefrontInitialLoad = Boolean(
    proof &&
    trace.method === 'GET' &&
    trace.errorText === 'net::ERR_ABORTED' &&
    trace.hostname === apiHost &&
    trace.path === expectedPath &&
    proof.initialLoadPhases.includes(trace.phase),
  );
  if (isStorefrontInitialLoad && completed && contentReadyEvidence && proof?.flowCompleted) {
    return { kind: 'recovered-initial-load', completed };
  }
  const isExpectedNavigation = Boolean(
    proof &&
    trace.method === 'GET' &&
    trace.errorText === 'net::ERR_ABORTED' &&
    trace.hostname === apiHost &&
    trace.path === expectedPath &&
    trace.phase === 'checkout-confirmation-navigation' &&
    proof.flowCompleted,
  );
  return { kind: isExpectedNavigation ? 'expected-navigation' : 'unexpected', completed };
}

function collect(page: Page, report: Report, currentPhase: () => string): PageProbe {
  const contextId = `page-${nextPageId++}`;
  const requests = new WeakMap<object, RequestTrace>();
  const traces: RequestTrace[] = [];
  let contentReadyEvidence: string | null = null;
  let nextId = 1;
  const startedAt = Date.now();
  page.on('console', (message) => {
    if (message.type() === 'error') report.errors.push(`console: ${message.text()}`);
  });
  page.on('pageerror', (error) => report.errors.push(`page: ${error.message}`));
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (!url.hostname.includes('openstreetmap.org')) {
      const trace: RequestTrace = {
        id: nextId++,
        contextId,
        method: request.method(),
        hostname: url.hostname,
        path: url.pathname,
        phase: currentPhase(),
        route: new URL(page.url()).pathname,
        timestampMs: Date.now() - startedAt,
        responseStatus: null,
        requestFinished: false,
        errorText: null,
      };
      requests.set(request, trace);
      traces.push(trace);
    }
  });

  page.on('response', (response) => {
    const request = response.request();
    const event = requests.get(request);
    if (!event) return;
    event.responseStatus = response.status();
  });

  page.on('requestfinished', (request) => {
    const event = requests.get(request);
    if (event) event.requestFinished = true;
  });

  page.on('requestfailed', (request) => {
    const event = requests.get(request);
    if (!event) return;
    event.errorText = request.failure()?.errorText ?? 'UNKNOWN';
  });

  return {
    markStorefrontContentReady(evidence: string): void {
      contentReadyEvidence = evidence;
    },
    finalize(proof?: StorefrontProof): void {
      for (const trace of traces.filter((candidate) => candidate.errorText !== null)) {
        const classification = classifyFailedTrace(trace, traces, proof, contentReadyEvidence);
        const diagnostic: NetworkDiagnostic = {
          ...trace,
          errorText: trace.errorText ?? 'UNKNOWN',
          pageContentReady: contentReadyEvidence !== null,
          contentReadyEvidence,
          completedRequestId: classification.completed?.id ?? null,
          visualEvidence: proof?.visualEvidence ?? null,
        };
        report.networkDiagnostics.push(diagnostic);
        if (classification.kind === 'recovered-initial-load') {
          report.recoveredInitialLoadAborts.push(diagnostic);
        } else if (classification.kind === 'expected-navigation') {
          report.expectedNavigationAborts.push(diagnostic);
        } else {
          report.errors.push(`network: ${diagnostic.contextId} ${diagnostic.method} ${diagnostic.path} ${diagnostic.errorText} during ${diagnostic.phase}`);
        }
      }
      report.unexpectedNetworkFailures = report.errors.filter((error) => error.startsWith('network:')).length;
    },
  };
}

function runNetworkProbeSelfCheck(): void {
  const completed: RequestTrace = { id: 2, contextId: 'page-a', method: 'GET', hostname: '127.0.0.1', path: '/api/v1/public/storefront/a', phase: 'storefront-initial-load', route: '/a', timestampMs: 2, responseStatus: 200, requestFinished: true, errorText: null };
  const aborted: RequestTrace = { ...completed, id: 1, errorText: 'net::ERR_ABORTED', requestFinished: false };
  const proof: StorefrontProof = { slug: 'a', initialLoadPhases: ['storefront-initial-load'], flowCompleted: true, visualEvidence: 'product-visible' };
  assert.equal(classifyFailedTrace(aborted, [aborted, completed], proof, 'product-visible').kind, 'recovered-initial-load');
  assert.equal(classifyFailedTrace(aborted, [aborted, { ...completed, requestFinished: false }], proof, 'product-visible').kind, 'unexpected');
  assert.equal(classifyFailedTrace(aborted, [aborted, { ...completed, contextId: 'page-b' }], proof, 'product-visible').kind, 'unexpected');
  assert.equal(classifyFailedTrace(aborted, [aborted, { ...completed, path: '/api/v1/public/storefront/b' }], proof, 'product-visible').kind, 'unexpected');
  assert.equal(classifyFailedTrace(aborted, [aborted, completed], proof, null).kind, 'unexpected');
  assert.equal(classifyFailedTrace({ ...aborted, method: 'POST' }, [aborted, completed], proof, 'product-visible').kind, 'unexpected');
  assert.equal(classifyFailedTrace({ ...aborted, hostname: 'other-host' }, [aborted, completed], proof, 'product-visible').kind, 'unexpected');
  console.log('COMMERCIAL_V4_NETWORK_PROBE_SELF_CHECK_PASS');
}

async function screenshot(page: Page, report: Report, name: string): Promise<void> {
  const file = join(artifactDir, `${name}.png`);
  await page.screenshot({ path: file, fullPage: true });
  report.screenshots.push(`${name}.png`);
}

async function authenticatedContext(browser: Awaited<ReturnType<typeof chromium.launch>>, token: string, mobile: boolean): Promise<BrowserContext> {
  const context = await browser.newContext({ viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 } });
  await context.addInitScript((accessToken) => window.localStorage.setItem('accessToken', accessToken), token);
  return context;
}

async function createFixture(prisma: PrismaClient, label: string, deliveryOnly: boolean): Promise<Fixture> {
  const tenant = await prisma.tenant.create({ data: { name: `V4 Browser ${label}`, slug: `v4-browser-${label}-${suffix}` } });
  await prisma.tenantSettings.create({
    data: {
      tenantId: tenant.id,
      street: 'Rua QA', number: '10', neighborhood: 'Centro', zipCode: '01001000',
      lat: -23.5489, lng: -46.6388, pickupEnabled: !deliveryOnly, paymentMethods: ['cash'],
    },
  });
  await prisma.tenantOperatingHours.createMany({ data: Array.from({ length: 7 }, (_, dayOfWeek) => ({ tenantId: tenant.id, dayOfWeek, isOpen: true, openTime: '00:00', closeTime: '23:59' })) });
  if (deliveryOnly) {
    await prisma.deliveryCoverageConfig.create({ data: { tenantId: tenant.id, storeLat: -23.5489, storeLng: -46.6388, maxRadiusKm: 10, defaultPricePerKm: 2, isDeliveryEnabled: true } });
  }
  const categorySlug = `v4-category-${label}-${suffix}`;
  const category = await prisma.productCategory.create({ data: { tenantId: tenant.id, name: 'Categoria QA', slug: categorySlug } });
  const product = await prisma.product.create({ data: { tenantId: tenant.id, categoryId: category.id, name: `Produto QA ${label}`, slug: `v4-product-${label}-${suffix}`, basePrice: 10 } });
  await prisma.tenantOnboarding.create({ data: { tenantId: tenant.id, completedAt: new Date() } });
  await ensureDefaultTenantRoles(prisma, tenant.id);
  const ownerRole = await prisma.tenantRole.findUniqueOrThrow({ where: { tenantId_slug: { tenantId: tenant.id, slug: 'tenant_owner' } } });
  const email = `v4-${label}-${suffix}@example.test`;
  const user = await prisma.tenantUser.create({ data: { tenantId: tenant.id, name: `QA ${label}`, email, passwordHash: await bcrypt.hash(password, 10) } });
  await prisma.tenantUserRole.create({ data: { userId: user.id, roleId: ownerRole.id } });
  return { id: tenant.id, slug: tenant.slug, categorySlug, productId: product.id, email, deliveryOnly };
}

async function runDashboard(browser: Awaited<ReturnType<typeof chromium.launch>>, fixture: Fixture, token: string, mobile: boolean, report: Report): Promise<void> {
  const context = await authenticatedContext(browser, token, mobile);
  const page = await context.newPage();
  const probe = collect(page, report, () => 'dashboard-before-first-order');
  try {
    await page.goto(`${tenantUrl}/dashboard`, { waitUntil: 'domcontentloaded' });
    await page.getByText('Prepare sua loja para o primeiro pedido', { exact: false }).waitFor({ timeout: 15_000 });
    await screenshot(page, report, `dashboard-${fixture.deliveryOnly ? 'delivery' : 'pickup'}-${mobile ? 'mobile' : 'desktop'}-before`);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 4), false, 'dashboard has horizontal overflow');
  } finally { probe.finalize(); await context.close(); }
}

async function runQr(browser: Awaited<ReturnType<typeof chromium.launch>>, token: string, mobile: boolean, report: Report): Promise<void> {
  const context = await authenticatedContext(browser, token, mobile);
  const page = await context.newPage();
  const probe = collect(page, report, () => `qr-${mobile ? 'mobile' : 'desktop'}`);
  try {
    await page.goto(`${tenantUrl}/settings/qr-codes`, { waitUntil: 'domcontentloaded' });
    await page.locator('#main-qr').waitFor({ timeout: 15_000 });
    const target = await page.getByRole('link', { name: /Testar Card.pio Online/i }).getAttribute('href');
    assert.ok(target?.startsWith(`${storefrontUrl}/`), 'QR does not encode the local storefront URL');
    await screenshot(page, report, `qr-${mobile ? 'mobile' : 'desktop'}`);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 4), false, 'QR page has horizontal overflow');
  } finally { probe.finalize(); await context.close(); }
}

async function runDashboardAfterFirstOrder(browser: Awaited<ReturnType<typeof chromium.launch>>, fixture: Fixture, token: string, mobile: boolean, report: Report): Promise<void> {
  const context = await authenticatedContext(browser, token, mobile);
  const page = await context.newPage();
  const probe = collect(page, report, () => 'dashboard-after-first-order');
  try {
    await page.goto(`${tenantUrl}/dashboard`, { waitUntil: 'domcontentloaded' });
    await page.getByText('Prepare sua loja para o primeiro pedido', { exact: false }).waitFor({ state: 'hidden', timeout: 15_000 });
    await screenshot(page, report, `dashboard-pickup-${mobile ? 'mobile' : 'desktop'}-after`);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 4), false, 'dashboard has horizontal overflow after first order');
  } finally { probe.finalize(); await context.close(); }
}

async function createPickupOrder(browser: Awaited<ReturnType<typeof chromium.launch>>, fixture: Fixture, report: Report, mobile: boolean): Promise<void> {
  let phase = 'storefront-initial-load';
  const context = await browser.newContext({ viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 } });
  const page = await context.newPage();
  const probe = collect(page, report, () => phase);
  try {
    await page.goto(`${storefrontUrl}/${fixture.slug}`, { waitUntil: 'domcontentloaded' });
    const productCard = page.locator(`#${fixture.categorySlug}`).getByText(`Produto QA pickup`, { exact: true });
    await productCard.waitFor({ timeout: 15_000 });
    probe.markStorefrontContentReady(`product-visible:#${fixture.categorySlug}:Produto QA pickup`);
    await productCard.click();
    await page.locator('#product-details-title').waitFor({ timeout: 15_000 });
    const productDialog = page.locator('[role="dialog"][aria-labelledby="product-details-title"]');
    await productDialog.getByRole('button', { name: /^Adicionar\b/ }).click();
    await screenshot(page, report, 'storefront-pickup-cart-footer-before');
    await page.getByRole('button', { name: /Prefer.ncias de privacidade/i }).click();
    const preferencesDialog = page.getByRole('dialog', { name: /Prefer.ncias de privacidade/i });
    await preferencesDialog.waitFor({ timeout: 15_000 });
    await screenshot(page, report, 'storefront-pickup-privacy-dialog');
    await page.getByRole('button', { name: /Fechar prefer.ncias de privacidade/i }).click();
    await page.getByRole('button', { name: /Ver carrinho/i }).click();
    await page.getByRole('button', { name: /Finalizar pedido/i }).click();
    await page.getByPlaceholder('Seu nome completo').fill('Cliente QA');
    await page.getByPlaceholder(/WhatsApp/i).fill('11999990000');
    await page.locator('#checkout-continue-btn').click();
    await page.getByRole('button', { name: /Retirada/i }).click();
    await page.locator('#checkout-continue-btn').click();
    await page.getByRole('button', { name: /Dinheiro/i }).click();
    await page.locator('#checkout-continue-btn').click();
    phase = 'checkout-confirmation-navigation';
    await page.locator('#checkout-submit-btn').click();
    await page.waitForURL(new RegExp(`/${fixture.slug}/order/`), { timeout: 20_000 });
    phase = 'checkout-confirmed';
    await screenshot(page, report, `storefront-pickup-order-confirmation-${mobile ? 'mobile' : 'desktop'}`);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 4), false, 'storefront has horizontal overflow');
  } finally {
    probe.finalize({
      slug: fixture.slug,
      initialLoadPhases: ['storefront-initial-load'],
      flowCompleted: phase === 'checkout-confirmed',
      visualEvidence: `storefront-pickup-order-confirmation-${mobile ? 'mobile' : 'desktop'}.png`,
    });
    await context.close();
  }
}

async function runDeliveryOnlyBrowser(browser: Awaited<ReturnType<typeof chromium.launch>>, fixture: Fixture, mobile: boolean, report: Report): Promise<void> {
  const context = await browser.newContext({ viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 } });
  const page = await context.newPage();
  const phase = `delivery-only-${mobile ? 'mobile' : 'desktop'}`;
  const probe = collect(page, report, () => phase);
  let deliveryFlowCompleted = false;
  try {
    await page.goto(`${storefrontUrl}/${fixture.slug}`, { waitUntil: 'domcontentloaded' });
    const productCard = page.locator(`#${fixture.categorySlug}`).getByText('Produto QA delivery', { exact: true });
    await productCard.waitFor({ timeout: 15_000 });
    probe.markStorefrontContentReady(`product-visible:#${fixture.categorySlug}:Produto QA delivery`);
    await productCard.click();
    await page.locator('#product-details-title').waitFor({ timeout: 15_000 });
    const productDialog = page.locator('[role="dialog"][aria-labelledby="product-details-title"]');
    await productDialog.getByRole('button', { name: /^Adicionar\b/ }).click();
    await page.getByRole('button', { name: /Ver carrinho/i }).click();
    await page.getByRole('button', { name: /Finalizar pedido/i }).click();
    await page.getByPlaceholder('Seu nome completo').fill('Cliente QA Delivery');
    await page.getByPlaceholder(/WhatsApp/i).fill('11999990001');
    await page.locator('#checkout-continue-btn').click();
    assert.equal(await page.getByRole('button', { name: /Retirada/i }).count(), 0, 'delivery-only storefront exposed pickup');
    await page.getByRole('button', { name: /Entrega/i }).waitFor({ timeout: 15_000 });
    await screenshot(page, report, `storefront-delivery-only-${mobile ? 'mobile' : 'desktop'}`);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 4), false, 'delivery-only storefront has horizontal overflow');
    deliveryFlowCompleted = true;
  } finally {
    probe.finalize({
      slug: fixture.slug,
      initialLoadPhases: [phase],
      flowCompleted: deliveryFlowCompleted,
      visualEvidence: `storefront-delivery-only-${mobile ? 'mobile' : 'desktop'}.png`,
    });
    await context.close();
  }
}

async function main(): Promise<void> {
  runNetworkProbeSelfCheck();
  assertEphemeralDatabase();
  await mkdir(artifactDir, { recursive: true });
  const prisma = new PrismaClient();
  const report: Report = {
    qaResult: 'FAIL',
    scenarios: {},
    screenshots: [],
    errors: [],
    networkDiagnostics: [],
    expectedNavigationAborts: [],
    recoveredInitialLoadAborts: [],
    unexpectedNetworkFailures: 0,
  };
  const tenantIds: string[] = [];
  const browser = await chromium.launch({ headless: true });
  try {
    await prisma.$connect();
    const pickup = await createFixture(prisma, 'pickup', false);
    const delivery = await createFixture(prisma, 'delivery', true);
    tenantIds.push(pickup.id, delivery.id);
    const [pickupToken, deliveryToken] = await Promise.all([login(pickup), login(delivery)]);
    assert.equal((await activation()).status, 401, 'unauthenticated activation status was not rejected');
    const pickupActivationResponse = await activation(pickupToken);
    const deliveryActivationResponse = await activation(deliveryToken);
    assert.equal(pickupActivationResponse.status, 200, 'pickup activation status failed');
    assert.equal(deliveryActivationResponse.status, 200, 'delivery activation status failed');
    const pickupActivation = await pickupActivationResponse.json() as { data: Activation };
    const deliveryActivation = await deliveryActivationResponse.json() as { data: Activation };
    assert.equal(pickupActivation.data.storefrontSlug, pickup.slug);
    assert.equal(deliveryActivation.data.storefrontSlug, delivery.slug);
    assert.equal(pickupActivation.data.firstStorefrontOrder, null);
    assert.equal(deliveryActivation.data.firstStorefrontOrder, null);
    report.scenarios.authentication = 'PASS';
    await runDashboard(browser, pickup, pickupToken, false, report);
    await runDashboard(browser, pickup, pickupToken, true, report);
    await runDashboard(browser, delivery, deliveryToken, false, report);
    await runDashboard(browser, delivery, deliveryToken, true, report);
    report.scenarios.activation = 'PASS';
    await runQr(browser, pickupToken, false, report);
    await runQr(browser, pickupToken, true, report);
    report.scenarios.qr = 'PASS';
    await createPickupOrder(browser, pickup, report, false);
    const firstPersisted = await prisma.order.findFirstOrThrow({ where: { tenantId: pickup.id, sourceChannel: 'direct_online' }, include: { items: true, timeline: true } });
    assert.equal(firstPersisted.items.length, 1, 'storefront did not create one order item');
    assert.ok(firstPersisted.timeline.length >= 1, 'storefront did not create order timeline');
    const after = await activation(pickupToken);
    assert.equal(after.status, 200);
    const afterPayload = await after.json() as { data: Activation };
    assert.ok(afterPayload.data.firstStorefrontOrder, 'activation projection did not receive the first storefront order');
    await runDashboardAfterFirstOrder(browser, pickup, pickupToken, false, report);
    await runDashboardAfterFirstOrder(browser, pickup, pickupToken, true, report);
    await createPickupOrder(browser, pickup, report, true);
    const orderCount = await prisma.order.count({ where: { tenantId: pickup.id, sourceChannel: 'direct_online' } });
    assert.equal(orderCount, 2, 'mobile checkout did not create a second tenant-scoped order');
    report.scenarios.firstOrder = 'PASS';
    report.scenarios.mobilePickupCheckout = 'PASS';
    assert.equal(deliveryActivation.data.operationallyReady, true, 'delivery-only tenant is not operationally ready');
    await runDeliveryOnlyBrowser(browser, delivery, false, report);
    await runDeliveryOnlyBrowser(browser, delivery, true, report);
    report.scenarios.deliveryOnly = 'PASS';
    assert.equal(report.errors.length, 0, report.errors.join(' | '));
    report.qaResult = 'PASS';
    console.log('COMMERCIAL_V4_BROWSER_QA_PASS');
  } catch (error) {
    if (report.errors.length === 0) report.errors.push(error instanceof Error ? error.message : String(error));
    throw error;
  } finally {
    try {
      await writeFile(join(artifactDir, 'report.json'), JSON.stringify(report, null, 2));
      await writeFile(join(artifactDir, 'report.md'), `# Commercial V4 browser QA\n\nQA_RESULT: ${report.qaResult}\n\n${Object.entries(report.scenarios).map(([name, status]) => `- ${name}: ${status}`).join('\n')}\n\nExpected navigation aborts: ${report.expectedNavigationAborts.length}\nRecovered initial-load aborts: ${report.recoveredInitialLoadAborts.length}\nUnexpected network failures: ${report.unexpectedNetworkFailures}\n\n## Network diagnostics\n${report.networkDiagnostics.map((diagnostic) => `- ${diagnostic.contextId} request=${diagnostic.id} completed=${diagnostic.completedRequestId ?? 'none'} ${diagnostic.method} ${diagnostic.path} ${diagnostic.errorText}; phase=${diagnostic.phase}; response=${diagnostic.responseStatus ?? 'none'}; finished=${diagnostic.requestFinished}; dom=${diagnostic.pageContentReady}; evidence=${diagnostic.contentReadyEvidence ?? 'none'}; visual=${diagnostic.visualEvidence ?? 'none'}`).join('\n') || '- none'}\n`);
    } finally {
      await browser.close();
      if (tenantIds.length) await prisma.tenant.deleteMany({ where: { id: { in: tenantIds } } });
      await prisma.$disconnect();
    }
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
