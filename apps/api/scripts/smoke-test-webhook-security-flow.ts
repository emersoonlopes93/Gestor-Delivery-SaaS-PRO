import { createHmac } from 'crypto';
import { PrismaClient } from '@prisma/client';

type JsonObject = Record<string, unknown>;

type SmokeConfig = {
  baseUrl: string;
  hmacSecret: string;
  replayWindowSeconds: number;
  requestTimeoutMs: number;
  runId: string;
};

type SmokeReport = {
  baseUrl: string;
  runId: string;
  rejectedChecks: string[];
  acceptedChecks: string[];
  idempotencyChecks: string[];
  dbChecks: string[];
  cleanupStatus: 'pending' | 'completed' | 'failed';
  eventId?: string;
  dbEventId?: string;
  dbEventStatus?: string;
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
  return {
    baseUrl: normalizeBaseUrl(requireEnv('SMOKE_API_BASE_URL')),
    hmacSecret: requireEnv('ASAAS_WEBHOOK_HMAC_SECRET'),
    replayWindowSeconds: readPositiveIntEnv('WEBHOOK_REPLAY_WINDOW_SECONDS', 300),
    requestTimeoutMs: readPositiveIntEnv('SMOKE_REQUEST_TIMEOUT_MS', 30000),
    runId: `webhook-security-smoke-${Date.now()}`,
  };
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
      if (/password|token|authorization|secret|credential|payload|signature/i.test(key)) {
        return [key, '[REDACTED]'];
      }
      return [key, sanitizeForLog(entry)];
    }),
  );
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function sign(secret: string, timestamp: string, rawBody: string): string {
  return createHmac('sha256', secret)
    .update(`${timestamp}.`)
    .update(Buffer.from(rawBody))
    .digest('hex');
}

class WebhookClient {
  constructor(private readonly config: SmokeConfig) {}

  async postRaw(rawBody: string, headers: Record<string, string>, expectedStatuses: number[]): Promise<unknown> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.requestTimeoutMs);
    try {
      const res = await fetch(`${this.config.baseUrl}/billing/webhooks/security-smoke`, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          accept: 'application/json',
          'content-type': 'application/json',
          'user-agent': `gestor-webhook-security-smoke/${this.config.runId}`,
          ...headers,
        },
        body: rawBody,
      });
      const text = await res.text();
      const parsed = text ? this.parseJson(text) : null;
      if (expectedStatuses.includes(res.status)) return unwrap(parsed);
      throw new HttpSmokeError(`POST /billing/webhooks/security-smoke failed with HTTP ${res.status}`, res.status, sanitizeForLog(parsed));
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

async function validateDbEvent(eventId: string): Promise<{ id: string; status: string; attempts: number; payloadHash: string }> {
  const prisma = new PrismaClient();
  try {
    const event = await prisma.externalWebhookEvent.findUnique({
      where: { provider_eventId: { provider: 'security-smoke', eventId } },
    });
    assert(event, `ExternalWebhookEvent not found for ${eventId}.`);
    return {
      id: event.id,
      status: event.status,
      attempts: event.attempts,
      payloadHash: event.payloadHash,
    };
  } finally {
    await prisma.$disconnect();
  }
}

async function cleanup(eventId: string | undefined): Promise<void> {
  if (!eventId) return;
  const prisma = new PrismaClient();
  try {
    await prisma.externalWebhookEvent.deleteMany({
      where: {
        provider: 'security-smoke',
        eventId,
      },
    });
  } finally {
    await prisma.$disconnect();
  }
}

