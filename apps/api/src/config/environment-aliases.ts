type EnvironmentValues = Record<string, string | undefined>;

const MEBIBYTE = 1024 * 1024;

function configuredValue(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function positiveNumber(name: string, value: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive number.`);
  }
  return parsed;
}

export function resolveMediaStorageDriver(environment: EnvironmentValues): 'local' | 'r2' {
  const configured = configuredValue(environment.MEDIA_STORAGE_DRIVER)
    ?? configuredValue(environment.MEDIA_STORAGE_PROVIDER)
    ?? configuredValue(environment.STORAGE_DRIVER)
    ?? 'local';

  if (configured !== 'local' && configured !== 'r2') {
    throw new Error('MEDIA_STORAGE_DRIVER must be either "local" or "r2".');
  }

  return configured;
}

export function resolveMediaMaxSizeBytes(environment: EnvironmentValues): number {
  const canonical = configuredValue(environment.MEDIA_MAX_SIZE_BYTES);
  if (canonical) return positiveNumber('MEDIA_MAX_SIZE_BYTES', canonical);

  const legacyMegabytes = configuredValue(environment.MEDIA_MAX_FILE_SIZE_MB);
  if (legacyMegabytes) return positiveNumber('MEDIA_MAX_FILE_SIZE_MB', legacyMegabytes) * MEBIBYTE;

  return 10 * MEBIBYTE;
}

export function resolveAsaasBillingBaseUrl(environment: EnvironmentValues): string {
  return configuredValue(environment.ASAAS_BILLING_BASE_URL)
    ?? configuredValue(environment.ASAAS_API_URL)
    ?? 'https://api-sandbox.asaas.com/v3';
}

export function resolveAsaasBillingApiKey(environment: EnvironmentValues): string {
  return configuredValue(environment.ASAAS_BILLING_API_KEY)
    ?? configuredValue(environment.ASAAS_API_KEY)
    ?? '';
}

export function resolveGoogleAiApiKey(environment: EnvironmentValues): string {
  return configuredValue(environment.GOOGLE_AI_API_KEY)
    ?? configuredValue(environment.GEMINI_API_KEY)
    ?? '';
}
