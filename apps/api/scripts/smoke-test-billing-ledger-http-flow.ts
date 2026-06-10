import { PrismaClient } from '@prisma/client';

type JsonObject = Record<string, unknown>;

type SmokeConfig = {
  baseUrl: string;
  adminEmail: string;
  adminPassword: string;
  tenantOwnerEmail: string;
  tenantOwnerPassword: string;
  cleanup: boolean;
  tenantPrefix: string;
};

type SmokeReport = {
  baseUrl: string;
  cleanup: boolean;
  tenantId?: string;
  tenantSlug?: string;
  ownerEmail?: string;
  categoryId?: string;
  productId?: string;
  orderId?: string;
  subscriptionId?: string;
  planId?: string;
  cycleId?: string;
  revenueEventId?: string;
  snapshotId?: string;
  invoiceId?: string;
  paymentAttemptId?: string;
  historyIds: string[];
  authChecks: string[];
  rbacChecks: string[];
  tenantContextChecks: string[];
  auditChecks: string[];
  cleanupIds: string[];
  healthStatus?: string;
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
  if (!value) {
    throw new Error(`Missing required env ${name}.`);
  }
  return value;
}

function loadConfig(): SmokeConfig {
  const tenantPrefix = process.env.SMOKE_TENANT_PREFIX?.trim() || 'billing-ledger-http-smoke';
  if (!/^[a-z0-9-]+$/.test(tenantPrefix)) {
    throw new Error('SMOKE_TENANT_PREFIX must contain only lowercase letters, numbers and hyphens.');
  }

  return {
    baseUrl: requireEnv('SMOKE_API_BASE_URL').replace(/\/$/, ''),
    adminEmail: requireEnv('SMOKE_ADMIN_EMAIL'),
    adminPassword: requireEnv('SMOKE_ADMIN_PASSWORD'),
    tenantOwnerEmail: requireEnv('SMOKE_TENANT_OWNER_EMAIL'),
    tenantOwnerPassword: requireEnv('SMOKE_TENANT_OWNER_PASSWORD'),
    cleanup: (process.env.SMOKE_CLEANUP ?? 'true').toLowerCase() !== 'false',
    tenantPrefix,
  };
}

