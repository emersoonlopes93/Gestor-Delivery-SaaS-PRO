---
title: Variáveis de Ambiente
status: current
owner: engineering
last_verified: 2026-07-15
verified_against: main-copy / c63d394
source_of_truth:
  - .env.example
  - apps/api/.env.example
  - apps/api/src/config/env.validation.ts
  - turbo.json
---

# Variáveis de Ambiente — Referência Completa

> Nunca commitar valores reais de produção. Use `.env.example` como referência.
> Arquivo de exemplo da raiz: `.env.example` | Da API: `apps/api/.env.example`

---

## 1. Configuração geral da API

| Variável | Obrigatória | Ambiente | App | Descrição | Exemplo | Sensível |
|----------|-------------|----------|-----|-----------|---------|---------|
| `NODE_ENV` | Sim | Todos | API | Ambiente de execução | `development` | Não |
| `API_PORT` | Sim | Todos | API | Porta HTTP da API | `3333` | Não |
| `API_PREFIX` | Sim | Todos | API | Prefixo global das rotas | `/api/v1` | Não |
| `PUBLIC_API_URL` | Não | Prod | API | URL pública da API para webhooks | `https://api.meusite.com` | Não |

---

## 2. Banco de dados (PostgreSQL / Prisma)

| Variável | Obrigatória | Ambiente | App | Descrição | Exemplo | Sensível |
|----------|-------------|----------|-----|-----------|---------|---------|
| `DATABASE_URL` | **Sim** | Todos | API | URL de conexão com pooling | `postgresql://user:pass@host:5432/db` | **Sim** |
| `DIRECT_URL` | **Sim** | Todos | API | URL direta (sem pooling) — para migrations | `postgresql://user:pass@host:5432/db` | **Sim** |

> `DIRECT_URL` é necessário para Neon/Supabase onde o pooler não suporta migrations.

---

## 3. Autenticação (JWT)

| Variável | Obrigatória | Ambiente | App | Descrição | Exemplo | Sensível |
|----------|-------------|----------|-----|-----------|---------|---------|
| `JWT_SECRET` | **Sim** | Todos | API | Chave para assinar access tokens | `your-secret-min-16-chars` | **Sim** |
| `JWT_REFRESH_SECRET` | **Sim** | Todos | API | Chave para assinar refresh tokens | `your-refresh-secret` | **Sim** |
| `JWT_EXPIRES_IN` | Sim | Todos | API | Expiração do access token | `15m` | Não |
| `JWT_REFRESH_EXPIRES_IN` | Sim | Todos | API | Expiração do refresh token | `7d` | Não |

---

## 4. Rate limiting

| Variável | Obrigatória | Ambiente | App | Descrição | Exemplo | Sensível |
|----------|-------------|----------|-----|-----------|---------|---------|
| `RATE_LIMIT_TTL_SECONDS` | Não | Todos | API | Janela de tempo global | `60` | Não |
| `RATE_LIMIT_MAX_REQUESTS` | Não | Todos | API | Max requests por janela (global) | `120` | Não |
| `RATE_LIMIT_AUTH_TTL_SECONDS` | Não | Todos | API | Janela para rotas de auth | `60` | Não |
| `RATE_LIMIT_AUTH_MAX_REQUESTS` | Não | Todos | API | Max requests de auth | `10` | Não |
| `RATE_LIMIT_PUBLIC_TTL_SECONDS` | Não | Todos | API | Janela para rotas públicas | `60` | Não |
| `RATE_LIMIT_PUBLIC_MAX_REQUESTS` | Não | Todos | API | Max requests públicos | `60` | Não |

---

## 5. CORS

| Variável | Obrigatória | Ambiente | App | Descrição | Exemplo | Sensível |
|----------|-------------|----------|-----|-----------|---------|---------|
| `CORS_ORIGINS` | Sim (prod) | Todos | API | URLs de frontends autorizadas (vírgula) | `http://localhost:5173,http://localhost:5174` | Não |

---

## 6. Redis (cache + filas BullMQ)

