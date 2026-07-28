import {
  chromium,
  expect,
  type Page,
} from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import * as path from 'node:path';

const webUrl =
  process.env.STOREFRONT_CONSENT_E2E_WEB_URL ?? 'http://127.0.0.1:3000';
const artifactDirectory = path.resolve(
  process.env.STOREFRONT_CONSENT_E2E_ARTIFACT_DIR ??
    'qa-artifacts/storefront-consent',
);
const policyVersion = '1.0.0';

const tenants = {
  'tenant-a': {
    id: 'tenant-a-id',
    name: 'Cardápio Aurora',
  },
  'tenant-b': {
    id: 'tenant-b-id',
    name: 'Cardápio Horizonte',
  },
} as const;

type TenantSlug = keyof typeof tenants;

interface StoredConsent {
  schemaVersion: 1;
  policyVersion: string;
  tenantKey: string;
  categories: {
    necessary: true;
    analytics: boolean;
    marketing: boolean;
  };
  decidedAt: string;
  updatedAt: string;
  source: string;
}

function storageKey(tenantKey: string) {
  return `gestor:storefront-consent:v1:${encodeURIComponent(tenantKey)}`;
}

function payloadFor(slug: TenantSlug) {
  const tenant = tenants[slug];
  return {
    data: {
      tenant: {
        id: tenant.id,
        name: tenant.name,
        slug,
        description: 'Cardápio de teste de consentimento',
        isOpen: true,
        statusMessage: 'Aberto',
        paymentMethods: ['pix'],
        minimumOrderValue: 0,
        orderModes: {
          deliveryEnabled: true,
          pickupEnabled: true,
          dineInEnabled: false,
          scheduledOrdersEnabled: false,
          allowScheduleWhenClosed: false,
        },
      },
      categories: [],
      combos: [],
      upsells: [],
      customization: {
        theme: {},
        layout: {},
      },
    },
  };
}

async function installStorefrontRoutes(page: Page) {
  await page.route('**/api/v1/public/storefront/*', async route => {
    const pathname = new URL(route.request().url()).pathname;
    const slug = pathname.split('/').filter(Boolean).at(-1);

    if (slug === 'tenant-a' || slug === 'tenant-b') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(payloadFor(slug)),
      });
      return;
    }

    await route.fulfill({
      status: 404,
      contentType: 'application/json',
      body: JSON.stringify({ error: { message: 'Tenant not found' } }),
    });
  });
}

async function goToTenant(page: Page, slug: TenantSlug) {
  await page.goto(`${webUrl}/${slug}`, { waitUntil: 'domcontentloaded' });
  await expect(
    page.getByRole('heading', { name: 'Sua privacidade importa' }),
  ).toBeVisible();
}

async function readConsent(page: Page, tenantKey: string) {
  return page.evaluate(key => {
    const value = localStorage.getItem(key);
    return value ? (JSON.parse(value) as StoredConsent) : null;
  }, storageKey(tenantKey));
}

async function setTheme(page: Page, theme: 'light' | 'dark') {
  await page.evaluate(nextTheme => {
    localStorage.setItem('gestor-delivery:storefront-theme', nextTheme);
  }, theme);
}

async function clearConsent(page: Page, tenantKey: string) {
  await page.evaluate(key => localStorage.removeItem(key), storageKey(tenantKey));
}

async function assertNoHorizontalOverflow(page: Page) {
  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth + 1);
}

async function assertBannerInFlow(page: Page) {
  const banner = page.getByRole('complementary', {
    name: 'Sua privacidade importa',
  });
  const position = await banner.evaluate(element => getComputedStyle(element).position);
  expect(position).not.toBe('fixed');
  await assertNoHorizontalOverflow(page);
}

async function openPreferences(page: Page) {
  const trigger = page.getByRole('button', {
    name: 'Preferências de privacidade',
  });
  await trigger.focus();
  await trigger.click();
  const dialog = page.getByRole('dialog', {
    name: 'Preferências de privacidade',
  });
  await expect(dialog).toBeVisible();
  return { dialog, trigger };
}

