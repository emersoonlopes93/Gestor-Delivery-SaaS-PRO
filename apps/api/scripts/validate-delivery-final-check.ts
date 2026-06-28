import { chromium, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { JwtService } from '@nestjs/jwt';
import { PrismaClient, type DeliveryCoverageConfig, type DeliveryRateDistanceTier, type DeliveryRateRule, type TenantOperatingHours, type TenantSettings } from '@prisma/client';
import { mkdir } from 'node:fs/promises';
import * as path from 'node:path';

const prisma = new PrismaClient();

const API_BASE = process.env.SMOKE_API_BASE_URL ?? 'http://localhost:3333/api/v1';
const TENANT_URL = process.env.FINAL_TENANT_URL ?? 'http://localhost:5174';
const STOREFRONT_URL = process.env.FINAL_STOREFRONT_URL ?? 'http://localhost:3000';
const TENANT_SLUG = process.env.SMOKE_TENANT_SLUG ?? 'pizzaria-demo';
const TENANT_EMAIL = process.env.SMOKE_TENANT_EMAIL ?? 'demo@demo.com';
const TENANT_PASSWORD = process.env.SMOKE_TENANT_PASSWORD ?? 'Owner@123';

const STORE_COORDS = {
  lat: -23.5503099,
  lng: -46.6339591,
};

const SHIFTED_STORE_COORDS = {
  lat: -23.5484,
  lng: -46.6389,
};

const DESKTOP_TEST_QUERY = 'Praca da Republica, Sao Paulo, SP';
const MOBILE_TEST_QUERY = 'MASP, Sao Paulo, SP';

const SPECIAL_AREA_NAME = 'Area especial teste';
const BLOCKED_AREA_NAME = 'Area bloqueada teste';

type JsonRecord = Record<string, unknown>;

type ApiEnvelope<T> = {
  success?: boolean;
  data?: T;
  error?: {
    message?: string;
  };
};

type LoginResponse = {
  accessToken: string;
};

type TenantMeResponse = {
  tenantId: string;
  settings?: {
    lat?: number;
    lng?: number;
  };
};

type CoverageResponse = {
  isDeliveryEnabled: boolean;
  storeLat: number;
  storeLng: number;
  maxRadiusKm: number;
  defaultPricePerKm: number;
  minimumFee: number | null;
  maximumFee: number | null;
  defaultEstimatedDeliveryMinutes: number | null;
};

type DeliveryTestCurrentResult = {
  available: boolean;
  fee: number;
  estimatedDeliveryMinutes: number | null;
  matchedZoneId: string | null;
  resolvedCoordinates?: { lat: number; lng: number };
};

type DistanceTierResponse = {
  id: string;
  minDistanceKm: number;
  maxDistanceKm: number;
  fee: number;
  estimatedDeliveryMinutes: number | null;
  sortOrder: number;
};

type DeliveryRuleResponse = {
  id: string;
  type: string;
  name: string | null;
  zoneKind: string | null;
  pricingMode: string | null;
  fixedFee: number | null;
  estimatedDeliveryMinutes: number | null;
  distanceTiers: DistanceTierResponse[];
};

type CheckoutValidationResult = {
  deliveryFee: number;
  estimatedDeliveryMinutes: number | null;
};

type PublicStorefrontResponse = {
  categories: Array<{
    products: Array<{
      id: string;
      name?: string;
      basePrice?: number;
    }>;
  }>;
};

type SnapshotRule = DeliveryRateRule & { distanceTiers: DeliveryRateDistanceTier[] };

type SnapshotState = {
  coverage: DeliveryCoverageConfig | null;
  rules: SnapshotRule[];
  settings: Pick<TenantSettings, 'tenantId' | 'lat' | 'lng' | 'isStorePaused' | 'storePauseReason'> | null;
  operatingHours: Array<Pick<TenantOperatingHours, 'id' | 'tenantId' | 'dayOfWeek' | 'isOpen' | 'openTime' | 'closeTime' | 'createdAt'>>;
};

type CheckResult = {
  name: string;
  passed: boolean;
  detail?: string;
};

const results: CheckResult[] = [];

function pushResult(name: string, passed: boolean, detail?: string): void {
  results.push({ name, passed, detail });
  process.stdout.write(`${passed ? 'OK ' : 'ERR'} ${name}${detail ? ` :: ${detail}` : ''}\n`);
}

function asRecord(value: unknown): JsonRecord | null {
  return typeof value === 'object' && value !== null ? (value as JsonRecord) : null;
}

function getMessage(value: unknown): string {
  const record = asRecord(value);
  const message = record?.message;
  if (typeof message === 'string') return message;
  const error = asRecord(record?.error);
  const errorMessage = error?.message;
  return typeof errorMessage === 'string' ? errorMessage : JSON.stringify(value);
}

async function apiRequest<T>(
  endpoint: string,
  init: RequestInit = {},
  token?: string,
): Promise<{ status: number; data?: T; raw: unknown }> {
  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init.headers ?? {}),
    },
  });

  const raw = await response.json().catch(() => ({}));
  const envelope = raw as ApiEnvelope<T>;
  const data = envelope && typeof envelope === 'object' && 'data' in envelope ? envelope.data : (raw as T);

  return {
    status: response.status,
    data,
    raw,
  };
}