| Variável | Obrigatória | Ambiente | App | Descrição | Exemplo | Sensível |
|----------|-------------|----------|-----|-----------|---------|---------|
| `REDIS_HOST` | Cond. | Prod | API | Host do Redis | `redis.upstash.io` | Não |
| `REDIS_PORT` | Não | Todos | API | Porta do Redis | `6379` | Não |
| `REDIS_PASSWORD` | Cond. | Prod | API | Senha de autenticação Redis | `sua-senha` | **Sim** |
| `REDIS_TLS` | Não | Prod | API | Usar TLS (`true`/`false`) | `true` | Não |
| `REDIS_TLS_REJECT_UNAUTHORIZED` | Não | Todos | API | Rejeitar cert inválido TLS | `true` | Não |
| `REDIS_ENABLED` | Não | Todos | API | Desabilitar Redis completamente (`false`) | `true` | Não |
| `REDIS_CONNECT_TIMEOUT_MS` | Não | Todos | API | Timeout de conexão Redis | `3000` | Não |
| `REDIS_RECONNECT_BASE_DELAY_MS` | Não | Todos | API | Delay base de reconexão | `500` | Não |
| `REDIS_RECONNECT_MAX_DELAY_MS` | Não | Todos | API | Delay máximo de reconexão | `5000` | Não |
| `REDIS_RECONNECT_MAX_ATTEMPTS` | Não | Todos | API | Máximo de tentativas de reconexão | `3` | Não |
| `REDIS_HEALTH_TIMEOUT_MS` | Não | Todos | API | Timeout do health check Redis | `1500` | Não |
| `REDIS_HEALTH_CACHE_TTL_MS` | Não | Todos | API | TTL do cache interno de ping | `30000` | Não |

### BullMQ / Campanhas
| Variável | Obrigatória | Ambiente | App | Descrição | Exemplo | Sensível |
|----------|-------------|----------|-----|-----------|---------|---------|
| `BULLMQ_ENABLED` | Não | Todos | API | Habilitar BullMQ | `true` | Não |
| `CAMPAIGNS_DISPATCH_ENABLED` | Não | Todos | API | Habilitar dispatcher de campanhas | `true` | Não |
| `CAMPAIGN_AUTOMATION_ENABLED` | Não | Todos | API | Habilitar varredura periódica de automações | `true` | Não |

> Todos os três devem ser `true` para automações funcionarem. Requerem Redis configurado.

### iFood bidirecional (Beta)

| Variável | Obrigatória | Ambiente | Descrição | Sensível |
|---|---|---|---|---|
| `MARKETPLACE_IFOOD_BIDIRECTIONAL_ENABLED` | Sim para ativar | Todos | Kill switch técnico; default `false` | Não |
| `MARKETPLACE_IFOOD_CLIENT_ID` | Cond. | Staging/Prod | ID do aplicativo no Developer Portal | Sim |
| `MARKETPLACE_IFOOD_CLIENT_SECRET` | Cond. | Staging/Prod | Secret OAuth e chave HMAC oficial do webhook | **Sim** |
| `MARKETPLACE_IFOOD_API_BASE_URL` | Não | Todos | Default `https://merchant-api.ifood.com.br` | Não |
| `MARKETPLACE_IFOOD_HTTP_TIMEOUT_MS` | Não | Todos | Timeout por request; default `10000` | Não |
| `MARKETPLACE_CREDENTIALS_ENCRYPTION_KEY` | Cond. | Todos | Chave AES de 32 bytes em base64; gerar e guardar no secret manager | **Sim** |
| `MARKETPLACE_SMOKE_ENABLED` | Não | Staging | Permite bypass exclusivo do smoke; manter `false` em produção | Não |

Ativar o kill switch exige também `REDIS_ENABLED=true`, `BULLMQ_ENABLED=true`, credenciais oficiais e migration aplicada. `MARKETPLACE_IFOOD_WEBHOOK_TOKEN` é legado e não substitui `X-IFood-Signature`.

---

## 7. Storage de mídia

| Variável | Obrigatória | Ambiente | App | Descrição | Exemplo | Sensível |
|----------|-------------|----------|-----|-----------|---------|---------|
| `MEDIA_STORAGE_DRIVER` | Sim | Todos | API | Driver de storage (`local` ou `r2`) | `local` | Não |
| `STORAGE_DRIVER` | Não | Todos | API | Alias legacy de MEDIA_STORAGE_DRIVER | `local` | Não |
| `MEDIA_UPLOAD_DIR` | Não | Dev | API | Diretório local de uploads | `uploads` | Não |
| `UPLOAD_DIR` | Não | Dev | API | Alias legacy de MEDIA_UPLOAD_DIR | `uploads` | Não |
| `MEDIA_PUBLIC_BASE_URL` | Sim (local) | Dev | API | URL base para acesso a mídias locais | `http://localhost:3333/api/v1/static` | Não |
| `MEDIA_MAX_SIZE_BYTES` | Não | Todos | API | Tamanho máximo de upload em bytes | `10485760` | Não |
| `R2_ACCOUNT_ID` | Cond. (r2) | Prod | API | ID da conta Cloudflare R2 | `abc123` | Não |
| `R2_ACCESS_KEY_ID` | Cond. (r2) | Prod | API | Access Key do R2 | `key` | **Sim** |
| `R2_SECRET_ACCESS_KEY` | Cond. (r2) | Prod | API | Secret Key do R2 | `secret` | **Sim** |
| `R2_BUCKET` | Cond. (r2) | Prod | API | Nome do bucket R2 | `meu-bucket` | Não |
| `R2_PUBLIC_BASE_URL` | Cond. (r2) | Prod | API | URL pública do bucket R2 | `https://cdn.meusite.com` | Não |
| `R2_REGION` | Não | Prod | API | Região R2 | `auto` | Não |