async function captureBanner(
  page: Page,
  tenantKey: string,
  theme: 'light' | 'dark',
  width: number,
  height: number,
) {
  await page.setViewportSize({ width, height });
  await setTheme(page, theme);
  await clearConsent(page, tenantKey);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(
    page.getByRole('heading', { name: 'Sua privacidade importa' }),
  ).toBeVisible();
  await assertBannerInFlow(page);
  await page.waitForTimeout(400);
  await page.screenshot({
    path: path.join(
      artifactDirectory,
      `banner-${width}x${height}-${theme}.png`,
    ),
  });
}

async function capturePreferences(
  page: Page,
  tenantKey: string,
  theme: 'light' | 'dark',
  width: number,
  height: number,
) {
  await page.setViewportSize({ width, height });
  await setTheme(page, theme);
  await page.evaluate(
    ({ key, currentTenantKey, currentPolicyVersion }) => {
      const timestamp = new Date().toISOString();
      localStorage.setItem(
        key,
        JSON.stringify({
          schemaVersion: 1,
          policyVersion: currentPolicyVersion,
          tenantKey: currentTenantKey,
          categories: {
            necessary: true,
            analytics: false,
            marketing: false,
          },
          decidedAt: timestamp,
          updatedAt: timestamp,
          source: 'banner_reject_optional',
        }),
      );
    },
    {
      key: storageKey(tenantKey),
      currentTenantKey: tenantKey,
      currentPolicyVersion: policyVersion,
    },
  );
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(
    page.getByRole('heading', { name: 'Sua privacidade importa' }),
  ).toBeHidden();

  await openPreferences(page);
  await assertNoHorizontalOverflow(page);
  await page.waitForTimeout(400);
  await page.screenshot({
    path: path.join(
      artifactDirectory,
      `preferences-${width}x${height}-${theme}.png`,
    ),
  });
  await page
    .getByRole('button', {
      name: 'Fechar preferências de privacidade',
    })
    .click();
}