async function login(): Promise<string> {
  const response = await apiRequest<LoginResponse>('/auth/tenant/login', {
    method: 'POST',
    body: JSON.stringify({
      email: TENANT_EMAIL,
      password: TENANT_PASSWORD,
    }),
  });

  if (response.status !== 200 && response.status !== 201) {
    throw new Error(`Falha no login tenant: ${response.status} ${getMessage(response.raw)}`);
  }

  if (!response.data?.accessToken) {
    throw new Error('Login tenant sem accessToken.');
  }

  return response.data.accessToken;
}

async function getTenantMe(token: string): Promise<TenantMeResponse> {
  const response = await apiRequest<TenantMeResponse>('/tenant/me', { method: 'GET' }, token);
  if (response.status !== 200 || !response.data) {
    throw new Error(`Falha ao obter tenant/me: ${response.status} ${getMessage(response.raw)}`);
  }
  return response.data;
}

async function resolveTenantIdBySlug(): Promise<string> {
  const tenant = await prisma.tenant.findUnique({
    where: { slug: TENANT_SLUG },
    select: { id: true },
  });

  if (!tenant) throw new Error(`Tenant ${TENANT_SLUG} nao encontrado.`);
  return tenant.id;
}

async function listRules(token: string): Promise<DeliveryRuleResponse[]> {
  const response = await apiRequest<DeliveryRuleResponse[]>('/delivery/rates', { method: 'GET' }, token);
  if (response.status !== 200 || !response.data) {
    throw new Error(`Falha ao listar delivery/rates: ${response.status} ${getMessage(response.raw)}`);
  }
  return response.data;
}

async function saveCoverage(token: string, storeCoords: { lat: number; lng: number }): Promise<void> {
  const response = await apiRequest<CoverageResponse>(
    '/delivery/coverage',
    {
      method: 'PUT',
      body: JSON.stringify({
        isDeliveryEnabled: true,
        storeLat: storeCoords.lat,
        storeLng: storeCoords.lng,
        maxRadiusKm: 8,
        defaultPricePerKm: 2.5,
        minimumFee: 3,
        maximumFee: 20,
        defaultEstimatedDeliveryMinutes: 40,
      }),
    },
    token,
  );

  if (response.status !== 200 && response.status !== 201) {
    throw new Error(`Falha ao salvar coverage: ${response.status} ${getMessage(response.raw)}`);
  }
}

async function saveGlobalDistanceRule(token: string): Promise<void> {
  const response = await apiRequest<DeliveryRuleResponse>(
    '/delivery/rates',
    {
      method: 'POST',
      body: JSON.stringify({
        type: 'distance',
        isActive: true,
        priority: 500,
        isFallback: false,
        pricingMode: 'tiers',
        name: 'Faixas principais de entrega',
        estimatedDeliveryMinutes: 40,
        distanceTiers: [
          { minDistanceKm: 0, maxDistanceKm: 2, fee: 5, estimatedDeliveryMinutes: 30, sortOrder: 0 },
          { minDistanceKm: 2, maxDistanceKm: 5, fee: 8, estimatedDeliveryMinutes: 45, sortOrder: 1 },
          { minDistanceKm: 5, maxDistanceKm: 8, fee: 12, estimatedDeliveryMinutes: 60, sortOrder: 2 },
        ],
      }),
    },
    token,
  );

  if (response.status !== 200 && response.status !== 201) {
    throw new Error(`Falha ao salvar regra de faixas: ${response.status} ${getMessage(response.raw)}`);
  }
}

