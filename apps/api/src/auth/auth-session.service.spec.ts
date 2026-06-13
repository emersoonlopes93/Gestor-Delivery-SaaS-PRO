import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { AuthSessionStatus, AuthSubjectType } from '@prisma/client';
import { AuthSessionService } from './auth-session.service';

describe('AuthSessionService', () => {
  let mockPrismaService: Record<string, unknown>;
  let service: AuthSessionService;

  beforeEach(() => {
    mockPrismaService = {
      authSession: {
        create: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
        findMany: jest.fn(),
      },
      $transaction: jest.fn((callback: Function) => callback(mockPrismaService)),
    };
    service = new AuthSessionService(
      (mockPrismaService as unknown) as PrismaService,
      new JwtService(),
      { get: jest.fn((key: string, fallback?: string) => ({
        JWT_REFRESH_SECRET: 'test-refresh-secret',
        JWT_REFRESH_EXPIRES_IN: '7d',
        }[key] ?? fallback)) } as unknown) as ConfigService,
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
    expect(mockPrismaService.authSession.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: sessionData.id },
      data: expect.objectContaining({ status: AuthSessionStatus.rotated }),
    }));
    expect(mockPrismaService.authSession.create).toHaveBeenCalledTimes(2);
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
});
