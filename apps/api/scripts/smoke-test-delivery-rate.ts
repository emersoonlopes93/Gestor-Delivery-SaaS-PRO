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

async function getTenantToken() {
  const login = await api('POST', '/auth/tenant/login', {
    email: TENANT_EMAIL,
    password: TENANT_PASSWORD,
    tenantSlug: TENANT_SLUG,
  });

  const loginData = asRecord(login.data);
  const accessToken = loginData ? pickString(loginData, 'accessToken') : null;

  return { accessToken, loginRaw: login.raw, status: login.status };
}

async function getTenantId(accessToken: string): Promise<string | null> {
  const me = await api('GET', '/auth/tenant/me', undefined, accessToken);
  const meData = asRecord(me.data);
  const tenantId = meData ? pickString(meData, 'tenantId') : null;
  return tenantId;
}

async function main() {
  process.stdout.write('SMOKE DELIVERY RATE\n');

  const auth = await getTenantToken();
  assert('login status 200/201', auth.status === 200 || auth.status === 201, `Status=${auth.status}`, auth.loginRaw);
  assert('login returns token', typeof auth.accessToken === 'string' && auth.accessToken.length > 10, 'missing token', auth.loginRaw);

  if (!auth.accessToken) process.exit(1);

  const tenantId = await getTenantId(auth.accessToken);
  assert('me returns tenantId', typeof tenantId === 'string' && tenantId.length > 0, 'missing tenantId');
  if (!tenantId) process.exit(1);

  const beforeList = await api('GET', '/delivery/rates', undefined, auth.accessToken);
  assert('list rules status 200', beforeList.status === 200, `Status=${beforeList.status}`, beforeList.raw);

  const createFixed = await api(
    'POST',
    '/delivery/rates',
    { type: 'fixed', fixedRate: 9.9, isActive: true },
    auth.accessToken,
  );
  assert('create fixed rule 200/201', createFixed.status === 200 || createFixed.status === 201, `Status=${createFixed.status}`, createFixed.raw);

  const created = asRecord(createFixed.data);
  const ruleId = created ? pickString(created, 'id') : null;
  assert('created rule has id', typeof ruleId === 'string' && ruleId.length > 0, 'missing id', createFixed.data);

  const calc = await api('POST', '/delivery/rates/calculate', {
    tenantId,
    address: {
      street: 'Rua A',
      number: '10',
      neighborhood: 'Centro',
      city: 'São Paulo',
      state: 'SP',
      zipCode: '01001000',
    },
  });

  assert('calculate delivery fee 200/201', calc.status === 200 || calc.status === 201, `Status=${calc.status}`, calc.raw);

  const calcData = asRecord(calc.data);
  const fee = calcData ? calcData.fee : null;
  assert('calculate returns fee number', typeof fee === 'number', 'fee not number', calc.data);

  if (ruleId) {
    const update = await api(
      'PUT',
      `/delivery/rates/${ruleId}`,
      { type: 'fixed', fixedRate: 7.5, isActive: true },
      auth.accessToken,
    );
    assert('update fixed rule status 200', update.status === 200, `Status=${update.status}`, update.raw);

    const del = await api('DELETE', `/delivery/rates/${ruleId}`, undefined, auth.accessToken);
    assert('delete rule status 200/201', del.status === 200 || del.status === 201, `Status=${del.status}`, del.raw);
  }

  const failed = results.filter((r) => !r.passed);
  process.stdout.write(`\nResults: ${results.length - failed.length} passed, ${failed.length} failed\n`);
  if (failed.length) {
    failed.forEach((f) => process.stdout.write(`- ${f.name}: ${f.detail}\n`));
  }
  process.exitCode = failed.length ? 1 : 0;
}

main().catch((err: unknown) => {
  process.stderr.write(`SMOKE DELIVERY RATE crashed: ${String(err)}\n`);
  process.exitCode = 1;
});
