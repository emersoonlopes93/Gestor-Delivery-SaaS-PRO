import * as bcrypt from 'bcryptjs';
import { PrismaClient, type DeliveryCoverageConfig, type DeliveryRateRule, type DeliveryRateDistanceTier } from '@prisma/client';

const API_BASE = process.env.SMOKE_API_BASE_URL ?? 'http://localhost:3333/api/v1';
const TENANT_SLUG = process.env.SMOKE_TENANT_SLUG ?? 'pizzaria-demo';
const TENANT_EMAIL = process.env.SMOKE_TENANT_EMAIL ?? '';
const TENANT_PASSWORD = process.env.SMOKE_TENANT_PASSWORD ?? 'Owner@123';

const STORE_COORDS = {
  lat: -23.5503099,
  lng: -46.6339591,
};

const CANDIDATES = {
  tier1: [
    'Praca da Republica, Sao Paulo, SP',
    'Pateo do Collegio, Sao Paulo, SP',
    'Estacao Liberdade, Sao Paulo, SP',
  ],
  tier2: [
    'Avenida Paulista, 1578, Sao Paulo, SP',
    'Parque da Aclimacao, Sao Paulo, SP',
    'Museu do Ipiranga, Sao Paulo, SP',
  ],
  tier3: [
    'Shopping Ibirapuera, Sao Paulo, SP',
    'Allianz Parque, Sao Paulo, SP',
    'Expo Center Norte, Sao Paulo, SP',
  ],
  blocked: [
    'Praca Roosevelt, Sao Paulo, SP',
    'Largo do Arouche, Sao Paulo, SP',
  ],
  special: [
    'MASP, Sao Paulo, SP',
    'Japan House Sao Paulo, Sao Paulo, SP',
  ],
  outOfCoverage: [
    'Aeroporto Internacional de Guarulhos, Guarulhos, SP',
    'Santos, SP',
  ],
} as const;

type JsonRecord = Record<string, unknown>;

interface ApiErrorPayload {
  message?: string;
}

interface ApiEnvelope<T> {
  success?: boolean;
  data?: T;
  error?: ApiErrorPayload;
  message?: string;
}

interface LoginResponse {
  accessToken: string;
}

interface TenantMeResponse {
  tenantId: string;
}

interface PublicStorefrontProduct {
  id: string;
}

interface PublicStorefrontCategory {
  products: PublicStorefrontProduct[];
}

interface PublicStorefrontResponse {
  categories: PublicStorefrontCategory[];
}

interface DeliveryTestCurrentResult {
  available: boolean;
  distanceKm: number | null;
  fee: number;
  estimatedDeliveryMinutes: number | null;
  appliedRule: string;
  reason?: string;
  matchedZoneId: string | null;
  matchedStrategy: string;
  resolvedCoordinates?: { lat: number; lng: number };
}

interface CheckoutValidationResult {
  tenantId: string;
  deliveryFee: number;
  total: number;
}

interface OrderResponse {
  id: string;
  orderNumber: string;
  deliveryFee: number;
  total: number;
}

interface CoverageConfigResponse {
  tenantId: string;
  defaultEstimatedDeliveryMinutes: number | null;
}

interface DistanceTierResponse {
  id: string;
  minDistanceKm: number;
  maxDistanceKm: number;
  fee: number;
  estimatedDeliveryMinutes: number | null;
  sortOrder: number;
}

interface DeliveryRuleResponse {
  id: string;
  type: string;
  name: string | null;
  zoneKind: string | null;
  pricingMode: string | null;
  fixedFee: number | null;
  estimatedDeliveryMinutes: number | null;
  distanceTiers: DistanceTierResponse[];
}

type SnapshotRule = DeliveryRateRule & { distanceTiers: DeliveryRateDistanceTier[] };

interface SnapshotState {
  coverage: DeliveryCoverageConfig | null;
  rules: SnapshotRule[];
}

interface AuthSnapshot {
  userId: string;
  email: string;
  passwordHash: string;
}

