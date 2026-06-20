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

type SmokeSetupResponse = {
  tenantId: string;
  tenantSlug: string;
  tenantEmail: string;
  planId: string;
  subscriptionId: string;
  settings: JsonObject;
  seedTimeline: {
    baselineEnd: string;
    progressiveEnd: string;
    capEnd: string;
    fullEnd: string;
  };
  seededEvents: Array<{
    orderId: string;
    sourceChannel: string;
    amount: number;
    occurredAt: string;
  }>;
  state: JsonObject;
};

type SmokeReport = {
  baseUrl: string;
  tenantSlug: string;
  runId: string;
  cleanupAttempted: boolean;
  cleanupCompleted: boolean;
  lastStep: string | null;
  checks: string[];
  notes: string[];
};

class HttpSmokeError extends Error {
  constructor(
    message: string,
    readonly method: string,
    readonly url: string,
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
  const looksSafe =
    /localhost|127\.0\.0\.1|staging|homolog|qa|dev/.test(host) ||
    host.endsWith('.onrender.com');
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

function monthStart(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1, 0, 0, 0, 0));
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

function getNestedArray(value: unknown, path: string): unknown[] {
  const current = getNested(value, path);
  assert(Array.isArray(current), `${path} must be an array.`);
  return current as unknown[];
}

function expectedTierPrice(
  revenue: number,
  tiers: Array<{ minRevenue: unknown; maxRevenue: unknown; price: unknown }>,
): number {
  for (const tier of tiers) {
    const minRevenue = decimalToNumber(tier.minRevenue);
    const maxRevenue = tier.maxRevenue === null ? null : decimalToNumber(tier.maxRevenue);
    if (revenue >= minRevenue && (maxRevenue === null || revenue <= maxRevenue)) {
      return decimalToNumber(tier.price);
    }
  }
  return tiers.length ? decimalToNumber(tiers[tiers.length - 1]?.price) : 0;
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
    const url = `${this.baseUrl}${path}`;

    for (let attempt = 1; attempt <= this.config.retryAttempts; attempt += 1) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.config.requestTimeoutMs);
      try {
        const response = await fetch(url, {
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
        const error = new HttpSmokeError(
          `${method} ${path} failed with HTTP ${response.status}`,
          method,
          url,
          response.status,
          sanitizeForLog(parsed),
        );
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

async function runStep<T>(
  report: SmokeReport,
  step: string,
  fn: () => Promise<T>,
): Promise<T> {
  report.lastStep = step;
  const result = await fn();
  report.checks.push(step);
  return result;
}

function pluckRestorableSettings(settings: JsonObject): JsonObject {
  const keys = [
    'freeTierRevenueLimit',
    'maxMonthlyCharge',
    'trialProEnabled',
    'trialProDays',
    'trialRequiresPaymentMethod',
    'trialIncludesAi',
    'trialIncludesIfood',
    'trialIncludesAdvancedReports',
    'trialAutoConvertToBilling',
    'aiAddonEnabled',
    'aiAddonPrice',
    'aiFreeTrialMessages',
    'aiIncludedForPaidTenants',
    'aiIncludedMonthlyMessages',
    'aiHardLimitMonthlyMessages',
    'countMarketplaceOrdersDefault',
    'includeDeliveryFeeByDefault',
    'includeServiceFeeByDefault',
    'countStorefrontOrders',
    'countDirectOnlineOrders',
    'countPosOrders',
    'countWhatsappAiOrders',
    'countManualOrders',
    'countMarketplaceIfoodOrders',
    'countMarketplaceRappiOrders',
    'countMarketplaceUbereatsOrders',
    'countMarketplace99foodOrders',
    'countMarketplaceKettaOrders',
    'countMarketplaceZeDeliveryOrders',
    'countConfirmedOrders',
    'countCompletedOrders',
    'excludeCancelledOrders',
    'discountReducesRevenue',
    'defaultGracePeriodDays',
    'defaultTrialDays',
    'requirePaymentMethodForPaidPlans',
    'partnerLinksJson',
  ] as const;

  return Object.fromEntries(keys.map((key) => [key, settings[key]]));
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
    lastStep: null,
    checks: [],
    notes: [],
  };

  const anonymous = new ApiClient(config.baseUrl, config);
  let admin: ApiClient | null = null;
  let tenant: ApiClient | null = null;
  let originalSettings: JsonObject | null = null;
  let setup: SmokeSetupResponse | null = null;
  let succeeded = false;

  try {
    assert(config.tenantSlug.startsWith('smoke-'), 'SMOKE_TENANT_SLUG must start with smoke-.');

    const adminLogin = await runStep(report, 'admin.login', async () => {
      return anonymous.request<JsonObject>('POST', '/auth/admin/login', {
        email: config.adminEmail,
        password: config.adminPassword,
      });
    });
    admin = anonymous.withToken(getNestedString(adminLogin, 'accessToken'));

    originalSettings = await runStep(report, 'admin.billing.settings.snapshot', async () => {
      return admin!.request<JsonObject>('GET', '/admin/billing/settings');
    });
    report.notes.push('Captured billing settings snapshot for restore.');

    setup = await runStep(report, 'smoke.setup', async () => {
      return admin!.request<SmokeSetupResponse>('POST', '/admin/billing/smoke/monetization/setup', {
        tenantSlug: config.tenantSlug,
        tenantEmail: config.tenantEmail,
        tenantPassword: config.tenantPassword,
        tenantName: 'Smoke Monetization',
        runId,
        allowReset: config.allowReset,
      });
    });
    report.notes.push(`Smoke tenant provisioned: ${setup.tenantSlug}`);

    const tenantLogin = await runStep(report, 'tenant.login', async () => {
      return anonymous.request<JsonObject>('POST', '/auth/tenant/login', {
        email: config.tenantEmail,
        password: config.tenantPassword,
        tenantSlug: config.tenantSlug,
      });
    });
    tenant = anonymous.withToken(getNestedString(tenantLogin, 'accessToken'));

    const tenantId = setup.tenantId;
    const planId = setup.planId;
    const subscriptionId = setup.subscriptionId;
    const seedTimeline = {
      baselineEnd: new Date(getNestedString(setup, 'seedTimeline.baselineEnd')),
      progressiveEnd: new Date(getNestedString(setup, 'seedTimeline.progressiveEnd')),
      capEnd: new Date(getNestedString(setup, 'seedTimeline.capEnd')),
      fullEnd: new Date(getNestedString(setup, 'seedTimeline.fullEnd')),
    };
    const windowStart = monthStart(seedTimeline.baselineEnd);
    const revenueTiers = getNestedArray(setup, 'state.plan.revenueTiers') as Array<{
      minRevenue: unknown;
      maxRevenue: unknown;
      price: unknown;
    }>;

    const usagePreview = (periodEnd: Date) => admin!.request<JsonObject>(
      'GET',
      `/admin/billing/usage-preview?tenantId=${encodeURIComponent(tenantId)}&planId=${encodeURIComponent(planId)}&periodStart=${encodeURIComponent(windowStart.toISOString())}&periodEnd=${encodeURIComponent(periodEnd.toISOString())}`,
    );

    const freePreview = await runStep(report, 'billing.freeTier', async () => usagePreview(seedTimeline.baselineEnd));
    const freeBillable = decimalToNumber(getNested(freePreview, 'billableAmount'));
    const freeRatingPrice = decimalToNumber(getNested(freePreview, 'rating.currentMonthlyPrice'));
    assert(freeBillable === 1400, 'Free tier preview should stay at R$ 1.400,00.');
    assert(freeRatingPrice === 0, 'Free tier preview should remain at zero charge.');

    const progressivePreview = await runStep(report, 'billing.progressiveTier', async () => usagePreview(seedTimeline.progressiveEnd));
    const progressiveBillable = decimalToNumber(getNested(progressivePreview, 'billableAmount'));
    const progressiveRatingPrice = decimalToNumber(getNested(progressivePreview, 'rating.currentMonthlyPrice'));
    const expectedProgressive = expectedTierPrice(1600, revenueTiers);
    assert(progressiveBillable === 1600, 'Progressive preview should include the first two seeded events.');
    assert(progressiveRatingPrice === expectedProgressive, 'Progressive preview should match the configured revenue tier.');

    const capPreview = await runStep(report, 'billing.cap300', async () => usagePreview(seedTimeline.capEnd));
    const capRatingPrice = decimalToNumber(getNested(capPreview, 'rating.currentMonthlyPrice'));
    assert(capRatingPrice === 300, 'Cap preview should stop at R$ 300,00.');

    const revenueEvents = await runStep(report, 'billing.sourceAlias', async () => {
      return admin!.request<Array<JsonObject>>(
        'GET',
        `/admin/billing/audit/revenue-events?tenantId=${encodeURIComponent(tenantId)}&periodStart=${encodeURIComponent(windowStart.toISOString())}&periodEnd=${encodeURIComponent(seedTimeline.fullEnd.toISOString())}`,
      );
    });
    const aliasSeed = `${runId}:alias-storefront`;
    const aliasEvent = revenueEvents.find((event) => String(event.orderId ?? '') === aliasSeed);
    assert(aliasEvent !== undefined, 'Storefront alias event must exist in revenue audit.');
    assert(String(aliasEvent?.source ?? '') === 'direct_online', 'Storefront must be normalized to direct_online.');

    const ifoodIncludedPreview = await runStep(report, 'billing.ifoodIncluded', async () => usagePreview(seedTimeline.fullEnd));
    const includedChannels = getNestedArray(ifoodIncludedPreview, 'includedChannels').map(String);
    const ifoodIncludedAmount = decimalToNumber(getNested(ifoodIncludedPreview, 'billableAmount'));
    assert(includedChannels.includes('marketplace_ifood'), 'iFood should be counted by default.');

    const ifoodExcludedPreview = await runStep(report, 'billing.ifoodExcluded', async () => {
      await admin!.request('PUT', '/admin/billing/settings', {
        ...pluckRestorableSettings(originalSettings!),
        countMarketplaceOrdersDefault: false,
        countMarketplaceIfoodOrders: false,
      });
      return admin!.request<JsonObject>(
        'GET',
        `/admin/billing/usage-preview?tenantId=${encodeURIComponent(tenantId)}&planId=${encodeURIComponent(planId)}&periodStart=${encodeURIComponent(windowStart.toISOString())}&periodEnd=${encodeURIComponent(seedTimeline.fullEnd.toISOString())}`,
      );
    });
    const excludedChannels = getNestedArray(ifoodExcludedPreview, 'includedChannels').map(String);
    const ifoodExcludedAmount = decimalToNumber(getNested(ifoodExcludedPreview, 'billableAmount'));
    assert(!excludedChannels.includes('marketplace_ifood'), 'iFood must be excluded after the admin flag is disabled.');
    assert(ifoodExcludedAmount < ifoodIncludedAmount, 'Excluding iFood should reduce the billable amount.');

    const addonOverview = await runStep(report, 'addons.ai.activate', async () => {
      return tenant!.request<JsonObject>('POST', '/billing/addons/ai-agent/activate', {});
    });
    assert(Boolean(addonOverview), 'AI add-on activation should return an overview.');

    const entitlementAfterAddon = await runStep(report, 'addons.ai.entitlement', async () => {
      return tenant!.request<JsonObject>('GET', '/billing/entitlements');
    });
    assert(getNestedBoolean(entitlementAfterAddon, 'flags.canUseAiAgent') === true, 'AI entitlement should be enabled after add-on activation.');
    assert(decimalToNumber(getNested(entitlementAfterAddon, 'addonsAmount')) === 70, 'AI add-on should add R$ 70,00 to billing.');

    const billingStateAfterAddon = await tenant!.request<JsonObject>('GET', '/billing/state');
    const invoicePreview = await runStep(report, 'addons.ai.invoicePreview', async () => {
      const currentCycle = await admin!.request<JsonObject>('POST', '/admin/billing/cycles/current', {
        tenantId,
        subscriptionId,
        now: seedTimeline.fullEnd.toISOString(),
      });
      const cycleId = getNestedString(currentCycle, 'id');
      const preview = await admin!.request<JsonObject>(
        'GET',
        `/admin/billing/cycles/${encodeURIComponent(cycleId)}/preview-invoice?tenantId=${encodeURIComponent(tenantId)}&subscriptionId=${encodeURIComponent(subscriptionId)}&planId=${encodeURIComponent(planId)}`,
      );
      report.notes.push(`Current billing cycle id: ${cycleId}`);
      return preview;
    });
    const invoiceItems = getNestedArray(invoicePreview, 'invoiceItems') as Array<JsonObject>;
    assert(decimalToNumber(getNested(invoicePreview, 'addonsAmount')) === 70, 'Invoice preview should include the AI add-on amount.');
    assert(invoiceItems.some((item) => String(item.type ?? '') === 'addon:ai_agent'), 'Invoice preview should include the AI add-on line item.');
    report.notes.push(`Billing state status after add-on: ${String(getNested(billingStateAfterAddon, 'subscription.status') ?? '')}`);

    const addonCanceled = await runStep(report, 'addons.ai.cancel', async () => {
      return tenant!.request<JsonObject>('POST', '/billing/addons/ai-agent/cancel', {});
    });
    assert(Boolean(addonCanceled), 'AI add-on cancel should return an overview.');

    const entitlementAfterCancel = await tenant!.request<JsonObject>('GET', '/billing/entitlements');
    const activeAddons = getNestedArray(entitlementAfterCancel, 'activeAddons') as Array<JsonObject>;
    const aiAddon = activeAddons.find((addon) => String(addon.addonKey ?? '') === 'ai_agent');
    assert(getNestedBoolean(entitlementAfterCancel, 'flags.canUseAiAgent') === true, 'AI should remain available until the current cycle ends.');
    assert(String(aiAddon?.status ?? '') === 'scheduled_cancel', 'AI add-on should be scheduled for cancellation at cycle end.');

    const trialBlocked = await runStep(report, 'trialPro.selfServiceBlocked', async () => {
      return tenant!.request<JsonObject>('POST', '/billing/trial-pro/start', {}, { expectedStatuses: [400] });
    });
    const trialBlockedMessage = String((trialBlocked as JsonObject).message ?? '');
    assert(
      /cartao|gateway|nao esta pronto|ainda nao esta pronto/i.test(trialBlockedMessage),
      'Self-service Trial Pro should be blocked with a clear gateway message.',
    );

    const assistedTrial = await runStep(report, 'trialPro.adminActivate', async () => {
      return admin!.request<JsonObject>('POST', `/admin/billing/tenants/${encodeURIComponent(tenantId)}/trial-pro/activate`, {});
    });
    assert(String(getNested(assistedTrial, 'activationMode') ?? '') === 'assisted_admin', 'Admin-assisted Trial Pro should report assisted_admin mode.');

    const billingOverview = await tenant!.request<JsonObject>('GET', '/billing/me');
    assert(getNestedString(billingOverview, 'entitlements.commercialStatus') === 'trial_pro', 'Trial Pro activation should unlock the tenant commercial status.');
    assert(getNestedBoolean(billingOverview, 'entitlements.flags.canUseAdvancedReports') === true, 'Trial Pro should enable advanced reports.');
    assert(getNestedBoolean(billingOverview, 'paymentModeInfo.automaticBillingActive') === false, 'Trial Pro should not expose automatic billing while the gateway is not ready.');

    const partners = await runStep(report, 'partners.list', async () => {
      return tenant!.request<Array<JsonObject>>('GET', '/billing/partners');
    });
    assert(Array.isArray(partners), 'Partners endpoint should return an array.');
    report.notes.push(`Partners returned: ${partners.length}`);

    succeeded = true;
  } catch (error) {
    console.error(JSON.stringify(
      {
        status: 'failed',
        report,
        error: error instanceof HttpSmokeError
          ? {
              message: error.message,
              method: error.method,
              url: error.url,
              status: error.status,
              body: sanitizeForLog(error.body),
            }
          : {
              message: error instanceof Error ? error.message : String(error),
            },
      },
      null,
      2,
    ));
    process.exitCode = 1;
  } finally {
    if (admin && originalSettings) {
      try {
        await runStep(report, 'cleanup.restore', async () => {
          await admin!.request('PUT', '/admin/billing/settings', pluckRestorableSettings(originalSettings));
          await admin!.request('POST', '/admin/billing/smoke/monetization/cleanup', {
            tenantSlug: config.tenantSlug,
          });
          report.cleanupCompleted = true;
          return null;
        });
        report.notes.push('Billing settings restored and smoke data cleaned up.');
      } catch (error) {
        report.notes.push(`Cleanup/restore failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }

  if (succeeded && report.cleanupCompleted) {
    console.log(JSON.stringify(
      {
        status: 'ok',
        report,
        result: 'MONETIZATION_P1_SMOKE_GO',
      },
      null,
      2,
    ));
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