function squarePolygon(coords: { lat: number; lng: number }, delta = 0.005): Array<[number, number]> {
  return [
    [coords.lng - delta, coords.lat - delta],
    [coords.lng + delta, coords.lat - delta],
    [coords.lng + delta, coords.lat + delta],
    [coords.lng - delta, coords.lat + delta],
    [coords.lng - delta, coords.lat - delta],
  ];
}

async function testCurrent(token: string, query: string): Promise<DeliveryTestCurrentResult> {
  const response = await apiRequest<DeliveryTestCurrentResult>(
    '/delivery/rates/test-current',
    {
      method: 'POST',
      body: JSON.stringify({ query }),
    },
    token,
  );

  if (response.status !== 200 || !response.data) {
    throw new Error(`Falha em test-current: ${response.status} ${getMessage(response.raw)}`);
  }

  return response.data;
}

async function createPolygonRule(
  token: string,
  body: {
    name: string;
    zoneKind: 'blocked_zone' | 'custom_zone';
    pricingMode: 'fixed' | 'free';
    fixedFee?: number;
    estimatedDeliveryMinutes?: number;
    polygonCoordinates: Array<[number, number]>;
    priority: number;
    blocksDelivery?: boolean;
  },
): Promise<void> {
  const response = await apiRequest<DeliveryRuleResponse>(
    '/delivery/rates',
    {
      method: 'POST',
      body: JSON.stringify({
        type: 'polygon',
        isActive: true,
        ...body,
      }),
    },
    token,
  );

  if (response.status !== 200 && response.status !== 201) {
    throw new Error(`Falha ao criar poligono ${body.name}: ${response.status} ${getMessage(response.raw)}`);
  }
}

async function getStorefrontProduct(): Promise<{ id: string; name: string; basePrice: number }> {
  const response = await apiRequest<PublicStorefrontResponse>(`/public/storefront/${TENANT_SLUG}`, { method: 'GET' });
  if (response.status !== 200 || !response.data) {
    throw new Error(`Falha em storefront/${TENANT_SLUG}: ${response.status} ${getMessage(response.raw)}`);
  }

  const product = response.data.categories.flatMap((category) => category.products)[0];
  if (!product?.id) throw new Error('Nenhum produto encontrado para o checkout visual.');

  return {
    id: product.id,
    name: product.name ?? 'Produto QA',
    basePrice: Number(product.basePrice ?? 10),
  };
}

async function validateCheckout(
  productId: string,
  address: {
    street: string;
    number: string;
    neighborhood: string;
    city: string;
    state: string;
    zipCode: string;
    lat: number;
    lng: number;
  },
): Promise<CheckoutValidationResult> {
  const response = await apiRequest<CheckoutValidationResult>(
    `/orders/public-checkout/${TENANT_SLUG}/validate`,
    {
      method: 'POST',
      body: JSON.stringify({
        items: [
          {
            lineType: 'product',
            productId,
            quantity: 1,
          },
        ],
        fulfillmentType: 'delivery',
        deliveryAddress: address,
        payment: {
          method: 'cash',
          changeFor: 9999,
        },
        customerName: 'Cliente Final Check',
        customerPhone: '11999999999',
        idempotencyKey: 'final-check-validation',
      }),
    },
  );

  if ((response.status !== 200 && response.status !== 201) || !response.data) {
    throw new Error(`Falha na validacao do checkout: ${response.status} ${getMessage(response.raw)}`);
  }

  return response.data;
}

async function snapshotState(tenantId: string): Promise<SnapshotState> {
  const [coverage, rules, settings, operatingHours] = await Promise.all([
    prisma.deliveryCoverageConfig.findUnique({ where: { tenantId } }),
    prisma.deliveryRateRule.findMany({
      where: { tenantId },
      include: {
        distanceTiers: {
          orderBy: { sortOrder: 'asc' },
        },
      },
      orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }],
    }),
    prisma.tenantSettings.findUnique({
      where: { tenantId },
      select: {
        tenantId: true,
        lat: true,
        lng: true,
        isStorePaused: true,
        storePauseReason: true,
      },
    }),
    prisma.tenantOperatingHours.findMany({
      where: { tenantId },
      orderBy: { dayOfWeek: 'asc' },
      select: {
        id: true,
        tenantId: true,
        dayOfWeek: true,
        isOpen: true,
        openTime: true,
        closeTime: true,
        createdAt: true,
      },
    }),
  ]);

  return {
    coverage,
    rules,
    settings,
    operatingHours,
  };
}