interface TenantSettingsSnapshot {
  tenantId: string;
  lat: number | null;
  lng: number | null;
  isStorePaused: boolean;
  storePauseReason: string | null;
}

interface OperatingHoursSnapshot {
  id: string;
  tenantId: string;
  dayOfWeek: number;
  isOpen: boolean;
  openTime: string | null;
  closeTime: string | null;
  createdAt: Date;
}

interface ApiResult<T> {
  status: number;
  data: T | null;
  raw: unknown;
  text: string;
}

interface AssertionResult {
  name: string;
  passed: boolean;
  detail: string;
}

const prisma = new PrismaClient();
const assertions: AssertionResult[] = [];

function pushAssertion(name: string, passed: boolean, detail: string): void {
  assertions.push({ name, passed, detail });
  process.stdout.write(`${passed ? 'OK ' : 'ERR'} ${name}${detail ? ` - ${detail}` : ''}\n`);
  if (!passed) {
    process.exitCode = 1;
  }
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null;
}

function getMessage(value: unknown): string {
  if (!isRecord(value)) return '';
  const direct = value.message;
  if (typeof direct === 'string') return direct;
  const error = value.error;
  if (isRecord(error) && typeof error.message === 'string') return error.message;
  return '';
}

async function apiRequest<T>(path: string, init: RequestInit, token?: string): Promise<ApiResult<T>> {
  const headers = new Headers(init.headers);
  headers.set('Content-Type', 'application/json');
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers,
  });

  const text = await response.text();
  let raw: unknown = null;
  if (text.trim()) {
    try {
      raw = JSON.parse(text) as unknown;
    } catch {
      raw = text;
    }
  }

  let data: T | null = null;
  if (isRecord(raw) && 'data' in raw) {
    data = (raw as ApiEnvelope<T>).data ?? null;
  } else if (raw != null && typeof raw !== 'string') {
    data = raw as T;
  }

  return {
    status: response.status,
    data,
    raw,
    text,
  };
}

async function login(email: string, password: string): Promise<string> {
  const result = await apiRequest<LoginResponse>(
    '/auth/tenant/login',
    {
      method: 'POST',
      body: JSON.stringify({
        email,
        password,
        tenantSlug: TENANT_SLUG,
      }),
    },
  );

  if ((result.status !== 200 && result.status !== 201) || !result.data?.accessToken) {
    throw new Error(`Falha no login do tenant. Status=${result.status} msg=${getMessage(result.raw)}`);
  }

  return result.data.accessToken;
}

async function ensureTenantAuth(): Promise<{ email: string; password: string; snapshot: AuthSnapshot }> {
  const tenant = await prisma.tenant.findUnique({
    where: { slug: TENANT_SLUG },
    select: { id: true },
  });

  if (!tenant) {
    throw new Error(`Tenant ${TENANT_SLUG} nao encontrado.`);
  }

  const user = await prisma.tenantUser.findFirst({
    where: {
      tenantId: tenant.id,
      isActive: true,
    },
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      email: true,
      passwordHash: true,
    },
  });

  if (!user) {
    throw new Error(`Nenhum usuario ativo encontrado para o tenant ${TENANT_SLUG}.`);
  }

  const snapshot: AuthSnapshot = {
    userId: user.id,
    email: user.email,
    passwordHash: user.passwordHash,
  };

  const hashed = await bcrypt.hash(TENANT_PASSWORD, 10);
  await prisma.tenantUser.update({
    where: { id: user.id },
    data: { passwordHash: hashed },
  });

  return {
    email: TENANT_EMAIL || user.email,
    password: TENANT_PASSWORD,
    snapshot,
  };
}

async function restoreTenantAuth(snapshot: AuthSnapshot | null): Promise<void> {
  if (!snapshot) return;

  await prisma.tenantUser.update({
    where: { id: snapshot.userId },
    data: { passwordHash: snapshot.passwordHash },
  });
}

