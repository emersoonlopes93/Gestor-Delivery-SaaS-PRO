import { ConfigService } from '@nestjs/config';
import { MarketplaceCredentialService } from './marketplace-credential.service';

describe('MarketplaceCredentialService', () => {
  const key = Buffer.alloc(32, 7).toString('base64');
  const service = new MarketplaceCredentialService(new ConfigService({
    MARKETPLACE_CREDENTIALS_ENCRYPTION_KEY: key,
    MARKETPLACE_IFOOD_CLIENT_ID: 'client-id',
    MARKETPLACE_IFOOD_CLIENT_SECRET: 'client-secret',
  }));

  it('encrypts credentials with authenticated encryption and decrypts them', () => {
    const encrypted = service.encrypt('sensitive-token');
    expect(encrypted).not.toContain('sensitive-token');
    expect(service.decrypt(encrypted)).toBe('sensitive-token');
  });

  it('fails closed for legacy plaintext credentials', () => {
    expect(() => service.decrypt('plaintext-token')).toThrow('unsupported legacy storage format');
  });
});