async function run() {
  await mkdir(artifactDirectory, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    colorScheme: 'light',
  });
  await context.addInitScript(() => {
    sessionStorage.setItem('pwa-reloaded:20260621-fix2', '1');
  });
  const page = await context.newPage();
  page.setDefaultTimeout(5_000);
  page.on('pageerror', error => console.error('PAGE_ERROR', error));
  page.on('console', message => {
    if (message.type() === 'error') {
      console.error('BROWSER_CONSOLE', message.text());
    }
  });

  try {
    await installStorefrontRoutes(page);
    await goToTenant(page, 'tenant-a');
    await assertBannerInFlow(page);
    await expect(
      page.getByRole('heading', { name: tenants['tenant-a'].name }),
    ).toBeVisible();
    console.log('E2E_STAGE=initial_banner');

    const initialRejectButton = page.getByRole('button', {
      name: 'Aceitar apenas necessários',
    });
    await initialRejectButton.click();
    await expect(
      page.getByRole('heading', { name: 'Sua privacidade importa' }),
    ).toBeHidden();
    expect(await readConsent(page, tenants['tenant-a'].id)).toMatchObject({
      policyVersion,
      tenantKey: tenants['tenant-a'].id,
      categories: {
        necessary: true,
        analytics: false,
        marketing: false,
      },
      source: 'banner_reject_optional',
    });
    console.log('E2E_STAGE=reject_optional');

    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(
      page.getByRole('heading', { name: 'Sua privacidade importa' }),
    ).toBeHidden();
    console.log('E2E_STAGE=valid_reload');

    const { dialog, trigger } = await openPreferences(page);
    const necessary = dialog.getByRole('switch', { name: 'Necessários' });
    const analytics = dialog.getByRole('switch', { name: 'Analytics' });
    const marketing = dialog.getByRole('switch', { name: 'Marketing' });
    await expect(necessary).toBeChecked();
    await expect(necessary).toBeDisabled();
    await expect(analytics).not.toBeChecked();
    await expect(marketing).not.toBeChecked();
    await expect(
      dialog.getByRole('button', {
        name: 'Fechar preferências de privacidade',
      }),
    ).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(
      dialog.getByRole('button', { name: 'Revogar opcionais' }),
    ).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(
      dialog.getByRole('button', {
        name: 'Fechar preferências de privacidade',
      }),
    ).toBeFocused();

    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(trigger).toBeFocused();
    console.log('E2E_STAGE=dialog_keyboard');

    await trigger.click();
    const reopenedDialog = page.getByRole('dialog', {
      name: 'Preferências de privacidade',
    });
    await reopenedDialog.getByRole('switch', { name: 'Analytics' }).click();
    await reopenedDialog
      .getByRole('button', {
        name: 'Salvar preferências',
      })
      .click();
    expect(await readConsent(page, tenants['tenant-a'].id)).toMatchObject({
      categories: {
        necessary: true,
        analytics: true,
        marketing: false,
      },
      source: 'preferences_save',
    });
    console.log('E2E_STAGE=customize');

    await openPreferences(page);
    await page.getByRole('button', { name: 'Revogar opcionais' }).click();
    expect(await readConsent(page, tenants['tenant-a'].id)).toMatchObject({
      categories: {
        necessary: true,
        analytics: false,
        marketing: false,
      },
      source: 'preferences_revoke',
    });
    console.log('E2E_STAGE=revoke');

    await page.goto(`${webUrl}/tenant-b`, { waitUntil: 'domcontentloaded' });
    await expect(
      page.getByRole('heading', { name: 'Sua privacidade importa' }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Aceitar todos' }).click();
    expect(await readConsent(page, tenants['tenant-b'].id)).toMatchObject({
      categories: {
        necessary: true,
        analytics: true,
        marketing: true,
      },
      source: 'banner_accept_all',
    });
    expect(await readConsent(page, tenants['tenant-a'].id)).toMatchObject({
      categories: {
        necessary: true,
        analytics: false,
        marketing: false,
      },
    });
    console.log('E2E_STAGE=tenant_isolation');

    await page.evaluate(
      ({ key, tenantKey }) => {
        const timestamp = new Date().toISOString();
        localStorage.setItem(
          key,
          JSON.stringify({
            schemaVersion: 1,
            policyVersion: '0.9.0',
            tenantKey,
            categories: {
              necessary: true,
              analytics: true,
              marketing: true,
            },
            decidedAt: timestamp,
            updatedAt: timestamp,
            source: 'banner_accept_all',
          }),
        );
      },
      {
        key: storageKey(tenants['tenant-b'].id),
        tenantKey: tenants['tenant-b'].id,
      },
    );
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(
      page.getByRole('heading', { name: 'Sua privacidade importa' }),
    ).toBeVisible();
    console.log('E2E_STAGE=policy_invalidation');

    await page.goto(`${webUrl}/tenant-a`, { waitUntil: 'domcontentloaded' });
    await captureBanner(page, tenants['tenant-a'].id, 'light', 1440, 900);
    console.log('E2E_STAGE=screenshot_1');
    await captureBanner(page, tenants['tenant-a'].id, 'dark', 1440, 900);
    await capturePreferences(
      page,
      tenants['tenant-a'].id,
      'light',
      1440,
      900,
    );
    await capturePreferences(
      page,
      tenants['tenant-a'].id,
      'dark',
      1440,
      900,
    );
    await captureBanner(page, tenants['tenant-a'].id, 'light', 390, 844);
    await captureBanner(page, tenants['tenant-a'].id, 'dark', 390, 844);
    await capturePreferences(
      page,
      tenants['tenant-a'].id,
      'light',
      390,
      844,
    );
    await capturePreferences(
      page,
      tenants['tenant-a'].id,
      'dark',
      390,
      844,
    );
    console.log('E2E_STAGE=screenshots_complete');

    console.log(
      JSON.stringify({
        result: 'PASS',
        scenarios: 7,
        screenshots: 8,
        artifactDirectory,
      }),
    );
  } finally {
    await context.close();
    await browser.close();
  }
}

void run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
