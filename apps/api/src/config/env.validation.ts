import { z } from 'zod';

const baseEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'staging', 'production']).default('development'),
  API_PORT: z.coerce.number().int().positive().default(3333),
  API_PREFIX: z.string().min(1).default('/api/v1'),
  DATABASE_URL: z.string().min(1),
  DIRECT_URL: z.string().min(1),
  JWT_SECRET: z.string().min(16),
  JWT_REFRESH_SECRET: z.string().min(16),
  JWT_EXPIRES_IN: z.string().min(1).default('15m'),
  JWT_REFRESH_EXPIRES_IN: z.string().min(1).default('7d'),
  CORS_ORIGINS: z.string().default(''),
  RATE_LIMIT_TTL_SECONDS: z.coerce.number().int().positive().default(60),
  RATE_LIMIT_MAX_REQUESTS: z.coerce.number().int().positive().default(120),
  RATE_LIMIT_AUTH_TTL_SECONDS: z.coerce.number().int().positive().default(60),
  RATE_LIMIT_AUTH_MAX_REQUESTS: z.coerce.number().int().positive().default(10),
  RATE_LIMIT_PUBLIC_TTL_SECONDS: z.coerce.number().int().positive().default(60),
  RATE_LIMIT_PUBLIC_MAX_REQUESTS: z.coerce.number().int().positive().default(60),
  SWAGGER_ENABLED: z.enum(['true', 'false']).default('false'),
  SWAGGER_PATH: z.string().min(1).default('/docs'),

  // Email & Security
  SMTP_HOST: z.string().default(''),
  SMTP_PORT: z.coerce.number().int().positive().default(587),
  SMTP_USER: z.string().default(''),
  SMTP_PASS: z.string().default(''),
  SMTP_FROM: z.string().default('noreply@pedehub.com.br'),
  FRONTEND_URL: z.string().default('http://localhost:3000'),

  // WhatsApp Cloud API (Customer OTP + Notifications)
  WHATSAPP_CLOUD_ACCESS_TOKEN: z.string().default(''),
  WHATSAPP_CLOUD_PHONE_NUMBER_ID: z.string().default(''),
  WHATSAPP_CLOUD_GRAPH_API_VERSION: z.string().default('v19.0'),
  WHATSAPP_OTP_MESSAGE_TEMPLATE: z.string().default('Seu código de acesso é: {CODE}'),
  WHATSAPP_WEBHOOK_VERIFY_TOKEN: z.string().default(''),

  // Web Push (VAPID)
  VAPID_PUBLIC_KEY: z.string().default(''),
  VAPID_PRIVATE_KEY: z.string().default(''),
  VAPID_SUBJECT: z.string().default('mailto:admin@pedehub.com.br'),

  // Mercado Pago
  MERCADO_PAGO_WEBHOOK_SECRET: z.string().default(''),

  // AI Providers. SaaS Admin database config has runtime priority; ENV is fallback.
  OPENAI_API_KEY: z.string().default(''),
  OPENAI_MODEL: z.string().default(''),
  ANTHROPIC_API_KEY: z.string().default(''),
  ANTHROPIC_MODEL: z.string().default(''),
  ANTHROPIC_VERSION: z.string().default('2023-06-01'),
  GOOGLE_AI_API_KEY: z.string().default(''),
  GEMINI_API_KEY: z.string().default(''),
  GOOGLE_AI_MODEL: z.string().default(''),
  GOOGLE_AI_BASE_URL: z.string().default('https://generativelanguage.googleapis.com/v1beta'),

  // Redis
  REDIS_ENABLED: z.enum(['true', 'false']).default('true'),
  REDIS_HOST: z.string().default('localhost'),
  REDIS_PORT: z.coerce.number().int().positive().default(6379),
  REDIS_PASSWORD: z.string().default(''),
  REDIS_TLS: z.enum(['true', 'false']).default('false'),

  // Feature Flags
  BULLMQ_ENABLED: z.enum(['true', 'false']).default('false'),
  CAMPAIGNS_DISPATCH_ENABLED: z.enum(['true', 'false']).default('false'),
  BILLING_DB_PREFLIGHT: z.enum(['strict', 'warn', 'off']).optional(),
  BILLING_PAYMENTS_ENABLED: z.enum(['true', 'false']).default('false'),
  BILLING_GATEWAY_PROVIDER: z.enum(['manual', 'mock', 'asaas', 'mercado_pago', 'stripe']).default('manual'),
  BILLING_GATEWAY_MODE: z.enum(['disabled', 'manual', 'sandbox', 'production']).default('disabled'),
  ASAAS_BILLING_API_KEY: z.string().default(''),
  ASAAS_BILLING_BASE_URL: z.string().default('https://api-sandbox.asaas.com/v3'),
  ASAAS_BILLING_WEBHOOK_SECRET: z.string().default(''),
  ASAAS_WEBHOOK_TOKEN: z.string().default(''),
  ASAAS_WEBHOOK_HMAC_SECRET: z.string().default(''),
  ASAAS_WEBHOOK_ALLOW_LEGACY_TOKEN: z.enum(['true', 'false']).default('false'),
  WEBHOOK_SECURITY_SMOKE_ENABLED: z.enum(['true', 'false']).default('false'),
  WEBHOOK_REPLAY_WINDOW_SECONDS: z.coerce.number().int().positive().default(300),

  // Storage Driver & Cloudflare R2
  STORAGE_DRIVER: z.enum(['local', 'r2']).optional(),
  MEDIA_STORAGE_PROVIDER: z.enum(['local', 'r2']).optional(),
  MEDIA_STORAGE_DRIVER: z.enum(['local', 'r2']).optional(),
  MEDIA_LOCAL_ROOT: z.string().optional(),
  MEDIA_UPLOAD_DIR: z.string().optional(),
  MEDIA_PUBLIC_BASE_URL: z.string().optional(),
  MEDIA_CDN_BASE_URL: z.string().optional(),
  MEDIA_MAX_SIZE_BYTES: z.coerce.number().int().positive().optional(),
  MEDIA_MAX_FILE_SIZE_MB: z.coerce.number().int().positive().optional(),
  R2_ACCOUNT_ID: z.string().default(''),
  R2_ACCESS_KEY_ID: z.string().default(''),
  R2_SECRET_ACCESS_KEY: z.string().default(''),
  R2_BUCKET: z.string().default(''),
  R2_PUBLIC_BASE_URL: z.string().default(''),
  R2_REGION: z.string().default('auto'),
});

