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

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null;
}

function pickString(obj: Record<string, unknown>, key: string): string | null {
  const v = obj[key];
  return typeof v === 'string' ? v : null;
}

async function waitForApi() {
  process.stdout.write(`⏳ Waiting for API at ${API}...\n`);
  for (let i = 0; i < 30; i++) {
    try {
      const res = await fetch(`${API}/health`);
      if (res.status === 200) {
        process.stdout.write('✅ API is up!\n');
        return true;
      }
    } catch (e) {
      // ignore
    }
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  return false;
}

async function main() {
  if (!(await waitForApi())) {
    process.stderr.write('❌ API did not start in time. Check logs.\n');
    process.exitCode = 1;
    return;
  }
  process.stdout.write('SMOKE TENANT USERS\n');

  // 1. Login
  const login = await api('POST', '/auth/tenant/login', {
    email: TENANT_EMAIL,
    password: TENANT_PASSWORD,
    tenantSlug: TENANT_SLUG,
  });
  
  const loginData = asRecord(login.data);
  const accessToken = loginData ? pickString(loginData, 'accessToken') : null;
  assert('login successful', login.status === 200 || login.status === 201, `Status=${login.status}`);

  if (!accessToken) {
    process.exitCode = 1;
    return;
  }

  // 2. List Users
  const list = await api('GET', '/tenant/users', undefined, accessToken);
  assert('list users status 200', list.status === 200, `Status=${list.status}`);
  assert('list is array', Array.isArray(list.data), 'not an array');

  // 3. Create User
  const testEmail = `emp-${Date.now()}@test.com`;
  const create = await api('POST', '/tenant/users', {
    name: 'Smoke Test User',
    email: testEmail,
    password: 'Password@123',
    isActive: true,
    roles: ['waiter']
  }, accessToken);
  
  assert('create user status 201', create.status === 201 || create.status === 200, `Status=${create.status}`, create.raw);
  const createdUser = asRecord(create.data);
  const newUserId = createdUser ? pickString(createdUser, 'id') : null;
  assert('user has id', !!newUserId, 'missing id');

  if (!newUserId) {
    process.exitCode = 1;
    return;
  }

  // 4. Update User
  const update = await api('PATCH', `/tenant/users/${newUserId}`, {
    name: 'Updated Smoke User',
    isActive: false
  }, accessToken);
  assert('update user status 200', update.status === 200, `Status=${update.status}`, update.raw);

  // 5. Delete User
  const del = await api('DELETE', `/tenant/users/${newUserId}`, undefined, accessToken);
  assert('delete user status 200', del.status === 200, `Status=${del.status}`, del.raw);

  // Results
  const failed = results.filter((r) => !r.passed);
  process.stdout.write(`\nResults: ${results.length - failed.length} passed, ${failed.length} failed\n`);
  process.exitCode = failed.length ? 1 : 0;
}

main().catch((err: unknown) => {
  process.stderr.write(`SMOKE TENANT USERS crashed: ${String(err)}\n`);
  process.exitCode = 1;
});

export {};