async function resolveTenantId(token: string): Promise<string> {
  const result = await apiRequest<TenantMeResponse>('/auth/tenant/me', { method: 'GET' }, token);
  if (result.status !== 200 || !result.data?.tenantId) {
    throw new Error(`Falha ao obter tenantId. Status=${result.status} msg=${getMessage(result.raw)}`);
  }
  return result.data.tenantId;
}

async function getStorefrontProductId(): Promise<string> {
  const result = await apiRequest<PublicStorefrontResponse>(`/public/storefront/${TENANT_SLUG}`, { method: 'GET' });
  const productId = result.data?.categories.flatMap((category) => category.products).find((product) => product.id)?.id;
  if (result.status !== 200 || !productId) {
    throw new Error(`Falha ao obter produto do storefront. Status=${result.status}`);
  }
  return productId;
}

async function snapshotState(tenantId: string): Promise<SnapshotState> {
  const [coverage, rules] = await Promise.all([
    prisma.deliveryCoverageConfig.findUnique({
      where: { tenantId },
    }),
    prisma.deliveryRateRule.findMany({
      where: { tenantId },
      include: {
        distanceTiers: {
          orderBy: { sortOrder: 'asc' },
        },
      },
      orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }],
    }),
  ]);

  return { coverage, rules };
}

async function snapshotTenantSettings(tenantId: string): Promise<TenantSettingsSnapshot | null> {
  const settings = await prisma.tenantSettings.findUnique({
    where: { tenantId },
    select: {
      tenantId: true,
      lat: true,
      lng: true,
      isStorePaused: true,
      storePauseReason: true,
    },
  });

  return settings ?? null;
}

async function setTenantSettingsOrigin(tenantId: string): Promise<void> {
  await prisma.tenantSettings.update({
    where: { tenantId },
    data: {
      lat: STORE_COORDS.lat,
      lng: STORE_COORDS.lng,
      isStorePaused: false,
      storePauseReason: null,
    },
  });
}

async function restoreTenantSettings(snapshot: TenantSettingsSnapshot | null): Promise<void> {
  if (!snapshot) return;

  await prisma.tenantSettings.update({
    where: { tenantId: snapshot.tenantId },
    data: {
      lat: snapshot.lat,
      lng: snapshot.lng,
      isStorePaused: snapshot.isStorePaused,
      storePauseReason: snapshot.storePauseReason,
    },
  });
}

async function snapshotOperatingHours(tenantId: string): Promise<OperatingHoursSnapshot[]> {
  return prisma.tenantOperatingHours.findMany({
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
  });
}

async function forceStoreOpen(tenantId: string): Promise<void> {
  await prisma.tenantOperatingHours.deleteMany({
    where: { tenantId },
  });

  await prisma.tenantOperatingHours.createMany({
    data: Array.from({ length: 7 }, (_, dayOfWeek) => ({
      tenantId,
      dayOfWeek,
      isOpen: true,
      openTime: '00:00',
      closeTime: '23:59',
    })),
  });
}