async function clearDeliveryState(tenantId: string): Promise<void> {
  await prisma.deliveryRateDistanceTier.deleteMany({ where: { tenantId } });
  await prisma.deliveryRateRule.deleteMany({ where: { tenantId } });
  await prisma.deliveryCoverageConfig.deleteMany({ where: { tenantId } });
}

async function forceStoreOpen(tenantId: string): Promise<void> {
  await prisma.tenantOperatingHours.deleteMany({ where: { tenantId } });
  await prisma.tenantOperatingHours.createMany({
    data: Array.from({ length: 7 }, (_, dayOfWeek) => ({
      tenantId,
      dayOfWeek,
      isOpen: true,
      openTime: '00:00',
      closeTime: '23:59',
    })),
  });

  await prisma.tenantSettings.update({
    where: { tenantId },
    data: {
      isStorePaused: false,
      storePauseReason: null,
    },
  });
}

async function restoreState(snapshot: SnapshotState): Promise<void> {
  const tenantId = snapshot.settings?.tenantId ?? snapshot.coverage?.tenantId ?? snapshot.rules[0]?.tenantId;
  if (!tenantId) return;

  await clearDeliveryState(tenantId);

  if (snapshot.coverage) {
    await prisma.deliveryCoverageConfig.create({
      data: {
        id: snapshot.coverage.id,
        tenantId: snapshot.coverage.tenantId,
        storeLat: snapshot.coverage.storeLat,
        storeLng: snapshot.coverage.storeLng,
        maxRadiusKm: snapshot.coverage.maxRadiusKm,
        defaultPricePerKm: snapshot.coverage.defaultPricePerKm,
        minimumFee: snapshot.coverage.minimumFee,
        maximumFee: snapshot.coverage.maximumFee,
        isDeliveryEnabled: snapshot.coverage.isDeliveryEnabled,
        defaultEstimatedDeliveryMinutes: snapshot.coverage.defaultEstimatedDeliveryMinutes,
        createdAt: snapshot.coverage.createdAt,
        updatedAt: snapshot.coverage.updatedAt,
      },
    });
  }

  for (const rule of snapshot.rules) {
    await prisma.deliveryRateRule.create({
      data: {
        id: rule.id,
        tenantId: rule.tenantId,
        name: rule.name,
        type: rule.type,
        neighborhood: rule.neighborhood,
        geoJson: rule.geoJson as object | null,
        polygonCoordinates: rule.polygonCoordinates as object | null,
        rate: rule.rate,
        fixedRate: rule.fixedRate,
        fixedFee: rule.fixedFee,
        ratePerKm: rule.ratePerKm,
        pricePerKm: rule.pricePerKm,
        minDistanceKm: rule.minDistanceKm,
        maxDistanceKm: rule.maxDistanceKm,
        isActive: rule.isActive,
        priority: rule.priority,
        isFallback: rule.isFallback,
        zoneKind: rule.zoneKind,
        pricingMode: rule.pricingMode,
        blocksDelivery: rule.blocksDelivery,
        color: rule.color,
        estimatedDeliveryMinutes: rule.estimatedDeliveryMinutes,
        createdAt: rule.createdAt,
        updatedAt: rule.updatedAt,
      },
    });

    if (rule.distanceTiers.length > 0) {
      await prisma.deliveryRateDistanceTier.createMany({
        data: rule.distanceTiers.map((tier) => ({
          id: tier.id,
          tenantId: tier.tenantId,
          deliveryRateRuleId: tier.deliveryRateRuleId,
          minDistanceKm: tier.minDistanceKm,
          maxDistanceKm: tier.maxDistanceKm,
          fee: tier.fee,
          estimatedDeliveryMinutes: tier.estimatedDeliveryMinutes,
          sortOrder: tier.sortOrder,
          createdAt: tier.createdAt,
          updatedAt: tier.updatedAt,
        })),
      });
    }
  }

  await prisma.tenantOperatingHours.deleteMany({ where: { tenantId } });
  if (snapshot.operatingHours.length > 0) {
    await prisma.tenantOperatingHours.createMany({
      data: snapshot.operatingHours.map((entry) => ({
        id: entry.id,
        tenantId: entry.tenantId,
        dayOfWeek: entry.dayOfWeek,
        isOpen: entry.isOpen,
        openTime: entry.openTime,
        closeTime: entry.closeTime,
        createdAt: entry.createdAt,
      })),
    });
  }

  if (snapshot.settings) {
    await prisma.tenantSettings.update({
      where: { tenantId: snapshot.settings.tenantId },
      data: {
        lat: snapshot.settings.lat,
        lng: snapshot.settings.lng,
        isStorePaused: snapshot.settings.isStorePaused,
        storePauseReason: snapshot.settings.storePauseReason,
      },
    });
  }

  await prisma.customerAddress.deleteMany({
    where: {
      tenantId,
      label: { startsWith: 'Final Check' },
    },
  });
}

