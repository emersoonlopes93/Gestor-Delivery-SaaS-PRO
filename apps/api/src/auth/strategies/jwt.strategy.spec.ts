import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthSessionStatus, AuthSubjectType } from '@prisma/client';
import { JwtStrategy } from './jwt.strategy';

describe('JwtStrategy customer session binding', () => {
  const prisma = { authSession: { findUnique: jest.fn() } };
  let strategy: JwtStrategy;

  beforeEach(() => {
    jest.clearAllMocks();
    strategy = new JwtStrategy(new ConfigService({ JWT_SECRET: 'secret' }), prisma as never);
  });

  it('rejects legacy customer JWTs without sid', async () => {
    await expect(strategy.validate({
      sub: 'customer-1',
      tenantId: 'tenant-1',
      type: 'customer',
    } as never)).rejects.toBeInstanceOf(UnauthorizedException);
    expect(prisma.authSession.findUnique).not.toHaveBeenCalled();
  });

  it('accepts a live session bound to the same customer and tenant', async () => {
    const payload = { sub: 'customer-1', tenantId: 'tenant-1', type: 'customer', sid: 'session-1' } as const;
    prisma.authSession.findUnique.mockResolvedValue({
      status: AuthSessionStatus.active,
      expiresAt: new Date(Date.now() + 60_000),
      subjectType: AuthSubjectType.customer,
      subjectId: payload.sub,
      tenantId: payload.tenantId,
    });
    await expect(strategy.validate(payload)).resolves.toEqual(payload);
  });

  it('rejects customer or tenant mismatch for an otherwise valid sid', async () => {
    prisma.authSession.findUnique.mockResolvedValue({
      status: AuthSessionStatus.active,
      expiresAt: new Date(Date.now() + 60_000),
      subjectType: AuthSubjectType.customer,
      subjectId: 'customer-other',
      tenantId: 'tenant-1',
    });
    await expect(strategy.validate({
      sub: 'customer-1',
      tenantId: 'tenant-1',
      type: 'customer',
      sid: 'session-1',
    })).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
