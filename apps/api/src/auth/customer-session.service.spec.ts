import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AuthSubjectType } from '@prisma/client';
import { CustomerSessionService } from './customer-session.service';

describe('CustomerSessionService', () => {
  const customer = {
    id: 'customer-1',
    tenantId: 'tenant-1',
    name: 'Cliente',
    phone: '5511999999999',
  };
  const prisma = {
    customer: { findFirst: jest.fn() },
  };
  const authSessions = {
    createSession: jest.fn(),
    rotateSession: jest.fn(),
    revokeSession: jest.fn(),
  };
  const jwt = new JwtService({ secret: 'access-secret', signOptions: { expiresIn: '15m' } });
  let service: CustomerSessionService;

  beforeEach(() => {
    jest.clearAllMocks();
    authSessions.createSession.mockResolvedValue({
      sessionId: 'session-1',
      refreshToken: 'refresh-1',
    });
    service = new CustomerSessionService(prisma as never, jwt, authSessions as never);
  });

  it('issues the same persisted AuthSession contract for customer logins', async () => {
    const result = await service.issue(customer, { userAgent: 'test' });
    const payload = jwt.verify<Record<string, unknown>>(result.accessToken);

    expect(authSessions.createSession).toHaveBeenCalledWith({
      subjectType: AuthSubjectType.customer,
      subjectId: customer.id,
      tenantId: customer.tenantId,
      payload: { sub: customer.id, tenantId: customer.tenantId, type: 'customer' },
      context: { userAgent: 'test' },
    });
    expect(result.refreshToken).toBe('refresh-1');
    expect(payload).toEqual(expect.objectContaining({
      sub: customer.id,
      tenantId: customer.tenantId,
      type: 'customer',
      sid: 'session-1',
    }));
    expect(payload).not.toHaveProperty('phone');
    expect(payload).not.toHaveProperty('name');
    expect(Number(payload.exp) - Number(payload.iat)).toBe(15 * 60);
  });

  it('rotates a tenant-bound customer refresh without extending absolute expiry', async () => {
    authSessions.rotateSession.mockResolvedValue({
      sessionId: 'session-2',
      refreshToken: 'refresh-2',
      session: { subjectId: customer.id, tenantId: customer.tenantId },
    });
    prisma.customer.findFirst.mockResolvedValue(customer);

    const result = await service.refresh('refresh-1', customer.tenantId);

    expect(authSessions.rotateSession).toHaveBeenCalledWith(expect.objectContaining({
      refreshToken: 'refresh-1',
      expectedSubjectType: AuthSubjectType.customer,
      expectedTenantId: customer.tenantId,
      preserveAbsoluteExpiry: true,
    }));
    expect(result.refreshToken).toBe('refresh-2');
    expect(jwt.verify(result.accessToken)).toEqual(expect.objectContaining({ sid: 'session-2' }));
  });

  it('revokes a rotated session if its tenant-scoped customer no longer exists', async () => {
    authSessions.rotateSession.mockResolvedValue({
      sessionId: 'session-2',
      refreshToken: 'refresh-2',
      session: { subjectId: customer.id, tenantId: customer.tenantId },
    });
    prisma.customer.findFirst.mockResolvedValue(null);

    await expect(service.refresh('refresh-1', customer.tenantId)).rejects.toBeInstanceOf(UnauthorizedException);
    expect(authSessions.revokeSession).toHaveBeenCalledWith('session-2', 'customer_not_found');
  });

  it('revokes the current server-side session on logout', async () => {
    authSessions.revokeSession.mockResolvedValue({ revoked: true });
    await expect(service.logout('session-1')).resolves.toEqual({ revoked: true });
    expect(authSessions.revokeSession).toHaveBeenCalledWith('session-1', 'logout');
  });
});