async function ensureCoverageScenario(token: string, storeCoords: { lat: number; lng: number }): Promise<{
  tierResolved: DeliveryTestCurrentResult;
  specialResolved: DeliveryTestCurrentResult;
}> {
  await saveCoverage(token, storeCoords);
  await saveGlobalDistanceRule(token);

  const tierResolved = await testCurrent(token, DESKTOP_TEST_QUERY);
  if (!tierResolved.resolvedCoordinates) {
    throw new Error(`Endereco base sem coordenadas: ${DESKTOP_TEST_QUERY}`);
  }

  const specialResolved = await testCurrent(token, MOBILE_TEST_QUERY);
  if (!specialResolved.resolvedCoordinates) {
    throw new Error(`Endereco especial sem coordenadas: ${MOBILE_TEST_QUERY}`);
  }

  await createPolygonRule(token, {
    name: SPECIAL_AREA_NAME,
    zoneKind: 'custom_zone',
    pricingMode: 'fixed',
    fixedFee: 15,
    estimatedDeliveryMinutes: 70,
    polygonCoordinates: squarePolygon(specialResolved.resolvedCoordinates),
    priority: 1,
  });

  await createPolygonRule(token, {
    name: BLOCKED_AREA_NAME,
    zoneKind: 'blocked_zone',
    pricingMode: 'fixed',
    polygonCoordinates: squarePolygon({
      lat: specialResolved.resolvedCoordinates.lat + 0.02,
      lng: specialResolved.resolvedCoordinates.lng + 0.02,
    }),
    priority: 0,
    blocksDelivery: true,
  });

  return { tierResolved, specialResolved };
}

async function createTenantContext(token: string): Promise<BrowserContext> {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 960 },
  });

  await context.addInitScript((value) => {
    window.localStorage.setItem('accessToken', value);
    window.localStorage.setItem('refreshToken', value);
  }, token);

  (context as BrowserContext & { __browser?: Browser }).__browser = browser;
  return context;
}

async function createStorefrontContext(product: { id: string; name: string; basePrice: number }): Promise<BrowserContext> {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
  });

  await context.addInitScript(({ product, tenantSlug }) => {
    const cartState = {
      state: {
        tenantId: null,
        tenantSlug,
        tableId: null,
        subtotal: product.basePrice,
        items: [
          {
            cartLineId: 'final-check-line-1',
            productId: product.id,
            quantity: 1,
            snapshot: {
              productName: product.name,
              basePrice: product.basePrice,
              lineSubtotal: product.basePrice,
              items: [],
            },
          },
        ],
      },
      version: 0,
    };
    window.localStorage.setItem('gestor_cart_temp', JSON.stringify(cartState));
  }, { product, tenantSlug: TENANT_SLUG });

  (context as BrowserContext & { __browser?: Browser }).__browser = browser;
  return context;
}

