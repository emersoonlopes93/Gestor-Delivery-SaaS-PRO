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

  // IFood
  MARKETPLACE_IFOOD_WEBHOOK_TOKEN: z.string().default(''),

  // Upload
  MEDIA_MAX_SIZE_BYTES: z.string().optional(),
  MEDIA_MAX_FILE_SIZE_MB: z.string().optional(),

  // Campaigns & Upsell
  CAMPAIGN_AUTOMATION_ENABLED: z.enum(['true', 'false']).default('false'),
  POST_PURCHASE_UPSELL_DELAY_MINUTES: z.string().default('60'),

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
  OPENROUTER_API_KEY: z.string().default(''),
  OPENROUTER_MODEL: z.string().default(''),
  OPENROUTER_BASE_URL: z.string().default('https://openrouter.ai/api/v1'),

  // Redis
  REDIS_ENABLED: z.enum(['true', 'false']).default('true'),
  REDIS_HOST: z.string().default('localhost'),
  REDIS_PORT: z.coerce.number().int().positive().default(6379),
  REDIS_PASSWORD: z.string().default(''),
  REDIS_TLS: z.enum(['true', 'false']).default('false'),
  REDIS_TLS_REJECT_UNAUTHORIZED: z.enum(['true', 'false']).default('true'),

  // Feature Flags
  BULLMQ_ENABLED: z.enum(['true', 'false']).default('false'),
  CAMPAIGNS_DISPATCH_ENABLED: z.enum(['true', 'false']).default('false'),
  BILLING_DB_PREFLIGHT: z.enum(['strict', 'warn', 'off']).optional(),
});

export const envSchema = baseEnvSchema.superRefine((data, ctx) => {
  if (data.NODE_ENV === 'production') {
    if (data.REDIS_ENABLED === 'true') {
      if (!data.REDIS_HOST || data.REDIS_HOST === 'localhost' || data.REDIS_HOST === '127.0.0.1') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['REDIS_HOST'],
          message: `REDIS_HOST não pode ser localhost ou vazio em produção.`,
        });
      }
    }
    
    if (data.CAMPAIGNS_DISPATCH_ENABLED === 'true' && data.BULLMQ_ENABLED !== 'true') {
       ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['BULLMQ_ENABLED'],
          message: `BULLMQ_ENABLED deve ser 'true' se CAMPAIGNS_DISPATCH_ENABLED estiver ativo.`,
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
