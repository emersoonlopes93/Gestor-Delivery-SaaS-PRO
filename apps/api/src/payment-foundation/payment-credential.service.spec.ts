import { ConfigService } from '@nestjs/config';
import { PaymentCredentialService } from './payment-credential.service';

describe('PaymentCredentialService', () => {
  const service = new PaymentCredentialService(new ConfigService({
    MARKETPLACE_CREDENTIALS_ENCRYPTION_KEY: Buffer.alloc(32, 11).toString('base64'),
    MARKETPLACE_CREDENTIALS_KEY_VERSION: 'payment-r1',
  }));

  it('encrypts provider credentials with the canonical versioned AES-GCM envelope', () => {
    const stored = service.encryptCredentials({
      accessToken: 'known-access-token',
      webhookSecret: 'known-webhook-secret',
    });

    expect(stored.version).toBe('payment-r1');
    expect(stored.encrypted).toMatch(/^enc:v2:payment-r1:/);
    expect(stored.encrypted).not.toContain('known-access-token');
    expect(stored.encrypted).not.toContain('known-webhook-secret');
    expect(service.decryptCredentials(stored.encrypted)).toEqual({
      accessToken: 'known-access-token',
      webhookSecret: 'known-webhook-secret',
    });
  });
});
