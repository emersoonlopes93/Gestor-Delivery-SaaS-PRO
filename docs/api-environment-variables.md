# API environment variables

This document summarizes the API environment variables that must stay aligned with `apps/api/.env.example`, the runtime code, and the validation schema.

## Rules of thumb

- Treat `apps/api/.env.example` as the canonical onboarding file.
- Keep `apps/api/src/config/env.validation.ts` aligned with any new variable that becomes required or operationally relevant.
- Do not commit real secrets. The example file should use empty values or safe local defaults.
- Operational smoke flags must stay disabled outside staging and test flows.

## Core runtime

- `NODE_ENV`
- `API_PORT`
- `API_PREFIX`
- `PUBLIC_API_URL`
- `CORS_ORIGINS`
- `FRONTEND_URL`
- `STOREFRONT_CACHE_TTL`

## Database and Prisma

- `DATABASE_URL`
- `DIRECT_URL`
- `PRISMA_TX_MAX_WAIT_MS`
- `PRISMA_BASE_MENU_DRAFT_TX_TIMEOUT_MS`

## Auth and rate limit

- `JWT_SECRET`
- `JWT_REFRESH_SECRET`
- `JWT_EXPIRES_IN`
- `JWT_REFRESH_EXPIRES_IN`
- `RATE_LIMIT_TTL_SECONDS`
- `RATE_LIMIT_MAX_REQUESTS`
- `RATE_LIMIT_AUTH_TTL_SECONDS`
- `RATE_LIMIT_AUTH_MAX_REQUESTS`
- `RATE_LIMIT_PUBLIC_TTL_SECONDS`
- `RATE_LIMIT_PUBLIC_MAX_REQUESTS`

## Billing and gateway

- `BILLING_DB_PREFLIGHT`
- `BILLING_PAYMENTS_ENABLED`
- `BILLING_GATEWAY_PROVIDER`
- `BILLING_GATEWAY_MODE`
- `ASAAS_BILLING_API_KEY`
- `ASAAS_API_URL`
- `ASAAS_API_KEY`
- `ASAAS_BILLING_BASE_URL`
- `ASAAS_BILLING_WEBHOOK_SECRET`
- `ASAAS_WEBHOOK_TOKEN`
- `ASAAS_WEBHOOK_HMAC_SECRET`
- `ASAAS_WEBHOOK_ALLOW_LEGACY_TOKEN`
- `WEBHOOK_REPLAY_WINDOW_SECONDS`
- `WEBHOOK_SECURITY_SMOKE_ENABLED`
- `BILLING_SMOKE_ENABLED`
- `MERCADO_PAGO_WEBHOOK_SECRET`

## Billing smoke and operational gates

- `SMOKE_ENABLED`
- `ALLOW_SMOKE_RESET`
- `MARKETPLACE_SMOKE_ENABLED`
- `FEATURE_WHATSAPP_STATUS_CAMPAIGNS`
- `POST_PURCHASE_UPSELL_DELAY_MINUTES`

## Redis and queues

- `REDIS_ENABLED`
- `REDIS_HOST`
- `REDIS_PORT`
- `REDIS_PASSWORD`
- `REDIS_TLS`
- `REDIS_TLS_REJECT_UNAUTHORIZED`
- `REDIS_CONNECT_TIMEOUT_MS`
- `REDIS_RECONNECT_BASE_DELAY_MS`
- `REDIS_RECONNECT_MAX_DELAY_MS`
- `REDIS_RECONNECT_MAX_ATTEMPTS`
- `REDIS_LOG_THROTTLE_MS`
- `REDIS_HEALTH_CACHE_TTL_MS`
- `REDIS_HEALTH_TIMEOUT_MS`
- `BULLMQ_ENABLED`
- `CAMPAIGNS_DISPATCH_ENABLED`
- `CAMPAIGN_AUTOMATION_ENABLED`

## Storage and uploads

- `STORAGE_DRIVER`
- `MEDIA_STORAGE_PROVIDER`
- `MEDIA_STORAGE_DRIVER`
- `MEDIA_LOCAL_ROOT`
- `MEDIA_UPLOAD_DIR`
- `MEDIA_PUBLIC_BASE_URL`
- `MEDIA_CDN_BASE_URL`
- `MEDIA_MAX_SIZE_BYTES`
- `MEDIA_MAX_FILE_SIZE_MB`
- `R2_ACCOUNT_ID`
- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`
- `R2_BUCKET`
- `R2_PUBLIC_BASE_URL`
- `R2_REGION`

## AI and geocoding

- `OPENAI_API_KEY`
- `OPENAI_MODEL`
- `OPENAI_BASE_URL`
- `ANTHROPIC_API_KEY`
- `ANTHROPIC_MODEL`
- `ANTHROPIC_VERSION`
- `GEMINI_API_KEY`
- `GOOGLE_AI_API_KEY`
- `GOOGLE_AI_MODEL`
- `GOOGLE_AI_BASE_URL`
- `AI_SIMULATE_TYPING`
- `AI_TYPING_MIN_DELAY_MS`
- `AI_TYPING_MAX_DELAY_MS`
- `GOOGLE_MAPS_KEY`
- `VITE_GOOGLE_MAPS_KEY`

## WhatsApp and marketplace

- `WHATSAPP_CLOUD_ACCESS_TOKEN`
- `WHATSAPP_CLOUD_PHONE_NUMBER_ID`
- `WHATSAPP_CLOUD_GRAPH_API_VERSION`
- `WHATSAPP_OTP_MESSAGE_TEMPLATE`
- `WHATSAPP_WEBHOOK_VERIFY_TOKEN`
- `MARKETPLACE_IFOOD_WEBHOOK_TOKEN`
- `MARKETPLACE_IFOOD_CLIENT_ID`
- `MARKETPLACE_IFOOD_CLIENT_SECRET`
- `MARKETPLACE_IFOOD_API_BASE_URL`
- `MARKETPLACE_IFOOD_HTTP_TIMEOUT_MS`
- `MARKETPLACE_IFOOD_BIDIRECTIONAL_ENABLED`
- `MARKETPLACE_CREDENTIALS_ENCRYPTION_KEY`

## Email, push and docs

- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_USER`
- `SMTP_PASS`
- `SMTP_FROM`
- `VAPID_PUBLIC_KEY`
- `VAPID_PRIVATE_KEY`
- `VAPID_SUBJECT`
- `WEB_TENANT_URL`
- `WEB_ADMIN_URL`
- `WEB_STOREFRONT_URL`
- `SWAGGER_ENABLED`
- `SWAGGER_PATH`

## Notes for staging and production

- Leave smoke flags off in production unless the environment is explicitly dedicated to controlled validation.
- `REDIS_ENABLED` should stay `true` in production.
- `BULLMQ_ENABLED` should stay `true` in production if background jobs are expected.
- `STORAGE_DRIVER=local` is not acceptable for production when the app depends on persistent media storage.
- Keep billing and webhook secrets aligned with the upstream provider configuration.
