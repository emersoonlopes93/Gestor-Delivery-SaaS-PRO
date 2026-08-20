const REDACTED = '[REDACTED]';

const SENSITIVE_KEYS = new Set([
  'authorization',
  'accesstoken',
  'refreshtoken',
  'clientsecret',
  'apikey',
  'webhooksecret',
  'mercadopagoaccesstoken',
  'mercadopagowebhooksecret',
  'credentialsencrypted',
  'encryptedsecret',
  'privatekey',
]);

type TenantFinancialSecretFields = {
  mercadoPagoAccessToken: string | null;
  mercadoPagoWebhookSecret: string | null;
};

export function omitTenantFinancialSecrets<T extends TenantFinancialSecretFields>(settings: T) {
  const {
    mercadoPagoAccessToken: _accessToken,
    mercadoPagoWebhookSecret: _webhookSecret,
    ...safeSettings
  } = settings;
  return safeSettings;
}

function normalizeKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]/g, '');
}

export function redactFinancialSecrets(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => redactFinancialSecrets(item));
  if (!value || typeof value !== 'object') return value;

  return Object.fromEntries(
    Object.entries(value).map(([key, nested]) => [
      key,
      SENSITIVE_KEYS.has(normalizeKey(key)) ? REDACTED : redactFinancialSecrets(nested),
    ]),
  );
}

export function redactFinancialSecretText(value: string): string {
  return value
    .replace(/\bBearer\s+[^\s,;]+/gi, `Bearer ${REDACTED}`)
    .replace(
      /\b(authorization|access[_-]?token|refresh[_-]?token|client[_-]?secret|api[_-]?key|webhook[_-]?secret)\b\s*[:=]\s*[^\s,;]+/gi,
      (_match, key: string) => `${key}=${REDACTED}`,
    );
}