async function main() {
  const config = loadConfig();
  const client = new WebhookClient(config);
  const eventId = `${config.runId}-event-1`;
  const report: SmokeReport = {
    baseUrl: config.baseUrl,
    runId: config.runId,
    rejectedChecks: [],
    acceptedChecks: [],
    idempotencyChecks: [],
    dbChecks: [],
    cleanupStatus: 'pending',
    eventId,
  };
  let smokePassed = false;
  let smokeError: unknown;

  const payload = {
    id: eventId,
    event: 'WEBHOOK_SECURITY_SMOKE',
    sensitive: 'this-value-must-not-be-printed',
  };
  const rawBody = JSON.stringify(payload);

  try {
    const now = Math.floor(Date.now() / 1000).toString();

    await client.postRaw(rawBody, { 'x-webhook-timestamp': now, 'x-webhook-id': `${eventId}-missing-signature` }, [401, 403]);
    report.rejectedChecks.push('missing signature rejected');

    await client.postRaw(rawBody, {
      'x-webhook-signature': 'sha256=invalid',
      'x-webhook-timestamp': now,
      'x-webhook-id': `${eventId}-invalid-signature`,
    }, [401, 403]);
    report.rejectedChecks.push('invalid signature rejected');

    const oldTimestamp = Math.floor(Date.now() / 1000 - config.replayWindowSeconds - 30).toString();
    await client.postRaw(rawBody, {
      'x-webhook-signature': `sha256=${sign(config.hmacSecret, oldTimestamp, rawBody)}`,
      'x-webhook-timestamp': oldTimestamp,
      'x-webhook-id': `${eventId}-old-timestamp`,
    }, [401, 403]);
    report.rejectedChecks.push('old timestamp rejected by replay window');

    const signature = sign(config.hmacSecret, now, rawBody);
    const accepted = await client.postRaw(rawBody, {
      'x-webhook-signature': `sha256=${signature}`,
      'x-webhook-timestamp': now,
      'x-webhook-id': eventId,
    }, [200, 201]);
    assert(accepted && typeof accepted === 'object', 'valid webhook response must be an object.');
    assert((accepted as JsonObject).received === true, 'valid webhook was not accepted.');
    report.acceptedChecks.push('valid HMAC webhook accepted');

    const dbEvent = await validateDbEvent(eventId);
    report.dbEventId = dbEvent.id;
    report.dbEventStatus = dbEvent.status;
    assert(dbEvent.status === 'processed', `expected processed event, got ${dbEvent.status}.`);
    assert(dbEvent.payloadHash.length >= 32, 'payloadHash missing/short.');
    report.dbChecks.push('ExternalWebhookEvent recorded as processed with payloadHash');

    const duplicate = await client.postRaw(rawBody, {
      'x-webhook-signature': `sha256=${signature}`,
      'x-webhook-timestamp': now,
      'x-webhook-id': eventId,
    }, [200, 201]);
    assert(duplicate && typeof duplicate === 'object', 'duplicate webhook response must be an object.');
    assert((duplicate as JsonObject).duplicate === true, 'duplicate webhook was not reported as idempotent duplicate.');
    const dbAfterDuplicate = await validateDbEvent(eventId);
    assert(dbAfterDuplicate.status === 'processed', `duplicate changed status unexpectedly: ${dbAfterDuplicate.status}.`);
    report.idempotencyChecks.push('duplicate x-webhook-id returned success without reprocessing');

    smokePassed = true;
  } catch (error) {
    smokeError = error;
  } finally {
    try {
      await cleanup(report.eventId);
      report.cleanupStatus = 'completed';
    } catch (cleanupError) {
      report.cleanupStatus = 'failed';
      smokePassed = false;
      smokeError = cleanupError;
    }
  }

  if (smokePassed) {
    console.log('WEBHOOK_SECURITY_SMOKE_GO', JSON.stringify(report, null, 2));
    return;
  }

  console.error('WEBHOOK_SECURITY_SMOKE_NO_GO');
  if (smokeError instanceof HttpSmokeError) {
    console.error(JSON.stringify({ message: smokeError.message, status: smokeError.status, body: smokeError.body, report: sanitizeForLog(report) }, null, 2));
  } else {
    console.error(sanitizeForLog(smokeError));
    console.error(JSON.stringify({ report: sanitizeForLog(report) }, null, 2));
  }
  process.exit(1);
}

main();
