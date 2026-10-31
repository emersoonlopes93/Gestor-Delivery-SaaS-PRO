/* global process */
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
      localStorage.setItem('gestor.driver.location-intro.v1:driver-layout', 'seen');
    });
    const page = await context.newPage();
    const runtimeErrors = [];
    page.on('pageerror', (error) => runtimeErrors.push(`pageerror: ${error.message}`));
    page.on('console', (message) => {
      if (message.type() === 'error') runtimeErrors.push(`console: ${message.text()}`);
    });
    await page.route('**/api/v1/delivery/driver/work-state', (route) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, data: {
        shift: { id: 'shift-layout', status: 'ACTIVE', startedAt: '2026-09-04T12:00:00.000Z', endedAt: null },
        trackingRequired: true,
        availability: 'busy',
        activeRun: {
          id: 'run-layout', driverId: 'driver-layout', driverName: 'Entregador QA', status: 'IN_PROGRESS', version: 2,
          assignedAt: '2026-09-04T12:00:00.000Z', acceptedAt: '2026-09-04T12:01:00.000Z',
          startedAt: '2026-09-04T12:02:00.000Z', returningAt: null, completedAt: null,
          createdAt: '2026-09-04T12:00:00.000Z',
          origin: { lat: -23.55, lng: -46.63, label: 'Loja' },
          route: {
            provider: 'haversine', quality: 'DEGRADED', version: 1,
            distanceMeters: 4200, durationSeconds: 1500, calculatedAt: '2026-09-04T12:02:00.000Z',
            geometry: [{ lat: -23.55, lng: -46.63 }, { lat: -23.551, lng: -46.631 }, { lat: -23.552, lng: -46.632 }, { lat: -23.553, lng: -46.633 }],
          },
          stops: [
            { id: 'stop-1', orderId: 'order-1', sequence: 1, status: 'CURRENT', attempts: 0, orderNumber: '101', customerName: 'Cliente 1', customerPhone: '551100000001', address: { street: 'Rua A', number: '10', neighborhood: 'Centro', lat: -23.551, lng: -46.631 }, arrivedAt: null, deliveredAt: null, failedAt: null, failureReason: null, returnRequiredAt: null, returnedAt: null, cancelledAt: null, cancellationReason: null, payAmount: 5, payCurrency: 'BRL', routeDistanceMeters: 1000, routeDurationSeconds: 300, estimatedArrivalAt: '2026-09-04T12:07:00.000Z' },
            { id: 'stop-2', orderId: 'order-2', sequence: 2, status: 'PENDING', attempts: 0, orderNumber: '102', customerName: 'Cliente 2', customerPhone: '551100000002', address: { street: 'Rua B', number: '20', neighborhood: 'Centro', lat: -23.552, lng: -46.632 }, arrivedAt: null, deliveredAt: null, failedAt: null, failureReason: null, returnRequiredAt: null, returnedAt: null, cancelledAt: null, cancellationReason: null, payAmount: 5, payCurrency: 'BRL', routeDistanceMeters: 1400, routeDurationSeconds: 500, estimatedArrivalAt: '2026-09-04T12:15:00.000Z' },
            { id: 'stop-3', orderId: 'order-3', sequence: 3, status: 'PENDING', attempts: 0, orderNumber: '103', customerName: 'Cliente 3', customerPhone: '551100000003', address: { street: 'Rua C', number: '30', neighborhood: 'Centro', lat: -23.553, lng: -46.633 }, arrivedAt: null, deliveredAt: null, failedAt: null, failureReason: null, returnRequiredAt: null, returnedAt: null, cancelledAt: null, cancellationReason: null, payAmount: 5, payCurrency: 'BRL', routeDistanceMeters: 1800, routeDurationSeconds: 700, estimatedArrivalAt: '2026-09-04T12:27:00.000Z' },
          ],
        },
      } }),
    }));
    await page.goto(`${baseUrl}/routes`, { waitUntil: 'domcontentloaded' });
    await page.locator('h1').waitFor().catch(async () => {
      throw new Error(`driver page did not render at ${page.url()}: ${runtimeErrors.join(' | ')} | body=${(await page.locator('body').innerText()).slice(0, 500)}`);
    });
    await page.getByText('Ordem das entregas').waitFor();
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
        map: document.querySelector('.driver-route-schematic')?.getBoundingClientRect().toJSON() ?? null,
      };
    });

    if (layout.documentWidth > layout.viewportWidth) throw new Error('horizontal overflow detected');
    if (layout.shell.top !== 0 || layout.shell.bottom > scenario.height + 1) throw new Error('shell exceeds viewport');
    if (layout.header.top < 31) throw new Error('header overlaps top safe area');
    if (layout.main.bottom > scenario.height - 23) throw new Error('content overlaps bottom safe area');
    if (layout.mainOverflowY !== 'auto') throw new Error('main content is not independently scrollable');
    if (runtimeErrors.length > 0) throw new Error(`browser runtime errors: ${runtimeErrors.join(' | ')}`);
    if (!layout.map || layout.map.width > scenario.width + 1 || layout.map.left < -1 || layout.map.right > scenario.width + 1) throw new Error('route map breaks the mobile viewport');
    const stopLabels = await page.locator('[aria-label^="Parada "]').allTextContents();
    if (stopLabels.join(',') !== '1,2,3') throw new Error(`numbered stops are not legible: ${stopLabels.join(',')}`);
    if (await page.getByText(/^ETA /).count() !== 3) throw new Error('ETA is not visible for every stop');
    await page.getByText('Estimativa degradada em linha reta. O trajeto e o ETA viários estão indisponíveis.').waitFor();
    await page.getByText('Abrir navegação').click();
    const navigationLink = page.getByRole('link', { name: /Google Maps/ });
    await navigationLink.waitFor();
    const navigationHref = await navigationLink.getAttribute('href');
    if (!navigationHref?.startsWith('https://www.google.com/maps/dir/')) throw new Error('navigation action is not actionable');

    const name = `${scenario.width}x${scenario.height}-${scenario.colorScheme}.png`;
    await page.screenshot({ path: new URL(name, outputDir).pathname.slice(1), fullPage: false });
    await page.getByText('Ordem das entregas').scrollIntoViewIfNeeded();
    const stopsName = `${scenario.width}x${scenario.height}-${scenario.colorScheme}-stops.png`;
    await page.screenshot({ path: new URL(stopsName, outputDir).pathname.slice(1), fullPage: false });
    console.log(`mobile-layout: ${name} PASS`);
    await context.close();
  }
} finally {
  await browser.close();
}
