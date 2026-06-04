import { chromium, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import * as path from 'node:path';

type Theme = 'light' | 'dark';
type AppName = 'api' | 'web-admin' | 'web-tenant' | 'web-storefront' | 'web-delivery';

type ViewportSpec = {
  name: 'desktop' | 'notebook' | 'tablet' | 'mobile';
  width: number;
  height: number;
};

type VisualTarget = {
  app: Exclude<AppName, 'api'>;
  route: string;
  label: string;
  auth: 'none' | 'admin' | 'tenant' | 'driver';
  themes: Theme[];
  viewports: Array<ViewportSpec['name']>;
  waitFor?: string;
};

type LoginPayload = {
  accessToken: string;
  refreshToken: string;
  user?: unknown;
  driver?: unknown;
};

type ApiResponse<T> = {
  success?: boolean;
  data?: T;
  error?: { message?: string };
};

type ScreenshotResult = {
  app: string;
  route: string;
  label: string;
  viewport: string;
  theme: Theme;
  file: string;
  status: 'passed' | 'failed';
  observations: string[];
};

const rootDir = path.resolve(__dirname, '..');
const artifactDir = path.join(rootDir, 'qa-artifacts', 'visual');
const screenshotDir = path.join(artifactDir, 'screenshots');
const apiBase = process.env.QA_API_BASE_URL ?? 'http://127.0.0.1:3333/api/v1';

const viewports: ViewportSpec[] = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'notebook', width: 1366, height: 768 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'mobile', width: 390, height: 844 },
];

const appUrls: Record<Exclude<AppName, 'api'>, string> = {
  'web-admin': 'http://localhost:5174',
  'web-tenant': 'http://localhost:5173',
  'web-storefront': 'http://localhost:3000',
  'web-delivery': 'http://127.0.0.1:5175',
};

const targets: VisualTarget[] = [
  { app: 'web-admin', route: '/login', label: 'saas-admin-login', auth: 'none', themes: ['light', 'dark'], viewports: ['desktop', 'mobile'], waitFor: 'input[type="email"]' },
  { app: 'web-admin', route: '/dashboard', label: 'saas-admin-dashboard', auth: 'admin', themes: ['light', 'dark'], viewports: ['desktop', 'notebook', 'mobile'] },
  { app: 'web-admin', route: '/tenants', label: 'saas-admin-tenants', auth: 'admin', themes: ['light'], viewports: ['desktop', 'notebook', 'mobile'] },
  { app: 'web-admin', route: '/billing', label: 'saas-admin-billing', auth: 'admin', themes: ['light'], viewports: ['desktop', 'notebook'] },
  { app: 'web-admin', route: '/media', label: 'saas-admin-media-global', auth: 'admin', themes: ['light', 'dark'], viewports: ['desktop', 'notebook', 'mobile'] },
  { app: 'web-admin', route: '/audit-logs', label: 'saas-admin-audit-logs', auth: 'admin', themes: ['light'], viewports: ['desktop'] },

  { app: 'web-tenant', route: '/login', label: 'tenant-login', auth: 'none', themes: ['light', 'dark'], viewports: ['desktop', 'mobile'], waitFor: 'input[type="email"]' },
  { app: 'web-tenant', route: '/dashboard', label: 'tenant-dashboard', auth: 'tenant', themes: ['light', 'dark'], viewports: ['desktop', 'notebook', 'mobile'] },
  { app: 'web-tenant', route: '/catalog/products', label: 'tenant-products', auth: 'tenant', themes: ['light'], viewports: ['desktop', 'notebook', 'mobile'] },
  { app: 'web-tenant', route: '/catalog/products/__PRODUCT_ID__/v2', label: 'tenant-product-editor', auth: 'tenant', themes: ['light', 'dark'], viewports: ['desktop', 'notebook', 'mobile'] },
  { app: 'web-tenant', route: '/catalog/media', label: 'tenant-media-library', auth: 'tenant', themes: ['light', 'dark'], viewports: ['desktop', 'notebook', 'mobile'] },
  { app: 'web-tenant', route: '/pos', label: 'tenant-pos', auth: 'tenant', themes: ['light'], viewports: ['desktop', 'notebook', 'tablet'] },
  { app: 'web-tenant', route: '/orders', label: 'tenant-orders-list', auth: 'tenant', themes: ['light'], viewports: ['desktop', 'notebook', 'mobile'] },
  { app: 'web-tenant', route: '/orders/board', label: 'tenant-orders-kanban', auth: 'tenant', themes: ['light'], viewports: ['desktop', 'notebook', 'tablet'] },
  { app: 'web-tenant', route: '/billing', label: 'tenant-billing', auth: 'tenant', themes: ['light'], viewports: ['desktop', 'notebook'] },
  { app: 'web-tenant', route: '/settings', label: 'tenant-settings', auth: 'tenant', themes: ['light'], viewports: ['desktop', 'mobile'] },
  { app: 'web-tenant', route: '/cash', label: 'tenant-cash', auth: 'tenant', themes: ['light'], viewports: ['desktop', 'notebook'] },
  { app: 'web-tenant', route: '/delivery/rates', label: 'tenant-delivery-rates', auth: 'tenant', themes: ['light'], viewports: ['desktop', 'notebook'] },

  { app: 'web-storefront', route: '/pizzaria-demo', label: 'storefront-menu', auth: 'none', themes: ['light', 'dark'], viewports: ['desktop', 'notebook', 'mobile'] },
  { app: 'web-storefront', route: '/pizzaria-demo/checkout', label: 'storefront-checkout', auth: 'none', themes: ['light'], viewports: ['desktop', 'mobile'] },

  { app: 'web-delivery', route: '/login', label: 'delivery-login', auth: 'none', themes: ['light'], viewports: ['mobile', 'tablet'], waitFor: 'input[type="tel"]' },
  { app: 'web-delivery', route: '/', label: 'delivery-active-runs', auth: 'driver', themes: ['light'], viewports: ['mobile', 'tablet'] },
];

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null ? value as Record<string, unknown> : null;
}