> `MEDIA_STORAGE_DRIVER=r2` é obrigatório em produção (`NODE_ENV=production`).

---

## 8. Inteligência Artificial

| Variável | Obrigatória | Ambiente | App | Descrição | Exemplo | Sensível |
|----------|-------------|----------|-----|-----------|---------|---------|
| `OPENAI_API_KEY` | Cond. | Prod | API | Chave da API OpenAI | `sk-...` | **Sim** |
| `OPENAI_MODEL` | Não | Todos | API | Modelo OpenAI padrão | `gpt-4o` | Não |
| `OPENAI_BASE_URL` | Não | Todos | API | URL base da API (suporta OpenRouter) | `https://api.openai.com/v1` | Não |
| `AI_SIMULATE_TYPING` | Não | Todos | API | Simular digitação no WhatsApp | `true` | Não |
| `AI_TYPING_MIN_DELAY_MS` | Não | Todos | API | Delay mínimo de digitação (ms) | `1500` | Não |
| `AI_TYPING_MAX_DELAY_MS` | Não | Todos | API | Delay máximo de digitação (ms) | `5000` | Não |

---

## 9. Geocoding

| Variável | Obrigatória | Ambiente | App | Descrição | Exemplo | Sensível |
|----------|-------------|----------|-----|-----------|---------|---------|
| `GOOGLE_MAPS_KEY` | Não | Todos | API | Chave API Google Maps (geocoding no AI agent) | `AIza...` | **Sim** |

---

## 10. WhatsApp Cloud API

| Variável | Obrigatória | Ambiente | App | Descrição | Exemplo | Sensível |
|----------|-------------|----------|-----|-----------|---------|---------|
| `WHATSAPP_CLOUD_ACCESS_TOKEN` | Cond. | Prod | API | Token de acesso permanente WhatsApp | `EAABwzLixnjYB...` | **Sim** |
| `WHATSAPP_CLOUD_PHONE_NUMBER_ID` | Cond. | Prod | API | ID do número de telefone Meta | `123456789` | Não |
| `WHATSAPP_CLOUD_GRAPH_API_VERSION` | Não | Todos | API | Versão da Graph API | `v19.0` | Não |
| `WHATSAPP_OTP_MESSAGE_TEMPLATE` | Não | Todos | API | Template de OTP via WhatsApp | `Seu código: {{CODE}}` | Não |
| `WHATSAPP_WEBHOOK_VERIFY_TOKEN` | Cond. | Prod | API | Token de verificação do webhook Meta | `token-secreto` | **Sim** |

---

## 11. Mercado Pago

| Variável | Obrigatória | Ambiente | App | Descrição | Exemplo | Sensível |
|----------|-------------|----------|-----|-----------|---------|---------|
| `MERCADO_PAGO_WEBHOOK_SECRET` | Cond. | Prod | API | Segredo do webhook Mercado Pago | `secret` | **Sim** |

---

## 12. Asaas (billing)

| Variável | Obrigatória | Ambiente | App | Descrição | Exemplo | Sensível |
|----------|-------------|----------|-----|-----------|---------|---------|
| `ASAAS_WEBHOOK_TOKEN` | Cond. | Prod | API | Token legacy do webhook Asaas | `token` | **Sim** |
| `ASAAS_BILLING_WEBHOOK_SECRET` | Cond. | Prod | API | Secret do webhook Asaas (billing) | `secret` | **Sim** |
| `ASAAS_WEBHOOK_HMAC_SECRET` | Cond. | Prod | API | HMAC secret para webhooks Asaas | `hmac-secret` | **Sim** |
| `ASAAS_WEBHOOK_ALLOW_LEGACY_TOKEN` | Não | Todos | API | Permitir token legado temporariamente | `false` | Não |

---

## 13. Webhooks gerais

| Variável | Obrigatória | Ambiente | App | Descrição | Exemplo | Sensível |
|----------|-------------|----------|-----|-----------|---------|---------|
| `WEBHOOK_HMAC_SECRET` | Cond. | Prod | API | HMAC secret global para webhooks | `secret` | **Sim** |
| `WEBHOOK_REPLAY_WINDOW_SECONDS` | Não | Todos | API | Janela de tempo para replay de webhooks | `300` | Não |
| `WEBHOOK_ALLOW_LEGACY_TOKEN` | Não | Todos | API | Permitir token legado | `false` | Não |
| `WEBHOOK_SECURITY_SMOKE_ENABLED` | Não | Dev | API | Habilitar smoke de segurança webhook | `false` | Não |

---

## 14. Web Push Notifications (VAPID)