async function restoreOperatingHours(
  tenantId: string,
  snapshot: OperatingHoursSnapshot[],
): Promise<void> {
  await prisma.tenantOperatingHours.deleteMany({
    where: { tenantId },
  });

  if (snapshot.length === 0) return;

  await prisma.tenantOperatingHours.createMany({
    data: snapshot.map((entry) => ({
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

async function clearDeliveryState(tenantId: string): Promise<void> {
  await prisma.deliveryRateDistanceTier.deleteMany({ where: { tenantId } });
  await prisma.deliveryRateRule.deleteMany({ where: { tenantId } });
  await prisma.deliveryCoverageConfig.deleteMany({ where: { tenantId } });
}

async function restoreState(snapshot: SnapshotState): Promise<void> {
  const tenantId = snapshot.coverage?.tenantId ?? snapshot.rules[0]?.tenantId;
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
        defaultEstimatedDeliveryMinutes: snapshot.coverage.defaultEstimatedDeliveryMinutes,
        isDeliveryEnabled: snapshot.coverage.isDeliveryEnabled,
        createdAt: snapshot.coverage.createdAt,
      },
    });
  }

  for (const rule of snapshot.rules) {
    await prisma.deliveryRateRule.create({
      data: {
        id: rule.id,
        tenantId: rule.tenantId,
        type: rule.type,
        isActive: rule.isActive,
        neighborhood: rule.neighborhood,
        rate: rule.rate,
        minKm: rule.minKm,
        maxKm: rule.maxKm,
        ratePerKm: rule.ratePerKm,
        fixedRate: rule.fixedRate,
        geoJson: rule.geoJson,
        isFallback: rule.isFallback,
        maxDistanceKm: rule.maxDistanceKm,
        minDistanceKm: rule.minDistanceKm,
        polygonCoordinates: rule.polygonCoordinates,
        priority: rule.priority,
        blocksDelivery: rule.blocksDelivery,
        color: rule.color,
        fixedFee: rule.fixedFee,
        name: rule.name,
        pricePerKm: rule.pricePerKm,
        pricingMode: rule.pricingMode,
        zoneKind: rule.zoneKind,
        estimatedDeliveryMinutes: rule.estimatedDeliveryMinutes,
        createdAt: rule.createdAt,
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
          isActive: tier.isActive,
          createdAt: tier.createdAt,
        })),
      });
    }
  }
}

function squarePolygon(center: { lat: number; lng: number }, delta = 0.003): Array<[number, number]> {
  return [
    [center.lng - delta, center.lat - delta],
    [center.lng + delta, center.lat - delta],
    [center.lng + delta, center.lat + delta],
    [center.lng - delta, center.lat + delta],
  ];
}

function buildAddress(query: string, coords: { lat: number; lng: number }) {
  return {
    street: query,
    number: '1',
    neighborhood: 'Centro',
    city: 'Sao Paulo',
    state: 'SP',
    zipCode: '01001000',
    lat: coords.lat,
    lng: coords.lng,
  };
}

async function saveCoverage(token: string): Promise<void> {
  const result = await apiRequest<CoverageConfigResponse>(
    '/delivery/coverage',
    {
      method: 'PUT',
      body: JSON.stringify({
        storeLat: STORE_COORDS.lat,
        storeLng: STORE_COORDS.lng,
        maxRadiusKm: 8,
        defaultPricePerKm: 2,
        minimumFee: 5,
        maximumFee: 30,
        defaultEstimatedDeliveryMinutes: 40,
        isDeliveryEnabled: true,
      }),
    },
    token,
  );

  pushAssertion('coverage save', result.status === 200, `status=${result.status}`);
}

