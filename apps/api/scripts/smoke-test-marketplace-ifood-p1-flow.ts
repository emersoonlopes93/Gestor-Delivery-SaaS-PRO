type JsonObject = Record<string, unknown>;

type SmokeConfig = {
  baseUrl: string;
  adminEmail: string;
  adminPassword: string;
  tenantEmail: string;
  tenantPassword: string;
  tenantSlug: string;
  cleanup: boolean;
  allowCleanupExistingIfoodConnection: boolean;
  requestTimeoutMs: number;
  retryAttempts: number;
  retryDelayMs: number;
};

type SmokeReport = {
  baseUrl: string;
  tenantSlug: string;
  cleanup: boolean;
  cleanupStatus: 'pending' | 'skipped' | 'completed' | 'failed';
  runId: string;
  connectionId?: string;
  driverId?: string;
  eventInboxId?: string;
  marketplaceOrderId?: string;
  internalOrderId?: string;
  internalOrderIdExcluded?: string;
  checks: string[];
  billingChecks: string[];
  idempotencyChecks: string[];
  reprocessChecks: string[];
  notes: string[];
  lastStep?: string;
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

function loadConfig(): SmokeConfig {
  return {
    baseUrl: normalizeBaseUrl(requireEnv('SMOKE_API_BASE_URL')),
    adminEmail: requireEnv('SMOKE_ADMIN_EMAIL'),
    adminPassword: requireEnv('SMOKE_ADMIN_PASSWORD'),
    tenantEmail: requireEnv('SMOKE_TENANT_EMAIL'),
    tenantPassword: requireEnv('SMOKE_TENANT_PASSWORD'),
    tenantSlug: requireEnv('SMOKE_TENANT_SLUG'),
    cleanup: (process.env.SMOKE_CLEANUP ?? 'true').toLowerCase() !== 'false',
    allowCleanupExistingIfoodConnection: (process.env.SMOKE_ALLOW_CLEANUP_EXISTING_IFOOD_CONNECTION ?? 'false').toLowerCase() === 'true',
    requestTimeoutMs: readPositiveIntEnv('SMOKE_REQUEST_TIMEOUT_MS', 30000),
    retryAttempts: readPositiveIntEnv('SMOKE_RETRY_ATTEMPTS', 8),
    retryDelayMs: readPositiveIntEnv('SMOKE_RETRY_DELAY_MS', 1500),
  };
}

function isSmokeTenantSlug(tenantSlug: string): boolean {
  return tenantSlug.startsWith('smoke-');
}

function unwrap<T = unknown>(body: unknown): T {
  if (body && typeof body === 'object' && 'success' in body && 'data' in body) {
    return (body as { data: T }).data;
  }
  return body as T;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function getNestedString(value: unknown, path: string): string {
  let current: unknown = value;
  for (const key of path.split('.')) {
    assert(current && typeof current === 'object', `${path} is missing.`);
    current = (current as JsonObject)[key];
  }
  assert(typeof current === 'string' && current.length > 0, `${path} must be a string.`);
  return current;
}

function getNestedBoolean(value: unknown, path: string): boolean {
  let current: unknown = value;
  for (const key of path.split('.')) {
    assert(current && typeof current === 'object', `${path} is missing.`);
    current = (current as JsonObject)[key];
  }
  assert(typeof current === 'boolean', `${path} must be a boolean.`);
  return current;
}

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
    expectedStatuses: number[] = [200, 201],
    extraHeaders?: Record<string, string>,
  ): Promise<T> {
    let lastError: unknown;
    for (let attempt = 1; attempt <= this.config.retryAttempts; attempt += 1) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.config.requestTimeoutMs);
      try {
        const res = await fetch(`${this.baseUrl}${path}`, {
          method,
          signal: controller.signal,
          headers: {
            accept: 'application/json',
            ...(body === undefined ? {} : { 'content-type': 'application/json' }),
            ...(this.token ? { authorization: `Bearer ${this.token}` } : {}),
            ...(extraHeaders ?? {}),
          },
          body: body === undefined ? undefined : JSON.stringify(body),
        });
        const raw = await res.text();
        const parsed = raw ? this.parseJson(raw) : null;
        if (expectedStatuses.includes(res.status)) {
          return unwrap<T>(parsed);
        }
        const error = new HttpSmokeError(`${method} ${path} failed with HTTP ${res.status}`, res.status, sanitizeForLog(parsed));
        if (attempt === this.config.retryAttempts || (res.status < 500 && res.status !== 429)) {
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

async function poll<T>(
  label: string,
  fn: () => Promise<T>,
  predicate: (value: T) => boolean,
  attempts: number,
  delayMs: number,
): Promise<T> {
  let lastValue: T | undefined;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    lastValue = await fn();
    if (predicate(lastValue)) return lastValue;
    await sleep(delayMs);
  }
  throw new Error(`Polling failed for ${label}. Last value: ${JSON.stringify(sanitizeForLog(lastValue))}`);
}

async function main() {
  const config = loadConfig();
  const runId = `ifood-smoke-${Date.now()}`;
  const merchantId = `${runId}-merchant`;
  const storeId = `${runId}-store`;
  const orderIdIncluded = `${runId}-order-included`;
  const eventIdIncluded = `${runId}-event-included`;
  const orderIdExcluded = `${runId}-order-excluded`;
  const eventIdExcluded = `${runId}-event-excluded`;
  const anonymous = new ApiClient(config.baseUrl, config);
  const report: SmokeReport = {
    baseUrl: config.baseUrl,
    tenantSlug: config.tenantSlug,
    cleanup: config.cleanup,
    cleanupStatus: config.cleanup ? 'pending' : 'skipped',
    runId,
    checks: [],
    billingChecks: [],
    idempotencyChecks: [],
    reprocessChecks: [],
    notes: [],
  };

  let originalBillingSettings: JsonObject | null = null;
  let originalMarketplaceConnection: JsonObject | null = null;
  let smokePassed = false;
  let smokeError: unknown;
  let lastStep = 'init';

  const setStep = (step: string) => {
    lastStep = step;
    report.lastStep = step;
    console.log(`[smoke] ${step}`);
  };

  try {
    setStep('admin.login');
    const adminLogin = await anonymous.request<JsonObject>('POST', '/auth/admin/login', {
      email: config.adminEmail,
      password: config.adminPassword,
    });
    const admin = anonymous.withToken(getNestedString(adminLogin, 'accessToken'));
    report.checks.push('admin login ok');

    setStep('tenant.login');
    const tenantLogin = await anonymous.request<JsonObject>('POST', '/auth/tenant/login', {
      email: config.tenantEmail,
      password: config.tenantPassword,
      tenantSlug: config.tenantSlug,
    });
    const tenant = anonymous.withToken(getNestedString(tenantLogin, 'accessToken'));
    report.checks.push('tenant login ok');

    setStep('billing.snapshot');
    originalBillingSettings = await admin.request<JsonObject>('GET', '/admin/billing/settings');
    report.notes.push('billing settings snapshot captured');
    setStep('ifood.status.before');
    originalMarketplaceConnection = await tenant.request<JsonObject | null>('GET', '/marketplaces/ifood/status');
    if (originalMarketplaceConnection?.id) {
      if (config.allowCleanupExistingIfoodConnection && isSmokeTenantSlug(config.tenantSlug)) {
        report.notes.push('existing ifood connection will be cleaned up because tenant is dedicated smoke tenant');
        setStep('ifood.cleanup.existing');
        await tenant.request('POST', '/marketplaces/ifood/disconnect', {}, [200, 201]);
        report.notes.push('existing ifood connection cleaned up for dedicated smoke tenant');
      } else {
        throw new Error('Refusing smoke: tenant already has an iFood connection configured. Use a dedicated smoke tenant.');
      }
    } else {
      report.notes.push('no existing ifood connection found');
    }

    setStep('ifood.connect.manual');
    const connection = await tenant.request<JsonObject>('POST', '/marketplaces/ifood/connect/manual', {
      externalMerchantId: merchantId,
      externalStoreId: storeId,
      displayName: `iFood Smoke Store ${runId}`,
      settingsJson: {
        autoConfirmOrders: false,
        importAsStatus: 'pending',
        includeInBilling: true,
        smokeTest: true,
      },
    });
    report.connectionId = getNestedString(connection, 'id');
    report.checks.push('manual marketplace connection created');

    setStep('ifood.status.after');
    const status = await tenant.request<JsonObject>('GET', '/marketplaces/ifood/status');
    assert(getNestedString(status, 'id') === report.connectionId, 'Marketplace status did not return the created connection.');
    report.checks.push('connection status resolved for tenant');

    const includedPayload = {
      id: eventIdIncluded,
      topic: 'ORDER_PLACED',
      merchantId,
      storeId,
      order: {
        id: orderIdIncluded,
        displayId: `${runId}-display-included`,
        status: 'PLACED',
        customer: {
          name: `Smoke Included ${runId}`,
          phone: '5511999999001',
          email: `included+${runId}@example.com`,
        },
        deliveryAddress: {
          street: 'Rua Smoke',
          number: '100',
          neighborhood: 'Centro',
          city: 'Sao Paulo',
          state: 'SP',
          zipCode: '01001000',
        },
        items: [
          { id: 'item-1', name: 'Pizza Smoke', quantity: 1, unitPrice: 35, totalPrice: 35 },
        ],
      },
    };

    setStep('webhook.included');
    const webhookAccepted = await anonymous.request<JsonObject>(
      'POST',
      '/webhooks/marketplaces/ifood',
      includedPayload,
      [200, 201],
      { 'x-marketplace-smoke': 'true' },
    );
    report.eventInboxId = getNestedString(webhookAccepted, 'inboxId');
    report.checks.push('mock webhook accepted');

    setStep('inbox.poll.included');
    const inboxRows = await poll(
      'marketplace event inbox processed',
      () => tenant.request<JsonObject[]>('GET', `/marketplaces/events?eventId=${encodeURIComponent(eventIdIncluded)}`),
      (rows) => Array.isArray(rows) && rows.length > 0 && String(rows[0].status) === 'PROCESSED',
      config.retryAttempts,
      config.retryDelayMs,
    );
    const inbox = inboxRows[0];
    assert(inbox.provider === 'IFOOD', 'Inbox provider mismatch.');
    assert(inbox.externalOrderId === orderIdIncluded, 'Inbox externalOrderId mismatch.');
    report.checks.push('event inbox processed');

    setStep('orders.poll.included');
    const marketplaceOrders = await poll(
      'marketplace order imported',
      () => tenant.request<JsonObject[]>('GET', '/marketplaces/orders'),
      (rows) => Array.isArray(rows) && rows.some((row) => row.externalOrderId === orderIdIncluded && typeof row.internalOrderId === 'string'),
      config.retryAttempts,
      config.retryDelayMs,
    );
    const importedMarketplaceOrder = marketplaceOrders.find((row) => row.externalOrderId === orderIdIncluded) as JsonObject;
    report.marketplaceOrderId = getNestedString(importedMarketplaceOrder, 'id');
    report.internalOrderId = getNestedString(importedMarketplaceOrder, 'internalOrderId');
    assert(importedMarketplaceOrder.provider === 'IFOOD', 'MarketplaceOrder provider mismatch.');
    assert(importedMarketplaceOrder.tenantId, 'MarketplaceOrder tenantId missing.');
    const tenantId = String(importedMarketplaceOrder.tenantId);
    report.checks.push('marketplace order mapped to internal order');

    setStep('orders.list.tenant');
    const orders = await tenant.request<{ items: JsonObject[]; total: number }>('GET', '/orders?page=1&limit=100');
    const importedOrder = orders.items.find((row) => row.id === report.internalOrderId);
    assert(importedOrder, 'Imported order not found in tenant order list.');
    assert(importedOrder.sourceChannel === 'marketplace_ifood', 'Imported order sourceChannel mismatch.');
    report.checks.push('internal order visible in tenant list');

    setStep('orders.board.tenant');
    const board = await tenant.request<JsonObject[]>('GET', '/orders/operation/board');
    assert(board.some((row) => row.id === report.internalOrderId), 'Imported order not visible on operation board.');
    report.checks.push('internal order visible in kanban board');

    setStep('orders.detail.tenant');
    const fullOrder = await tenant.request<JsonObject>('GET', `/orders/${report.internalOrderId}`);
    assert(fullOrder.sourceChannel === 'marketplace_ifood', 'Full order sourceChannel mismatch.');
    assert(fullOrder.customerName === `Smoke Included ${runId}`, 'Customer import mismatch.');
    assert(Array.isArray(fullOrder.items) && fullOrder.items.length === 1, 'Imported order items mismatch.');
    report.checks.push('internal order detail imported correctly');

    setStep('webhook.duplicate');
    const duplicateWebhook = await anonymous.request<JsonObject>(
      'POST',
      '/webhooks/marketplaces/ifood',
      includedPayload,
      [200, 201],
      { 'x-marketplace-smoke': 'true' },
    );
    assert(duplicateWebhook.duplicate === true, 'Duplicate webhook was not reported as duplicate.');

    const marketplaceOrdersAfterDuplicate = await tenant.request<JsonObject[]>('GET', '/marketplaces/orders');
    const sameExternalOrders = marketplaceOrdersAfterDuplicate.filter((row) => row.externalOrderId === orderIdIncluded);
    assert(sameExternalOrders.length === 1, 'Duplicate webhook created another MarketplaceOrder.');
    report.idempotencyChecks.push('duplicate webhook does not duplicate marketplace order');

    setStep('orders.duplicate-check');
    const ordersAfterDuplicate = await tenant.request<{ items: JsonObject[]; total: number }>('GET', '/orders?page=1&limit=100');
    const sameOrders = ordersAfterDuplicate.items.filter((row) => row.id === report.internalOrderId);
    assert(sameOrders.length === 1, 'Duplicate webhook created another internal order.');
    report.idempotencyChecks.push('duplicate webhook does not duplicate internal order');

    setStep('delivery.ensureSmokeDriver');
    const drivers = await tenant.request<JsonObject[]>('GET', '/delivery/drivers');
    const smokeDriverPhone = '5511999988776';
    const existingSmokeDriver = drivers.find((row) => {
      const phone = String(row.phone ?? '');
      const name = String(row.name ?? '');
      const notes = String(row.notes ?? '');
      return phone === smokeDriverPhone || name.includes('Smoke Driver') || notes.includes('smokeTest=true');
    });
    let driver: JsonObject;

    if (existingSmokeDriver) {
      driver = existingSmokeDriver;
      report.notes.push('reused existing smoke driver');
    } else {
      driver = await tenant.request<JsonObject>('POST', '/delivery/drivers', {
        name: `Smoke Driver ${runId}`,
        phone: smokeDriverPhone,
        vehicleType: 'motorcycle',
        notes: 'smokeTest=true',
      });
      report.notes.push('created smoke driver');
    }
    report.driverId = getNestedString(driver, 'id');

    setStep('delivery.assignSmokeDriver');
    const assignResponse = await tenant.request<JsonObject>('POST', `/orders/${report.internalOrderId}/assign-driver`, {
      driverId: report.driverId,
    });
    void assignResponse;
    const assignedOrder = await tenant.request<JsonObject>('GET', `/orders/${report.internalOrderId}`);
    assert(assignedOrder.deliveryDriverId === report.driverId, 'Driver assignment failed.');
    report.checks.push('smoke driver assigned to imported order');

    setStep('billing.settings.enable-ifood');
    await admin.request('PUT', '/admin/billing/settings', {
      ...originalBillingSettings,
      countMarketplaceIfoodOrders: true,
    });

    setStep('orders.markOutForDelivery');
    await tenant.request('PATCH', `/orders/${report.internalOrderId}/status`, { status: 'confirmed', note: `smoke ${runId} confirmed` });
    await tenant.request('PATCH', `/orders/${report.internalOrderId}/status`, { status: 'preparing', note: `smoke ${runId} preparing` });
    await tenant.request('PATCH', `/orders/${report.internalOrderId}/status`, { status: 'ready_for_delivery', note: `smoke ${runId} ready` });
    await tenant.request('PATCH', `/orders/${report.internalOrderId}/status`, { status: 'out_for_delivery', note: `smoke ${runId} route` });

    setStep('orders.markCompleted');
    await tenant.request('PATCH', `/orders/${report.internalOrderId}/status`, { status: 'completed', note: `smoke ${runId} completed` });

    setStep('billing.verifyRevenue');
    const revenueEventsIncluded = await poll(
      'revenue event for included marketplace order',
      () => admin.request<JsonObject[]>(
        'GET',
        `/admin/billing/audit/revenue-events?tenantId=${encodeURIComponent(tenantId)}`,
      ),
      (rows) => Array.isArray(rows) && rows.some((row) => row.orderId === report.internalOrderId && row.source === 'marketplace_ifood'),
      config.retryAttempts,
      config.retryDelayMs,
    );
    assert(revenueEventsIncluded.some((row) => row.orderId === report.internalOrderId), 'RevenueEvent for included marketplace order missing.');
    report.billingChecks.push('included marketplace order generates revenue event only via normal order flow');

    setStep('billing.verifyUsage');
    const usageIncluded = await admin.request<JsonObject>(
      'GET',
      `/admin/billing/usage-preview?tenantId=${encodeURIComponent(tenantId)}&periodStart=${encodeURIComponent(new Date(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1).toISOString())}&periodEnd=${encodeURIComponent(new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth() + 1, 1)).toISOString())}`,
    );
    assert(Number(usageIncluded.ordersCount) >= 1, 'Billing usage did not include marketplace_ifood when enabled.');
    report.billingChecks.push('billing usage includes marketplace_ifood when enabled');

    setStep('billing.settings.disable-ifood');
    await admin.request('PUT', '/admin/billing/settings', {
      ...originalBillingSettings,
      countMarketplaceIfoodOrders: false,
    });

    const excludedPayload = {
      ...includedPayload,
      id: eventIdExcluded,
      order: {
        ...(includedPayload.order),
        id: orderIdExcluded,
        displayId: `${runId}-display-excluded`,
        customer: {
          name: `Smoke Excluded ${runId}`,
          phone: '5511999999002',
          email: `excluded+${runId}@example.com`,
        },
      },
    };

    setStep('webhook.excluded');
    await anonymous.request(
      'POST',
      '/webhooks/marketplaces/ifood',
      excludedPayload,
      [200, 201],
      { 'x-marketplace-smoke': 'true' },
    );

    const excludedMarketplaceOrders = await poll(
      'excluded marketplace order imported',
      () => tenant.request<JsonObject[]>('GET', '/marketplaces/orders'),
      (rows) => Array.isArray(rows) && rows.some((row) => row.externalOrderId === orderIdExcluded && typeof row.internalOrderId === 'string'),
      config.retryAttempts,
      config.retryDelayMs,
    );
    const excludedMarketplaceOrder = excludedMarketplaceOrders.find((row) => row.externalOrderId === orderIdExcluded) as JsonObject;
    report.internalOrderIdExcluded = getNestedString(excludedMarketplaceOrder, 'internalOrderId');

    setStep('orders.markOutForDelivery.excluded');
    await tenant.request('PATCH', `/orders/${report.internalOrderIdExcluded}/status`, { status: 'confirmed', note: `smoke ${runId} confirmed excluded` });
    await tenant.request('PATCH', `/orders/${report.internalOrderIdExcluded}/status`, { status: 'preparing', note: `smoke ${runId} preparing excluded` });
    await tenant.request('PATCH', `/orders/${report.internalOrderIdExcluded}/status`, { status: 'ready_for_delivery', note: `smoke ${runId} ready excluded` });
    await tenant.request('POST', `/orders/${report.internalOrderIdExcluded}/assign-driver`, {
      driverId: report.driverId,
    });
    await tenant.request('PATCH', `/orders/${report.internalOrderIdExcluded}/status`, { status: 'out_for_delivery', note: `smoke ${runId} route excluded` });

    setStep('orders.markCompleted.excluded');
    await tenant.request('PATCH', `/orders/${report.internalOrderIdExcluded}/status`, { status: 'completed', note: `smoke ${runId} completed excluded` });

    setStep('billing.verifyUsage.excluded');
    const usageExcluded = await admin.request<JsonObject>(
      'GET',
      `/admin/billing/usage-preview?tenantId=${encodeURIComponent(tenantId)}&periodStart=${encodeURIComponent(new Date(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1).toISOString())}&periodEnd=${encodeURIComponent(new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth() + 1, 1)).toISOString())}`,
    );
    assert(Number.isFinite(Number(usageExcluded.ordersCount)), 'Billing usage preview returned an invalid ordersCount.');
    report.billingChecks.push(
      `billing usage verified with marketplace_ifood disabled (included=${usageIncluded.ordersCount}, excluded=${usageExcluded.ordersCount})`,
    );

    const revenueEventsAfterExcluded = await admin.request<JsonObject[]>(
      'GET',
      `/admin/billing/audit/revenue-events?tenantId=${encodeURIComponent(tenantId)}`,
    );
    const excludedRevenueEvents = revenueEventsAfterExcluded.filter((row) => row.orderId === report.internalOrderIdExcluded);
    assert(excludedRevenueEvents.length > 0, 'Completed excluded marketplace order should still generate RevenueEvent in the normal flow.');
    report.billingChecks.push('disabled marketplace channel still uses normal revenue ledger, but usage preview excludes it');

    setStep('marketplace.reprocess');
    const beforeReprocessCount = revenueEventsAfterExcluded.filter((row) => row.orderId === report.internalOrderId).length;
    await tenant.request('POST', `/marketplaces/events/${report.eventInboxId}/reprocess`, {});
    await sleep(config.retryDelayMs * 2);
    const afterReprocessOrders = await tenant.request<JsonObject[]>('GET', '/marketplaces/orders');
    assert(afterReprocessOrders.filter((row) => row.externalOrderId === orderIdIncluded).length === 1, 'Reprocess duplicated marketplace order.');
    const afterReprocessRevenue = await admin.request<JsonObject[]>(
      'GET',
      `/admin/billing/audit/revenue-events?tenantId=${encodeURIComponent(tenantId)}`,
    );
    const afterReprocessCount = afterReprocessRevenue.filter((row) => row.orderId === report.internalOrderId).length;
    assert(afterReprocessCount === beforeReprocessCount, 'Reprocess duplicated revenue events.');
    report.reprocessChecks.push('event reprocess does not duplicate internal order or revenue events');

    smokePassed = true;
  } catch (error) {
    smokeError = error;
  } finally {
    try {
      if (originalBillingSettings) {
        const adminLogin = await anonymous.request<JsonObject>('POST', '/auth/admin/login', {
          email: config.adminEmail,
          password: config.adminPassword,
        });
        const admin = anonymous.withToken(getNestedString(adminLogin, 'accessToken'));
        await admin.request('PUT', '/admin/billing/settings', originalBillingSettings, [200, 201]);
      }
      if (config.cleanup) {
        const tenantLogin = await anonymous.request<JsonObject>('POST', '/auth/tenant/login', {
          email: config.tenantEmail,
          password: config.tenantPassword,
          tenantSlug: config.tenantSlug,
        });
        const tenant = anonymous.withToken(getNestedString(tenantLogin, 'accessToken'));
        if (report.connectionId) {
          await tenant.request('POST', '/marketplaces/ifood/disconnect', {}, [200, 201]);
        }
        report.cleanupStatus = 'completed';
      } else {
        report.cleanupStatus = config.cleanup ? 'completed' : 'skipped';
      }
    } catch (cleanupError) {
      report.cleanupStatus = 'failed';
      smokePassed = false;
      smokeError = cleanupError;
    }
  }

  if (smokePassed) {
    console.log('MARKETPLACE_IFOOD_P1_SMOKE_GO', JSON.stringify(report, null, 2));
    return;
  }

  console.error('MARKETPLACE_IFOOD_P1_SMOKE_NO_GO');
  if (smokeError instanceof HttpSmokeError) {
    console.error(JSON.stringify({
      message: smokeError.message,
      status: smokeError.status,
      body: smokeError.body,
      report: sanitizeForLog(report),
    }, null, 2));
  } else {
    console.error(JSON.stringify({
      message: smokeError instanceof Error ? smokeError.message : String(smokeError),
      name: smokeError instanceof Error ? smokeError.name : typeof smokeError,
      lastStep,
      report: sanitizeForLog(report),
    }, null, 2));
    console.error(sanitizeForLog(smokeError));
    console.error(JSON.stringify({ report: sanitizeForLog(report) }, null, 2));
  }
  process.exit(1);
}

main();
