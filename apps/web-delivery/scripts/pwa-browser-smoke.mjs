import { chromium } from '@playwright/test';

const baseUrl = process.env.PWA_SMOKE_BASE_URL || 'http://127.0.0.1:4175';
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext();
const page = await context.newPage();
page.setDefaultTimeout(15_000);
page.on('console', (message) => console.log(`browser:${message.type()}: ${message.text()}`));
page.on('pageerror', (error) => console.log(`browser:pageerror: ${error.message}`));

try {
  console.log('pwa-smoke: open');
  const response = await page.goto(`${baseUrl}/login`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  if (!response?.ok()) throw new Error(`login returned ${response?.status()}`);

  const manifest = await page.evaluate(async () => {
    const link = document.querySelector('link[rel="manifest"]');
    if (!(link instanceof HTMLLinkElement)) throw new Error('manifest link missing');
    const response = await fetch(link.href);
    return response.json();
  });
  console.log('pwa-smoke: manifest');
  if (manifest.display !== 'standalone' || manifest.start_url !== '/' || manifest.scope !== '/') {
    throw new Error('manifest installability fields are invalid');
  }
  for (const icon of manifest.icons) {
    const iconResponse = await page.request.get(new URL(icon.src, baseUrl).href);
    const bytes = await iconResponse.body();
    const [expectedWidth, expectedHeight] = icon.sizes.split('x').map(Number);
    if (
      !iconResponse.ok()
      || iconResponse.headers()['content-type'] !== 'image/png'
      || bytes.readUInt32BE(16) !== expectedWidth
      || bytes.readUInt32BE(20) !== expectedHeight
    ) {
      throw new Error(`invalid ${icon.sizes} ${icon.purpose} icon`);
    }
  }
  for (const size of ['192x192', '512x512']) {
    if (!manifest.icons.some((icon) => icon.sizes === size && icon.purpose === 'any')) {
      throw new Error(`missing ${size} install icon`);
    }
  }
  if (!manifest.icons.some((icon) => icon.sizes === '512x512' && icon.purpose === 'maskable')) {
    throw new Error('missing maskable 512x512 icon');
  }

  await page.evaluate(() => Promise.race([
    navigator.serviceWorker.ready,
    new Promise((_, reject) => setTimeout(() => reject(new Error('service worker ready timeout')), 15_000)),
  ]));
  console.log('pwa-smoke: worker-active');
  console.log(await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.getRegistration();
    return { scope: registration?.scope, active: registration?.active?.state, controller: navigator.serviceWorker.controller?.scriptURL };
  }));
  await page.reload({ waitUntil: 'domcontentloaded' });
  console.log(await page.evaluate(() => ({ controller: navigator.serviceWorker.controller?.scriptURL })));
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
  const cacheNames = await page.evaluate(() => caches.keys());
  if (!cacheNames.includes('gestor-motoboy-v2')) throw new Error('app shell cache missing');

  await context.setOffline(true);
  console.log('pwa-smoke: offline-reload');
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 30_000 });
  await page.getByRole('heading', { name: 'Gestor Delivery' }).waitFor();

  console.log(JSON.stringify({
    installability: 'ok',
    serviceWorkerControlled: true,
    offlineNavigation: 'ok',
    cache: 'gestor-motoboy-v2',
    icons: manifest.icons.length,
  }));
} finally {
  await context.setOffline(false).catch(() => undefined);
  await browser.close();
}
