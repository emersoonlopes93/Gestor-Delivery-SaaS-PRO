import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { AuthSessionStatus, AuthSubjectType } from '@prisma/client';
import { AuthSessionService } from './auth-session.service';
import { AUTH_SESSION_REVOKED_EVENT } from './auth-session.events';

describe('AuthSessionService', () => {
  let mockPrismaService: {
    authSession: {
      create: jest.Mock;
      findUnique: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
      findMany: jest.Mock;
      count: jest.Mock;
    };
    $transaction: jest.Mock;
  };
  let service: AuthSessionService;

  afterEach(() => {
    jest.useRealTimers();
  });

  beforeEach(() => {
    mockPrismaService = {
      authSession: {
        create: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
      },
      $transaction: jest.fn((callback: (tx: typeof mockPrismaService) => unknown) => callback(mockPrismaService)),
    };
    mockPrismaService.authSession.updateMany.mockResolvedValue({ count: 1 });
    const mockConfig = new ConfigService({
      JWT_REFRESH_SECRET: 'test-refresh-secret',
      JWT_REFRESH_EXPIRES_IN: '7d',
    });
    service = new AuthSessionService(
      mockPrismaService as never,
      new JwtService(),
      mockConfig,
    );
  });

  it('creates a persisted session with a hashed refresh token', async () => {
    const result = await service.createSession({
      subjectType: AuthSubjectType.tenant,
      subjectId: 'user-1',
      tenantId: 'tenant-1',
      userId: 'user-1',
      payload: { sub: 'user-1', tenantId: 'tenant-1', type: 'tenant' },
    });

    expect(result.refreshToken).toEqual(expect.any(String));
    expect(mockPrismaService.authSession.create).toHaveBeenCalledTimes(1);
    const data = mockPrismaService.authSession.create.mock.calls[0][0].data;
    expect(data.refreshTokenHash).toEqual(expect.any(String));
    expect(data.refreshTokenHash).not.toBe(result.refreshToken);
    expect(data.status).toBeUndefined();
  });

  it('rotates refresh tokens and marks the previous session as rotated', async () => {
    const created = await service.createSession({
      subjectType: AuthSubjectType.tenant,
      subjectId: 'user-1',
      tenantId: 'tenant-1',
      userId: 'user-1',
      payload: { sub: 'user-1', tenantId: 'tenant-1', type: 'tenant' },
    });
    const sessionData = mockPrismaService.authSession.create.mock.calls[0][0].data;
    mockPrismaService.authSession.findUnique.mockResolvedValueOnce({
      ...sessionData,
      id: sessionData.id,
      status: AuthSessionStatus.active,
      metadata: null,
    });

    const rotated = await service.rotateSession({
      refreshToken: created.refreshToken,
      expectedSubjectType: AuthSubjectType.tenant,
    });

    expect(rotated.refreshToken).toEqual(expect.any(String));
    expect(rotated.refreshToken).not.toBe(created.refreshToken);
    expect(mockPrismaService.authSession.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: sessionData.id, status: AuthSessionStatus.active }),
      data: expect.objectContaining({ status: AuthSessionStatus.rotated }),
    }));
    expect(mockPrismaService.authSession.create).toHaveBeenCalledTimes(2);
  });

  it('keeps the original absolute expiry when requested', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-08-08T12:00:00.000Z'));
    const created = await service.createSession({
      subjectType: AuthSubjectType.customer,
      subjectId: 'customer-1',
      tenantId: 'tenant-1',
      payload: { sub: 'customer-1', tenantId: 'tenant-1', type: 'customer' },
    });
    const sessionData = mockPrismaService.authSession.create.mock.calls[0][0].data;
    mockPrismaService.authSession.findUnique.mockResolvedValueOnce({
      ...sessionData,
      status: AuthSessionStatus.active,
      metadata: null,
    });
    jest.setSystemTime(new Date('2026-08-09T12:00:00.000Z'));

    await service.rotateSession({
      refreshToken: created.refreshToken,
      expectedSubjectType: AuthSubjectType.customer,
      expectedTenantId: 'tenant-1',
      preserveAbsoluteExpiry: true,
    });

    const rotatedData = mockPrismaService.authSession.create.mock.calls[1][0].data;
    expect(rotatedData.expiresAt).toEqual(sessionData.expiresAt);
  });

  it('rejects a concurrent rotation that cannot atomically consume the active token', async () => {
    const created = await service.createSession({
      subjectType: AuthSubjectType.customer,
      subjectId: 'customer-1',
      tenantId: 'tenant-1',
      payload: { sub: 'customer-1', tenantId: 'tenant-1', type: 'customer' },
    });
    const sessionData = mockPrismaService.authSession.create.mock.calls[0][0].data;
    mockPrismaService.authSession.findUnique.mockResolvedValueOnce({
      ...sessionData,
      status: AuthSessionStatus.active,
      metadata: null,
    });
    mockPrismaService.authSession.updateMany.mockResolvedValueOnce({ count: 0 });

    await expect(service.rotateSession({
      refreshToken: created.refreshToken,
      expectedSubjectType: AuthSubjectType.customer,
      expectedTenantId: 'tenant-1',
      preserveAbsoluteExpiry: true,
    })).rejects.toBeInstanceOf(UnauthorizedException);
    expect(mockPrismaService.authSession.create).toHaveBeenCalledTimes(1);
  });

  it('marks the token family compromised when a rotated token is reused', async () => {
    const created = await service.createSession({
      subjectType: AuthSubjectType.admin,
      subjectId: 'admin-1',
      adminUserId: 'admin-1',
      payload: { sub: 'admin-1', type: 'admin' },
    });
    const sessionData = mockPrismaService.authSession.create.mock.calls[0][0].data;
    mockPrismaService.authSession.findUnique.mockResolvedValueOnce({
      ...sessionData,
      status: AuthSessionStatus.rotated,
    });

    await expect(service.rotateSession({
      refreshToken: created.refreshToken,
      expectedSubjectType: AuthSubjectType.admin,
    })).rejects.toBeInstanceOf(UnauthorizedException);

    expect(mockPrismaService.authSession.updateMany).toHaveBeenCalledWith({
      where: { refreshTokenFamilyId: sessionData.refreshTokenFamilyId },
      data: expect.objectContaining({
        status: AuthSessionStatus.compromised,
        revokedReason: 'refresh_reuse_detected',
      }),
    });
  });

  it('rejects and marks an expired customer session', async () => {
    const created = await service.createSession({
      subjectType: AuthSubjectType.customer,
      subjectId: 'customer-1',
      tenantId: 'tenant-1',
      payload: { sub: 'customer-1', tenantId: 'tenant-1', type: 'customer' },
    });
    const sessionData = mockPrismaService.authSession.create.mock.calls[0][0].data;
    mockPrismaService.authSession.findUnique.mockResolvedValueOnce({
      ...sessionData,
      status: AuthSessionStatus.active,
      expiresAt: new Date(Date.now() - 1),
    });

    await expect(service.rotateSession({
      refreshToken: created.refreshToken,
      expectedSubjectType: AuthSubjectType.customer,
      expectedTenantId: 'tenant-1',
    })).rejects.toBeInstanceOf(UnauthorizedException);
    expect(mockPrismaService.authSession.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: AuthSessionStatus.expired }),
    }));
  });

  it('rejects a revoked customer session and refresh after logout', async () => {
    const created = await service.createSession({
      subjectType: AuthSubjectType.customer,
      subjectId: 'customer-1',
      tenantId: 'tenant-1',
      payload: { sub: 'customer-1', tenantId: 'tenant-1', type: 'customer' },
    });
    const sessionData = mockPrismaService.authSession.create.mock.calls[0][0].data;
    mockPrismaService.authSession.findUnique.mockResolvedValueOnce({
      ...sessionData,
      status: AuthSessionStatus.revoked,
    });

    await expect(service.rotateSession({
      refreshToken: created.refreshToken,
      expectedSubjectType: AuthSubjectType.customer,
      expectedTenantId: 'tenant-1',
    })).rejects.toBeInstanceOf(UnauthorizedException);
    expect(mockPrismaService.authSession.create).toHaveBeenCalledTimes(1);
  });

  it('rejects tenant mismatch before consuming the refresh token', async () => {
    const created = await service.createSession({
      subjectType: AuthSubjectType.customer,
      subjectId: 'customer-1',
      tenantId: 'tenant-1',
      payload: { sub: 'customer-1', tenantId: 'tenant-1', type: 'customer' },
    });
    const sessionData = mockPrismaService.authSession.create.mock.calls[0][0].data;
    mockPrismaService.authSession.findUnique.mockResolvedValueOnce({
      ...sessionData,
      status: AuthSessionStatus.active,
    });

    await expect(service.rotateSession({
      refreshToken: created.refreshToken,
      expectedSubjectType: AuthSubjectType.customer,
      expectedTenantId: 'tenant-2',
    })).rejects.toBeInstanceOf(UnauthorizedException);
    expect(mockPrismaService.authSession.updateMany).not.toHaveBeenCalled();
  });

  it('publishes only the revoked session id for websocket cleanup', async () => {
    const emitter = { emit: jest.fn() };
    const config = new ConfigService({ JWT_REFRESH_SECRET: 'test-refresh-secret' });
    const serviceWithEvents = new AuthSessionService(
      mockPrismaService as never,
      new JwtService(),
      config,
      emitter as never,
    );
    mockPrismaService.authSession.findUnique.mockResolvedValue({
      id: 'sid-x',
      status: AuthSessionStatus.active,
      subjectType: AuthSubjectType.driver,
      subjectId: 'driver-a',
      tenantId: 'tenant-a',
    });

    await serviceWithEvents.revokeSession('sid-x', 'driver_logout');

    expect(emitter.emit).toHaveBeenCalledWith(
      AUTH_SESSION_REVOKED_EVENT,
      { sessionId: 'sid-x' },
    );
  });

  it('rejects customer mismatch between refresh claims and persisted session', async () => {
    const created = await service.createSession({
      subjectType: AuthSubjectType.customer,
      subjectId: 'customer-1',
      tenantId: 'tenant-1',
      payload: { sub: 'customer-1', tenantId: 'tenant-1', type: 'customer' },
    });
    const sessionData = mockPrismaService.authSession.create.mock.calls[0][0].data;
    mockPrismaService.authSession.findUnique.mockResolvedValueOnce({
      ...sessionData,
      subjectId: 'customer-other',
      status: AuthSessionStatus.active,
    });

    await expect(service.rotateSession({
      refreshToken: created.refreshToken,
      expectedSubjectType: AuthSubjectType.customer,
      expectedTenantId: 'tenant-1',
    })).rejects.toBeInstanceOf(UnauthorizedException);
    expect(mockPrismaService.authSession.updateMany).not.toHaveBeenCalled();
  });

  it('revokes all active sessions and reports aggregate counts only', async () => {
    mockPrismaService.authSession.count
      .mockResolvedValueOnce(7)
      .mockResolvedValueOnce(0);
    mockPrismaService.authSession.updateMany.mockResolvedValueOnce({ count: 7 });

    await expect(service.revokeAllActiveSessions('security_jwt_secret_rotation')).resolves.toEqual({
      activeBefore: 7,
      revoked: 7,
      activeAfter: 0,
    });
    expect(mockPrismaService.authSession.updateMany).toHaveBeenCalledWith({
      where: { status: AuthSessionStatus.active },
      data: expect.objectContaining({
        status: AuthSessionStatus.revoked,
        revokedReason: 'security_jwt_secret_rotation',
      }),
    });
  });
});
