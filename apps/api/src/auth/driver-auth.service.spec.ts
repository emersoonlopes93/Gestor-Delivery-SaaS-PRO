import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AuthSessionStatus, AuthSubjectType } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { DriverAuthService } from './driver-auth.service';

const tenantA = { id: 'tenant-a', name: 'Loja A', slug: 'loja-a', status: 'active' };
const tenantB = { id: 'tenant-b', name: 'Loja B', slug: 'loja-b', status: 'trial' };

function driver(id: string, tenant: typeof tenantA, pin: string) {
  return {
    id,
    tenantId: tenant.id,
    name: `Driver ${id}`,
    phone: '5511999999999',
    pin,
    isActive: true,
    tenant,
  };
}

describe('DriverAuthService slugless login', () => {
  const jwtService = new JwtService({ secret: 'driver-test-secret' });
  const prisma = {
    deliveryDriver: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
    },
    authSession: { findUnique: jest.fn() },
  };
  const authSessionService = {
    createSession: jest.fn(),
    rotateSession: jest.fn(),
    revokeSession: jest.fn(),
    revokeSubjectSessions: jest.fn(),
    listActiveSessions: jest.fn(),
  };
  let service: DriverAuthService;
  let validPinHash: string;

  beforeAll(async () => {
    validPinHash = await bcrypt.hash('123456', 4);
  });

  beforeEach(() => {
    jest.clearAllMocks();
    authSessionService.createSession.mockResolvedValue({
      sessionId: 'session-a',
      refreshToken: 'refresh-a',
    });
    service = new DriverAuthService(prisma as never, jwtService, authSessionService as never);
  });

  it('logs in without slug when one active tenant-bound credential matches', async () => {
    prisma.deliveryDriver.findMany.mockResolvedValue([driver('driver-a', tenantA, validPinHash)]);

    const result = await service.login('(11) 99999-9999', '123456');

    expect('requiresTenantSelection' in result).toBe(false);
    if ('requiresTenantSelection' in result) throw new Error('Unexpected tenant selection');
    expect(result.driver).toEqual(expect.objectContaining({ driverId: 'driver-a', tenantId: 'tenant-a' }));
    expect(authSessionService.createSession).toHaveBeenCalledWith(expect.objectContaining({
      subjectType: AuthSubjectType.driver,
      subjectId: 'driver-a',
      tenantId: 'tenant-a',
      userId: 'driver-a',
    }));
    const accessPayload = jwtService.verify(result.accessToken);
    expect(accessPayload).toEqual(expect.objectContaining({
      sub: 'driver-a',
      tenantId: 'tenant-a',
      type: 'driver',
      sid: 'session-a',
    }));
  });

  it.each([
    ['unknown credential', []],
    ['inactive or inactive-tenant credential filtered by the query', []],
  ])('returns the same generic error for %s', async (_caseName, candidates) => {
    prisma.deliveryDriver.findMany.mockResolvedValue(candidates);
    await expect(service.login('5511888888888', 'wrong-pin')).rejects.toMatchObject({
      message: 'Credenciais invalidas.',
    });
    expect(prisma.deliveryDriver.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        phone: '5511888888888',
        isActive: true,
        pin: { not: null },
        tenant: { status: { in: ['active', 'trial'] } },
      },
    }));
  });

  it('does not distinguish an existing credential with the wrong PIN', async () => {
    prisma.deliveryDriver.findMany.mockResolvedValue([driver('driver-a', tenantA, validPinHash)]);
    await expect(service.login('5511999999999', 'wrong-pin')).rejects.toMatchObject({
      message: 'Credenciais invalidas.',
    });
    expect(authSessionService.createSession).not.toHaveBeenCalled();
  });

  it('returns only authenticated tenant choices when more than one row validates', async () => {
    prisma.deliveryDriver.findMany.mockResolvedValue([
      driver('driver-a', tenantA, validPinHash),
      driver('driver-b', tenantB, validPinHash),
    ]);

    const result = await service.login('5511999999999', '123456');

    expect(result).toEqual(expect.objectContaining({
      requiresTenantSelection: true,
      selectionToken: expect.any(String),
      tenants: [
        { driverId: 'driver-a', tenant: { id: 'tenant-a', name: 'Loja A' } },
        { driverId: 'driver-b', tenant: { id: 'tenant-b', name: 'Loja B' } },
      ],
    }));
    expect(authSessionService.createSession).not.toHaveBeenCalled();
  });

  it('accepts only a driver embedded in the post-auth selection capability', async () => {
    prisma.deliveryDriver.findMany.mockResolvedValue([
      driver('driver-a', tenantA, validPinHash),
      driver('driver-b', tenantB, validPinHash),
    ]);
    const loginResult = await service.login('5511999999999', '123456');
    if (!('requiresTenantSelection' in loginResult)) throw new Error('Expected tenant selection');

    await expect(service.selectTenant(loginResult.selectionToken, 'foreign-driver'))
      .rejects.toBeInstanceOf(UnauthorizedException);
    expect(prisma.deliveryDriver.findFirst).not.toHaveBeenCalled();

    prisma.deliveryDriver.findFirst.mockResolvedValue(driver('driver-b', tenantB, validPinHash));
    const selected = await service.selectTenant(loginResult.selectionToken, 'driver-b');
    expect(selected.driver).toEqual(expect.objectContaining({ driverId: 'driver-b', tenantId: 'tenant-b' }));
  });

  it('keeps optional legacy slug compatibility after validating the credential', async () => {
    prisma.deliveryDriver.findMany.mockResolvedValue([
      driver('driver-a', tenantA, validPinHash),
      driver('driver-b', tenantB, validPinHash),
    ]);
    const result = await service.login('5511999999999', '123456', 'loja-b');
    if ('requiresTenantSelection' in result) throw new Error('Unexpected tenant selection');
    expect(result.driver.tenantId).toBe('tenant-b');
  });

  it('validates access-token session, subject, driver and tenant binding', async () => {
    const accessToken = jwtService.sign({
      sub: 'driver-a', tenantId: 'tenant-a', type: 'driver', phone: '5511999999999', name: 'Driver A', sid: 'session-a',
    });
    prisma.authSession.findUnique.mockResolvedValue({
      status: AuthSessionStatus.active,
      expiresAt: new Date(Date.now() + 60_000),
      subjectType: AuthSubjectType.driver,
      subjectId: 'driver-a',
      tenantId: 'tenant-a',
    });
    prisma.deliveryDriver.findFirst.mockResolvedValue({ id: 'driver-a' });

    await expect(service.validateAccessToken(accessToken)).resolves.toEqual(expect.objectContaining({
      sub: 'driver-a', tenantId: 'tenant-a', sid: 'session-a', type: 'driver',
    }));

    prisma.authSession.findUnique.mockResolvedValue({
      status: AuthSessionStatus.revoked,
      expiresAt: new Date(Date.now() + 60_000),
      subjectType: AuthSubjectType.driver,
      subjectId: 'driver-a',
      tenantId: 'tenant-a',
    });
    await expect(service.validateAccessToken(accessToken)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('preserves tenant binding during refresh rotation and supports logout', async () => {
    authSessionService.rotateSession.mockResolvedValue({
      payload: { sub: 'driver-a', tenantId: 'tenant-a', type: 'driver', phone: '5511999999999', name: 'Driver A' },
      sessionId: 'session-b',
      refreshToken: 'refresh-b',
    });
    prisma.deliveryDriver.findUnique.mockResolvedValue(driver('driver-a', tenantA, validPinHash));

    const refreshed = await service.refreshToken('refresh-a');
    expect(jwtService.verify(refreshed.accessToken)).toEqual(expect.objectContaining({
      sub: 'driver-a', tenantId: 'tenant-a', sid: 'session-b', type: 'driver',
    }));

    await service.logout('session-b');
    expect(authSessionService.revokeSession).toHaveBeenCalledWith('session-b', 'logout');
  });
});
