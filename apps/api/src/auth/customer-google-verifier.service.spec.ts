import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { OAuth2Client } from 'google-auth-library';
import { CustomerGoogleVerifierService } from './customer-google-verifier.service';

describe('CustomerGoogleVerifierService', () => {
  const config = { get: jest.fn() };
  let verifyIdToken: jest.SpyInstance;
  let service: CustomerGoogleVerifierService;

  beforeEach(() => {
    jest.clearAllMocks();
    config.get.mockReturnValue('google-client-id');
    verifyIdToken = jest.spyOn(OAuth2Client.prototype, 'verifyIdToken');
    service = new CustomerGoogleVerifierService(config as never);
  });

  it('uses the configured audience and accepts a verified Google subject', async () => {
    verifyIdToken.mockResolvedValue({
      getPayload: () => ({
        iss: 'https://accounts.google.com', sub: 'google-subject', email: 'customer@example.test', email_verified: true,
      }),
    });

    await expect(service.verifyCredential('credential')).resolves.toEqual({
      subject: 'google-subject', email: 'customer@example.test',
    });
    expect(verifyIdToken).toHaveBeenCalledWith({ idToken: 'credential', audience: 'google-client-id' });
  });

  it.each([
    ['invalid issuer', { iss: 'https://issuer.invalid', sub: 'sub', email: 'customer@example.test', email_verified: true }],
    ['unverified email', { iss: 'accounts.google.com', sub: 'sub', email: 'customer@example.test', email_verified: false }],
    ['missing subject', { iss: 'accounts.google.com', email: 'customer@example.test', email_verified: true }],
  ])('rejects %s', async (_label, payload) => {
    verifyIdToken.mockResolvedValue({ getPayload: () => payload });
    await expect(service.verifyCredential('credential')).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects expired, invalid-signature, or invalid-audience credentials from the official verifier', async () => {
    verifyIdToken.mockRejectedValue(new Error('token rejected'));
    await expect(service.verifyCredential('credential')).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('requires an explicit client ID configuration', async () => {
    config.get.mockReturnValue('');
    await expect(service.verifyCredential('credential')).rejects.toBeInstanceOf(BadRequestException);
  });
});