async function createCustomerSession(
  tenantId: string,
  address: {
    street: string;
    number: string;
    neighborhood: string;
    city: string;
    state: string;
    zipCode: string;
    lat: number;
    lng: number;
  },
): Promise<{
  token: string;
  customer: {
    id: string;
    tenantId: string;
    name: string;
    phone: string;
    email: string | null;
    totalOrders: number;
    totalSpent: number;
    loyaltyPoints: number;
    cashbackBalance: number;
    createdAt: string;
    updatedAt: string;
  };
}> {
  const phone = '11988887777';
  const customer = await prisma.customer.upsert({
    where: {
      tenantId_phone: {
        tenantId,
        phone,
      },
    },
    update: {
      name: 'Cliente Final Check',
      email: 'final-check@example.com',
    },
    create: {
      tenantId,
      name: 'Cliente Final Check',
      phone,
      email: 'final-check@example.com',
    },
  });

  await prisma.customerAddress.deleteMany({
    where: {
      tenantId,
      customerId: customer.id,
      label: { startsWith: 'Final Check' },
    },
  });

  await prisma.customerAddress.create({
    data: {
      tenantId,
      customerId: customer.id,
      label: 'Final Check Principal',
      street: address.street,
      number: address.number,
      neighborhood: address.neighborhood,
      city: address.city,
      state: address.state,
      zipCode: address.zipCode,
      lat: address.lat,
      lng: address.lng,
      isDefault: true,
    },
  });

  const jwtService = new JwtService({ secret: process.env.JWT_SECRET ?? 'dev-secret' });
  const token = jwtService.sign(
    {
      sub: customer.id,
      tenantId,
      type: 'customer',
      phone: customer.phone,
      name: customer.name,
    },
    { expiresIn: '30d' },
  );

  return {
    token,
    customer: {
      id: customer.id,
      tenantId: customer.tenantId,
      name: customer.name,
      phone: customer.phone,
      email: customer.email,
      totalOrders: Number(customer.totalOrders ?? 0),
      totalSpent: Number(customer.totalSpent ?? 0),
      loyaltyPoints: Number(customer.loyaltyPoints ?? 0),
      cashbackBalance: Number(customer.cashbackBalance ?? 0),
      createdAt: customer.createdAt.toISOString(),
      updatedAt: customer.updatedAt.toISOString(),
    },
  };
}

async function closeContext(context: BrowserContext): Promise<void> {
  const browser = (context as BrowserContext & { __browser?: Browser }).__browser;
  await context.close();
  await browser?.close();
}

async function saveScreenshot(page: Page, fileName: string): Promise<void> {
  const dir = path.resolve(process.cwd(), 'qa-artifacts', 'delivery-final-check');
  await mkdir(dir, { recursive: true });
  await page.screenshot({ path: path.join(dir, fileName), fullPage: true });
}

async function fillFirstVisibleInput(page: Page, labelText: string, value: string): Promise<void> {
  const target = page.locator('label').filter({ hasText: labelText }).locator('input').first();
  await target.click();
  await target.fill(value);
}

async function runDesktopValidation(token: string): Promise<void> {
  const context = await createTenantContext(token);
  const page = await context.newPage();

  try {
    await page.goto(`${TENANT_URL}/delivery/rates`, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await page.getByText('Forma de cálculo').first().waitFor({ timeout: 20000 });
    await page.locator('.leaflet-container').first().waitFor({ timeout: 20000 });
    await page.waitForTimeout(1200);

    pushResult('desktop /delivery/rates abre', (await page.url()).includes('/delivery/rates'), `url=${page.url()}`);
    pushResult('desktop mapa aparece', (await page.locator('.leaflet-container').count()) > 0);
    pushResult('desktop painel lateral aparece', await page.getByText('Forma de cálculo').first().isVisible());
    pushResult('desktop círculos de raio aparecem', (await page.locator('.leaflet-overlay-pane path').count()) >= 3, `paths=${await page.locator('.leaflet-overlay-pane path').count()}`);
    pushResult('desktop áreas especiais aparecem', (await page.getByText(SPECIAL_AREA_NAME).count()) > 0);

    await page.getByRole('button', { name: /Editar/i }).first().click();
    await fillFirstVisibleInput(page, 'Tempo estimado (min)', '31');
    await page.getByRole('button', { name: 'Salvar raio' }).click();
    await page.getByRole('button', { name: /Salvar configurações/i }).click();
    await page.getByText('Configurações salvas').waitFor({ timeout: 15000 });
    pushResult('desktop editar faixa funciona', true);
    pushResult('desktop botão salvar funciona', true);

    const rulesAfterSave = await listRules(token);
    const distanceRule = rulesAfterSave.find((rule) => rule.type === 'distance');
    pushResult(
      'desktop persistiu edição da faixa',
      distanceRule?.distanceTiers[0]?.estimatedDeliveryMinutes === 31,
      `minutes=${distanceRule?.distanceTiers[0]?.estimatedDeliveryMinutes ?? 'null'}`,
    );

    const testInput = page.getByPlaceholder('Rua, número, bairro ou CEP');
    await testInput.fill(DESKTOP_TEST_QUERY);
    await page.getByRole('button', { name: 'Testar' }).click();
    await page.getByText('Entrega disponível').waitFor({ timeout: 20000 });
    pushResult('desktop teste de entrega funciona', await page.getByText('Tempo estimado:').isVisible());

    await saveScreenshot(page, 'tenant-desktop-delivery-rates.png');
  } finally {
    await closeContext(context);
  }
}

async function runMobileValidation(token: string): Promise<void> {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
  });
  await context.addInitScript((value) => {
    window.localStorage.setItem('accessToken', value);
    window.localStorage.setItem('refreshToken', value);
  }, token);

  const page = await context.newPage();

  try {
    await page.goto(`${TENANT_URL}/delivery/rates`, { waitUntil: 'domcontentloaded', timeout: 90000 });

    pushResult('mobile mapa não aparece', (await page.locator('.leaflet-container').count()) === 0);
    const mobileCardShellCount = await page.evaluate(() => document.querySelectorAll('.rounded-3xl').length);
    pushResult('mobile cards aparecem', mobileCardShellCount >= 4, `count=${mobileCardShellCount}`);

    await page.getByRole('button', { name: /Editar/i }).first().click();
    await fillFirstVisibleInput(page, 'Tempo estimado (min)', '46');
    await page.getByRole('button', { name: 'Salvar raio' }).click();
    await page.getByRole('button', { name: /Salvar configurações/i }).click();
    await page.getByText('Configurações salvas').waitFor({ timeout: 15000 });
    pushResult('mobile permite editar faixas', true);

    pushResult('mobile áreas especiais aparecem como resumo', await page.getByText(SPECIAL_AREA_NAME).isVisible());
    pushResult(
      'mobile aviso de usar computador para mapa aparece',
      await page.getByText('Para desenhar ou editar áreas no mapa, recomendamos usar um computador.').isVisible(),
    );

    const testInput = page.getByPlaceholder('Rua, número, bairro ou CEP');
    await testInput.fill(MOBILE_TEST_QUERY);
    await page.getByRole('button', { name: 'Testar' }).click();
    await page.getByText('Entrega disponível').waitFor({ timeout: 20000 });
    pushResult('mobile teste de entrega funciona', await page.getByText('Taxa:').isVisible());

    const hasHorizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 4);
    pushResult('mobile layout não quebra', !hasHorizontalOverflow, `overflow=${String(hasHorizontalOverflow)}`);

    await saveScreenshot(page, 'tenant-mobile-delivery-rates.png');
  } finally {
    await context.close();
    await browser.close();
  }
}

