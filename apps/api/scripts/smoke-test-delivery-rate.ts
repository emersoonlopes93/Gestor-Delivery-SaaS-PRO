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

  if (!auth.accessToken) {
    process.exitCode = 1;
    return;
  }
  const accessToken = auth.accessToken;

  const tenantId = await getTenantId(accessToken);
  assert('me returns tenantId', typeof tenantId === 'string' && tenantId.length > 0, 'missing tenantId');
  if (!tenantId) {
    process.exitCode = 1;
    return;
  }
  const resolvedTenantId = tenantId;

  const beforeList = await api('GET', '/delivery/rates', undefined, accessToken);
  assert('list rules status 200', beforeList.status === 200, `Status=${beforeList.status}`, beforeList.raw);

  // Create rules: fallback fixed + neighborhood with higher priority
  const createFixedFallback = await api(
    'POST',
    '/delivery/rates',
    { type: 'fixed', fixedRate: 9.9, isActive: true, isFallback: true, priority: 999 },
    accessToken,
  );
  assert(
    'create fixed fallback rule 200/201',
    createFixedFallback.status === 200 || createFixedFallback.status === 201,
    `Status=${createFixedFallback.status}`,
    createFixedFallback.raw,
  );
  const fixedFallback = asRecord(createFixedFallback.data);
  const fixedFallbackId = fixedFallback ? pickString(fixedFallback, 'id') : null;
  assert(
    'created fixed fallback has id',
    typeof fixedFallbackId === 'string' && fixedFallbackId.length > 0,
    'missing id',
    createFixedFallback.data,
  );

  const createNeighborhood = await api(
    'POST',
    '/delivery/rates',
    { type: 'neighborhood', neighborhood: 'Centro', rate: 4.5, isActive: true, priority: 10 },
    accessToken,
  );
  assert(
    'create neighborhood rule 200/201',
    createNeighborhood.status === 200 || createNeighborhood.status === 201,
    `Status=${createNeighborhood.status}`,
    createNeighborhood.raw,
  );
  const neighborhoodRule = asRecord(createNeighborhood.data);
  const neighborhoodRuleId = neighborhoodRule ? pickString(neighborhoodRule, 'id') : null;

  // Create distance rule
  const createDistance = await api(
    'POST',
    '/delivery/rates',
    { type: 'distance', minDistanceKm: 0, maxDistanceKm: 10, ratePerKm: 2, isActive: true, priority: 50 },
    accessToken,
  );
  assert(
    'create distance rule 200/201',
    createDistance.status === 200 || createDistance.status === 201,
    `Status=${createDistance.status}`,
    createDistance.raw,
  );

  // 1) Neighborhood should win (priority + order)
  const calcNeighborhood = await api('POST', '/delivery/rates/calculate', {
    tenantId: resolvedTenantId,
    address: {
      street: 'Rua A',
      number: '10',
      neighborhood: 'Centro',
      city: 'São Paulo',
      state: 'SP',
      zipCode: '01001000',
    },
    distanceKm: 5,
  });

  assert(
    'calculate neighborhood status 200/201',
    calcNeighborhood.status === 200 || calcNeighborhood.status === 201,
    `Status=${calcNeighborhood.status}`,
    calcNeighborhood.raw,
  );
  const calcNeighborhoodData = asRecord(calcNeighborhood.data);
  const feeNeighborhood = calcNeighborhoodData ? calcNeighborhoodData.fee : null;
  assert('neighborhood fee=4.5', feeNeighborhood === 4.5, `fee=${String(feeNeighborhood)}`, calcNeighborhood.data);

  // 2) Distance should apply when no neighborhood match
  const calcDistance = await api('POST', '/delivery/rates/calculate', {
    tenantId: resolvedTenantId,
    address: {
      street: 'Rua B',
      number: '20',
      neighborhood: 'Outro',
      city: 'São Paulo',
      state: 'SP',
      zipCode: '01001000',
    },
    distanceKm: 5,
  });
  assert(
    'calculate distance status 200/201',
    calcDistance.status === 200 || calcDistance.status === 201,
    `Status=${calcDistance.status}`,
    calcDistance.raw,
  );
  const calcDistanceData = asRecord(calcDistance.data);
  const feeDistance = calcDistanceData ? calcDistanceData.fee : null;
  assert('distance fee=10', feeDistance === 10, `fee=${String(feeDistance)}`, calcDistance.data);

  // Cleanup
  if (neighborhoodRuleId) {
    const del = await api('DELETE', `/delivery/rates/${neighborhoodRuleId}`, undefined, accessToken);
    assert('delete neighborhood rule status 200/201', del.status === 200 || del.status === 201, `Status=${del.status}`, del.raw);
  }
  if (fixedFallbackId) {
    const del = await api('DELETE', `/delivery/rates/${fixedFallbackId}`, undefined, accessToken);
    assert('delete fixed fallback rule status 200/201', del.status === 200 || del.status === 201, `Status=${del.status}`, del.raw);
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

export {};
