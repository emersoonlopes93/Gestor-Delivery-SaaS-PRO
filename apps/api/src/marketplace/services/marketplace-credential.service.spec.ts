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

  it('uses a unique nonce for every encryption', () => {
    expect(service.encrypt('same-token')).not.toBe(service.encrypt('same-token'));
  });

  it('rejects an altered authenticated ciphertext', () => {
    const encrypted = service.encrypt('sensitive-token');
    const parts = encrypted.split(':');
    parts[parts.length - 1] = Buffer.from('altered').toString('base64');
    expect(() => service.decrypt(parts.join(':'))).toThrow('could not be decrypted');
  });

  it('rejects a ciphertext encrypted with an unavailable key version', () => {
    const other = new MarketplaceCredentialService(new ConfigService({
      MARKETPLACE_CREDENTIALS_ENCRYPTION_KEY: Buffer.alloc(32, 8).toString('base64'),
      MARKETPLACE_CREDENTIALS_KEY_VERSION: 'other',
    }));
    expect(() => service.decrypt(other.encrypt('sensitive-token'))).toThrow('key version is unavailable');
  });

  it('reads a previous key version and rotates it to the current version', () => {
    const previousKey = Buffer.alloc(32, 9).toString('base64');
    const previous = new MarketplaceCredentialService(new ConfigService({
      MARKETPLACE_CREDENTIALS_ENCRYPTION_KEY: previousKey,
      MARKETPLACE_CREDENTIALS_KEY_VERSION: 'previous',
    }));
    const rotating = new MarketplaceCredentialService(new ConfigService({
      MARKETPLACE_CREDENTIALS_ENCRYPTION_KEY: key,
      MARKETPLACE_CREDENTIALS_KEY_VERSION: 'current',
      MARKETPLACE_CREDENTIALS_PREVIOUS_ENCRYPTION_KEY: previousKey,
      MARKETPLACE_CREDENTIALS_PREVIOUS_KEY_VERSION: 'previous',
    }));
    const rotated = rotating.rotate(previous.encrypt('sensitive-token'));
    expect(rotated).toMatch(/^enc:v2:current:/);
    expect(rotating.decrypt(rotated)).toBe('sensitive-token');
  });

  it('keeps 99Food application credentials independent from encryption-key versioning', () => {
    const configured = new MarketplaceCredentialService(new ConfigService({
      MARKETPLACE_CREDENTIALS_ENCRYPTION_KEY: key,
      MARKETPLACE_CREDENTIALS_KEY_VERSION: 'rotated-key',
      MARKETPLACE_99FOOD_APP_ID: 'app-id',
      MARKETPLACE_99FOOD_CLIENT_SECRET: 'app-secret',
    }));

    expect(configured.getFood99AppCredentials()).toEqual({
      appId: 'app-id',
      clientSecret: 'app-secret',
    });
  });
});