async function runStorefrontValidation(
  product: { id: string; name: string; basePrice: number },
  customerSession: {
    token: string;
    customer: {
      id: string;
      tenantId: string;
      name: string;
      phone: string;
      email: string | null;
      totalOrders: number;
      totalSpent: number;
      loyaltyPoints: number;
      cashbackBalance: number;
      createdAt: string;
      updatedAt: string;
    };
  },
  address: {
  street: string;
  number: string;
  neighborhood: string;
  city: string;
  state: string;
  zipCode: string;
  lat: number;
  lng: number;
},
  expectedFee: number,
  expectedMinutes: number,
): Promise<void> {
  const context = await createStorefrontContext(product);
  await context.addInitScript((session) => {
    window.localStorage.setItem('customer-storage', JSON.stringify({
      state: {
        customer: session.customer,
        accessToken: session.token,
        tenantSlug: session.tenantSlug,
        isLoggedIn: true,
      },
      version: 0,
    }));
  }, {
    customer: customerSession.customer,
    token: customerSession.token,
    tenantSlug: TENANT_SLUG,
  });

  const page = await context.newPage();

  try {
    await page.goto(`${STOREFRONT_URL}/${TENANT_SLUG}/checkout`, { waitUntil: 'domcontentloaded', timeout: 90000 });

    await page.getByText('Usar este endereço salvo').click();
    await page.getByPlaceholder('Seu nome completo').fill('Cliente Final Check');
    await page.getByPlaceholder('Seu WhatsApp (apenas números)').fill('11988887777');
    await page.waitForTimeout(1800);
    await page.waitForFunction(() => document.body.innerText.includes('Entrega estimada'), undefined, { timeout: 30000 });

    pushResult('storefront tempo estimado aparece', await page.getByText('Entrega estimada').isVisible());
    const deliveryLine = page.locator('div').filter({ hasText: 'Taxa de entrega' }).first();
    pushResult('storefront fee confere', await deliveryLine.getByText(/5,00|R\$\s?5,00/).isVisible(), `expected=${expectedFee}`);
    pushResult('storefront minutos conferem', await page.getByText(`${expectedMinutes} min`).isVisible());

    await saveScreenshot(page, 'storefront-mobile-checkout.png');
  } finally {
    await closeContext(context);
  }
}

