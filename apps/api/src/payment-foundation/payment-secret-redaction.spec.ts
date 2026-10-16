import {
  redactFinancialSecrets,
  redactFinancialSecretText,
} from './payment-secret-redaction';

describe('payment financial secret redaction', () => {
  it('redacts nested payment credentials before structured logging', () => {
    const redacted = redactFinancialSecrets({
      tenantId: 'tenant-1',
      nested: {
        accessToken: 'known-access-token',
        webhook_secret: 'known-webhook-secret',
      },
    });

    expect(JSON.stringify(redacted)).not.toContain('known-access-token');
    expect(JSON.stringify(redacted)).not.toContain('known-webhook-secret');
    expect(redacted).toEqual({
      tenantId: 'tenant-1',
      nested: {
        accessToken: '[REDACTED]',
        webhook_secret: '[REDACTED]',
      },
    });
  });

  it('redacts bearer tokens and key-value secrets from provider error text', () => {
    const redacted = redactFinancialSecretText(
      'Authorization: Bearer known-token access_token=other-token',
    );
    expect(redacted).not.toContain('known-token');
    expect(redacted).not.toContain('other-token');
  });
});
