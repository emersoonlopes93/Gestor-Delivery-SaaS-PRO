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

type Fixture = { id: string; slug: string; productId: string; email: string; deliveryOnly: boolean };
type LoginResponse = { accessToken?: string; data?: { accessToken?: string } };
type Activation = { storefrontSlug: string; firstStorefrontOrder: unknown | null; operationallyReady: boolean };
type Report = { scenarios: Record<string, 'PASS' | 'FAIL'>; screenshots: string[]; errors: string[] };

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

function collect(page: Page, report: Report): void {
  page.on('console', (message) => {
    if (message.type() === 'error') report.errors.push(`console: ${message.text()}`);
  });
  page.on('pageerror', (error) => report.errors.push(`page: ${error.message}`));
  page.on('requestfailed', (request) => {
    if (!request.url().includes('openstreetmap.org')) report.errors.push(`request: ${request.method()} ${request.url()}`);
  });
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
  const category = await prisma.productCategory.create({ data: { tenantId: tenant.id, name: 'Categoria QA', slug: `v4-category-${label}-${suffix}` } });
  const product = await prisma.product.create({ data: { tenantId: tenant.id, categoryId: category.id, name: `Produto QA ${label}`, slug: `v4-product-${label}-${suffix}`, basePrice: 10 } });
  await prisma.tenantOnboarding.create({ data: { tenantId: tenant.id, completedAt: new Date() } });
  await ensureDefaultTenantRoles(prisma, tenant.id);
  const ownerRole = await prisma.tenantRole.findUniqueOrThrow({ where: { tenantId_slug: { tenantId: tenant.id, slug: 'tenant_owner' } } });
  const email = `v4-${label}-${suffix}@example.test`;
  const user = await prisma.tenantUser.create({ data: { tenantId: tenant.id, name: `QA ${label}`, email, passwordHash: await bcrypt.hash(password, 10) } });
  await prisma.tenantUserRole.create({ data: { userId: user.id, roleId: ownerRole.id } });
  return { id: tenant.id, slug: tenant.slug, productId: product.id, email, deliveryOnly };
}

async function runDashboard(browser: Awaited<ReturnType<typeof chromium.launch>>, fixture: Fixture, token: string, mobile: boolean, report: Report): Promise<void> {
  const context = await authenticatedContext(browser, token, mobile);
  const page = await context.newPage();
  collect(page, report);
  try {
    await page.goto(`${tenantUrl}/dashboard`, { waitUntil: 'domcontentloaded' });
    await page.getByText('Prepare sua loja para o primeiro pedido', { exact: false }).waitFor({ timeout: 15_000 });
    await screenshot(page, report, `dashboard-${fixture.deliveryOnly ? 'delivery' : 'pickup'}-${mobile ? 'mobile' : 'desktop'}-before`);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 4), false, 'dashboard has horizontal overflow');
  } finally { await context.close(); }
}

async function runQr(browser: Awaited<ReturnType<typeof chromium.launch>>, token: string, report: Report): Promise<void> {
  const context = await authenticatedContext(browser, token, false);
  const page = await context.newPage();
  collect(page, report);
  try {
    await page.goto(`${tenantUrl}/settings/qr-codes`, { waitUntil: 'domcontentloaded' });
    await page.locator('#main-qr').waitFor({ timeout: 15_000 });
    const target = await page.getByRole('link', { name: /Testar Card.pio Online/i }).getAttribute('href');
    assert.ok(target?.startsWith(`${storefrontUrl}/`), 'QR does not encode the local storefront URL');
    await screenshot(page, report, 'qr-desktop');
  } finally { await context.close(); }
}

async function createPickupOrder(browser: Awaited<ReturnType<typeof chromium.launch>>, fixture: Fixture, report: Report): Promise<void> {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  collect(page, report);
  try {
    await page.goto(`${storefrontUrl}/${fixture.slug}`, { waitUntil: 'domcontentloaded' });
    await page.getByText(`Produto QA pickup`, { exact: false }).first().click();
    const productDialog = page.locator('[role="dialog"]').filter({ has: page.locator('#product-details-title') });
    await productDialog.getByRole('button', { name: 'Adicionar', exact: true }).click();
    await page.getByRole('button', { name: /Ver carrinho/i }).click();
    await page.getByRole('button', { name: /Finalizar pedido/i }).click();
    await page.getByPlaceholder('Seu nome completo').fill('Cliente QA');
    await page.getByPlaceholder(/WhatsApp/i).fill('11999990000');
    await page.locator('#checkout-continue-btn').click();
    await page.getByRole('button', { name: /Retirada/i }).click();
    await page.locator('#checkout-continue-btn').click();
    await page.getByRole('button', { name: /Dinheiro/i }).click();
    await page.locator('#checkout-continue-btn').click();
    await page.locator('#checkout-submit-btn').click();
    await page.waitForURL(new RegExp(`/${fixture.slug}/order/`), { timeout: 20_000 });
    await screenshot(page, report, 'storefront-pickup-order-confirmation');
  } finally { await context.close(); }
}

async function main(): Promise<void> {
  assertEphemeralDatabase();
  await mkdir(artifactDir, { recursive: true });
  const prisma = new PrismaClient();
  const report: Report = { scenarios: {}, screenshots: [], errors: [] };
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
    await runQr(browser, pickupToken, report);
    report.scenarios.qr = 'PASS';
    await createPickupOrder(browser, pickup, report);
    const persisted = await prisma.order.findFirstOrThrow({ where: { tenantId: pickup.id, sourceChannel: 'direct_online' }, include: { items: true, timeline: true } });
    assert.equal(persisted.items.length, 1, 'storefront did not create one order item');
    assert.ok(persisted.timeline.length >= 1, 'storefront did not create order timeline');
    const after = await activation(pickupToken);
    assert.equal(after.status, 200);
    const afterPayload = await after.json() as { data: Activation };
    assert.ok(afterPayload.data.firstStorefrontOrder, 'activation projection did not receive the first storefront order');
    report.scenarios.firstOrder = 'PASS';
    assert.equal(deliveryActivation.data.operationallyReady, true, 'delivery-only tenant is not operationally ready');
    report.scenarios.deliveryOnly = 'PASS';
    assert.equal(report.errors.length, 0, report.errors.join(' | '));
    console.log('COMMERCIAL_V4_BROWSER_QA_PASS');
  } catch (error) {
    report.errors.push(error instanceof Error ? error.message : String(error));
    throw error;
  } finally {
    try {
      await writeFile(join(artifactDir, 'report.json'), JSON.stringify(report, null, 2));
      await writeFile(join(artifactDir, 'report.md'), `# Commercial V4 browser QA\n\n${Object.entries(report.scenarios).map(([name, status]) => `- ${name}: ${status}`).join('\n')}\n`);
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
