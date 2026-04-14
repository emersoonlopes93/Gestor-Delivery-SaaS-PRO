declare const process: {
  env: Record<string, string | undefined>;
  stdout: { write: (value: string) => void };
  stderr: { write: (value: string) => void };
  exitCode: number;
};

const API = process.env.SMOKE_API_BASE_URL ?? 'http://localhost:3333/api/v1';
const TENANT_SLUG = process.env.SMOKE_TENANT_SLUG ?? 'pizzaria-demo';
const TENANT_EMAIL = process.env.SMOKE_TENANT_EMAIL ?? 'owner@pizzariademo.com';
const TENANT_PASSWORD = process.env.SMOKE_TENANT_PASSWORD ?? 'Owner@123';

type TestResult = {
  name: string;
  passed: boolean;
  detail: string;
};

const results: TestResult[] = [];

function assert(name: string, condition: boolean, detail: string, payload?: unknown) {
  const fullDetail = payload ? `${detail} | Payload: ${JSON.stringify(payload)}` : detail;
  results.push({ name, passed: condition, detail: fullDetail });
  process.stdout.write(condition ? `  OK  ${name}\n` : `  ERR ${name}: ${fullDetail}\n`);
}

async function api(method: string, path: string, body?: unknown, token?: string) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${API}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const raw: unknown = await res.json().catch(() => ({}));
  const data =
    typeof raw === 'object' &&
    raw !== null &&
    'success' in raw &&
    'data' in raw
      ? (raw as { data: unknown }).data
      : raw;

  return { status: res.status, data, raw };
}

function pickString(obj: Record<string, unknown>, key: string): string | null {
  const v = obj[key];
  return typeof v === 'string' ? v : null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null;
}

function asStringArray(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  if (!value.every((v) => typeof v === 'string')) return null;
  return value;
}

async function main() {
  process.stdout.write('SMOKE AUTH (tenant)\n');

  const login = await api('POST', '/auth/tenant/login', {
    email: TENANT_EMAIL,
    password: TENANT_PASSWORD,
    tenantSlug: TENANT_SLUG,
  });

  assert('login status 200/201', login.status === 200 || login.status === 201, `Status=${login.status}`, login.raw);

  const loginData = asRecord(login.data);
  const accessToken = loginData ? pickString(loginData, 'accessToken') : null;
  const refreshToken = loginData ? pickString(loginData, 'refreshToken') : null;

  assert('login returns accessToken', typeof accessToken === 'string' && accessToken.length > 10, 'missing/short accessToken', login.data);
  assert('login returns refreshToken', typeof refreshToken === 'string' && refreshToken.length > 10, 'missing/short refreshToken', login.data);

  if (!accessToken || !refreshToken) {
    process.exitCode = 1;
    return;
  }

  const me = await api('GET', '/auth/tenant/me', undefined, accessToken);
  assert('me status 200', me.status === 200, `Status=${me.status}`, me.raw);

  const meData = asRecord(me.data);
  assert('me has tenantId', !!(meData && typeof meData.tenantId === 'string'), 'tenantId missing', me.data);

  const roles = meData ? asStringArray(meData.roles) : null;
  const permissions = meData ? asStringArray(meData.permissions) : null;

  assert('me roles is string[]', Array.isArray(roles), 'roles not string[]', me.data);
  assert('me permissions is string[]', Array.isArray(permissions), 'permissions not string[]', me.data);

  const refresh = await api('POST', '/auth/tenant/refresh', { refreshToken });
  assert('refresh status 200/201', refresh.status === 200 || refresh.status === 201, `Status=${refresh.status}`, refresh.raw);

  const refreshData = asRecord(refresh.data);
  const newAccessToken = refreshData ? pickString(refreshData, 'accessToken') : null;
  assert('refresh returns accessToken', typeof newAccessToken === 'string' && newAccessToken.length > 10, 'missing/short accessToken', refresh.data);

  const failed = results.filter((r) => !r.passed);
  process.stdout.write(`\nResults: ${results.length - failed.length} passed, ${failed.length} failed\n`);
  if (failed.length) {
    failed.forEach((f) => process.stdout.write(`- ${f.name}: ${f.detail}\n`));
  }
  process.exitCode = failed.length ? 1 : 0;
}

main().catch((err: unknown) => {
  process.stderr.write(`SMOKE AUTH crashed: ${String(err)}\n`);
  process.exitCode = 1;
});

export {};