function pickString(value: unknown, key: string): string | null {
  const record = asRecord(value);
  const field = record?.[key];
  return typeof field === 'string' ? field : null;
}

async function delay(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function spawnProcess(name: AppName, command: string, args: string[], cwd = rootDir): ChildProcess {
  const child = spawn(command, args, {
    cwd,
    shell: true,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  child.stdout?.on('data', (chunk: Buffer) => process.stdout.write(`[${name}] ${chunk.toString()}`));
  child.stderr?.on('data', (chunk: Buffer) => process.stderr.write(`[${name}] ${chunk.toString()}`));
  return child;
}

async function waitForUrl(url: string, name: string, timeoutMs = 90_000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.status < 500) return;
    } catch {
      await delay(1000);
    }
  }
  throw new Error(`Timeout aguardando ${name} em ${url}`);
}

async function apiJson<T>(pathName: string, init?: RequestInit, retries = 4): Promise<T> {
  let lastError: unknown = null;
  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      const response = await fetch(`${apiBase}${pathName}`, {
        ...init,
        headers: {
          'Content-Type': 'application/json',
          ...(init?.headers ?? {}),
        },
      });
      const raw = await response.json().catch(() => ({})) as ApiResponse<T> | T;
      if (!response.ok) {
        const message = asRecord(raw)?.error ? asRecord(asRecord(raw)?.error)?.message : null;
        throw new Error(`${pathName} HTTP ${response.status}${typeof message === 'string' ? `: ${message}` : ''}`);
      }
      const maybeWrapped = asRecord(raw);
      if (maybeWrapped && 'success' in maybeWrapped && 'data' in maybeWrapped) {
        return maybeWrapped.data as T;
      }
      return raw as T;
    } catch (error) {
      lastError = error;
      await delay(1000 * attempt);
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

async function loginAdmin(): Promise<LoginPayload> {
  return apiJson<LoginPayload>('/auth/admin/login', {
    method: 'POST',
    body: JSON.stringify({ email: 'admin@saas.com', password: 'admin123' }),
  });
}

async function loginTenant(): Promise<LoginPayload> {
  return apiJson<LoginPayload>('/auth/tenant/login', {
    method: 'POST',
    body: JSON.stringify({ email: 'demo@demo.com', password: 'demo123', tenantSlug: 'pizzaria-demo' }),
  });
}

async function ensureDriver(tenantToken: string): Promise<LoginPayload | null> {
  const phone = '11977770000';
  await apiJson<unknown>('/delivery/drivers', {
    method: 'POST',
    headers: { Authorization: `Bearer ${tenantToken}` },
    body: JSON.stringify({ name: 'QA Visual Entregador', phone, status: 'available', isActive: true }),
  }).catch(() => null);

  const drivers = await apiJson<unknown[]>('/delivery/drivers', {
    headers: { Authorization: `Bearer ${tenantToken}` },
  }).catch((): unknown[] => []);
  const driver = drivers.find((item) => pickString(item, 'phone') === phone);
  const driverId = pickString(driver, 'id');
  if (!driverId) return null;

  const reset = await apiJson<{ pin?: string }>(`/delivery/drivers/${driverId}/reset-pin`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${tenantToken}` },
  }).catch(() => null);
  const pin = reset?.pin;
  if (!pin) return null;

  return apiJson<LoginPayload>('/auth/driver/login', {
    method: 'POST',
    body: JSON.stringify({ phone, pin, tenantSlug: 'pizzaria-demo' }),
  }).catch(() => null);
}

async function ensureVisualProduct(tenantToken: string): Promise<string> {
  const existingProducts = await apiJson<unknown[]>('/catalog/products', {
    headers: { Authorization: `Bearer ${tenantToken}` },
  }).catch((): unknown[] => []);
  const existing = existingProducts.find((item) => pickString(item, 'id') !== null);
  const existingId = pickString(existing, 'id');
  if (existingId) return existingId;

  const created = await apiJson<unknown>('/catalog/products', {
    method: 'POST',
    headers: { Authorization: `Bearer ${tenantToken}` },
    body: JSON.stringify({
      name: `QA Visual ${Date.now()}`,
      type: 'simple',
      basePrice: 10,
      shortDescription: 'Produto criado pelo QA visual.',
      isActive: true,
      isAvailable: true,
      sellableOnline: true,
    }),
  });
  const createdId = pickString(created, 'id');
  if (!createdId) throw new Error('Nao foi possivel obter produto para QA visual.');
  return createdId;
}

async function setContextAuth(context: BrowserContext, auth: VisualTarget['auth'], adminLogin: LoginPayload, tenantLogin: LoginPayload, driverLogin: LoginPayload | null, theme: Theme): Promise<void> {
  await context.addInitScript(({ authKind, admin, tenant, driver, selectedTheme }) => {
    if (authKind === 'admin') {
      window.localStorage.setItem('admin_accessToken', admin.accessToken);
      window.localStorage.setItem('admin_refreshToken', admin.refreshToken);
    }
    if (authKind === 'tenant') {
      window.localStorage.setItem('accessToken', tenant.accessToken);
      window.localStorage.setItem('refreshToken', tenant.refreshToken);
    }
    if (authKind === 'driver' && driver) {
      window.localStorage.setItem('gestor-web-delivery-auth', JSON.stringify({
        state: {
          accessToken: driver.accessToken,
          refreshToken: driver.refreshToken,
          user: driver.driver ?? driver.user,
          isAuthenticated: true,
        },
        version: 0,
      }));
    }
    window.localStorage.setItem('gestor-delivery:saas-admin-theme', selectedTheme);
    window.localStorage.setItem('gestor-delivery:tenant-panel-theme', selectedTheme);
    window.localStorage.setItem('gestor-delivery:storefront-theme', selectedTheme);
  }, { authKind: auth, admin: adminLogin, tenant: tenantLogin, driver: driverLogin, selectedTheme: theme });
}

async function inspectPage(page: Page): Promise<string[]> {
  const observations: string[] = [];
  const metrics = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
    bodyText: document.body.innerText.slice(0, 200),
    visibleButtons: Array.from(document.querySelectorAll('button')).filter((button) => {
      const rect = button.getBoundingClientRect();
      const style = window.getComputedStyle(button);
      return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
    }).length,
    visibleInputs: Array.from(document.querySelectorAll('input, textarea, select')).filter((input) => {
      const rect = input.getBoundingClientRect();
      const style = window.getComputedStyle(input);
      return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
    }).length,
  }));

  if (metrics.scrollWidth > metrics.clientWidth + 4) {
    observations.push(`scroll-horizontal ${metrics.scrollWidth}/${metrics.clientWidth}`);
  }
  if (metrics.bodyText.trim().length < 20) {
    observations.push('conteudo textual muito curto ou tela possivelmente vazia');
  }
  if (metrics.visibleButtons === 0 && metrics.visibleInputs === 0) {
    observations.push('sem botoes ou inputs visiveis');
  }
  return observations;
}

function slugPart(value: string): string {
  return value.replace(/[^a-z0-9-]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase();
}

async function captureTarget(browser: Browser, target: VisualTarget, viewport: ViewportSpec, theme: Theme, adminLogin: LoginPayload, tenantLogin: LoginPayload, driverLogin: LoginPayload | null, productId: string): Promise<ScreenshotResult> {
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    colorScheme: theme,
  });
  await setContextAuth(context, target.auth, adminLogin, tenantLogin, driverLogin, theme);

  const consoleErrors: string[] = [];
  const requestFailures: string[] = [];
  const page = await context.newPage();
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text().slice(0, 180));
  });
  page.on('requestfailed', (request) => {
    const url = request.url();
    if (!url.includes('/socket.io/') && !url.includes('hot-update')) {
      requestFailures.push(`${request.method()} ${url.slice(0, 160)}`);
    }
  });
  page.on('response', (response) => {
    const status = response.status();
    const url = response.url();
    if (status >= 500 && !url.includes('/socket.io/')) {
      requestFailures.push(`HTTP ${status} ${url.slice(0, 160)}`);
    }
  });

  const route = target.route.replace('__PRODUCT_ID__', productId);
  const url = `${appUrls[target.app]}${route}`;
  let status: ScreenshotResult['status'] = 'passed';
  const observations: string[] = [];
  const fileName = `${target.app}__${target.label}__${viewport.name}__${theme}.png`;
  const filePath = path.join(screenshotDir, fileName);

  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await page.waitForLoadState('networkidle', { timeout: 12_000 }).catch(() => null);
    if (target.waitFor) {
      await page.locator(target.waitFor).first().waitFor({ timeout: 10_000 });
    }
    await delay(600);
    observations.push(...await inspectPage(page));
    if (consoleErrors.length) observations.push(`console-error: ${consoleErrors[0]}`);
    if (requestFailures.length) observations.push(`request-failure: ${requestFailures[0]}`);
    if (consoleErrors.length || requestFailures.length || observations.some((item) => item.startsWith('scroll-horizontal'))) {
      status = 'failed';
    }
    await page.screenshot({ path: filePath, fullPage: true });
  } catch (error) {
    status = 'failed';
    observations.push(error instanceof Error ? error.message : String(error));
    if (!existsSync(filePath)) {
      await page.screenshot({ path: filePath, fullPage: true }).catch(() => null);
    }
  } finally {
    await context.close();
  }

  return {
    app: target.app,
    route,
    label: target.label,
    viewport: viewport.name,
    theme,
    file: path.relative(rootDir, filePath).replace(/\\/g, '/'),
    status,
    observations,
  };
}

async function main() {
  await mkdir(screenshotDir, { recursive: true });

  const processes: ChildProcess[] = [];
  try {
    processes.push(spawnProcess('api', 'node.exe', ['apps/api/dist/apps/api/src/main.js']));
    processes.push(spawnProcess('web-tenant', 'pnpm.cmd', ['--filter', '@gestor/web-tenant', 'dev', '--', '--host', '127.0.0.1']));
    processes.push(spawnProcess('web-admin', 'pnpm.cmd', ['--filter', '@gestor/web-admin', 'dev', '--', '--host', '127.0.0.1']));
    processes.push(spawnProcess('web-storefront', 'pnpm.cmd', ['--filter', '@gestor/web-storefront', 'dev', '--', '--host', '127.0.0.1']));
    processes.push(spawnProcess('web-delivery', 'pnpm.cmd', ['--filter', '@gestor/web-delivery', 'exec', 'vite', '--host', '127.0.0.1', '--port', '5175']));

    await waitForUrl(`${apiBase}/health`, 'API');
    await Promise.all([
      waitForUrl(appUrls['web-tenant'], 'Web Tenant'),
      waitForUrl(appUrls['web-admin'], 'Web Admin'),
      waitForUrl(appUrls['web-storefront'], 'Web Storefront'),
      waitForUrl(appUrls['web-delivery'], 'Web Delivery'),
    ]);

    const adminLogin = await loginAdmin();
    const tenantLogin = await loginTenant();
    const productId = await ensureVisualProduct(tenantLogin.accessToken);
    const driverLogin = await ensureDriver(tenantLogin.accessToken);

    const browser = await chromium.launch({ headless: true });
    const results: ScreenshotResult[] = [];

    for (const target of targets) {
      for (const viewportName of target.viewports) {
        const viewport = viewports.find((item) => item.name === viewportName);
        if (!viewport) continue;
        for (const theme of target.themes) {
          const result = await captureTarget(browser, target, viewport, theme, adminLogin, tenantLogin, driverLogin, productId);
          results.push(result);
          process.stdout.write(`${result.status === 'passed' ? 'OK ' : 'ERR'} ${result.label} ${result.viewport} ${result.theme} ${result.observations.join(' | ')}\n`);
        }
      }
    }

    await browser.close();
    await writeFile(path.join(artifactDir, 'results.json'), JSON.stringify({
      generatedAt: new Date().toISOString(),
      appUrls,
      results,
    }, null, 2));

    const failed = results.filter((result) => result.status === 'failed');
    process.stdout.write(`\nQA visual: ${results.length - failed.length} OK, ${failed.length} falha(s)\n`);
    if (failed.length) {
      for (const failure of failed) {
        process.stdout.write(`- ${failure.app} ${failure.label} ${failure.viewport}/${failure.theme}: ${failure.observations.join(' | ')}\n`);
      }
      process.exitCode = 1;
    }
  } finally {
    for (const child of processes) {
      if (!child.killed) child.kill();
    }
  }
}

main().catch(async (error: unknown) => {
  process.stderr.write(`QA visual crashed: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
