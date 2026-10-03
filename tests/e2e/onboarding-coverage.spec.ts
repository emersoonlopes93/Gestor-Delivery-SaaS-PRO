import { test, expect, type APIRequestContext, type Page } from '@playwright/test';

const apiBase = process.env.ONBOARDING_E2E_API_BASE ?? 'http://127.0.0.1:3333/api/v1';
const webBase = process.env.ONBOARDING_E2E_WEB_BASE ?? 'http://localhost:5173';

type AuthPayload = {
  accessToken?: string;
  data?: { accessToken?: string; tenant?: { slug?: string }; user?: { tenant?: { slug?: string } } };
  user?: { tenant?: { slug?: string } };
};

async function login(request: APIRequestContext, email: string, password: string, tenantSlug: string) {
  const response = await request.post(`${apiBase}/auth/tenant/login`, {
    data: { email, password, tenantSlug },
  });
  expect(response.ok()).toBeTruthy();
  const body = await response.json() as AuthPayload;
  const token = body.accessToken ?? body.data?.accessToken;
  expect(token).toBeTruthy();
  return token as string;
}

async function registerLocalTenant(request: APIRequestContext, suffix: string) {
  const email = `onboarding-e2e-${suffix}@example.test`;
  const password = process.env.ONBOARDING_E2E_PASSWORD;
  if (!password) throw new Error('ONBOARDING_E2E_PASSWORD is required for authenticated E2E fixtures');
  const response = await request.post(`${apiBase}/auth/tenant/register`, {
    data: {
      ownerName: `Onboarding E2E ${suffix}`,
      shopName: `Onboarding E2E ${suffix}`,
      phone: '11900000000',
      email,
      password,
    },
  });
  expect(response.ok()).toBeTruthy();
  const body = await response.json() as AuthPayload;
  const token = body.accessToken ?? body.data?.accessToken;
  const slug = body.user?.tenant?.slug ?? body.data?.user?.tenant?.slug ?? body.data?.tenant?.slug;
  expect(token).toBeTruthy();
  expect(slug, JSON.stringify(body)).toBeTruthy();
  return { email, password, slug: slug as string, token: token as string };
}

async function openDeliveryStep(page: Page, token: string) {
  await page.addInitScript(({ accessToken }) => {
    window.localStorage.setItem('accessToken', accessToken);
    if (window.localStorage.getItem('onboarding_e2e_initialized') === '1') return;
    window.localStorage.setItem('onboarding_state', JSON.stringify({
      version: 2,
      currentStep: 2,
      visitedSteps: [0, 1, 2],
      validation: {
        hasStoreName: true,
        hasAddress: true,
        hasOperatingHours: true,
        hasPaymentMethod: true,
        hasOperationalModes: true,
        hasProduct: true,
      },
    }));
    window.localStorage.setItem('onboarding_e2e_initialized', '1');
  }, { accessToken: token });
  await page.goto(`${webBase}/onboarding`, { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'Como sua loja vai entregar?' })).toBeVisible({ timeout: 20_000 });
}

test.describe('authenticated onboarding delivery coverage', () => {
  test.describe.configure({ mode: 'serial' });
  test.setTimeout(45_000);

  test('happy path, double submit and refresh preserve canonical state', async ({ page, request }) => {
    const fixture = await registerLocalTenant(request, `happy-${Date.now()}`);
    const token = fixture.token;
    const seededCoverage = await request.put(`${apiBase}/delivery/coverage`, {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        storeLat: -23.5505,
        storeLng: -46.6333,
        maxRadiusKm: 2,
        defaultPricePerKm: 1,
        minimumFee: 5,
        defaultEstimatedDeliveryMinutes: 30,
        isDeliveryEnabled: true,
      },
    });
    expect(seededCoverage.ok()).toBeTruthy();
    const calls: string[] = [];
    let putCount = 0;
    await page.route('**/api/v1/delivery/coverage', async (route) => {
      if (route.request().method() === 'PUT') {
        putCount += 1;
        calls.push('put:start');
        const response = await route.fetch();
        await new Promise((resolve) => setTimeout(resolve, 700));
        calls.push('put:response');
        await route.fulfill({ response });
        return;
      }
      await route.continue();
    });
    await page.route('**/api/v1/tenant/onboarding-step', async (route) => {
      if (route.request().method() === 'PATCH') calls.push('mark');
      await route.continue();
    });
    await openDeliveryStep(page, token);
    const next = page.getByRole('button', { name: 'Proximo' });
    await next.dblclick();
    await expect(page.getByRole('button', { name: 'Salvando...' })).toBeVisible();
    await expect(page.getByText('Passo 3 de 10')).toHaveCount(1);
    await expect(page.getByText('Passo 4 de 10')).toBeVisible({ timeout: 20_000 });
    expect(putCount).toBe(1);
    expect(calls.indexOf('put:response')).toBeLessThan(calls.indexOf('mark'));
    await page.waitForTimeout(500);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.getByText('Passo 4 de 10')).toHaveCount(1);
  });

  test('pickup-only does not require delivery coverage and survives refresh', async ({ page, request }) => {
    const fixture = await registerLocalTenant(request, `pickup-${Date.now()}`);
    const headers = { Authorization: `Bearer ${fixture.token}` };
    const settings = await request.patch(`${apiBase}/tenant/settings`, {
      headers,
      data: { pickupEnabled: true },
    });
    expect(settings.ok()).toBeTruthy();
    const coverage = await request.get(`${apiBase}/delivery/coverage`, { headers });
    expect(coverage.ok()).toBeTruthy();
    expect((await coverage.json()).data ?? null).toBeNull();
    await openDeliveryStep(page, fixture.token);
    await page.getByRole('checkbox').uncheck();
    await expect(page.getByText('Entrega desativada.')).toBeVisible();
    await page.getByRole('button', { name: 'Proximo' }).click();
    await expect(page.getByText('Passo 4 de 10')).toBeVisible({ timeout: 20_000 });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.getByText('Passo 4 de 10')).toHaveCount(1);
  });

  test('isolates coverage between two authenticated tenants', async ({ request }) => {
    const tenantA = await registerLocalTenant(request, `a-${Date.now()}`);
    const tenantB = await registerLocalTenant(request, `b-${Date.now()}`);
    const put = await request.put(`${apiBase}/delivery/coverage`, {
      headers: { Authorization: `Bearer ${tenantA.token}` },
      data: {
        storeLat: -23.5614,
        storeLng: -46.6559,
        maxRadiusKm: 7,
        defaultPricePerKm: 2,
        minimumFee: 5,
        defaultEstimatedDeliveryMinutes: 30,
        isDeliveryEnabled: true,
      },
    });
    expect(put.ok()).toBeTruthy();
    const coverageA = await request.get(`${apiBase}/delivery/coverage`, {
      headers: { Authorization: `Bearer ${tenantA.token}` },
    });
    const coverageB = await request.get(`${apiBase}/delivery/coverage`, {
      headers: { Authorization: `Bearer ${tenantB.token}` },
    });
    expect(coverageA.ok()).toBeTruthy();
    expect(coverageB.ok()).toBeTruthy();
    expect(Number((await coverageA.json()).data?.maxRadiusKm)).toBe(7);
    expect((await coverageB.json()).data ?? null).toBeNull();
  });
});