function uniqueOwnerEmail(email: string, suffix: string): string {
  const [local, domain] = email.split('@');
  if (!local || !domain) {
    throw new Error('SMOKE_TENANT_OWNER_EMAIL must be a valid email address.');
  }
  const sanitizedSuffix = suffix.replace(/[^a-z0-9]/g, '');
  return `${local}+${sanitizedSuffix}@${domain}`.toLowerCase();
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

function assertEquals<T>(actual: T, expected: T, label: string): void {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, got ${String(actual)}`);
  }
}

function idOf(value: unknown, label: string): string {
  assert(value && typeof value === 'object', `${label} must be an object.`);
  const id = (value as { id?: unknown }).id;
  assert(typeof id === 'string' && id.length > 0, `${label}.id is required.`);
  return id;
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

class ApiClient {
  constructor(private readonly baseUrl: string, private readonly token?: string) {}

  withToken(token: string): ApiClient {
    return new ApiClient(this.baseUrl, token);
  }

  async request<T = unknown>(
    method: string,
    path: string,
    body?: unknown,
    expectedStatuses = [200, 201],
  ): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: {
        accept: 'application/json',
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        ...(this.token ? { authorization: `Bearer ${this.token}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const raw = await res.text();
    const parsed = raw ? this.parseJson(raw) : null;
    if (!expectedStatuses.includes(res.status)) {
      throw new HttpSmokeError(`${method} ${path} failed with HTTP ${res.status}`, res.status, parsed);
    }
    return unwrap<T>(parsed);
  }

  async expectStatus(method: string, path: string, expectedStatuses: number[], body?: unknown): Promise<number> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: {
        accept: 'application/json',
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        ...(this.token ? { authorization: `Bearer ${this.token}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!expectedStatuses.includes(res.status)) {
      const raw = await res.text();
      throw new HttpSmokeError(
        `${method} ${path} expected ${expectedStatuses.join('/')} but got HTTP ${res.status}`,
        res.status,
        raw ? this.parseJson(raw) : null,
      );
    }
    return res.status;
  }

  private parseJson(raw: string): unknown {
    try {
      return JSON.parse(raw);
    } catch {
      return raw;
    }
  }
}

async function cleanupTenant(tenantId: string | undefined, tenantPrefix: string): Promise<string[]> {
  if (!tenantId) return [];
  const prisma = new PrismaClient();
  try {
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { id: true, slug: true, name: true },
    });
    if (!tenant) return [];
    const safeBySlug = tenant.slug.startsWith(tenantPrefix);
    const safeByName = tenant.name.toLowerCase().startsWith(tenantPrefix);
    if (!safeBySlug && !safeByName) {
      throw new Error(`Refusing cleanup for non-smoke tenant ${tenant.id} (${tenant.slug}).`);
    }
    await prisma.tenant.delete({ where: { id: tenant.id } });
    return [tenant.id];
  } finally {
    await prisma.$disconnect();
  }
}

async function main() {
  const config = loadConfig();
  const suffix = `${Date.now()}`;
  const shopName = `${config.tenantPrefix}-${suffix}`;
  const ownerEmail = uniqueOwnerEmail(config.tenantOwnerEmail, suffix);
  const anonymous = new ApiClient(config.baseUrl);
  const report: SmokeReport = {
    baseUrl: config.baseUrl,
    cleanup: config.cleanup,
    ownerEmail,
    historyIds: [],
    authChecks: [],
    rbacChecks: [],
    tenantContextChecks: [],
    auditChecks: [],
    cleanupIds: [],
  };

  try {
    await anonymous.expectStatus('GET', '/admin/billing/audit/revenue-events?tenantId=missing', [401, 403]);
    report.authChecks.push('admin audit endpoint rejects missing token');

    const adminLogin = await anonymous.request<JsonObject>('POST', '/auth/admin/login', {
      email: config.adminEmail,
      password: config.adminPassword,
    });
    const adminToken = getNestedString(adminLogin, 'accessToken');
    const admin = anonymous.withToken(adminToken);
    report.authChecks.push('admin login ok');

    const registered = await anonymous.request<JsonObject>('POST', '/auth/tenant/register', {
      ownerName: 'Billing Ledger HTTP Smoke',
      shopName,
      phone: '11999999999',
      email: ownerEmail,
      password: config.tenantOwnerPassword,
    });
    const tenantTokenFromRegister = getNestedString(registered, 'accessToken');
    const tenantId = getNestedString(registered, 'user.tenant.id');
    const tenantSlug = getNestedString(registered, 'user.tenant.slug');
    report.tenantId = tenantId;
    report.tenantSlug = tenantSlug;
    report.authChecks.push('tenant register returned tenant token');

    await anonymous.withToken(tenantTokenFromRegister).expectStatus('GET', '/admin/health/system', [401, 403]);
    report.rbacChecks.push('tenant token cannot access admin health');

    const tenantLogin = await anonymous.request<JsonObject>('POST', '/auth/tenant/login', {
      email: ownerEmail,
      password: config.tenantOwnerPassword,
      tenantSlug,
    });
    const tenantToken = getNestedString(tenantLogin, 'accessToken');
    const tenant = anonymous.withToken(tenantToken);
    report.authChecks.push('tenant login ok');

    const plans = await admin.request<JsonObject[]>('GET', '/admin/billing/plans-v2');
    const plan = plans.find((item) => item.slug === 'revenue-growth') ?? plans.find((item) => item.isActive);
    assert(plan, 'No active billing plan found.');
    report.planId = idOf(plan, 'billingPlan');

    const billingSubscriptionResponse = await admin.request<JsonObject>(
      'POST',
      `/admin/billing/tenants/${tenantId}/subscription`,
      { billingPlanId: report.planId },
    );
    const subscription = billingSubscriptionResponse.subscription as JsonObject | null;
    assert(subscription, 'Tenant billing subscription missing.');
    report.subscriptionId = idOf(subscription, 'subscription');
    assertEquals(subscription.tenantId, tenantId, 'subscription.tenantId');
    report.tenantContextChecks.push('subscription tenantId ok');

    await tenant.request('PATCH', '/tenant/settings', {
      businessPhone: '11999999999',
      street: 'Rua Smoke HTTP',
      number: '100',
      neighborhood: 'Centro',
      city: 'Sao Paulo',
      state: 'SP',
      zipCode: '01000-000',
      pixKey: 'smoke-pix-key',
      paymentMethods: ['cash'],
    });
    await tenant.request('PATCH', '/tenant/operating-hours', {
      hours: Array.from({ length: 7 }, (_, dayOfWeek) => ({
        dayOfWeek,
        isOpen: true,
        openTime: '00:00',
        closeTime: '23:59',
      })),
    });
    await tenant.request('PUT', '/delivery/coverage', {
      storeLat: -23.55052,
      storeLng: -46.633308,
      maxRadiusKm: 15,
      defaultPricePerKm: 0,
      minimumFee: 0,
      maximumFee: 0,
      isDeliveryEnabled: true,
    });

    const category = await tenant.request<JsonObject>('POST', '/catalog/categories', {
      name: `Smoke Categoria ${suffix}`,
      isActive: true,
    });
    report.categoryId = idOf(category, 'category');
    const product = await tenant.request<JsonObject>('POST', '/catalog/products', {
      name: `Smoke Produto ${suffix}`,
      categoryId: report.categoryId,
      type: 'simple',
      basePrice: 2000,
      isActive: true,
      isAvailable: true,
      sellableOnline: true,
    });
    report.productId = idOf(product, 'product');

    const order = await anonymous.request<JsonObject>('POST', `/orders/public-checkout/${tenantSlug}`, {
      idempotencyKey: `billing-ledger-http-smoke-${suffix}`,
      items: [
        {
          lineType: 'product',
          productId: report.productId,
          quantity: 1,
        },
      ],
      customerName: 'Cliente Smoke HTTP',
      customerPhone: '11988887777',
      fulfillmentType: 'pickup',
      payment: { method: 'cash', changeFor: 2000 },
      sourceChannel: 'storefront',
    });
    report.orderId = idOf(order, 'order');

    for (const status of ['confirmed', 'preparing', 'ready_for_pickup', 'completed']) {
      const updated = await tenant.request<JsonObject>('PATCH', `/orders/${report.orderId}/status`, {
        status,
        note: `billing ledger http smoke ${status}`,
      });
      assertEquals(updated.tenantId, tenantId, `order tenantId after ${status}`);
    }
    report.tenantContextChecks.push('order tenantId ok');

    const periodStart = new Date();
    periodStart.setUTCDate(1);
    periodStart.setUTCHours(0, 0, 0, 0);
    const periodEnd = new Date(Date.UTC(periodStart.getUTCFullYear(), periodStart.getUTCMonth() + 1, 1, 0, 0, 0, 0));

    const auditEvents = await admin.request<JsonObject[]>(
      'GET',
      `/admin/billing/audit/revenue-events?tenantId=${tenantId}&periodStart=${encodeURIComponent(periodStart.toISOString())}&periodEnd=${encodeURIComponent(periodEnd.toISOString())}`,
    );
    const completedEvent = auditEvents.find((event) => event.orderId === report.orderId && event.type === 'order_completed');
    assert(completedEvent, 'order_completed revenue_event not found via admin audit HTTP.');
    report.revenueEventId = idOf(completedEvent, 'revenueEvent');
    assertEquals(completedEvent.tenantId, tenantId, 'revenueEvent.tenantId');
    report.tenantContextChecks.push('revenue_event tenantId ok');
    report.auditChecks.push('revenue events audit ok');

    const currentCycle = await admin.request<JsonObject>('POST', '/admin/billing/cycles/current', {
      tenantId,
      subscriptionId: report.subscriptionId,
    });
    report.cycleId = idOf(currentCycle, 'cycle');

    const closeResult = await admin.request<JsonObject>('POST', `/admin/billing/cycles/${report.cycleId}/close-and-draft-invoice`, {
      tenantId,
      subscriptionId: report.subscriptionId,
      planId: report.planId,
    });
    report.snapshotId = getNestedString(closeResult, 'usageSnapshotId');
    report.invoiceId = getNestedString(closeResult, 'invoice.id');

    const snapshots = await admin.request<JsonObject[]>('GET', `/admin/billing/audit/snapshots?tenantId=${tenantId}`);
    const snapshot = snapshots.find((item) => item.id === report.snapshotId);
    assert(snapshot, 'Snapshot not found via admin audit HTTP.');
    assertEquals(snapshot.tenantId, tenantId, 'snapshot.tenantId');
    assertEquals(snapshot.source, 'ledger', 'snapshot.source');
    assert(snapshot.billingRuleVersionId, 'snapshot.billingRuleVersionId missing.');
    assert(Array.isArray(snapshot.invoices) && snapshot.invoices.some((invoice: JsonObject) => invoice.id === report.invoiceId), 'snapshot invoice relation missing.');
    report.tenantContextChecks.push('snapshot tenantId ok');
    report.auditChecks.push('snapshot audit ok');

    const invoiceDetails = await admin.request<JsonObject>('GET', `/admin/billing/invoices/${report.invoiceId}`);
    const invoice = invoiceDetails.invoice as JsonObject;
    assert(invoice, 'Invoice details missing invoice.');
    assertEquals(invoice.tenantId, tenantId, 'invoice.tenantId');
    assertEquals(invoice.usageSnapshotId, report.snapshotId, 'invoice.usageSnapshotId');
    assertEquals(invoice.billingRuleVersionId, snapshot.billingRuleVersionId, 'invoice.billingRuleVersionId');
    report.tenantContextChecks.push('invoice tenantId ok');
    report.auditChecks.push('invoice detail ok');

    await admin.request<JsonObject>('PATCH', `/admin/tenants/${tenantId}/status`, {
      status: 'suspended',
    });
    await tenant.expectStatus('GET', '/orders', [403]);
    report.rbacChecks.push('suspended tenant cannot access operational orders route');

    const paymentConfig = await admin.request<JsonObject>('GET', '/admin/billing/payment-config');
    assert(paymentConfig.paymentsEnabled === true, 'Billing payments must be enabled on target API for HTTP smoke.');
    const provider = String(paymentConfig.provider);
    const mode = String(paymentConfig.mode);
    assert(['manual', 'mock', 'asaas'].includes(provider), `Unsupported provider for smoke: ${provider}`);
    assert(['manual', 'sandbox', 'production'].includes(mode), `Unsupported billing mode for smoke: ${mode}`);

    const attempt = await admin.request<JsonObject>('POST', `/admin/billing/invoices/${report.invoiceId}/payment-attempts`, {
      tenantId,
      provider,
      mode,
      idempotencyKey: `billing-ledger-http-smoke:${report.invoiceId}`,
      simulate: provider === 'mock' ? 'pending' : undefined,
    });
    report.paymentAttemptId = idOf(attempt, 'paymentAttempt');
    assertEquals(attempt.tenantId, tenantId, 'paymentAttempt.tenantId');
    report.tenantContextChecks.push('payment attempt tenantId ok');

    await admin.request<JsonObject>('POST', `/admin/billing/payment-attempts/${report.paymentAttemptId}/mark-paid`, {
      reason: 'billing_ledger_http_smoke_confirmed',
    });

    const tenantAfterPayment = await admin.request<JsonObject>('GET', `/admin/billing/tenants/${tenantId}/subscription`);
    const subscriptionAfterPayment = tenantAfterPayment.subscription as JsonObject;
    assertEquals(subscriptionAfterPayment.status, 'active', 'subscription after payment');

    const history = await admin.request<JsonObject[]>('GET', `/admin/billing/audit/subscription-history?tenantId=${tenantId}`);
    assert(history.some((entry) => entry.reason === 'subscription_created'), 'subscription_created history missing.');
    assert(history.some((entry) => entry.reason === 'admin_suspended_tenant'), 'admin_suspended_tenant history missing.');
    assert(history.some((entry) => entry.reason === 'payment_confirmed'), 'payment_confirmed history missing.');
    report.historyIds = history.map((entry) => idOf(entry, 'history'));
    assert(history.every((entry) => entry.tenantId === tenantId), 'history tenantId mismatch.');
    report.tenantContextChecks.push('subscription history tenantId ok');
    report.auditChecks.push('subscription history audit ok');

    await anonymous.withToken(tenantToken).expectStatus('GET', `/admin/billing/audit/revenue-events?tenantId=${tenantId}`, [401, 403]);
    report.rbacChecks.push('tenant token cannot access billing audit');

    const health = await admin.request<JsonObject>('GET', '/admin/health/system');
    report.healthStatus = String(health.status);
    assertEquals(health.status, 'ok', 'admin health status');
    report.auditChecks.push('admin health ok');

    if (config.cleanup) {
      report.cleanupIds = await cleanupTenant(report.tenantId, config.tenantPrefix);
    }

    console.log('BILLING_LEDGER_HTTP_SMOKE_GO', JSON.stringify(report, null, 2));
  } catch (error) {
    if (config.cleanup && report.tenantId) {
      try {
        report.cleanupIds = await cleanupTenant(report.tenantId, config.tenantPrefix);
      } catch (cleanupError) {
        console.error('Cleanup failed:', cleanupError);
      }
    }
    console.error('BILLING_LEDGER_HTTP_SMOKE_NO_GO');
    if (error instanceof HttpSmokeError) {
      console.error(JSON.stringify({ message: error.message, status: error.status, body: error.body, report }, null, 2));
    } else {
      console.error(error);
      console.error(JSON.stringify({ report }, null, 2));
    }
    process.exit(1);
  }
}

main();
