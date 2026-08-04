import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { CustomerIdentityProvider } from '@prisma/client';
import { CustomerAuthService } from './customer-auth.service';

const tenantA = { id: 'tenant-a', slug: 'loja-a' };
const tenantB = { id: 'tenant-b', slug: 'loja-b' };
const customerA = { id: 'customer-a', tenantId: tenantA.id, name: 'Cliente', phone: '5511999999999' };

describe('CustomerAuthService Google linking', () => {
  const prisma = {
    tenant: { findUnique: jest.fn() },
    customerOTP: { findFirst: jest.fn(), update: jest.fn() },
    customerExternalIdentity: { findUnique: jest.fn(), create: jest.fn() },
  };
  const customers = { syncCustomerOnOrderUpsert: jest.fn() };
  const whatsappSender = { sendText: jest.fn() };
  const googleVerifier = { verifyCredential: jest.fn() };
  const config = { get: jest.fn() };
  const jwt = new JwtService({ secret: 'customer-test-secret' });
  let service: CustomerAuthService;

  beforeEach(() => {
    jest.clearAllMocks();
    config.get.mockImplementation((key: string, fallback?: string) => key === 'JWT_SECRET' ? 'customer-test-secret' : fallback);
    service = new CustomerAuthService(
      prisma as never, jwt, config as never, customers as never, whatsappSender as never, googleVerifier as never,
    );
  });

  it('authenticates an existing tenant-scoped Google identity without OTP', async () => {
    prisma.tenant.findUnique.mockResolvedValue(tenantA);
    googleVerifier.verifyCredential.mockResolvedValue({ subject: 'google-sub', email: 'same-email@example.test' });
    prisma.customerExternalIdentity.findUnique.mockResolvedValue({ customer: customerA });

    const result = await service.signInWithGoogle('credential', tenantA.slug);

    expect(result).toEqual(expect.objectContaining({ status: 'AUTHENTICATED', customer: expect.objectContaining({ id: customerA.id }) }));
    expect(customers.syncCustomerOnOrderUpsert).not.toHaveBeenCalled();
  });

  it('requires phone OTP for a new Google identity and does not auto-link by email', async () => {
    prisma.tenant.findUnique.mockResolvedValue(tenantA);
    googleVerifier.verifyCredential.mockResolvedValue({ subject: 'google-sub', email: 'existing@example.test' });
    prisma.customerExternalIdentity.findUnique.mockResolvedValue(null);

    const result = await service.signInWithGoogle('credential', tenantA.slug);

    expect(result).toEqual(expect.objectContaining({ status: 'PHONE_LINK_REQUIRED', googleLinkCapability: expect.any(String) }));
    expect(customers.syncCustomerOnOrderUpsert).not.toHaveBeenCalled();
  });

  it('allows the same Google subject to start an independent link flow in another tenant', async () => {
    prisma.tenant.findUnique.mockResolvedValue(tenantB);
    googleVerifier.verifyCredential.mockResolvedValue({ subject: 'google-sub', email: 'customer@example.test' });
    prisma.customerExternalIdentity.findUnique.mockResolvedValue(null);

    const result = await service.signInWithGoogle('credential', tenantB.slug);

    expect(result).toEqual(expect.objectContaining({ status: 'PHONE_LINK_REQUIRED' }));
    expect(prisma.customerExternalIdentity.findUnique).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        tenantId_provider_providerSubject: expect.objectContaining({ tenantId: tenantB.id, providerSubject: 'google-sub' }),
      }),
    }));
  });

  it('links a valid OTP customer to the Google subject and emits the same customer JWT contract', async () => {
    const capability = jwt.sign({
      type: 'customer_google_link', tenantId: tenantA.id, provider: CustomerIdentityProvider.GOOGLE, providerSubject: 'google-sub',
    }, { audience: 'customer-google-link', expiresIn: '5m' });
    prisma.tenant.findUnique.mockResolvedValue(tenantA);
    prisma.customerOTP.findFirst.mockResolvedValue({ id: 'otp-a', code: '123456' });
    customers.syncCustomerOnOrderUpsert.mockResolvedValue(customerA);
    prisma.customerExternalIdentity.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce(null);

    const result = await service.validateOtp(customerA.phone, '123456', tenantA.slug, capability);

    expect(prisma.customerExternalIdentity.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      tenantId: tenantA.id, customerId: customerA.id, provider: CustomerIdentityProvider.GOOGLE, providerSubject: 'google-sub',
    }) });
    expect(jwt.verify(result.accessToken)).toEqual(expect.objectContaining({
      sub: customerA.id, tenantId: tenantA.id, type: 'customer',
    }));
  });

  it('rejects a link capability from another tenant', async () => {
    const capability = jwt.sign({
      type: 'customer_google_link', tenantId: tenantB.id, provider: CustomerIdentityProvider.GOOGLE, providerSubject: 'google-sub',
    }, { audience: 'customer-google-link', expiresIn: '5m' });
    prisma.tenant.findUnique.mockResolvedValue(tenantA);
    prisma.customerOTP.findFirst.mockResolvedValue({ id: 'otp-a', code: '123456' });
    customers.syncCustomerOnOrderUpsert.mockResolvedValue(customerA);

    await expect(service.validateOtp(customerA.phone, '123456', tenantA.slug, capability)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects an expired link capability before creating an identity', async () => {
    const capability = jwt.sign({
      type: 'customer_google_link', tenantId: tenantA.id, provider: CustomerIdentityProvider.GOOGLE, providerSubject: 'google-sub',
    }, { audience: 'customer-google-link', expiresIn: -1 });
    prisma.tenant.findUnique.mockResolvedValue(tenantA);
    prisma.customerOTP.findFirst.mockResolvedValue({ id: 'otp-a', code: '123456' });
    customers.syncCustomerOnOrderUpsert.mockResolvedValue(customerA);

    await expect(service.validateOtp(customerA.phone, '123456', tenantA.slug, capability)).rejects.toBeInstanceOf(UnauthorizedException);
    expect(prisma.customerExternalIdentity.create).not.toHaveBeenCalled();
  });

  it('rejects an identity that is already linked to another customer in the same tenant', async () => {
    const capability = jwt.sign({
      type: 'customer_google_link', tenantId: tenantA.id, provider: CustomerIdentityProvider.GOOGLE, providerSubject: 'google-sub',
    }, { audience: 'customer-google-link', expiresIn: '5m' });
    prisma.tenant.findUnique.mockResolvedValue(tenantA);
    prisma.customerOTP.findFirst.mockResolvedValue({ id: 'otp-a', code: '123456' });
    customers.syncCustomerOnOrderUpsert.mockResolvedValue(customerA);
    prisma.customerExternalIdentity.findUnique.mockResolvedValue({ customerId: 'customer-other' });

    await expect(service.validateOtp(customerA.phone, '123456', tenantA.slug, capability)).rejects.toBeInstanceOf(ConflictException);
  });
});
