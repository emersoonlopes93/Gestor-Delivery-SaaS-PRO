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
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${API}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const raw: unknown = await res.json().catch(() => ({}));
  const data =
    typeof raw === 'object' && raw !== null && 'success' in raw && 'data' in raw
      ? (raw as { data: unknown }).data
      : raw;

  return { status: res.status, data, raw };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null;
}

function pickString(obj: Record<string, unknown>, key: string): string | null {
  const value = obj[key];
  return typeof value === 'string' ? value : null;
}

function pickNumber(obj: Record<string, unknown>, key: string): number | null {
  const value = obj[key];
  return typeof value === 'number' ? value : null;
}

function getRuleType(result: unknown): string | null {
  const calculation = asRecord(result);
  const rule = calculation ? asRecord(calculation.rule) : null;
  return rule ? pickString(rule, 'type') : null;
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
  return meData ? pickString(meData, 'tenantId') : null;
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

  const beforeList = await api('GET', '/delivery/rates', undefined, accessToken);
  assert('list rules status 200', beforeList.status === 200, `Status=${beforeList.status}`, beforeList.raw);

  let distanceTiersRuleId: string | null = null;
  let specialPolygonRuleId: string | null = null;
  let blockedPolygonRuleId: string | null = null;

  try {
    // Neighborhood pricing is coming_soon and is intentionally not asserted here.
    const createDistanceTiers = await api(
    'POST',
    '/delivery/rates',
    {
      type: 'distance',
      name: 'Smoke distance tiers',
      pricingMode: 'tiers',
      distanceTiers: [{ minDistanceKm: 0, maxDistanceKm: 10, fee: 8.88 }],
      isActive: true,
      priority: 50,
    },
    accessToken,
  );
  assert(
    'create distance tiers rule 200/201',
    createDistanceTiers.status === 200 || createDistanceTiers.status === 201,
    `Status=${createDistanceTiers.status}`,
    createDistanceTiers.raw,
  );
    const distanceTiersRule = asRecord(createDistanceTiers.data);
    distanceTiersRuleId = distanceTiersRule ? pickString(distanceTiersRule, 'id') : null;
  assert(
    'created distance tiers rule has id',
    typeof distanceTiersRuleId === 'string' && distanceTiersRuleId.length > 0,
    'missing id',
    createDistanceTiers.data,
  );

    const createSpecialPolygon = await api(
    'POST',
    '/delivery/rates',
    {
      type: 'polygon',
      name: 'Smoke special polygon',
      pricingMode: 'fixed',
      fixedRate: 7.77,
      isActive: true,
      priority: 10,
      polygonCoordinates: [
        [-46.64, -23.56],
        [-46.62, -23.56],
        [-46.62, -23.54],
        [-46.64, -23.54],
      ],
    },
    accessToken,
  );
  assert(
    'create special polygon rule 200/201',
    createSpecialPolygon.status === 200 || createSpecialPolygon.status === 201,
    `Status=${createSpecialPolygon.status}`,
    createSpecialPolygon.raw,
  );
    const specialPolygonRule = asRecord(createSpecialPolygon.data);
    specialPolygonRuleId = specialPolygonRule ? pickString(specialPolygonRule, 'id') : null;
  assert(
    'created special polygon has id',
    typeof specialPolygonRuleId === 'string' && specialPolygonRuleId.length > 0,
    'missing id',
    createSpecialPolygon.data,
  );

    const createBlockedPolygon = await api(
    'POST',
    '/delivery/rates',
    {
      type: 'polygon',
      name: 'Smoke blocked polygon',
      zoneKind: 'blocked_zone',
      blocksDelivery: true,
      isActive: true,
      priority: 1,
      polygonCoordinates: [
        [-46.61, -23.53],
        [-46.59, -23.53],
        [-46.59, -23.51],
        [-46.61, -23.51],
      ],
    },
    accessToken,
  );
  assert(
    'create blocked polygon rule 200/201',
    createBlockedPolygon.status === 200 || createBlockedPolygon.status === 201,
    `Status=${createBlockedPolygon.status}`,
    createBlockedPolygon.raw,
  );
    const blockedPolygonRule = asRecord(createBlockedPolygon.data);
    blockedPolygonRuleId = blockedPolygonRule ? pickString(blockedPolygonRule, 'id') : null;
  assert(
    'created blocked polygon has id',
    typeof blockedPolygonRuleId === 'string' && blockedPolygonRuleId.length > 0,
    'missing id',
    createBlockedPolygon.data,
  );

  const calcInvalid = await api('POST', '/delivery/rates/calculate', {
    tenantId,
    address: { lat: 999, lng: 999 },
  });
  assert('invalid delivery coordinates status 422', calcInvalid.status === 422, `Status=${calcInvalid.status}`, calcInvalid.raw);

  const calcBlockedPolygon = await api('POST', '/delivery/rates/calculate', {
    tenantId,
    address: { lat: -23.52, lng: -46.6 },
    distanceKm: 5,
  });
  assert(
    'calculate blocked polygon status 200/201',
    calcBlockedPolygon.status === 200 || calcBlockedPolygon.status === 201,
    `Status=${calcBlockedPolygon.status}`,
    calcBlockedPolygon.raw,
  );
  assert(
    'blocked polygon rule is selected',
    getRuleType(calcBlockedPolygon.data) === 'blocked_zone',
    `rule=${String(getRuleType(calcBlockedPolygon.data))}`,
    calcBlockedPolygon.data,
  );
  const blockedCalculation = asRecord(calcBlockedPolygon.data);
  assert(
    'blocked polygon fee=0',
    blockedCalculation ? pickNumber(blockedCalculation, 'fee') === 0 : false,
    `fee=${String(blockedCalculation ? pickNumber(blockedCalculation, 'fee') : null)}`,
    calcBlockedPolygon.data,
  );

  const calcSpecialPolygon = await api('POST', '/delivery/rates/calculate', {
    tenantId,
    address: { lat: -23.55, lng: -46.63 },
    distanceKm: 5,
  });
  assert(
    'calculate special polygon status 200/201',
    calcSpecialPolygon.status === 200 || calcSpecialPolygon.status === 201,
    `Status=${calcSpecialPolygon.status}`,
    calcSpecialPolygon.raw,
  );
  const specialPolygonCalculation = asRecord(calcSpecialPolygon.data);
  assert(
    'special polygon rule is selected',
    getRuleType(calcSpecialPolygon.data) === 'custom_zone_fixed',
    `rule=${String(getRuleType(calcSpecialPolygon.data))}`,
    calcSpecialPolygon.data,
  );
  assert(
    'special polygon fee=7.77',
    specialPolygonCalculation ? pickNumber(specialPolygonCalculation, 'fee') === 7.77 : false,
    `fee=${String(specialPolygonCalculation ? pickNumber(specialPolygonCalculation, 'fee') : null)}`,
    calcSpecialPolygon.data,
  );

  const calcDistanceTiers = await api('POST', '/delivery/rates/calculate', {
    tenantId,
    address: { lat: -23.5, lng: -46.58 },
    distanceKm: 5,
  });
  assert(
    'calculate distance tiers status 200/201',
    calcDistanceTiers.status === 200 || calcDistanceTiers.status === 201,
    `Status=${calcDistanceTiers.status}`,
    calcDistanceTiers.raw,
  );
  const distanceTiersCalculation = asRecord(calcDistanceTiers.data);
  assert(
    'distance tiers rule is selected',
    getRuleType(calcDistanceTiers.data) === 'custom_zone_tiers',
    `rule=${String(getRuleType(calcDistanceTiers.data))}`,
    calcDistanceTiers.data,
  );
  assert(
    'distance tiers fee=8.88',
    distanceTiersCalculation ? pickNumber(distanceTiersCalculation, 'fee') === 8.88 : false,
    `fee=${String(distanceTiersCalculation ? pickNumber(distanceTiersCalculation, 'fee') : null)}`,
    calcDistanceTiers.data,
  );

  const calcBaseRadius = await api('POST', '/delivery/rates/calculate', {
    tenantId,
    address: { lat: -23.5, lng: -46.58 },
    distanceKm: 12,
  });
  assert(
    'calculate base radius status 200/201',
    calcBaseRadius.status === 200 || calcBaseRadius.status === 201,
    `Status=${calcBaseRadius.status}`,
    calcBaseRadius.raw,
  );
  const baseRadiusCalculation = asRecord(calcBaseRadius.data);
  assert(
    'base radius rule is selected',
    getRuleType(calcBaseRadius.data) === 'base_radius',
    `rule=${String(getRuleType(calcBaseRadius.data))}`,
    calcBaseRadius.data,
  );
  assert(
    'base radius fee=20',
    baseRadiusCalculation ? pickNumber(baseRadiusCalculation, 'fee') === 20 : false,
    `fee=${String(baseRadiusCalculation ? pickNumber(baseRadiusCalculation, 'fee') : null)}`,
    calcBaseRadius.data,
  );

  const calcOutsideCoverage = await api('POST', '/delivery/rates/calculate', {
    tenantId,
    address: { lat: -23.5, lng: -46.58 },
    distanceKm: 20,
  });
  assert(
    'calculate outside coverage status 200/201',
    calcOutsideCoverage.status === 200 || calcOutsideCoverage.status === 201,
    `Status=${calcOutsideCoverage.status}`,
    calcOutsideCoverage.raw,
  );
  const outsideCoverageCalculation = asRecord(calcOutsideCoverage.data);
  assert(
    'outside coverage rule is selected',
    getRuleType(calcOutsideCoverage.data) === 'out_of_coverage',
    `rule=${String(getRuleType(calcOutsideCoverage.data))}`,
    calcOutsideCoverage.data,
  );
  assert(
    'outside coverage fee=0',
    outsideCoverageCalculation ? pickNumber(outsideCoverageCalculation, 'fee') === 0 : false,
    `fee=${String(outsideCoverageCalculation ? pickNumber(outsideCoverageCalculation, 'fee') : null)}`,
    calcOutsideCoverage.data,
  );

  } finally {
    if (blockedPolygonRuleId) {
      const deletion = await api('DELETE', `/delivery/rates/${blockedPolygonRuleId}`, undefined, accessToken);
      assert('delete blocked polygon rule status 200/201', deletion.status === 200 || deletion.status === 201, `Status=${deletion.status}`, deletion.raw);
    }
    if (specialPolygonRuleId) {
      const deletion = await api('DELETE', `/delivery/rates/${specialPolygonRuleId}`, undefined, accessToken);
      assert('delete special polygon rule status 200/201', deletion.status === 200 || deletion.status === 201, `Status=${deletion.status}`, deletion.raw);
    }
    if (distanceTiersRuleId) {
      const deletion = await api('DELETE', `/delivery/rates/${distanceTiersRuleId}`, undefined, accessToken);
      assert('delete distance tiers rule status 200/201', deletion.status === 200 || deletion.status === 201, `Status=${deletion.status}`, deletion.raw);
    }
  }

  const failed = results.filter((result) => !result.passed);
  process.stdout.write(`\nResults: ${results.length - failed.length} passed, ${failed.length} failed\n`);
  if (failed.length) {
    failed.forEach((failure) => process.stdout.write(`- ${failure.name}: ${failure.detail}\n`));
  }
  process.exitCode = failed.length ? 1 : 0;
}

main().catch((error: unknown) => {
  process.stderr.write(`SMOKE DELIVERY RATE crashed: ${String(error)}\n`);
  process.exitCode = 1;
});

export {};
