import { equal, ok } from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { chromium, type Page } from '@playwright/test';

type LoginResponse = { accessToken?: string; data?: { accessToken?: string } };
type BrowserLog = { console: string[]; pageErrors: string[]; requestFailures: string[] };

const apiBase = process.env.DASHBOARD_THEME_E2E_API_BASE ?? 'http://127.0.0.1:3333/api/v1';
const webUrl = process.env.DASHBOARD_THEME_E2E_WEB_URL ?? 'http://127.0.0.1:5173';
const artifactDir = resolve(process.env.DASHBOARD_THEME_E2E_ARTIFACT_DIR ?? 'qa-artifacts/dashboard-theme-consistency');
const tenantSlug = process.env.DASHBOARD_THEME_E2E_TENANT_SLUG ?? 'pizzaria-demo';
const tenantEmail = process.env.DASHBOARD_THEME_E2E_TENANT_EMAIL ?? 'owner@pizzariademo.com';
const tenantPassword = process.env.DASHBOARD_THEME_E2E_TENANT_PASSWORD ?? 'Owner@123';

const captures = [
  { width: 1440, height: 900, theme: 'light', menuOpen: true },
  { width: 1440, height: 900, theme: 'dark', menuOpen: true },
  { width: 1366, height: 768, theme: 'light', menuOpen: false },
  { width: 1366, height: 768, theme: 'dark', menuOpen: false },
  { width: 390, height: 844, theme: 'light', menuOpen: false },
  { width: 390, height: 844, theme: 'dark', menuOpen: false },
] as const;

const routes = [
  { slug: 'dashboard', path: '/dashboard', readyText: 'Abrir ações rápidas' },
  { slug: 'delivery-rates', path: '/delivery/rates', readyText: 'Salvar configurações' },
  { slug: 'analytics-reports', path: '/analytics/reports', readyText: 'Relatórios Gerenciais' },
  { slug: 'suppliers', path: '/management/suppliers', readyText: 'Fornecedores' },
  { slug: 'inventory', path: '/inventory', readyText: 'Estoque' },
  { slug: 'promotions', path: '/promotions', readyText: 'Promoções e Retenção' },
] as const;

async function login(): Promise<string> {
  const response = await fetch(`${apiBase}/auth/tenant/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: tenantEmail, password: tenantPassword, tenantSlug }),
  });
  const payload = await response.json().catch((): unknown => ({})) as LoginResponse;
  ok(response.ok, `tenant login returned ${response.status}: ${JSON.stringify(payload)}`);
  const token = payload.accessToken ?? payload.data?.accessToken;
  ok(token, 'tenant login did not return an access token');
  return token;
}

function collectBrowserLog(page: Page, browserLog: BrowserLog): void {
  page.on('console', (message) => {
    if (message.type() === 'error') browserLog.console.push(message.text());
  });
  page.on('pageerror', (error) => browserLog.pageErrors.push(error.stack ?? error.message));
  page.on('requestfailed', (request) => {
    if (request.url().includes('.tile.openstreetmap.org/')) return;
    browserLog.requestFailures.push(`${request.method()} ${request.url()} :: ${request.failure()?.errorText ?? 'unknown failure'}`);
  });
}

async function main(): Promise<void> {
  await mkdir(artifactDir, { recursive: true });
  const token = await login();
  const browser = await chromium.launch({ headless: true });

  try {
    for (const route of routes) {
      for (const capture of captures) {
        if (route.slug !== 'dashboard' && capture.width === 1366) continue;

        const context = await browser.newContext({ viewport: { width: capture.width, height: capture.height }, colorScheme: capture.theme });
        await context.addInitScript(({ accessToken, theme }) => {
          window.localStorage.setItem('accessToken', accessToken);
          window.localStorage.setItem('gestor-delivery:tenant-panel-theme', theme);
        }, { accessToken: token, theme: capture.theme });
        const page = await context.newPage();
        const browserLog: BrowserLog = { console: [], pageErrors: [], requestFailures: [] };
        collectBrowserLog(page, browserLog);
        const name = `${route.slug}-${capture.width}x${capture.height}-${capture.theme}`;

        try {
          await page.goto(`${webUrl}${route.path}`, { waitUntil: 'domcontentloaded' });
          if (route.slug === 'dashboard' || route.slug === 'delivery-rates') {
            await page.getByRole('button', { name: route.readyText }).waitFor({ timeout: 15_000 });
          } else {
            await page.locator('main').getByRole('heading', { name: route.readyText, level: 1 }).waitFor({ timeout: 15_000 });
          }
          await page.waitForFunction((expectedTheme) => document.documentElement.getAttribute('data-theme') === expectedTheme, capture.theme, { timeout: 5_000 });
          equal(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 4), false, `${name} has horizontal overflow`);

          if (route.slug === 'dashboard' && capture.menuOpen) {
            await page.getByRole('button', { name: 'Abrir ações rápidas' }).click();
            equal(await page.getByText('Abrir pedidos', { exact: true }).count(), 1, `${name} action menu did not open`);
          }

          await page.screenshot({ path: join(artifactDir, `${name}.png`), fullPage: true });
          ok(browserLog.console.length === 0, `${name} console errors: ${browserLog.console.join(' | ')}`);
          ok(browserLog.pageErrors.length === 0, `${name} page errors: ${browserLog.pageErrors.join(' | ')}`);
          ok(browserLog.requestFailures.length === 0, `${name} network failures: ${browserLog.requestFailures.join(' | ')}`);
        } catch (error) {
          await page.screenshot({ path: join(artifactDir, `${name}-failure.png`), fullPage: true }).catch(() => undefined);
          await writeFile(join(artifactDir, `${name}-failure.json`), JSON.stringify({ error: error instanceof Error ? error.message : String(error), browserLog, url: page.url() }, null, 2));
          throw error;
        } finally {
          await context.close();
        }
      }
    }
  } finally {
    await browser.close();
  }

  console.log('WEB_TENANT_THEME_E2E_PASS');
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