async function saveGlobalDistanceRule(token: string): Promise<void> {
  const result = await apiRequest<DeliveryRuleResponse>(
    '/delivery/rates',
    {
      method: 'POST',
      body: JSON.stringify({
        type: 'distance',
        name: 'Faixas por raio',
        pricingMode: 'tiers',
        isActive: true,
        priority: 100,
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

  pushAssertion('distance tiers save', result.status === 201 || result.status === 200, `status=${result.status}`);
}

async function listRules(token: string): Promise<DeliveryRuleResponse[]> {
  const result = await apiRequest<DeliveryRuleResponse[]>('/delivery/rates', { method: 'GET' }, token);
  if (result.status !== 200 || !result.data) {
    throw new Error(`Falha ao listar regras. Status=${result.status}`);
  }
  return result.data;
}

async function testCurrent(token: string, query: string): Promise<ApiResult<DeliveryTestCurrentResult>> {
  return apiRequest<DeliveryTestCurrentResult>(
    '/delivery/rates/test-current',
    {
      method: 'POST',
      body: JSON.stringify({ query }),
    },
    token,
  );
}

async function validateCheckout(
  productId: string,
  address: ReturnType<typeof buildAddress>,
): Promise<ApiResult<CheckoutValidationResult>> {
  return apiRequest<CheckoutValidationResult>(
    `/orders/public-checkout/${TENANT_SLUG}/validate`,
    {
      method: 'POST',
      body: JSON.stringify({
        idempotencyKey: `validate-${Date.now()}-${Math.random().toString(16).slice(2)}`,
        customerName: 'Teste Delivery',
        customerPhone: '11999990000',
        fulfillmentType: 'delivery',
        items: [{ lineType: 'product', productId, quantity: 1 }],
        payment: { method: 'cash', changeFor: 9999 },
        deliveryAddress: address,
      }),
    },
  );
}

async function createOrder(
  productId: string,
  address: ReturnType<typeof buildAddress>,
  suffix: string,
): Promise<ApiResult<OrderResponse>> {
  return apiRequest<OrderResponse>(
    `/orders/public-checkout/${TENANT_SLUG}`,
    {
      method: 'POST',
      body: JSON.stringify({
        idempotencyKey: `order-${suffix}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
        customerName: 'Teste Delivery',
        customerPhone: `11999${Math.floor(Math.random() * 90000 + 10000)}`,
        fulfillmentType: 'delivery',
        items: [{ lineType: 'product', productId, quantity: 1 }],
        payment: { method: 'cash', changeFor: 9999 },
        deliveryAddress: address,
      }),
    },
  );
}

async function findCandidateForRange(
  token: string,
  candidates: readonly string[],
  minInclusive: number,
  maxInclusive: number,
): Promise<{ query: string; result: DeliveryTestCurrentResult }> {
  for (const query of candidates) {
    const tested = await testCurrent(token, query);
    const distance = tested.data?.distanceKm;
    if (
      tested.status === 200 &&
      tested.data &&
      typeof distance === 'number' &&
      distance >= minInclusive &&
      distance <= maxInclusive
    ) {
      return { query, result: tested.data };
    }
  }

  throw new Error(`Nao encontrei endereco para faixa ${minInclusive}-${maxInclusive} km.`);
}

async function findFirstResolved(
  token: string,
  candidates: readonly string[],
): Promise<{ query: string; result: DeliveryTestCurrentResult }> {
  for (const query of candidates) {
    const tested = await testCurrent(token, query);
    if (tested.status === 200 && tested.data?.resolvedCoordinates) {
      return { query, result: tested.data };
    }
  }

  throw new Error('Nenhum endereco candidato foi geocodificado com sucesso.');
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
  const result = await apiRequest<DeliveryRuleResponse>(
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

  pushAssertion(`create polygon ${body.name}`, result.status === 201 || result.status === 200, `status=${result.status}`);
}

async function validateTierScenario(
  token: string,
  productId: string,
  label: string,
  candidates: readonly string[],
  range: { min: number; max: number; fee: number; minutes: number },
): Promise<void> {
  const match = await findCandidateForRange(token, candidates, range.min, range.max);
  pushAssertion(`${label} test-current available`, match.result.available, `query=${match.query}`);
  pushAssertion(
    `${label} test-current fee`,
    match.result.fee === range.fee,
    `expected=${range.fee} actual=${match.result.fee} distance=${match.result.distanceKm}`,
  );
  pushAssertion(
    `${label} test-current minutes`,
    match.result.estimatedDeliveryMinutes === range.minutes,
    `expected=${range.minutes} actual=${match.result.estimatedDeliveryMinutes ?? 'null'}`,
  );

  const coords = match.result.resolvedCoordinates;
  if (!coords) {
    throw new Error(`Endereco ${match.query} nao retornou coordenadas resolvidas.`);
  }

  const address = buildAddress(match.query, coords);
  const validation = await validateCheckout(productId, address);
  pushAssertion(`${label} checkout validate status`, validation.status === 201 || validation.status === 200, `status=${validation.status}`);
  pushAssertion(
    `${label} checkout fee`,
    validation.data?.deliveryFee === range.fee,
    `expected=${range.fee} actual=${validation.data?.deliveryFee ?? 'null'}`,
  );

  const order = await createOrder(productId, address, label);
  pushAssertion(`${label} order create status`, order.status === 201 || order.status === 200, `status=${order.status}`);
  pushAssertion(
    `${label} order delivery fee`,
    order.data?.deliveryFee === range.fee,
    `expected=${range.fee} actual=${order.data?.deliveryFee ?? 'null'}`,
  );
}

async function run(): Promise<void> {
  let authSnapshot: AuthSnapshot | null = null;

  const auth = await ensureTenantAuth();
  authSnapshot = auth.snapshot;

  const token = await login(auth.email, auth.password);
  const tenantId = await resolveTenantId(token);
  const productId = await getStorefrontProductId();
  const snapshot = await snapshotState(tenantId);
  const tenantSettingsSnapshot = await snapshotTenantSettings(tenantId);
  const operatingHoursSnapshot = await snapshotOperatingHours(tenantId);

  try {
    await setTenantSettingsOrigin(tenantId);
    await forceStoreOpen(tenantId);
    await clearDeliveryState(tenantId);
    await saveCoverage(token);
    await saveGlobalDistanceRule(token);

    const coverageResult = await apiRequest<CoverageConfigResponse>('/delivery/coverage', { method: 'GET' }, token);
    pushAssertion(
      'coverage default estimated minutes persisted',
      coverageResult.status === 200 && coverageResult.data?.defaultEstimatedDeliveryMinutes === 40,
      `value=${coverageResult.data?.defaultEstimatedDeliveryMinutes ?? 'null'}`,
    );

    const savedRules = await listRules(token);
    const globalDistanceRule = savedRules.find((rule) => rule.type === 'distance');
    pushAssertion('distance tiers persisted count', globalDistanceRule?.distanceTiers.length === 3, `count=${globalDistanceRule?.distanceTiers.length ?? 0}`);
    pushAssertion(
      'distance tiers persisted minutes',
      JSON.stringify(globalDistanceRule?.distanceTiers.map((tier) => tier.estimatedDeliveryMinutes) ?? []) === JSON.stringify([30, 45, 60]),
      `minutes=${JSON.stringify(globalDistanceRule?.distanceTiers.map((tier) => tier.estimatedDeliveryMinutes) ?? [])}`,
    );

    await validateTierScenario(token, productId, 'scenario-a-tier-1', CANDIDATES.tier1, { min: 0, max: 2, fee: 5, minutes: 30 });
    await validateTierScenario(token, productId, 'scenario-a-tier-2', CANDIDATES.tier2, { min: 2, max: 5, fee: 8, minutes: 45 });
    await validateTierScenario(token, productId, 'scenario-a-tier-3', CANDIDATES.tier3, { min: 5, max: 8, fee: 12, minutes: 60 });

    const specialCandidate = await findFirstResolved(token, CANDIDATES.special);
    await createPolygonRule(token, {
      name: 'Area especial teste',
      zoneKind: 'custom_zone',
      pricingMode: 'fixed',
      fixedFee: 15,
      estimatedDeliveryMinutes: 70,
      polygonCoordinates: squarePolygon(specialCandidate.result.resolvedCoordinates),
      priority: 1,
    });

    let specialRules = await listRules(token);
    const specialRule = specialRules.find((rule) => rule.name === 'Area especial teste');
    pushAssertion(
      'special area estimated minutes persisted',
      specialRule?.estimatedDeliveryMinutes === 70,
      `value=${specialRule?.estimatedDeliveryMinutes ?? 'null'}`,
    );

    const specialRetest = await testCurrent(token, specialCandidate.query);
    pushAssertion('scenario-b test-current status', specialRetest.status === 200, `status=${specialRetest.status}`);
    pushAssertion('scenario-b test-current fixed fee', specialRetest.data?.fee === 15, `fee=${specialRetest.data?.fee ?? 'null'}`);
    pushAssertion(
      'scenario-b test-current minutes',
      specialRetest.data?.estimatedDeliveryMinutes === 70,
      `minutes=${specialRetest.data?.estimatedDeliveryMinutes ?? 'null'}`,
    );

    if (!specialCandidate.result.resolvedCoordinates) {
      throw new Error('Area especial sem coordenadas resolvidas.');
    }
    const specialAddress = buildAddress(specialCandidate.query, specialCandidate.result.resolvedCoordinates);
    const specialValidation = await validateCheckout(productId, specialAddress);
    pushAssertion('scenario-b checkout validate fee', specialValidation.data?.deliveryFee === 15, `fee=${specialValidation.data?.deliveryFee ?? 'null'}`);
    const specialOrder = await createOrder(productId, specialAddress, 'scenario-b');
    pushAssertion('scenario-b order status', specialOrder.status === 201 || specialOrder.status === 200, `status=${specialOrder.status}`);
    pushAssertion('scenario-b order fee', specialOrder.data?.deliveryFee === 15, `fee=${specialOrder.data?.deliveryFee ?? 'null'}`);

    const blockedCandidate = await findFirstResolved(token, CANDIDATES.blocked);
    await createPolygonRule(token, {
      name: 'Area bloqueada teste',
      zoneKind: 'blocked_zone',
      pricingMode: 'fixed',
      polygonCoordinates: squarePolygon(blockedCandidate.result.resolvedCoordinates),
      priority: 0,
      blocksDelivery: true,
    });

    const blockedRetest = await testCurrent(token, blockedCandidate.query);
    pushAssertion('scenario-c test-current unavailable', blockedRetest.status === 200 && blockedRetest.data?.available === false, `status=${blockedRetest.status} available=${String(blockedRetest.data?.available)}`);

    if (!blockedCandidate.result.resolvedCoordinates) {
      throw new Error('Area bloqueada sem coordenadas resolvidas.');
    }
    const blockedAddress = buildAddress(blockedCandidate.query, blockedCandidate.result.resolvedCoordinates);
    const blockedValidation = await validateCheckout(productId, blockedAddress);
    pushAssertion('scenario-c checkout blocked', blockedValidation.status >= 400, `status=${blockedValidation.status} msg=${getMessage(blockedValidation.raw)}`);
    const blockedOrder = await createOrder(productId, blockedAddress, 'scenario-c');
    pushAssertion('scenario-c order blocked', blockedOrder.status >= 400, `status=${blockedOrder.status} msg=${getMessage(blockedOrder.raw)}`);

    const outCandidate = await findFirstResolved(token, CANDIDATES.outOfCoverage);
    const outRetest = await testCurrent(token, outCandidate.query);
    pushAssertion('scenario-d test-current unavailable', outRetest.status === 200 && outRetest.data?.available === false, `status=${outRetest.status} available=${String(outRetest.data?.available)}`);

    if (!outCandidate.result.resolvedCoordinates) {
      throw new Error('Endereco fora de cobertura sem coordenadas resolvidas.');
    }
    const outAddress = buildAddress(outCandidate.query, outCandidate.result.resolvedCoordinates);
    const outValidation = await validateCheckout(productId, outAddress);
    pushAssertion('scenario-d checkout blocked', outValidation.status >= 400, `status=${outValidation.status} msg=${getMessage(outValidation.raw)}`);
    const outOrder = await createOrder(productId, outAddress, 'scenario-d');
    pushAssertion('scenario-d order blocked', outOrder.status >= 400, `status=${outOrder.status} msg=${getMessage(outOrder.raw)}`);
  } finally {
    await restoreState(snapshot);
    await restoreOperatingHours(tenantId, operatingHoursSnapshot);
    await restoreTenantSettings(tenantSettingsSnapshot);
    await restoreTenantAuth(authSnapshot);
    await prisma.$disconnect();
  }
}

run().catch(async (error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
  await prisma.$disconnect();
});