> **Atenção:** Push Notifications estão em estado `Stub`. As VAPID keys são configuradas mas notificações reais não são enviadas. Ver `docs/product/known-gaps.md`.

| Variável | Obrigatória | Ambiente | App | Descrição | Exemplo | Sensível |
|----------|-------------|----------|-----|-----------|---------|---------|
| `VAPID_PUBLIC_KEY` | Não | Todos | API | Chave pública VAPID | `BEl62...` | Não |
| `VAPID_PRIVATE_KEY` | Não | Todos | API | Chave privada VAPID | `CzvZ...` | **Sim** |
| `VAPID_SUBJECT` | Não | Todos | API | Email de contato para push | `mailto:admin@dominio.com` | Não |

---

## 15. URLs de frontend

| Variável | Obrigatória | Ambiente | App | Descrição | Exemplo | Sensível |
|----------|-------------|----------|-----|-----------|---------|---------|
| `WEB_TENANT_URL` | Não | Todos | API | URL do painel da loja | `http://localhost:5173` | Não |
| `WEB_ADMIN_URL` | Não | Todos | API | URL do admin SaaS | `http://localhost:5174` | Não |
| `WEB_STOREFRONT_URL` | Não | Todos | API | URL do cardápio público | `http://localhost:3000` | Não |

---

## 16. Swagger

| Variável | Obrigatória | Ambiente | App | Descrição | Exemplo | Sensível |
|----------|-------------|----------|-----|-----------|---------|---------|
| `SWAGGER_ENABLED` | Não | Dev | API | Habilitar Swagger UI | `false` | Não |
| `SWAGGER_PATH` | Não | Dev | API | Caminho da UI do Swagger | `/docs` | Não |

---

## 17. Storefront Cache

| Variável | Obrigatória | Ambiente | App | Descrição | Exemplo | Sensível |
|----------|-------------|----------|-----|-----------|---------|---------|
| `STOREFRONT_CACHE_TTL` | Não | Todos | API | TTL do cache público do storefront (ms) | `300000` | Não |

---

## 18. Feature Flags de Frontend (VITE_FEATURE_*)

> Estas variáveis são fallbacks de baixa precedência. O catálogo canônico está em `packages/core/src/constants/features.ts`. Consulte `docs/contracts/feature-flags.md` para entender precedência completa.

| Variável | Feature | Status da feature |
|----------|---------|------------------|
| `VITE_FEATURE_AI_AGENT` | `ai_agent` | Beta |
| `VITE_FEATURE_CAMPAIGNS` | `campaigns` | Beta |
| `VITE_FEATURE_CRM_ADVANCED` | `crm_enterprise` | Beta |
| `VITE_FEATURE_BI_ADVANCED` | `bi_advanced` | Beta |
| `VITE_FEATURE_FRANCHISE` | `franchise` | Beta |
| `VITE_FEATURE_ADMIN_INTEGRATIONS` | `admin_integrations` | Beta |
| `VITE_FEATURE_WHATSAPP_ADVANCED` | `whatsapp_advanced` | Beta |
| `VITE_FEATURE_DELIVERY_LIVE_MAP` | `delivery_live_map` | Beta |
| `VITE_FEATURE_INVENTORY_ADVANCED` | `inventory_advanced` | Stable |
| `VITE_FEATURE_FINANCE_ADVANCED` | `finance_advanced` | Stable |
| `VITE_FEATURE_GOALS` | `goals` | Beta |
| `VITE_FEATURE_UPSELLS` | `upsells` | Beta |
| `VITE_FEATURE_WHATSAPP_CONNECT` | `whatsapp_connect` | Beta |
| `VITE_FEATURE_ORDER_NOTIFICATIONS` | — | Ver `turbo.json` |

> **Em produção:** mantenha features beta como `false` até validação explícita com clientes reais.

---

## 19. Variáveis de frontend (web-tenant)

Consulte `apps/web-tenant/.env.example` para lista completa. Principais:

| Variável | Descrição |
|----------|-----------|
| `VITE_API_URL` | URL da API backend |
| `VITE_GOOGLE_MAPS_KEY` | Chave Google Maps para frontend |
| `VITE_TENANT_URL` | URL do storefront público |
| `VITE_FEATURE_*` | Feature flags (ver acima) |

---

## Smoke tests (variáveis de ambiente)

| Variável | Descrição | Exemplo |
|----------|-----------|---------|
| `SMOKE_API_BASE_URL` | URL base da API para smoke tests | `http://localhost:3333/api/v1` |
| `SMOKE_TENANT_SLUG` | Slug do tenant de teste | `pizzaria-demo` |
| `SMOKE_TENANT_EMAIL` | Email do owner do tenant de teste | `owner@pizzariademo.com` |
| `SMOKE_TENANT_PASSWORD` | Senha do owner do tenant de teste | `Owner@123` | 