const envSchema = baseEnvSchema
  .transform((data) => {
    const isProduction = data.NODE_ENV === 'production';
    const resolvedDriver = data.MEDIA_STORAGE_PROVIDER || data.MEDIA_STORAGE_DRIVER || data.STORAGE_DRIVER || (isProduction ? 'r2' : 'local');
    return {
      ...data,
      STORAGE_DRIVER: resolvedDriver as 'local' | 'r2',
      MEDIA_STORAGE_PROVIDER: resolvedDriver as 'local' | 'r2',
    };
  })
  .superRefine((data, ctx) => {
    const isProduction = data.NODE_ENV === 'production';

    if (data.BILLING_GATEWAY_MODE === 'production' && !isProduction) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['BILLING_GATEWAY_MODE'],
        message: `BILLING_GATEWAY_MODE='production' só é permitido com NODE_ENV='production'.`,
      });
    }

    if (data.BILLING_PAYMENTS_ENABLED === 'true' && data.BILLING_GATEWAY_MODE === 'disabled') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['BILLING_PAYMENTS_ENABLED'],
        message: `BILLING_PAYMENTS_ENABLED='true' exige BILLING_GATEWAY_MODE='manual', 'sandbox' ou 'production'.`,
      });
    }

    if (data.BILLING_GATEWAY_PROVIDER === 'mock' && data.BILLING_GATEWAY_MODE !== 'sandbox') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['BILLING_GATEWAY_PROVIDER'],
        message: `BILLING_GATEWAY_PROVIDER='mock' exige BILLING_GATEWAY_MODE='sandbox'.`,
      });
    }

    if (data.BILLING_GATEWAY_PROVIDER === 'manual' && data.BILLING_GATEWAY_MODE !== 'disabled' && data.BILLING_GATEWAY_MODE !== 'manual') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['BILLING_GATEWAY_PROVIDER'],
        message: `BILLING_GATEWAY_PROVIDER='manual' exige BILLING_GATEWAY_MODE='manual' quando pagamentos estao ativos.`,
      });
    }

    if (data.BILLING_GATEWAY_PROVIDER === 'asaas' && data.BILLING_GATEWAY_MODE !== 'sandbox') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['BILLING_GATEWAY_PROVIDER'],
        message: `BILLING_GATEWAY_PROVIDER='asaas' esta liberado somente com BILLING_GATEWAY_MODE='sandbox' nesta fase.`,
      });
    }

    if (data.BILLING_GATEWAY_PROVIDER === 'asaas' && data.BILLING_GATEWAY_MODE === 'sandbox') {
      if (!data.ASAAS_BILLING_BASE_URL.startsWith('https://api-sandbox.asaas.com/v3')) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['ASAAS_BILLING_BASE_URL'],
          message: `ASAAS_BILLING_BASE_URL deve apontar para https://api-sandbox.asaas.com/v3 nesta fase.`,
        });
      }

      if (data.BILLING_PAYMENTS_ENABLED === 'true' && !data.ASAAS_BILLING_API_KEY.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['ASAAS_BILLING_API_KEY'],
          message: `ASAAS_BILLING_API_KEY e obrigatoria quando Asaas billing sandbox esta ativo.`,
        });
      }
    }

    if (isProduction && data.STORAGE_DRIVER === 'local') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['STORAGE_DRIVER'],
        message: `STORAGE_DRIVER='local' não é permitido em produção. Defina STORAGE_DRIVER=r2.`,
      });
    }

    if (data.STORAGE_DRIVER === 'r2') {
      const requiredR2Fields = [
        'R2_ACCOUNT_ID',
        'R2_ACCESS_KEY_ID',
        'R2_SECRET_ACCESS_KEY',
        'R2_BUCKET',
        'R2_PUBLIC_BASE_URL',
      ] as const;

      for (const field of requiredR2Fields) {
        if (!data[field] || data[field].trim() === '') {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [field],
            message: `${field} é obrigatório quando STORAGE_DRIVER é 'r2' (ou em produção).`,
          });
        }
      }
    }

    if (isProduction) {
      if (data.JWT_SECRET === data.JWT_REFRESH_SECRET) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['JWT_REFRESH_SECRET'],
          message: `JWT_REFRESH_SECRET deve ser diferente de JWT_SECRET em producao.`,
        });
      }

      if (data.JWT_SECRET.length < 32 || data.JWT_REFRESH_SECRET.length < 32) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['JWT_SECRET'],
          message: `JWT_SECRET e JWT_REFRESH_SECRET devem ter pelo menos 32 caracteres em producao.`,
        });
      }

      if (!data.CORS_ORIGINS.trim() || data.CORS_ORIGINS.includes('localhost')) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['CORS_ORIGINS'],
          message: `CORS_ORIGINS deve ser restrito a dominios reais em producao e nao pode conter localhost.`,
        });
      }

      if (data.SWAGGER_ENABLED !== 'false') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['SWAGGER_ENABLED'],
          message: `SWAGGER_ENABLED deve ser 'false' em producao.`,
        });
      }

      if (!data.ASAAS_WEBHOOK_HMAC_SECRET.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['ASAAS_WEBHOOK_HMAC_SECRET'],
          message: `ASAAS_WEBHOOK_HMAC_SECRET e obrigatorio em producao.`,
        });
      }

      if (data.ASAAS_WEBHOOK_ALLOW_LEGACY_TOKEN !== 'false') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['ASAAS_WEBHOOK_ALLOW_LEGACY_TOKEN'],
          message: `ASAAS_WEBHOOK_ALLOW_LEGACY_TOKEN deve ser 'false' em producao.`,
        });
      }

      if (data.WEBHOOK_SECURITY_SMOKE_ENABLED !== 'false') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['WEBHOOK_SECURITY_SMOKE_ENABLED'],
          message: `WEBHOOK_SECURITY_SMOKE_ENABLED deve ser 'false' em producao.`,
        });
      }

      if (data.REDIS_ENABLED === 'false') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['REDIS_ENABLED'],
          message: `REDIS_ENABLED must be 'true' in production.`,
        });
      }

      if (!data.REDIS_HOST || data.REDIS_HOST === 'localhost' || data.REDIS_HOST === '127.0.0.1') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['REDIS_HOST'],
          message: `REDIS_HOST não pode ser localhost ou vazio em produção.`,
        });
      }

      if (data.BULLMQ_ENABLED !== 'true') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['BULLMQ_ENABLED'],
          message: `BULLMQ_ENABLED must be 'true' in production.`,
        });
      }
    }
  });

export type Env = z.infer<typeof envSchema>;

export function validateEnv(config: Record<string, unknown>): Env {
  const parsed = envSchema.safeParse(config);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => ({
      path: i.path.join('.'),
      message: i.message,
    }));
    throw new Error(`Invalid environment variables: ${JSON.stringify(issues)}`);
  }
  return parsed.data;
}
