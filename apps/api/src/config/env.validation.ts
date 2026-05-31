import { z } from 'zod';

const baseEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'staging', 'production']).default('development'),
  API_PORT: z.coerce.number().int().positive().default(3333),
  API_PREFIX: z.string().min(1).default('/api/v1'),
  DATABASE_URL: z.string().min(1),
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

  // WhatsApp Cloud API (Customer OTP + Notifications)
  WHATSAPP_CLOUD_ACCESS_TOKEN: z.string().default(''),
  WHATSAPP_CLOUD_PHONE_NUMBER_ID: z.string().default(''),
  WHATSAPP_CLOUD_GRAPH_API_VERSION: z.string().default('v19.0'),
  WHATSAPP_OTP_MESSAGE_TEMPLATE: z.string().default('Seu código de acesso é: {{CODE}}'),
  WHATSAPP_WEBHOOK_VERIFY_TOKEN: z.string().default(''),

  // Web Push (VAPID)
  VAPID_PUBLIC_KEY: z.string().default(''),
  VAPID_PRIVATE_KEY: z.string().default(''),
  VAPID_SUBJECT: z.string().default('mailto:admin@gestordelivery.com.br'),

  // Mercado Pago
  MERCADO_PAGO_WEBHOOK_SECRET: z.string().default(''),

  // Redis
  REDIS_ENABLED: z.enum(['true', 'false']).default('true'),
  REDIS_HOST: z.string().default('localhost'),
  REDIS_PORT: z.coerce.number().int().positive().default(6379),
  REDIS_PASSWORD: z.string().default(''),
  REDIS_TLS: z.enum(['true', 'false']).default('false'),

  // Feature Flags
  BULLMQ_ENABLED: z.enum(['true', 'false']).default('false'),
  CAMPAIGNS_DISPATCH_ENABLED: z.enum(['true', 'false']).default('false'),

  // Storage Driver & Cloudflare R2
  STORAGE_DRIVER: z.enum(['local', 'r2']).optional(),
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
    const resolvedDriver = data.STORAGE_DRIVER || (isProduction ? 'r2' : 'local');
    return {
      ...data,
      STORAGE_DRIVER: resolvedDriver as 'local' | 'r2',
    };
  })
  .superRefine((data, ctx) => {
    const isProduction = data.NODE_ENV === 'production';

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
