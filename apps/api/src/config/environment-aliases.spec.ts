import {
  resolveAsaasBillingApiKey,
  resolveAsaasBillingBaseUrl,
  resolveGoogleAiApiKey,
  resolveMediaMaxSizeBytes,
  resolveMediaStorageDriver,
} from './environment-aliases';

describe('environment aliases', () => {
  it('uses the canonical media storage driver when canonical and legacy values coexist', () => {
    expect(resolveMediaStorageDriver({
      MEDIA_STORAGE_DRIVER: 'r2',
      MEDIA_STORAGE_PROVIDER: 'local',
      STORAGE_DRIVER: 'local',
    })).toBe('r2');
  });

  it('keeps media storage legacy fallbacks', () => {
    expect(resolveMediaStorageDriver({ MEDIA_STORAGE_PROVIDER: 'r2' })).toBe('r2');
    expect(resolveMediaStorageDriver({ STORAGE_DRIVER: 'r2' })).toBe('r2');
  });

  it('uses byte limits before the legacy megabyte limit', () => {
    expect(resolveMediaMaxSizeBytes({
      MEDIA_MAX_SIZE_BYTES: '2097152',
      MEDIA_MAX_FILE_SIZE_MB: '10',
    })).toBe(2097152);
  });

  it('converts the legacy megabyte limit to bytes', () => {
    expect(resolveMediaMaxSizeBytes({ MEDIA_MAX_FILE_SIZE_MB: '2.5' })).toBe(2621440);
  });

  it('rejects invalid configured media limits instead of silently falling back', () => {
    expect(() => resolveMediaMaxSizeBytes({
      MEDIA_MAX_SIZE_BYTES: 'invalid',
      MEDIA_MAX_FILE_SIZE_MB: '10',
    })).toThrow('MEDIA_MAX_SIZE_BYTES');
  });

  it('uses canonical Asaas Billing variables before legacy aliases', () => {
    expect(resolveAsaasBillingBaseUrl({
      ASAAS_BILLING_BASE_URL: 'https://api-sandbox.asaas.com/v3',
      ASAAS_API_URL: 'https://legacy.example.test/v3',
    })).toBe('https://api-sandbox.asaas.com/v3');
    expect(resolveAsaasBillingApiKey({
      ASAAS_BILLING_API_KEY: 'canonical',
      ASAAS_API_KEY: 'legacy',
    })).toBe('canonical');
  });

  it('uses GOOGLE_AI_API_KEY before the GEMINI_API_KEY fallback', () => {
    expect(resolveGoogleAiApiKey({ GEMINI_API_KEY: 'legacy' })).toBe('legacy');
    expect(resolveGoogleAiApiKey({
      GOOGLE_AI_API_KEY: 'canonical',
      GEMINI_API_KEY: 'legacy',
    })).toBe('canonical');
  });
});
