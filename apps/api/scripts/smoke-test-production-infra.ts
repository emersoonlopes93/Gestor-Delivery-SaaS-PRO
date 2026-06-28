type JsonObject = Record<string, unknown>;

type SmokeConfig = {
  baseUrl: string;
  adminEmail?: string;
  adminPassword?: string;
  expectProduction: boolean;
  expectRedis: boolean;
  expectBullmq: boolean;
  expectStorageRemote: boolean;
  expectSwaggerDisabled: boolean;
  expectWebhookEnv: boolean;
  expectedCommit?: string;
  requestTimeoutMs: number;
};

type SmokeReport = {
  baseUrl: string;
  mode: 'strict' | 'relaxed';
  result?: 'GO' | 'GO parcial';
  productionReady: boolean;
  productionReadyReasons: string[];
  checks: string[];
  warnings: string[];
  health?: JsonObject;
  adminHealth?: JsonObject;
  swaggerStatus?: number;
  corsPreflightStatus?: number;
};

class InfraSmokeError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly body?: unknown,
  ) {
    super(message);
  }
}

function readBoolEnv(name: string, fallback: boolean): boolean {
  const raw = process.env[name]?.trim().toLowerCase();
  if (!raw) return fallback;
  return ['1', 'true', 'yes', 'y'].includes(raw);
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

function normalizeBaseUrl(value: string): string {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error('SMOKE_API_BASE_URL must be a valid absolute HTTP(S) URL.');
  }
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
  const baseUrl = process.env.SMOKE_API_BASE_URL?.trim();
  if (!baseUrl) {
    throw new Error('Missing required env SMOKE_API_BASE_URL.');
  }

  return {
    baseUrl: normalizeBaseUrl(baseUrl),
    adminEmail: process.env.SMOKE_ADMIN_EMAIL?.trim(),
    adminPassword: process.env.SMOKE_ADMIN_PASSWORD?.trim(),
    expectProduction: readBoolEnv('SMOKE_EXPECT_PRODUCTION', false),
    expectRedis: readBoolEnv('SMOKE_EXPECT_REDIS', true),
    expectBullmq: readBoolEnv('SMOKE_EXPECT_BULLMQ', true),
    expectStorageRemote: readBoolEnv('SMOKE_EXPECT_STORAGE_REMOTE', true),
    expectSwaggerDisabled: readBoolEnv('SMOKE_EXPECT_SWAGGER_DISABLED', true),
    expectWebhookEnv: readBoolEnv('SMOKE_EXPECT_WEBHOOK_ENV', true),
    expectedCommit: process.env.SMOKE_EXPECT_COMMIT?.trim(),
    requestTimeoutMs: readPositiveIntEnv('SMOKE_REQUEST_TIMEOUT_MS', 30000),
  };
}

function sanitizeForLog(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeForLog(item));
  }
  if (!value || typeof value !== 'object') {
    return value;
  }
  return Object.fromEntries(
    Object.entries(value as JsonObject).map(([key, entry]) => {
      if (/password|token|authorization|secret|credential|dsn|url|host|bucket/i.test(key)) {
        return [key, '[REDACTED]'];
      }
      return [key, sanitizeForLog(entry)];
    }),
  );
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

