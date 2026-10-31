import { strict as assert } from 'node:assert';
import { mkdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { chromium, expect, type Page } from '@playwright/test';

type LoginResponse = { accessToken?: string; data?: { accessToken?: string } };

const apiBase = process.env.MULTI_IFOOD_E2E_API_BASE_URL ?? 'http://127.0.0.1:3333/api/v1';
const webUrl = process.env.MULTI_IFOOD_E2E_WEB_URL ?? 'http://127.0.0.1:5173';
const runId = (process.env.MULTI_IFOOD_E2E_RUN_ID ?? '').replace(/[^a-z0-9-]/gi, '-').toLowerCase();
const password = process.env.MULTI_IFOOD_E2E_PASSWORD ?? 'LocalE2E!123';
const email = `multi-ifood-alpha-${runId}@e2e.local`;
const slug = `tenant-alpha-multi-ifood-e2e-${runId}`;
const artifactDirectory = resolve(process.env.MULTI_IFOOD_E2E_ARTIFACT_DIR ?? 'qa-artifacts/multi-ifood-e2e-v1');

async function login(): Promise<string> {
  assert.ok(runId, 'MULTI_IFOOD_E2E_RUN_ID is required');
  const response = await fetch(`${apiBase}/auth/tenant/login`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password, tenantSlug: slug }),
  });
  const payload = await response.json() as LoginResponse;
  assert.equal(response.ok, true, `tenant login failed with HTTP ${response.status}`);
  const token = payload.accessToken ?? payload.data?.accessToken;
  assert.ok(token, 'tenant login did not return an access token');
  return token;
}

function installDiagnostics(page: Page, errors: string[]): void {
  page.on('pageerror', (error) => errors.push(`pageerror:${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console:${message.text()}`);
  });
  page.on('requestfailed', (request) => errors.push(`request:${request.method()} ${request.url()} ${request.failure()?.errorText ?? ''}`));
}

async function main(): Promise<void> {
  await mkdir(artifactDirectory, { recursive: true });
  const token = await login();
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await context.addInitScript((accessToken) => {
    localStorage.setItem('accessToken', accessToken);
    localStorage.setItem('gestor-delivery:tenant-panel-theme', 'light');
  }, token);
  const page = await context.newPage();
  const errors: string[] = [];
  installDiagnostics(page, errors);

  try {
    await page.goto(`${webUrl}/settings/integrations`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: 'Integrações Marketplace' })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText('Loja Alpha A', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('Merchant: merchant-alpha-a', { exact: true })).toBeVisible();
    await expect(page.getByText('Loja Alpha B', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('Merchant: merchant-alpha-b', { exact: true })).toBeVisible();

    const connectionA = page.locator('div.rounded-2xl').filter({ hasText: 'Loja Alpha A' }).last();
    const connectionB = page.locator('div.rounded-2xl').filter({ hasText: 'Loja Alpha B' }).last();
    await expect(connectionA.getByText('Offline', { exact: true })).toBeVisible();
    await expect(connectionB.getByText('Ativo', { exact: true })).toBeVisible();

    const pageText = await page.locator('body').innerText();
    for (const forbidden of ['fake-access-alpha-a', 'fake-refresh-alpha-a', 'accessTokenEnc', 'refreshTokenEnc', 'clientSecret']) {
      assert.equal(pageText.includes(forbidden), false, `UI exposed ${forbidden}`);
    }

    await page.getByRole('button', { name: 'Adicionar loja iFood' }).click();
    await page.getByLabel('Merchant ID').fill(`merchant-alpha-ui-${runId}`);
    await page.getByLabel('Store ID').fill(`store-alpha-ui-${runId}`);
    await page.getByLabel('Nome exibido').fill('Loja Alpha UI E2E');
    await page.getByRole('button', { name: 'Salvar conexão' }).click();
    await expect(page.getByText('Loja Alpha UI E2E', { exact: true }).first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(`Merchant: merchant-alpha-ui-${runId}`, { exact: true })).toBeVisible();
    assert.deepEqual(errors, []);
    await page.screenshot({ path: join(artifactDirectory, 'multi-ifood-connections.png'), fullPage: true });
    console.log(JSON.stringify({ result: 'WEB_TENANT_MULTI_IFOOD_E2E_PASS', screenshot: join(artifactDirectory, 'multi-ifood-connections.png') }));
  } finally {
    await context.close();
    await browser.close();
  }
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
