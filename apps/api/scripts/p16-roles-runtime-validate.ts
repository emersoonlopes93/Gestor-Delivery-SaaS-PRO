import { PrismaClient } from '@prisma/client';

const API = process.env.SMOKE_API_BASE_URL ?? 'http://localhost:3333/api/v1';
const OWNER_EMAIL = process.env.P16_OWNER_EMAIL ?? 'demo@demo.com';
const OWNER_PASSWORD = process.env.P16_OWNER_PASSWORD ?? 'demo123';
const OWNER_CONFIRMATION = 'DONO';

const prisma = new PrismaClient();

type ApiResult = {
  status: number;
  data: unknown;
  raw: unknown;
};

type Check = {
  name: string;
  passed: boolean;
  detail: string;
};

const checks: Check[] = [];

function record(name: string, passed: boolean, detail: string) {
  checks.push({ name, passed, detail });
  const prefix = passed ? 'OK ' : 'ERR';
  console.log(`${prefix} ${name}: ${detail}`);
}

async function api(
  method: string,
  path: string,
  body?: unknown,
  token?: string,
): Promise<ApiResult> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`${API}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const raw = await response.json().catch(() => ({}));
  const data =
    typeof raw === 'object' && raw !== null && 'success' in raw && 'data' in raw
      ? (raw as { data: unknown }).data
      : raw;

  return {
    status: response.status,
    data,
    raw,
  };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function pickString(record: Record<string, unknown> | null, key: string): string | null {
  if (!record) return null;
  const value = record[key];
  return typeof value === 'string' ? value : null;
}

async function login(email: string, password: string) {
  const result = await api('POST', '/auth/tenant/login', {
    email,
    password,
  });

  const data = asRecord(result.data);

  return {
    status: result.status,
    token: pickString(data, 'accessToken'),
    refreshToken: pickString(data, 'refreshToken'),
    user: asRecord(data?.user),
    raw: result.raw,
  };
}

async function getAuditActionsForUser(targetUserId: string) {
  const logs = await prisma.auditLog.findMany({
    where: {
      details: {
        path: ['createdUserId'],
        equals: targetUserId,
      },
    },
    select: {
      action: true,
    },
  });

  return logs.map((log) => log.action);
}

async function main() {
  const ownerLogin = await login(OWNER_EMAIL, OWNER_PASSWORD);
  record('owner login', ownerLogin.status === 200 || ownerLogin.status === 201, `status=${ownerLogin.status}`);

  if (!ownerLogin.token || !ownerLogin.user) {
    console.log(JSON.stringify({ checks }, null, 2));
    process.exitCode = 1;
    return;
  }

  const ownerUserId = pickString(ownerLogin.user, 'userId');
  record('owner session role', asStringArray(ownerLogin.user.roles).includes('tenant_owner'), 'tenant_owner present');

  const rolesResponse = await api('GET', '/tenant/users/roles', undefined, ownerLogin.token);
  const roles = asArray(rolesResponse.data).map((value) => asRecord(value)).filter(Boolean);
  const roleSlugs = roles.map((role) => pickString(role, 'slug')).filter((slug): slug is string => !!slug);
  const ownerRole = roles.find((role) => pickString(role, 'slug') === 'tenant_owner');

  record('roles endpoint status', rolesResponse.status === 200, `status=${rolesResponse.status}`);
  record('roles include operational catalog', ['attendant', 'kitchen', 'manager', 'delivery_operator', 'finance', 'waiter'].every((slug) => roleSlugs.includes(slug)), `slugs=${roleSlugs.join(',')}`);
  record('roles not only owner', roleSlugs.length > 1, `count=${roleSlugs.length}`);
  record(
    'owner role flagged protected',
    ownerRole?.protected === true && ownerRole?.requiresStrongConfirmation === true,
    JSON.stringify(ownerRole),
  );

  const uniquePrefix = `p16-runtime-${Date.now()}`;
  const usersToCleanup: string[] = [];

  async function createUser(name: string, email: string, roles: string[], ownerConfirmationText?: string) {
    const result = await api(
      'POST',
      '/tenant/users',
      {
        name,
        email,
        password: 'Password@123',
        isActive: true,
        roles,
        ...(ownerConfirmationText ? { ownerConfirmationText } : {}),
      },
      ownerLogin.token,
    );

    const created = asRecord(result.data);
    const userId = pickString(created, 'id');
    if (userId) {
      usersToCleanup.push(userId);
    }

    return {
      status: result.status,
      userId,
      raw: result.raw,
    };
  }

  const attendantEmail = `${uniquePrefix}-attendant@test.com`;
  const kitchenEmail = `${uniquePrefix}-kitchen@test.com`;
  const managerEmail = `${uniquePrefix}-manager@test.com`;
  const ownerCandidateEmail = `${uniquePrefix}-owner@test.com`;

  const attendantCreate = await createUser('P16 Attendant', attendantEmail, ['attendant']);
  record('create attendant', attendantCreate.status === 201 || attendantCreate.status === 200, `status=${attendantCreate.status}`);

  const kitchenCreate = await createUser('P16 Kitchen', kitchenEmail, ['kitchen']);
  record('create kitchen', kitchenCreate.status === 201 || kitchenCreate.status === 200, `status=${kitchenCreate.status}`);

  const managerCreate = await createUser('P16 Manager', managerEmail, ['manager']);
  record('create manager', managerCreate.status === 201 || managerCreate.status === 200, `status=${managerCreate.status}`);

  if (attendantCreate.userId) {
    const actions = await getAuditActionsForUser(attendantCreate.userId);
    record(
      'audit log user create',
      actions.includes('tenant.user.create') && actions.includes('tenant.user.role.assign'),
      `actions=${actions.join(',')}`,
    );
  }

  const attendantLogin = await login(attendantEmail, 'Password@123');
  const kitchenLogin = await login(kitchenEmail, 'Password@123');
  const managerLogin = await login(managerEmail, 'Password@123');

  record('attendant login', attendantLogin.status === 200 || attendantLogin.status === 201, `status=${attendantLogin.status}`);
  record('kitchen login', kitchenLogin.status === 200 || kitchenLogin.status === 201, `status=${kitchenLogin.status}`);
  record('manager login', managerLogin.status === 200 || managerLogin.status === 201, `status=${managerLogin.status}`);

  const attendantPerms = asStringArray(attendantLogin.user?.permissions);
  const kitchenPerms = asStringArray(kitchenLogin.user?.permissions);
  const managerPerms = asStringArray(managerLogin.user?.permissions);

  record('attendant not owner', !asStringArray(attendantLogin.user?.roles).includes('tenant_owner'), `roles=${asStringArray(attendantLogin.user?.roles).join(',')}`);
  record('attendant has operational perms', attendantPerms.includes('orders.read') && attendantPerms.includes('pos.read'), `perms=${attendantPerms.join(',')}`);
  record('attendant lacks sensitive perms', !attendantPerms.includes('users.read') && !attendantPerms.includes('billing.read') && !attendantPerms.includes('settings.manage'), `perms=${attendantPerms.join(',')}`);

  record('kitchen has kds permission', kitchenPerms.includes('kds.use') && kitchenPerms.includes('orders.read'), `perms=${kitchenPerms.join(',')}`);
  record('kitchen lacks sensitive perms', !kitchenPerms.includes('finance.read') && !kitchenPerms.includes('users.read') && !kitchenPerms.includes('settings.manage'), `perms=${kitchenPerms.join(',')}`);

  record('manager has broad operational perms', managerPerms.includes('orders.read') && managerPerms.includes('catalog.read') && managerPerms.includes('billing.read'), `perms=${managerPerms.join(',')}`);
  record('manager lacks owner-only powers', !managerPerms.includes('users.roles') && !managerPerms.includes('billing.write') && !managerPerms.includes('settings.manage'), `perms=${managerPerms.join(',')}`);

  async function expectStatus(name: string, token: string | null | undefined, path: string, expectedStatuses: number[]) {
    const result = await api('GET', path, undefined, token ?? undefined);
    record(name, expectedStatuses.includes(result.status), `status=${result.status}`);
  }

  await expectStatus('attendant orders access', attendantLogin.token, '/orders', [200]);
  await expectStatus('attendant users denied', attendantLogin.token, '/tenant/users', [403]);
  await expectStatus('attendant finance denied', attendantLogin.token, '/finance/accounts', [403]);
  await expectStatus('attendant billing denied', attendantLogin.token, '/billing/me', [403]);

  await expectStatus('kitchen kds access', kitchenLogin.token, '/orders/operation/kds', [200]);
  await expectStatus('kitchen finance denied', kitchenLogin.token, '/finance/accounts', [403]);
  await expectStatus('kitchen users denied', kitchenLogin.token, '/tenant/users', [403]);

  await expectStatus('manager orders access', managerLogin.token, '/orders', [200]);
  await expectStatus('manager billing read access', managerLogin.token, '/billing/me', [200]);
  await expectStatus('manager finance denied', managerLogin.token, '/finance/accounts', [403]);

  if (ownerUserId && managerLogin.token) {
    const managerPatchOwner = await api(
      'PATCH',
      `/tenant/users/${ownerUserId}`,
      {
        roles: ['manager'],
      },
      managerLogin.token,
    );

    record('manager cannot alter owner role', managerPatchOwner.status === 403, `status=${managerPatchOwner.status}`);
  }

  const ownerWithoutConfirmation = await createUser('P16 Owner Candidate', ownerCandidateEmail, ['tenant_owner']);
  record('owner assignment requires confirmation', ownerWithoutConfirmation.status === 400, `status=${ownerWithoutConfirmation.status}`);

  const ownerWithConfirmation = await createUser(
    'P16 Owner Candidate Confirmed',
    ownerCandidateEmail,
    ['tenant_owner'],
    OWNER_CONFIRMATION,
  );
  record('owner assignment with confirmation works', ownerWithConfirmation.status === 201 || ownerWithConfirmation.status === 200, `status=${ownerWithConfirmation.status}`);

  if (ownerWithConfirmation.userId) {
    const actions = await getAuditActionsForUser(ownerWithConfirmation.userId);
    record('audit log owner assignment', actions.includes('tenant.user.owner.assign'), `actions=${actions.join(',')}`);
  }

  const ownerCandidateLogin = await login(ownerCandidateEmail, 'Password@123');

  if (ownerWithConfirmation.userId && ownerCandidateLogin.token) {
    if (ownerUserId) {
      const demoteOriginalOwner = await api(
        'PATCH',
        `/tenant/users/${ownerUserId}`,
        {
          roles: ['manager'],
        },
        ownerCandidateLogin.token,
      );
      record('owner transfer to replacement', demoteOriginalOwner.status === 200, `status=${demoteOriginalOwner.status}`);
    }

    const removeLastOwnerRole = await api(
      'PATCH',
      `/tenant/users/${ownerWithConfirmation.userId}`,
      {
        roles: ['manager'],
      },
      ownerCandidateLogin.token,
    );
    record('last owner role protected', removeLastOwnerRole.status === 400, `status=${removeLastOwnerRole.status}`);

    const deactivateLastOwner = await api(
      'PATCH',
      `/tenant/users/${ownerWithConfirmation.userId}`,
      {
        isActive: false,
      },
      ownerCandidateLogin.token,
    );
    record('last owner deactivation protected', deactivateLastOwner.status === 400, `status=${deactivateLastOwner.status}`);

    const deleteLastOwner = await api(
      'DELETE',
      `/tenant/users/${ownerWithConfirmation.userId}`,
      undefined,
      ownerCandidateLogin.token,
    );
    record('last owner deletion protected', deleteLastOwner.status === 400, `status=${deleteLastOwner.status}`);

    if (ownerUserId) {
      const restoreOriginalOwner = await api(
        'PATCH',
        `/tenant/users/${ownerUserId}`,
        {
          roles: ['tenant_owner'],
          ownerConfirmationText: OWNER_CONFIRMATION,
        },
        ownerCandidateLogin.token,
      );
      record('owner restored after validation', restoreOriginalOwner.status === 200, `status=${restoreOriginalOwner.status}`);
    }
  }

  const restoredOwnerLogin = await login(OWNER_EMAIL, OWNER_PASSWORD);
  for (const userId of usersToCleanup.reverse()) {
    await api('DELETE', `/tenant/users/${userId}`, undefined, restoredOwnerLogin.token ?? ownerLogin.token ?? undefined);
  }

  const summary = {
    api: API,
    ownerEmail: OWNER_EMAIL,
    checks,
  };

  console.log(JSON.stringify(summary, null, 2));

  if (checks.some((check) => !check.passed)) {
    process.exitCode = 1;
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