async function main(): Promise<void> {
  const token = await login();
  const tenantId = await resolveTenantIdBySlug();
  const snapshot = await snapshotState(tenantId);

  try {
    await forceStoreOpen(tenantId);
    await clearDeliveryState(tenantId);

    const scenario = await ensureCoverageScenario(token, STORE_COORDS);
    const beforeShiftValidation = await validateCheckout(await getStorefrontProduct().then((p) => p.id), {
      street: 'Praca da Republica',
      number: '1',
      neighborhood: 'Republica',
      city: 'Sao Paulo',
      state: 'SP',
      zipCode: '01045-001',
      lat: scenario.tierResolved.resolvedCoordinates!.lat,
      lng: scenario.tierResolved.resolvedCoordinates!.lng,
    });
    pushResult('baseline checkout minutes = 30', beforeShiftValidation.estimatedDeliveryMinutes === 30, `minutes=${beforeShiftValidation.estimatedDeliveryMinutes ?? 'null'}`);

    await saveCoverage(token, SHIFTED_STORE_COORDS);
    const shiftedTenant = await getTenantMe(token);
    pushResult(
      'origem efetiva sincronizada em tenant settings',
      shiftedTenant.settings?.lat === SHIFTED_STORE_COORDS.lat && shiftedTenant.settings?.lng === SHIFTED_STORE_COORDS.lng,
      `lat=${shiftedTenant.settings?.lat ?? 'null'} lng=${shiftedTenant.settings?.lng ?? 'null'}`,
    );

    const shiftedCoverage = await apiRequest<CoverageResponse>('/delivery/coverage', { method: 'GET' }, token);
    pushResult(
      'coverage persiste origem alterada',
      shiftedCoverage.data?.storeLat === SHIFTED_STORE_COORDS.lat && shiftedCoverage.data?.storeLng === SHIFTED_STORE_COORDS.lng,
      `lat=${shiftedCoverage.data?.storeLat ?? 'null'} lng=${shiftedCoverage.data?.storeLng ?? 'null'}`,
    );

    await clearDeliveryState(tenantId);
    const preparedScenario = await ensureCoverageScenario(token, SHIFTED_STORE_COORDS);
    const product = await getStorefrontProduct();
    const checkoutAddress = {
      street: 'Praca da Republica',
      number: '1',
      neighborhood: 'Republica',
      city: 'Sao Paulo',
      state: 'SP',
      zipCode: '01045-001',
      lat: preparedScenario.tierResolved.resolvedCoordinates!.lat,
      lng: preparedScenario.tierResolved.resolvedCoordinates!.lng,
    };
    const checkoutValidation = await validateCheckout(product.id, checkoutAddress);
    pushResult('test-current vs checkout minutos iguais', checkoutValidation.estimatedDeliveryMinutes === 30, `minutes=${checkoutValidation.estimatedDeliveryMinutes ?? 'null'}`);
    pushResult('test-current vs checkout taxa igual', checkoutValidation.deliveryFee === 5, `fee=${checkoutValidation.deliveryFee}`);
    const customerSession = await createCustomerSession(tenantId, checkoutAddress);

    await runDesktopValidation(token);
    await runMobileValidation(token);
    const latestRules = await listRules(token);
    const latestDistanceRule = latestRules.find((rule) => rule.type === 'distance');
    const storefrontExpectedMinutes = latestDistanceRule?.distanceTiers[0]?.estimatedDeliveryMinutes ?? 30;
    await runStorefrontValidation(product, customerSession, checkoutAddress, 5, storefrontExpectedMinutes);
  } finally {
    await restoreState(snapshot);
    await prisma.$disconnect();
  }

  const failed = results.filter((result) => !result.passed);
  process.stdout.write(`\nDelivery Final Check: ${results.length - failed.length} OK, ${failed.length} falha(s)\n`);
  if (failed.length > 0) {
    for (const failure of failed) {
      process.stdout.write(`- ${failure.name}${failure.detail ? ` :: ${failure.detail}` : ''}\n`);
    }
    process.exitCode = 1;
  }
}

main().catch(async (error: unknown) => {
  process.stderr.write(`Delivery final check crashed: ${error instanceof Error ? error.message : String(error)}\n`);
  await prisma.$disconnect();
  process.exitCode = 1;
});
