import { PrismaClient } from '@prisma/client';

type JsonObject = Record<string, unknown>;

type SmokeConfig = {
  baseUrl: string;
  adminEmail: string;
  adminPassword: string;
  tenantOwnerEmail: string;
  tenantOwnerPassword: string;
  tenantPrefix: string;
  cleanup: boolean;
  requestTimeoutMs: number;
  runId: string;
  userAgent: string;
};

type SmokeReport = {
  baseUrl: string;
  runId: string;
  migrationChecks: string[];
  adminChecks: string[];
  tenantChecks: string[];
  impersonationChecks: string[];
  cleanupStatus: 'pending' | 'skipped' | 'completed' | 'failed';
  cleanupIds: string[];
  tenantId?: string;
  tenantSlug?: string;
  adminReuseFamilyId?: string;
  adminLogoutSessionId?: string;
  adminGlobalSessionIds: string[];
  tenantLogoutSessionId?: string;
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

function readPositiveIntEnv(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer.`);
  }
  return value;
}

function loadConfig(): SmokeConfig {
  const tenantPrefix = process.env.SMOKE_TENANT_PREFIX?.trim() || 'session-security-smoke';
  if (!/^[a-z0-9][a-z0-9-]{4,48}[a-z0-9]$/.test(tenantPrefix) || tenantPrefix.includes('--')) {
    throw new Error('SMOKE_TENANT_PREFIX must be 6-50 lowercase letters/numbers/hyphens.');
  }
  const runId = `${tenantPrefix}-${Date.now()}`;
  return {
    baseUrl: normalizeBaseUrl(requireEnv('SMOKE_API_BASE_URL')),
    adminEmail: requireEnv('SMOKE_ADMIN_EMAIL'),
    adminPassword: requireEnv('SMOKE_ADMIN_PASSWORD'),
    tenantOwnerEmail: requireEnv('SMOKE_TENANT_OWNER_EMAIL'),
    tenantOwnerPassword: requireEnv('SMOKE_TENANT_OWNER_PASSWORD'),
    tenantPrefix,
    cleanup: (process.env.SMOKE_CLEANUP ?? 'true').toLowerCase() !== 'false',
    requestTimeoutMs: readPositiveIntEnv('SMOKE_REQUEST_TIMEOUT_MS', 30000),
    runId,
    userAgent: `gestor-session-security-smoke/${runId}`,
  };
}

function uniqueOwnerEmail(email: string, suffix: string): string {
  const [local, domain] = email.split('@');
  if (!local || !domain) throw new Error('SMOKE_TENANT_OWNER_EMAIL must be a valid email.');
  return `${local}+${suffix.replace(/[^a-z0-9]/g, '')}@${domain}`.toLowerCase();
}

function unwrap<T = unknown>(body: unknown): T {
  if (body && typeof body === 'object' && 'success' in body && 'data' in body) {
    return (body as { data: T }).data;
  }
  return body as T;
}

function sanitizeForLog(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => sanitizeForLog(item));
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value as JsonObject).map(([key, entry]) => {
      if (/password|token|authorization|secret|credential/i.test(key)) return [key, '[REDACTED]'];
      return [key, sanitizeForLog(entry)];
    }),
  );
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function getString(value: unknown, label: string): string {
  assert(typeof value === 'string' && value.length > 0, `${label} must be a non-empty string.`);
  return value;
}

function getNestedString(value: unknown, path: string): string {
  let current: unknown = value;
  for (const key of path.split('.')) {
    assert(current && typeof current === 'object', `${path} is missing.`);
    current = (current as JsonObject)[key];
  }
  return getString(current, path);
}

function decodeJwtPayload(token: string): JsonObject {
  const [, payload] = token.split('.');
  assert(payload, 'JWT payload missing.');
  const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), '=');
  return JSON.parse(Buffer.from(padded, 'base64').toString('utf8')) as JsonObject;
}

class ApiClient {
  constructor(
    private readonly config: SmokeConfig,
    private readonly token?: string,
  ) {}

  withToken(token: string): ApiClient {
    return new ApiClient(this.config, token);
  }

  async request<T = unknown>(method: string, path: string, body?: unknown, expectedStatuses: number[] = [200, 201]): Promise<T> {
    const parsed = await this.fetchParsed(method, path, body, expectedStatuses);
    return unwrap<T>(parsed);
  }

  async expectStatus(method: string, path: string, expectedStatuses: number[], body?: unknown): Promise<unknown> {
    return this.fetchParsed(method, path, body, expectedStatuses);
  }

  private async fetchParsed(method: string, path: string, body: unknown, expectedStatuses: number[]): Promise<unknown> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.requestTimeoutMs);
    try {
      const res = await fetch(`${this.config.baseUrl}${path}`, {
        method,
        signal: controller.signal,
        headers: {
          accept: 'application/json',
          'user-agent': this.config.userAgent,
          ...(body === undefined ? {} : { 'content-type': 'application/json' }),
          ...(this.token ? { authorization: `Bearer ${this.token}` } : {}),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const raw = await res.text();
      const parsed = raw ? this.parseJson(raw) : null;
      if (expectedStatuses.includes(res.status)) return parsed;
      throw new HttpSmokeError(`${method} ${path} failed with HTTP ${res.status}`, res.status, sanitizeForLog(parsed));
    } finally {
      clearTimeout(timeout);
    }
  }

  private parseJson(raw: string): unknown {
    try {
      return JSON.parse(raw);
    } catch {
      return raw;
    }
  }
}

async function validateMigration(prisma: PrismaClient, report: SmokeReport): Promise<void> {
  await prisma.authSession.count();
  report.migrationChecks.push('AuthSession model/table reachable');
  await prisma.externalWebhookEvent.count();
  report.migrationChecks.push('ExternalWebhookEvent model/table reachable');
  const enumChecks = await prisma.$queryRaw<Array<{ typname: string }>>`
    SELECT typname
    FROM pg_type
    WHERE typname IN ('AuthSubjectType', 'AuthSessionStatus', 'WebhookEventStatus')
  `;
  const names = new Set(enumChecks.map((entry) => entry.typname));
  for (const name of ['AuthSubjectType', 'AuthSessionStatus', 'WebhookEventStatus']) {
    assert(names.has(name), `${name} enum missing in database.`);
  }
  report.migrationChecks.push('session/webhook enums reachable');
}

async function cleanup(config: SmokeConfig, report: SmokeReport): Promise<void> {
  const prisma = new PrismaClient();
  try {
    await prisma.authSession.deleteMany({ where: { userAgent: config.userAgent } });
    await prisma.externalWebhookEvent.deleteMany({ where: { provider: 'security-smoke', eventId: { contains: config.runId } } });
    if (report.tenantId) {
      const tenant = await prisma.tenant.findUnique({
        where: { id: report.tenantId },
        select: { id: true, slug: true, name: true },
      });
      if (tenant) {
        const safeBySlug = tenant.slug.startsWith(config.tenantPrefix);
        const safeByName = tenant.name.toLowerCase().startsWith(config.tenantPrefix);
        if (!safeBySlug && !safeByName) {
          throw new Error(`Refusing cleanup for non-smoke tenant ${tenant.id} (${tenant.slug}).`);
        }
        await prisma.tenant.delete({ where: { id: tenant.id } });
        report.cleanupIds.push(tenant.id);
      }
    }
    report.cleanupStatus = 'completed';
  } finally {
    await prisma.$disconnect();
  }
}

async function assertSessionStatus(sessionId: string, statuses: string[], label: string): Promise<void> {
  const prisma = new PrismaClient();
  try {
    const session = await prisma.authSession.findUnique({ where: { id: sessionId } });
    assert(session, `${label}: session ${sessionId} not found.`);
    assert(statuses.includes(session.status), `${label}: expected ${statuses.join('/')} got ${session.status}.`);
  } finally {
    await prisma.$disconnect();
  }
}

async function assertFamilyCompromised(familyId: string): Promise<void> {
  const prisma = new PrismaClient();
  try {
    const sessions = await prisma.authSession.findMany({ where: { refreshTokenFamilyId: familyId } });
    assert(sessions.length >= 1, 'reuse family not found.');
    assert(sessions.every((session) => ['compromised', 'revoked'].includes(session.status)), 'reuse family was not compromised/revoked.');
  } finally {
    await prisma.$disconnect();
  }
}

async function getSessionFamilyId(sessionId: string): Promise<string> {
  const prisma = new PrismaClient();
  try {
    const session = await prisma.authSession.findUnique({ where: { id: sessionId } });
    assert(session, `session ${sessionId} not found.`);
    return session.refreshTokenFamilyId;
  } finally {
    await prisma.$disconnect();
  }
}

async function main() {
  const config = loadConfig();
  const anonymous = new ApiClient(config);
  const report: SmokeReport = {
    baseUrl: config.baseUrl,
    runId: config.runId,
    migrationChecks: [],
    adminChecks: [],
    tenantChecks: [],
    impersonationChecks: [],
    cleanupStatus: config.cleanup ? 'pending' : 'skipped',
    cleanupIds: [],
    adminGlobalSessionIds: [],
  };
  let smokePassed = false;
  let smokeError: unknown;

  try {
    const prisma = new PrismaClient();
    try {
      await validateMigration(prisma, report);
    } finally {
      await prisma.$disconnect();
    }

    const adminLogin = await anonymous.request<JsonObject>('POST', '/auth/admin/login', {
      email: config.adminEmail,
      password: config.adminPassword,
    });
    const adminAccessToken = getNestedString(adminLogin, 'accessToken');
    const adminRefreshToken = getNestedString(adminLogin, 'refreshToken');
    const adminPayload = decodeJwtPayload(adminAccessToken);
    const adminSessionId = getString(adminPayload.sid, 'admin sid');
    const admin = anonymous.withToken(adminAccessToken);
    report.adminChecks.push('admin login returned accessToken and refreshToken');

    const sessions = await admin.request<JsonObject[]>('GET', '/auth/admin/sessions');
    assert(sessions.some((session) => session.id === adminSessionId), 'admin active session missing from /sessions.');
    report.adminChecks.push('admin sessions endpoint returned active session');

    const refreshed = await anonymous.request<JsonObject>('POST', '/auth/admin/refresh', { refreshToken: adminRefreshToken });
    const refreshedAccessToken = getNestedString(refreshed, 'accessToken');
    const refreshedRefreshToken = getNestedString(refreshed, 'refreshToken');
    assert(refreshedRefreshToken !== adminRefreshToken, 'admin refresh token was not rotated.');
    const refreshedPayload = decodeJwtPayload(refreshedAccessToken);
    const refreshedSessionId = getString(refreshedPayload.sid, 'refreshed admin sid');
    const refreshedFamilyId = await getSessionFamilyId(refreshedSessionId);
    report.adminReuseFamilyId = refreshedFamilyId;
    report.adminChecks.push('admin refresh returned rotated refreshToken');

    await anonymous.expectStatus('POST', '/auth/admin/refresh', [401, 403], { refreshToken: adminRefreshToken });
    await assertFamilyCompromised(refreshedFamilyId);
    report.adminChecks.push('admin refresh token reuse failed and family was compromised/revoked');
    await anonymous.withToken(refreshedAccessToken).expectStatus('GET', '/auth/admin/me', [401, 403]);
    report.adminChecks.push('access token from compromised refresh family rejected by sid validation');

    const adminLogoutLogin = await anonymous.request<JsonObject>('POST', '/auth/admin/login', {
      email: config.adminEmail,
      password: config.adminPassword,
    });
    const adminLogoutAccessToken = getNestedString(adminLogoutLogin, 'accessToken');
    report.adminLogoutSessionId = getString(decodeJwtPayload(adminLogoutAccessToken).sid, 'logout admin sid');
    await anonymous.withToken(adminLogoutAccessToken).request('POST', '/auth/admin/logout');
    await assertSessionStatus(report.adminLogoutSessionId, ['revoked'], 'admin logout');
    await anonymous.withToken(adminLogoutAccessToken).expectStatus('GET', '/auth/admin/me', [401, 403]);
    report.adminChecks.push('admin logout revoked current session and invalidated access token');

    const adminGlobalA = await anonymous.request<JsonObject>('POST', '/auth/admin/login', {
      email: config.adminEmail,
      password: config.adminPassword,
    });
    const adminGlobalB = await anonymous.request<JsonObject>('POST', '/auth/admin/login', {
      email: config.adminEmail,
      password: config.adminPassword,
    });
    const adminGlobalTokenA = getNestedString(adminGlobalA, 'accessToken');
    const adminGlobalTokenB = getNestedString(adminGlobalB, 'accessToken');
    report.adminGlobalSessionIds = [
      getString(decodeJwtPayload(adminGlobalTokenA).sid, 'admin global sid A'),
      getString(decodeJwtPayload(adminGlobalTokenB).sid, 'admin global sid B'),
    ];
    await anonymous.withToken(adminGlobalTokenA).request('POST', '/auth/admin/logout-global');
    await anonymous.withToken(adminGlobalTokenA).expectStatus('GET', '/auth/admin/me', [401, 403]);
    await anonymous.withToken(adminGlobalTokenB).expectStatus('GET', '/auth/admin/me', [401, 403]);
    for (const sessionId of report.adminGlobalSessionIds) {
      await assertSessionStatus(sessionId, ['revoked'], 'admin logout global');
    }
    report.adminChecks.push('admin logout global revoked both sessions');

    const tenantSuffix = config.runId.replace(/[^a-z0-9]/g, '');
    const ownerEmail = uniqueOwnerEmail(config.tenantOwnerEmail, tenantSuffix);
    const tenantRegistered = await anonymous.request<JsonObject>('POST', '/auth/tenant/register', {
      ownerName: 'Session Security Smoke',
      shopName: config.runId,
      phone: '11999999999',
      email: ownerEmail,
      password: config.tenantOwnerPassword,
    });
    const tenantAccessToken = getNestedString(tenantRegistered, 'accessToken');
    const tenantRefreshToken = getNestedString(tenantRegistered, 'refreshToken');
    report.tenantId = getNestedString(tenantRegistered, 'user.tenant.id');
    report.tenantSlug = getNestedString(tenantRegistered, 'user.tenant.slug');
    report.tenantChecks.push('tenant register returned accessToken and refreshToken');

    const tenantRefreshed = await anonymous.request<JsonObject>('POST', '/auth/tenant/refresh', { refreshToken: tenantRefreshToken });
    const tenantRefreshedAccessToken = getNestedString(tenantRefreshed, 'accessToken');
    const tenantRefreshedRefreshToken = getNestedString(tenantRefreshed, 'refreshToken');
    assert(tenantRefreshedRefreshToken !== tenantRefreshToken, 'tenant refresh token was not rotated.');
    report.tenantChecks.push('tenant refresh rotated refreshToken');

    report.tenantLogoutSessionId = getString(decodeJwtPayload(tenantRefreshedAccessToken).sid, 'tenant logout sid');
    await anonymous.withToken(tenantRefreshedAccessToken).request('POST', '/auth/tenant/logout');
    await assertSessionStatus(report.tenantLogoutSessionId, ['revoked'], 'tenant logout');
    await anonymous.withToken(tenantRefreshedAccessToken).expectStatus('GET', '/auth/tenant/me', [401, 403]);
    report.tenantChecks.push('tenant logout revoked current session and invalidated access token');

    const adminForImpersonation = await anonymous.request<JsonObject>('POST', '/auth/admin/login', {
      email: config.adminEmail,
      password: config.adminPassword,
    });
    const impersonation = await anonymous.withToken(getNestedString(adminForImpersonation, 'accessToken')).request<JsonObject>(
      'POST',
      '/auth/admin/impersonate',
      { tenantId: report.tenantId, reason: `session security smoke ${config.runId}` },
    );
    assert(typeof impersonation.accessToken === 'string', 'impersonation did not return accessToken.');
    assert(!('refreshToken' in impersonation), 'impersonation unexpectedly returned refreshToken.');
    report.impersonationChecks.push('impersonation remains access-token-only');

    smokePassed = true;
  } catch (error) {
    smokeError = error;
  } finally {
    if (config.cleanup) {
      try {
        await cleanup(config, report);
      } catch (cleanupError) {
        report.cleanupStatus = 'failed';
        smokePassed = false;
        smokeError = cleanupError;
      }
    }
  }

  if (smokePassed) {
    console.log('SESSION_SECURITY_HTTP_SMOKE_GO', JSON.stringify(report, null, 2));
    return;
  }

  console.error('SESSION_SECURITY_HTTP_SMOKE_NO_GO');
  if (smokeError instanceof HttpSmokeError) {
    console.error(JSON.stringify({ message: smokeError.message, status: smokeError.status, body: smokeError.body, report: sanitizeForLog(report) }, null, 2));
  } else {
    console.error(sanitizeForLog(smokeError));
    console.error(JSON.stringify({ report: sanitizeForLog(report) }, null, 2));
  }
  process.exit(1);
}

main();
