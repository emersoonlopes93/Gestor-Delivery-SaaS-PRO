import { mkdir } from 'node:fs/promises';
import { chromium } from '@playwright/test';

const baseUrl = process.env.MOBILE_SMOKE_BASE_URL || 'http://127.0.0.1:4175';
const outputDir = new URL('../artifacts/mobile-layout/', import.meta.url);
const scenarios = [
  { width: 390, height: 844, colorScheme: 'light' },
  { width: 430, height: 932, colorScheme: 'dark' },
];

await mkdir(outputDir, { recursive: true });
const browser = await chromium.launch({ headless: true });

try {
  for (const scenario of scenarios) {
    const context = await browser.newContext({
      viewport: { width: scenario.width, height: scenario.height },
      colorScheme: scenario.colorScheme,
    });
    await context.addInitScript(() => {
      localStorage.setItem('gestor-web-delivery-auth', JSON.stringify({
        state: {
          accessToken: 'layout-smoke-token',
          refreshToken: 'layout-smoke-refresh',
          user: {
            id: 'user-layout',
            driverId: 'driver-layout',
            tenantId: 'tenant-layout',
            name: 'Entregador QA',
            status: 'available',
          },
          isAuthenticated: true,
        },
        version: 0,
      }));
    });
    const page = await context.newPage();
    await page.route('**/api/v1/delivery/driver/active-runs', (route) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, data: [] }),
    }));
    await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
    await page.getByRole('heading', { name: 'Motoboy' }).waitFor();
    await page.evaluate(() => {
      document.documentElement.style.setProperty('--safe-area-top', '32px');
      document.documentElement.style.setProperty('--safe-area-bottom', '24px');
    });

    const layout = await page.evaluate(() => {
      const shell = document.querySelector('.delivery-shell');
      const header = document.querySelector('header');
      const main = document.querySelector('main');
      if (!(shell instanceof HTMLElement) || !(header instanceof HTMLElement) || !(main instanceof HTMLElement)) {
        throw new Error('driver shell landmarks missing');
      }
      return {
        viewportWidth: window.innerWidth,
        documentWidth: document.documentElement.scrollWidth,
        shell: shell.getBoundingClientRect().toJSON(),
        header: header.getBoundingClientRect().toJSON(),
        main: main.getBoundingClientRect().toJSON(),
        mainOverflowY: getComputedStyle(main).overflowY,
      };
    });

    if (layout.documentWidth > layout.viewportWidth) throw new Error('horizontal overflow detected');
    if (layout.shell.top !== 0 || layout.shell.bottom > scenario.height + 1) throw new Error('shell exceeds viewport');
    if (layout.header.top < 31) throw new Error('header overlaps top safe area');
    if (layout.main.bottom > scenario.height - 23) throw new Error('content overlaps bottom safe area');
    if (layout.mainOverflowY !== 'auto') throw new Error('main content is not independently scrollable');

    const name = `${scenario.width}x${scenario.height}-${scenario.colorScheme}.png`;
    await page.screenshot({ path: new URL(name, outputDir).pathname.slice(1), fullPage: false });
    console.log(`mobile-layout: ${name} PASS`);
    await context.close();
  }
} finally {
  await browser.close();
}
