import { strict as assert } from 'node:assert';
import { mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { chromium, type Page } from '@playwright/test';

type LoginResponse = { accessToken?: string; data?: { accessToken?: string } };

const apiBase = 'http://127.0.0.1:3333/api/v1';
const webBase = 'http://127.0.0.1:5178';
const artifacts = resolve('..', 'pedehub-production-quick-fixes-qa');
const executablePath = process.env.PRODUCTION_QF_CHROME_PATH;

const cases: Array<{ width: number; height: number; path: string; prepare?: (page: Page) => Promise<void> }> = [
  { width: 390, height: 844, path: '/inventory', prepare: openNewIngredient },
  { width: 430, height: 932, path: '/settings/notifications' },
  { width: 768, height: 900, path: '/settings', prepare: openHours },
  { width: 1024, height: 900, path: '/delivery/dispatch' },
  { width: 1440, height: 900, path: '/settings/integrations' },
];

async function login() {
  const response = await fetch(`${apiBase}/auth/tenant/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'demo@demo.com', password: 'demo123', tenantSlug: 'pizzaria-demo' }),
  });
  const payload = await response.json() as LoginResponse;
  assert.equal(response.ok, true, `Login local retornou ${response.status}`);
  const token = payload.accessToken ?? payload.data?.accessToken;
  assert.ok(token, 'Login local não retornou access token');
  return token;
}

async function openNewIngredient(page: Page) {
  const button = page.getByRole('button', { name: /Novo Insumo/i });
  await button.waitFor({ timeout: 60_000 });
  await button.click();
  await page.getByRole('switch', { name: 'Lançar compra inicial agora' }).waitFor();
}

async function openHours(page: Page) {
  await page.getByRole('button', { name: /Horários/i }).click();
  await page.getByRole('switch').first().waitFor();
}

async function assertNoOverflow(page: Page, label: string) {
  const overflow = await page.evaluate(() => ({
    document: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    body: document.body.scrollWidth - document.body.clientWidth,
  }));
  assert.ok(overflow.document <= 1, `${label}: document overflow ${overflow.document}px`);
  assert.ok(overflow.body <= 1, `${label}: body overflow ${overflow.body}px`);
}

async function assertStableSwitches(page: Page, label: string) {
  const switches = page.getByRole('switch');
  const count = await switches.count();
  assert.ok(count > 0, `${label}: nenhum switch renderizado`);
  for (let index = 0; index < count; index += 1) {
    const box = await switches.nth(index).boundingBox();
    assert.ok(box, `${label}: switch ${index + 1} sem bounding box`);
    assert.ok(box.width >= 43 && box.width <= 45, `${label}: switch ${index + 1} com largura ${box.width}`);
    assert.ok(box.height >= 23 && box.height <= 25, `${label}: switch ${index + 1} com altura ${box.height}`);
  }
}

async function main() {
  await mkdir(artifacts, { recursive: true });
  const token = await login();
  const browser = await chromium.launch({
    headless: true,
    ...(executablePath ? { executablePath } : {}),
  });
  try {
    for (const item of cases) {
      for (const theme of ['light', 'dark'] as const) {
        const context = await browser.newContext({
          viewport: { width: item.width, height: item.height },
          colorScheme: theme,
        });
        await context.addInitScript(({ accessToken, selectedTheme }) => {
          localStorage.setItem('accessToken', accessToken);
          localStorage.setItem('gestor-delivery:tenant-panel-theme', selectedTheme);
        }, { accessToken: token, selectedTheme: theme });
        const page = await context.newPage();
        const label = `${item.width}x${item.height}-${theme}`;
        await page.goto(`${webBase}${item.path}`, { waitUntil: 'domcontentloaded' });
        if (item.width < 768) {
          await page.getByRole('button', { name: 'Abrir menu' }).click();
        }
        const statusSwitch = page.getByRole('switch', { name: /pedidos|horário/i }).first();
        await statusSwitch.waitFor({ timeout: 60_000 });
        const dismissNotifications = page.getByRole('button', { name: 'Agora nao' });
        if (await dismissNotifications.isVisible().catch(() => false)) {
          await dismissNotifications.click();
        }
        await page.waitForTimeout(300);
        await assertStableSwitches(page, `${label}-sidebar`);
        await assertNoOverflow(page, `${label}-sidebar`);
        await page.screenshot({ path: join(artifacts, `${label}-sidebar-status.png`), fullPage: true });
        if (item.width < 768) {
          await page.mouse.click(item.width - 8, Math.floor(item.height / 2));
        }
        if (item.prepare) await item.prepare(page);
        await page.waitForTimeout(300);
        await assertStableSwitches(page, `${label}${item.path}`);
        await assertNoOverflow(page, `${label}${item.path}`);
        await page.screenshot({ path: join(artifacts, `${label}-${item.path.replaceAll('/', '-')}.png`), fullPage: true });

        if (item.path === '/settings') {
          assert.equal(await page.getByText('Status da loja', { exact: true }).count(), 0, 'Configurações ainda mostra bloco duplicado');
        }
        await context.close();
        console.log(`PASS ${label} ${item.path}`);
      }
    }
  } finally {
    await browser.close();
  }
  console.log(`PRODUCTION_QUICK_FIXES_VISUAL_PASS artifacts=${artifacts}`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