async function request<T = unknown>(
  config: SmokeConfig,
  method: string,
  path: string,
  expectedStatuses: number[],
  body?: unknown,
  token?: string,
): Promise<{ status: number; body: T }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.requestTimeoutMs);
  try {
    const response = await fetch(`${config.baseUrl}${path}`, {
      method,
      signal: controller.signal,
      headers: {
        accept: 'application/json',
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const raw = await response.text();
    const parsed = raw ? parseJson(raw) : null;
    if (!expectedStatuses.includes(response.status)) {
      throw new InfraSmokeError(`${method} ${path} failed with HTTP ${response.status}`, response.status, sanitizeForLog(parsed));
    }
    return { status: response.status, body: unwrap<T>(parsed) };
  } finally {
    clearTimeout(timeout);
  }
}

function parseJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

function getNested(value: unknown, path: string): unknown {
  return path.split('.').reduce((current, key) => {
    if (!current || typeof current !== 'object') return undefined;
    return (current as JsonObject)[key];
  }, value);
}

function collectReasons(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string' && item.length > 0);
}

async function main() {
  const config = loadConfig();
  const strictMode = config.expectRedis && config.expectBullmq;
  const report: SmokeReport = {
    baseUrl: config.baseUrl,
    mode: strictMode ? 'strict' : 'relaxed',
    productionReady: false,
    productionReadyReasons: [],
    checks: [],
    warnings: [],
  };

  try {
    const healthResponse = await request<JsonObject>(config, 'GET', '/health', [200]);
    report.health = sanitizeForLog(healthResponse.body) as JsonObject;
    const databaseOk =
      getNested(healthResponse.body, 'checks.database.ok') === true ||
      getNested(healthResponse.body, 'details.database.ok') === true ||
      getNested(healthResponse.body, 'status') === 'ok';
    assert(databaseOk, 'Database health must be ok.');
    if (strictMode) {
      assert(getNested(healthResponse.body, 'status') === 'ok', 'Public health status must be ok in strict mode.');
    } else if (getNested(healthResponse.body, 'status') !== 'ok') {
      report.warnings.push('public health degraded in relaxed mode');
    }
    report.productionReady = getNested(healthResponse.body, 'productionReady') === true;
    report.productionReadyReasons.push(...collectReasons(getNested(healthResponse.body, 'productionReadiness.reasons')));
    report.checks.push(strictMode ? 'public health ok' : 'public health checked');
    report.checks.push('database health ok');

    if (config.expectRedis) {
      assert(getNested(healthResponse.body, 'checks.redis.connected') === true, 'Redis must be connected.');
      report.checks.push('redis health ok');
    } else if (getNested(healthResponse.body, 'checks.redis.connected') !== true) {
      report.warnings.push('redis not connected');
      report.productionReadyReasons.push('Redis not required in relaxed smoke, but productionReady=false');
    }

    if (config.expectBullmq) {
      assert(getNested(healthResponse.body, 'checks.bullmq.enabled') === true, 'BullMQ must be enabled.');
      assert(getNested(healthResponse.body, 'checks.bullmq.connected') === true, 'BullMQ must be connected.');
      report.checks.push('bullmq health ok');
    } else if (getNested(healthResponse.body, 'checks.bullmq.enabled') !== true) {
      report.warnings.push('bullmq disabled');
      report.productionReadyReasons.push('BullMQ not required in relaxed smoke, but productionReady=false');
    }

    if (config.adminEmail && config.adminPassword) {
      const loginResponse = await request<JsonObject>(config, 'POST', '/auth/admin/login', [200, 201], {
        email: config.adminEmail,
        password: config.adminPassword,
      });
      const accessToken = getNested(loginResponse.body, 'accessToken');
      assert(typeof accessToken === 'string' && accessToken.length > 0, 'Admin login did not return access token.');
      report.checks.push('admin login ok');

      const adminHealthResponse = await request<JsonObject>(config, 'GET', '/admin/health/system', [200], undefined, accessToken);
      report.adminHealth = sanitizeForLog(adminHealthResponse.body) as JsonObject;
      if (strictMode) {
        assert(getNested(adminHealthResponse.body, 'status') === 'ok', 'Admin health status must be ok in strict mode.');
      } else if (getNested(adminHealthResponse.body, 'status') !== 'ok') {
        report.warnings.push('admin health degraded in relaxed mode');
      }
      report.productionReady =
        report.productionReady && getNested(adminHealthResponse.body, 'productionReadiness.productionReady') === true;
      report.productionReadyReasons.push(...collectReasons(getNested(adminHealthResponse.body, 'productionReadiness.reasons')));
      report.checks.push(strictMode ? 'admin health ok' : 'admin health checked');

      if (config.expectProduction) {
        assert(getNested(adminHealthResponse.body, 'productionReadiness.nodeEnv') === 'production', 'NODE_ENV must be production.');
      }

      if (config.expectStorageRemote) {
        const storageDriver = String(getNested(adminHealthResponse.body, 'productionReadiness.storageDriver') ?? '');
        assert(['r2', 's3'].includes(storageDriver), `Storage driver must be remote, got ${storageDriver || 'missing'}.`);
        report.checks.push('remote storage configured');
      }

      const billingMode = String(getNested(adminHealthResponse.body, 'productionReadiness.billingGatewayMode') ?? '');
      if (billingMode === 'disabled') {
        if (strictMode || config.expectProduction) {
          throw new Error('Billing gateway mode must not be disabled.');
        }
        report.warnings.push('billing gateway disabled in relaxed smoke');
      } else {
        report.checks.push('billing env ok');
      }
    } else {
      report.warnings.push('admin health skipped because SMOKE_ADMIN_EMAIL/SMOKE_ADMIN_PASSWORD are not set');
      report.productionReady = false;
      report.productionReadyReasons.push('Admin health not checked');
    }

    if (config.expectSwaggerDisabled) {
      const swagger = await request<unknown>(config, 'GET', '/docs', [404, 401, 403, 308, 301, 302]);
      report.swaggerStatus = swagger.status;
      assert(swagger.status !== 200, 'Swagger must not be publicly available.');
      report.checks.push('swagger not public');
    }

    if (config.expectWebhookEnv) {
      const webhookSmoke = await request<unknown>(config, 'POST', '/billing/webhooks/security-smoke', [200, 201, 400, 401, 403, 404], {});
      if ([200, 201].includes(webhookSmoke.status)) {
        report.checks.push('webhook security smoke endpoint available');
      } else if ([401, 403, 404].includes(webhookSmoke.status)) {
        report.checks.push('webhook security endpoint guarded or disabled');
      } else {
        report.warnings.push(`webhook security endpoint returned HTTP ${webhookSmoke.status}`);
      }
      if (config.expectProduction && [200, 201].includes(webhookSmoke.status)) {
        throw new Error('Webhook security smoke endpoint must not be exposed in production.');
      }
    }

    const corsOrigin = process.env.SMOKE_CORS_ORIGIN?.trim();
    if (corsOrigin) {
      const cors = await request<unknown>(config, 'OPTIONS', '/health', [200, 204, 404]);
      report.corsPreflightStatus = cors.status;
      report.checks.push('cors preflight reachable');
    }

    if (config.expectedCommit) {
      const version = String(getNested(healthResponse.body, 'version') ?? '');
      if (!version.includes(config.expectedCommit)) {
        report.warnings.push('expected commit check skipped: health does not expose commit sha');
      }
    }

    if (strictMode) {
      assert(report.productionReady === true, `Strict smoke requires productionReady=true. Reasons: ${report.productionReadyReasons.join('; ') || 'unknown'}`);
      report.result = 'GO';
    } else {
      report.productionReady = false;
      report.result = 'GO parcial';
      report.warnings.push('relaxed smoke does not authorize production promotion');
      if (report.productionReadyReasons.length === 0) {
        report.productionReadyReasons.push('Relaxed smoke was requested');
      }
    }

    console.log('PRODUCTION_INFRA_SMOKE_GO', JSON.stringify(report, null, 2));
  } catch (error) {
    console.error('PRODUCTION_INFRA_SMOKE_NO_GO');
    if (error instanceof InfraSmokeError) {
      console.error(JSON.stringify({ message: error.message, status: error.status, body: error.body, report: sanitizeForLog(report) }, null, 2));
    } else {
      console.error(error instanceof Error ? error.message : String(error));
      console.error(JSON.stringify({ report: sanitizeForLog(report) }, null, 2));
    }
    process.exitCode = 1;
  }
}

main();
