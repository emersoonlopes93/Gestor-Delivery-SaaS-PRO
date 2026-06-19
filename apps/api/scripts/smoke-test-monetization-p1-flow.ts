import { OrderStatus, Prisma, PrismaClient } from '@prisma/client';
import { RevenueLedgerService } from '../src/billing/revenue-ledger.service';

type JsonObject = Record<string, unknown>;

type SmokeConfig = {
  baseUrl: string;
  adminEmail: string;
  adminPassword: string;
  tenantEmail: string;
  tenantPassword: string;
  tenantSlug: string;
  allowReset: boolean;
  requestTimeoutMs: number;
  retryAttempts: number;
  retryDelayMs: number;
};

type SmokeReport = {
  baseUrl: string;
  tenantSlug: string;
  runId: string;
  cleanupAttempted: boolean;
  cleanupCompleted: boolean;
  checks: string[];
  notes: string[];
};

class HttpSmokeError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly body?: unknown,
  ) {
    super(message);
  }
}

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required env ${name}.`);
  return value;
}

function readPositiveIntEnv(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) throw new Error(`${name} must be a positive integer.`);
  return value;
}

function normalizeBaseUrl(value: string): string {
  const parsed = new URL(value);
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('SMOKE_API_BASE_URL must use http or https.');
  }
  const normalized = value.replace(/\/$/, '');
  if (!normalized.endsWith('/api/v1')) {
    throw new Error('SMOKE_API_BASE_URL must include /api/v1.');
  }
  return normalized;
}

function assertSafeTarget(baseUrl: string): void {
  const host = new URL(baseUrl).hostname.toLowerCase();
  const looksSafe = /localhost|127\.0\.0\.1|staging|homolog|qa|dev/.test(host);
  if (!looksSafe || host.includes('prod')) {
    throw new Error(`Refusing monetization smoke against non-local/non-staging host: ${host}.`);
  }
}

function loadConfig(): SmokeConfig {
  const baseUrl = normalizeBaseUrl(requireEnv('SMOKE_API_BASE_URL'));
  assertSafeTarget(baseUrl);

  return {
    baseUrl,
    adminEmail: requireEnv('SMOKE_ADMIN_EMAIL'),
    adminPassword: requireEnv('SMOKE_ADMIN_PASSWORD'),
    tenantEmail: requireEnv('SMOKE_TENANT_EMAIL'),
    tenantPassword: requireEnv('SMOKE_TENANT_PASSWORD'),
    tenantSlug: requireEnv('SMOKE_TENANT_SLUG'),
    allowReset: (process.env.ALLOW_SMOKE_RESET ?? 'false').toLowerCase() === 'true',
    requestTimeoutMs: readPositiveIntEnv('SMOKE_REQUEST_TIMEOUT_MS', 30000),
    retryAttempts: readPositiveIntEnv('SMOKE_RETRY_ATTEMPTS', 4),
    retryDelayMs: readPositiveIntEnv('SMOKE_RETRY_DELAY_MS', 1250),
  };
}

function unwrap<T = unknown>(body: unknown): T {
  if (body && typeof body === 'object' && 'success' in body && 'data' in body) {
    return (body as { data: T }).data;
  }
  return body as T;
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function decimalToNumber(value: unknown): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') return Number(value);
  if (value && typeof value === 'object' && 'toString' in value) return Number(String(value));
  return Number(value ?? 0);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function currentMonthWindow(): { periodStart: Date; periodEnd: Date } {
  const now = new Date();
  return {
    periodStart: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)),
    periodEnd: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)),
  };
}

function getNested(value: unknown, path: string): unknown {
  let current: unknown = value;
  for (const key of path.split('.')) {
    assert(current && typeof current === 'object', `${path} is missing.`);
    current = (current as JsonObject)[key];
  }
  return current;
}

function getNestedString(value: unknown, path: string): string {
  const current = getNested(value, path);
  assert(typeof current === 'string' && current.length > 0, `${path} must be a non-empty string.`);
  return current;
}

function getNestedBoolean(value: unknown, path: string): boolean {
  const current = getNested(value, path);
  assert(typeof current === 'boolean', `${path} must be a boolean.`);
  return current;
}

function sanitizeForLog(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => sanitizeForLog(item));
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value as JsonObject).map(([key, entry]) => {
      if (/password|token|authorization|secret|credential/i.test(key)) {
        return [key, '[REDACTED]'];
      }
      return [key, sanitizeForLog(entry)];
    }),
  );
}

type RequestOptions = {
  expectedStatuses?: number[];
};

class ApiClient {
  constructor(
    private readonly baseUrl: string,
    private readonly config: SmokeConfig,
    private readonly token?: string,
  ) {}

  withToken(token: string): ApiClient {
    return new ApiClient(this.baseUrl, this.config, token);
  }

  async request<T = unknown>(
    method: string,
    path: string,
    body?: unknown,
    options: RequestOptions = {},
  ): Promise<T> {
    let lastError: unknown;
    const expectedStatuses = options.expectedStatuses ?? [200, 201];

    for (let attempt = 1; attempt <= this.config.retryAttempts; attempt += 1) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.config.requestTimeoutMs);
      try {
        const response = await fetch(`${this.baseUrl}${path}`, {
          method,
          signal: controller.signal,
          headers: {
            accept: 'application/json',
            ...(body === undefined ? {} : { 'content-type': 'application/json' }),
            ...(this.token ? { authorization: `Bearer ${this.token}` } : {}),
          },
          body: body === undefined ? undefined : JSON.stringify(body),
        });
        const raw = await response.text();
        const parsed = raw ? this.parseJson(raw) : null;
        if (expectedStatuses.includes(response.status)) {
          return unwrap<T>(parsed);
        }
        const error = new HttpSmokeError(`${method} ${path} failed with HTTP ${response.status}`, response.status, sanitizeForLog(parsed));
        if (attempt === this.config.retryAttempts || (response.status < 500 && response.status !== 429)) {
          throw error;
        }
        lastError = error;
      } catch (error) {
        lastError = error;
        if (attempt === this.config.retryAttempts) throw error;
      } finally {
        clearTimeout(timeout);
      }
      await sleep(this.config.retryDelayMs * attempt);
    }

    throw lastError instanceof Error ? lastError : new Error(String(lastError));
  }

  private parseJson(raw: string): unknown {
    try {
      return JSON.parse(raw);
    } catch {
      return raw;
    }
  }
}

async function resetSmokeTenantData(prisma: PrismaClient, tenantId: string) {
  const invoiceIds = await prisma.invoice.findMany({
    where: { tenantId },
    select: { id: true },
  });
  const sessionIds = await prisma.chatSession.findMany({
    where: { tenantId },
    select: { id: true },
  });

  await prisma.paymentAttempt.deleteMany({ where: { tenantId } });
  if (invoiceIds.length) {
    await prisma.invoiceItem.deleteMany({
      where: {
        invoiceId: {
          in: invoiceIds.map((invoice) => invoice.id),
        },
      },
    });
  }
  await prisma.invoice.deleteMany({ where: { tenantId } });
  await prisma.billingUsageSnapshot.deleteMany({ where: { tenantId } });
  await prisma.billingCycleRecord.deleteMany({ where: { tenantId } });
  await prisma.subscriptionStatusHistory.deleteMany({ where: { tenantId } });
  await prisma.revenueEvent.deleteMany({ where: { tenantId } });
  await prisma.tenantAddon.deleteMany({ where: { tenantId } });
  await prisma.billingPaymentMethod.deleteMany({ where: { tenantId } });
  if (sessionIds.length) {
    await prisma.chatMessage.deleteMany({
      where: {
        sessionId: {
          in: sessionIds.map((session) => session.id),
        },
      },
    });
  }
  await prisma.chatSession.deleteMany({ where: { tenantId } });
  await prisma.tenantBillingSubscription.deleteMany({ where: { tenantId } });
}

function expectedTierPrice(revenue: number, tiers: Array<{ minRevenue: unknown; maxRevenue: unknown; price: unknown }>): number {
  for (const tier of tiers) {
    const minRevenue = decimalToNumber(tier.minRevenue);
    const maxRevenue = tier.maxRevenue === null ? null : decimalToNumber(tier.maxRevenue);
    if (revenue >= minRevenue && (maxRevenue === null || revenue <= maxRevenue)) {
      return decimalToNumber(tier.price);
    }
  }
  return tiers.length ? decimalToNumber(tiers[tiers.length - 1]?.price) : 0;
}

async function seedCompletedOrder(
  ledger: RevenueLedgerService,
  input: {
    tenantId: string;
    orderId: string;
    amount: number;
    sourceChannel: string;
  },
) {
  await ledger.recordOrderStatusEvent({
    tenantId: input.tenantId,
    orderId: input.orderId,
    orderStatus: OrderStatus.completed,
    orderTotal: new Prisma.Decimal(input.amount),
    sourceChannel: input.sourceChannel,
    occurredAt: new Date(),
    actorType: 'system',
    actorId: 'smoke-test',
  });
}

async function main() {
  const config = loadConfig();
  const runId = `monetization-p1-${Date.now()}`;
  const report: SmokeReport = {
    baseUrl: config.baseUrl,
    tenantSlug: config.tenantSlug,
    runId,
    cleanupAttempted: config.allowReset,
    cleanupCompleted: false,
    checks: [],
    notes: [],
  };

  const anonymous = new ApiClient(config.baseUrl, config);
  const prisma = new PrismaClient();
  const ledger = new RevenueLedgerService(prisma as never);
  const { periodStart, periodEnd } = currentMonthWindow();
  let originalSettings: JsonObject | null = null;

  try {
    assert(config.tenantSlug.startsWith('smoke-'), 'SMOKE_TENANT_SLUG must start with smoke-.');

    const adminLogin = await anonymous.request<JsonObject>('POST', '/auth/admin/login', {
      email: config.adminEmail,
      password: config.adminPassword,
    });
    const admin = anonymous.withToken(getNestedString(adminLogin, 'accessToken'));
    report.checks.push('admin login ok');

    const tenantLogin = await anonymous.request<JsonObject>('POST', '/auth/tenant/login', {
      email: config.tenantEmail,
      password: config.tenantPassword,
      tenantSlug: config.tenantSlug,
    });
    const tenantApi = anonymous.withToken(getNestedString(tenantLogin, 'accessToken'));
    report.checks.push('tenant login ok');

    await prisma.$connect();

    const tenantRecord = await prisma.tenant.findUnique({
      where: { slug: config.tenantSlug },
      select: { id: true, slug: true, name: true },
    });
    assert(tenantRecord, 'Smoke tenant not found in database.');
    const tenantId = tenantRecord.id;

    originalSettings = await admin.request<JsonObject>('GET', '/admin/billing/settings');
    report.notes.push('billing settings snapshot captured');

    if (config.allowReset) {
      await resetSmokeTenantData(prisma, tenantId);
      report.notes.push('smoke tenant billing state reset');
    } else {
      const existingEvents = await prisma.revenueEvent.count({ where: { tenantId } });
      const existingAddons = await prisma.tenantAddon.count({ where: { tenantId } });
      assert(existingEvents === 0 && existingAddons === 0, 'Smoke tenant already has monetization data. Re-run with ALLOW_SMOKE_RESET=true.');
    }

    await admin.request('PUT', '/admin/billing/settings', {
      trialProEnabled: true,
      trialProDays: 14,
      trialRequiresPaymentMethod: true,
      trialAutoConvertToBilling: false,
      countMarketplaceOrdersDefault: true,
      countMarketplaceIfoodOrders: true,
      aiAddonEnabled: true,
      aiAddonPrice: 70,
    });
    report.checks.push('admin monetization baseline applied');

    const plans = await tenantApi.request<Array<JsonObject>>('GET', '/billing/plans');
    const defaultPlan = plans[0];
    assert(defaultPlan, 'Default billing plan not found.');
    const planId = getNestedString(defaultPlan, 'id');
    await tenantApi.request('POST', '/billing/subscription', { planId });
    report.checks.push('tenant billing subscription ensured');

    await seedCompletedOrder(ledger, {
      tenantId,
      orderId: `${runId}-free-direct-online`,
      amount: 1400,
      sourceChannel: 'direct_online',
    });

    let overview = await tenantApi.request<JsonObject>('GET', '/billing/me');
    let entitlements = getNested(overview, 'entitlements') as JsonObject;
    assert(decimalToNumber(getNested(entitlements, 'estimatedBasePrice')) === 0, 'Free controlled tenant should not generate base charge up to R$ 1.500.');
    assert(getNestedString(entitlements, 'commercialStatus') === 'free_controlled', 'Commercial status should be free_controlled below the free tier.');
    assert(getNestedBoolean(entitlements, 'flags.canUseAiAgent') === false, 'AI must stay blocked without add-on for a free tenant.');
    report.checks.push('free tier up to R$ 1.500 validated');

    const aiBlocked = await tenantApi.request<JsonObject>('GET', '/ai-agent/config', undefined, { expectedStatuses: [403] });
    const aiBlockedMessage = String((aiBlocked as JsonObject).message ?? '');
    assert(/Trial Pro|add-on/i.test(aiBlockedMessage), 'AI blocked endpoint should return a clear commercial guidance message.');
    report.checks.push('ai endpoint blocks free tenant without entitlement');

    await seedCompletedOrder(ledger, {
      tenantId,
      orderId: `${runId}-paid-storefront`,
      amount: 200,
      sourceChannel: 'storefront',
    });

    overview = await tenantApi.request<JsonObject>('GET', '/billing/me');
    entitlements = getNested(overview, 'entitlements') as JsonObject;
    const tiers = (getNested(overview, 'plan.revenueTiers') as Array<JsonObject>) ?? [];
    const billableRevenue = decimalToNumber(getNested(entitlements, 'billableRevenue'));
    const expectedProgressivePrice = expectedTierPrice(billableRevenue, tiers.map((tier) => ({
      minRevenue: tier.minRevenue,
      maxRevenue: tier.maxRevenue,
      price: tier.price,
    })));
    assert(decimalToNumber(getNested(entitlements, 'estimatedBasePrice')) === expectedProgressivePrice, 'Progressive billing should select the correct revenue tier.');
    assert(decimalToNumber(getNested(entitlements, 'estimatedBasePrice')) > 0, 'Revenue above the free tier should generate a positive base price.');

    const eventsAfterStorefront = await admin.request<Array<JsonObject>>(
      'GET',
      `/admin/billing/audit/revenue-events?tenantId=${encodeURIComponent(tenantId)}&periodStart=${encodeURIComponent(periodStart.toISOString())}&periodEnd=${encodeURIComponent(periodEnd.toISOString())}`,
    );
    const storefrontEvent = eventsAfterStorefront.find((event) => String(event.orderId ?? '') === `${runId}-paid-storefront`);
    assert(storefrontEvent && String(storefrontEvent.source ?? '') === 'direct_online', 'Legacy storefront revenue must remain normalized as direct_online.');
    report.checks.push('progressive tier and storefront alias validated');

    await seedCompletedOrder(ledger, {
      tenantId,
      orderId: `${runId}-cap-direct-online`,
      amount: 5000,
      sourceChannel: 'direct_online',
    });

    overview = await tenantApi.request<JsonObject>('GET', '/billing/me');
    entitlements = getNested(overview, 'entitlements') as JsonObject;
    const topTier = tiers[tiers.length - 1];
    const topTierPrice = decimalToNumber(topTier?.price);
    assert(decimalToNumber(getNested(entitlements, 'estimatedBasePrice')) === topTierPrice, 'High revenue should respect the top revenue tier price cap.');

    const adminSettings = await admin.request<JsonObject>('GET', '/admin/billing/settings');
    assert(decimalToNumber(adminSettings.maxMonthlyCharge) === topTierPrice, 'Admin maxMonthlyCharge must stay derived from the highest BillingRevenueTier.');
    report.checks.push('monthly cap of R$ 300 validated through revenue tiers');

    await seedCompletedOrder(ledger, {
      tenantId,
      orderId: `${runId}-ifood-marketplace`,
      amount: 250,
      sourceChannel: 'marketplace_ifood',
    });

    let usagePreview = await admin.request<JsonObject>(
      'GET',
      `/admin/billing/usage-preview?tenantId=${encodeURIComponent(tenantId)}&planId=${encodeURIComponent(planId)}&periodStart=${encodeURIComponent(periodStart.toISOString())}&periodEnd=${encodeURIComponent(periodEnd.toISOString())}`,
    );
    let includedChannels = getNested(usagePreview, 'includedChannels') as string[];
    assert(includedChannels.includes('marketplace_ifood'), 'marketplace_ifood should count in billing by default.');
    const ifoodIncludedAmount = decimalToNumber(getNested(usagePreview, 'billableAmount'));

    await admin.request('PUT', '/admin/billing/settings', {
      ...originalSettings,
      trialProEnabled: true,
      trialProDays: 14,
      trialRequiresPaymentMethod: true,
      trialAutoConvertToBilling: false,
      countMarketplaceOrdersDefault: false,
      countMarketplaceIfoodOrders: false,
      aiAddonEnabled: true,
      aiAddonPrice: 70,
    });
    usagePreview = await admin.request<JsonObject>(
      'GET',
      `/admin/billing/usage-preview?tenantId=${encodeURIComponent(tenantId)}&planId=${encodeURIComponent(planId)}&periodStart=${encodeURIComponent(periodStart.toISOString())}&periodEnd=${encodeURIComponent(periodEnd.toISOString())}`,
    );
    includedChannels = getNested(usagePreview, 'includedChannels') as string[];
    assert(!includedChannels.includes('marketplace_ifood'), 'marketplace_ifood should be excluded after the admin setting is disabled.');
    const ifoodExcludedAmount = decimalToNumber(getNested(usagePreview, 'billableAmount'));
    assert(ifoodExcludedAmount < ifoodIncludedAmount, 'Excluding iFood should reduce the billable revenue preview without deleting historical events.');
    const historicalIfoodEvent = await prisma.revenueEvent.findFirst({
      where: { tenantId, orderId: `${runId}-ifood-marketplace` },
    });
    assert(Boolean(historicalIfoodEvent), 'Historical iFood RevenueEvent must remain persisted after excluding the channel from billing.');
    report.checks.push('iFood channel inclusion/exclusion validated');

    await admin.request('PUT', '/admin/billing/settings', {
      ...originalSettings,
      trialProEnabled: true,
      trialProDays: 14,
      trialRequiresPaymentMethod: true,
      trialAutoConvertToBilling: false,
      countMarketplaceOrdersDefault: true,
      countMarketplaceIfoodOrders: true,
      aiAddonEnabled: true,
      aiAddonPrice: 70,
    });

    let addonOverview = await tenantApi.request<JsonObject>('POST', '/billing/addons/ai-agent/activate', {});
    let addonEntitlements = getNested(addonOverview, 'entitlements') as JsonObject;
    let tenantAddon = await prisma.tenantAddon.findUnique({
      where: {
        tenantId_addonKey: {
          tenantId,
          addonKey: 'ai_agent',
        },
      },
    });
    assert(Boolean(tenantAddon), 'TenantAddon should be created for the AI add-on.');
    assert(getNestedBoolean(addonEntitlements, 'flags.canUseAiAgent') === true, 'AI add-on should enable AI entitlement.');
    assert(decimalToNumber(getNested(addonEntitlements, 'addonsAmount')) === 70, 'AI add-on should contribute its configured price to billing preview.');
    report.checks.push('ai add-on activation validated');

    addonOverview = await tenantApi.request<JsonObject>('POST', '/billing/addons/ai-agent/cancel', {});
    addonEntitlements = getNested(addonOverview, 'entitlements') as JsonObject;
    tenantAddon = await prisma.tenantAddon.findUnique({
      where: {
        tenantId_addonKey: {
          tenantId,
          addonKey: 'ai_agent',
        },
      },
    });
    assert(tenantAddon?.status === 'scheduled_cancel', 'AI add-on cancellation should be scheduled for the end of the cycle in P1.');
    assert(getNestedBoolean(addonEntitlements, 'flags.canUseAiAgent') === true, 'Scheduled cancellation should keep AI active until the cycle ends.');
    report.checks.push('ai add-on cancel-at-cycle-end policy validated');

    const selfServeTrialAttempt = await tenantApi.request<JsonObject>('POST', '/billing/trial-pro/start', {}, { expectedStatuses: [400] });
    const selfServeTrialMessage = String((selfServeTrialAttempt as JsonObject).message ?? '');
    assert(/ainda nao esta pronto|gateway real/i.test(selfServeTrialMessage), 'Self-serve Trial Pro should fail with a clear message when payment method/tokenization is not ready.');
    report.checks.push('self-serve trial blocked when card-on-file is unavailable');

    const assistedTrial = await admin.request<JsonObject>('POST', `/admin/billing/tenants/${tenantId}/trial-pro/activate`, {});
    assert(String(assistedTrial.activationMode ?? '') === 'assisted_admin', 'Admin-assisted Trial Pro should return its activation mode.');
    overview = await tenantApi.request<JsonObject>('GET', '/billing/me');
    entitlements = getNested(overview, 'entitlements') as JsonObject;
    assert(getNestedString(entitlements, 'commercialStatus') === 'trial_pro', 'Admin-assisted Trial Pro should unlock trial entitlements.');
    assert(getNestedBoolean(entitlements, 'flags.canUseAdvancedReports') === true, 'Trial Pro should unlock advanced reports.');
    assert(getNestedBoolean(overview, 'paymentModeInfo.automaticBillingActive') === false, 'Trial Pro assistido nao pode expor cobranca automatica enquanto o gateway nao estiver pronto.');
    report.checks.push('admin-assisted Trial Pro validated');

    const partners = await tenantApi.request<Array<JsonObject>>('GET', '/billing/partners');
    assert(Array.isArray(partners) && partners.length > 0, 'Partners endpoint should return configured cards.');
    report.checks.push('partners endpoint validated');

    console.log(JSON.stringify({
      status: 'ok',
      report,
    }, null, 2));
  } catch (error) {
    console.error(JSON.stringify({
      status: 'failed',
      report,
      error: error instanceof HttpSmokeError
        ? {
            message: error.message,
            status: error.status,
            body: sanitizeForLog(error.body),
          }
        : {
            message: error instanceof Error ? error.message : String(error),
          },
    }, null, 2));
    process.exitCode = 1;
  } finally {
    try {
      if (originalSettings) {
        await anonymous
          .request<JsonObject>('POST', '/auth/admin/login', {
            email: config.adminEmail,
            password: config.adminPassword,
          })
          .then((body) => anonymous.withToken(getNestedString(body, 'accessToken')))
          .then((admin) => admin.request('PUT', '/admin/billing/settings', originalSettings));
      }

      if (config.allowReset) {
        const tenantRecord = await prisma.tenant.findUnique({
          where: { slug: config.tenantSlug },
          select: { id: true },
        });
        if (tenantRecord) {
          await resetSmokeTenantData(prisma, tenantRecord.id);
          report.cleanupCompleted = true;
        }
      }
    } finally {
      await prisma.$disconnect();
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
