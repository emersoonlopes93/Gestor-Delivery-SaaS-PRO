---
title: Auditoria Documental Completa
status: current
owner: engineering
last_verified: 2026-07-15
verified_against: main-copy / c63d394
---

# Auditoria Documental — Gestor Delivery SaaS PRO

> Branch analisado: `main-copy` | Commit: `c63d394` | Data: 2026-07-15

---

## 1. Arquitetura verificada

### 1.1 Tipo de repositório
**Monorepo com pnpm workspaces + Turborepo**
- Gerenciador de pacotes: pnpm ≥ 9.0.0 (verificado em `package.json`)
- Node.js: ≥ 22.0.0 (verificado em `package.json` engines)
- Build orchestration: Turborepo 2.7.4 (verificado em `turbo.json`)
- TypeScript: ~5.5.4 (verificado em `package.json` devDependencies)

### 1.2 Aplicações (`apps/`)

| App | Package | Porta padrão | Stack | Status |
|-----|---------|-------------|-------|--------|
| `api` | `@gestor/api` | 3333 | NestJS 10 + Prisma + PostgreSQL | **Ativo** |
| `web-tenant` | `@gestor/web-tenant` | 5173 | Vite + React + Tailwind CSS | **Ativo** |
| `web-admin` | `@gestor/web-admin` | 5174 | Vite + React | **Ativo** |
| `web-storefront` | `@gestor/web-storefront` | 3000 | Vite + React | **Ativo** |
| `web-delivery` | `@gestor/web-delivery` | — | Vite + React | **Ativo** |

### 1.3 Packages compartilhados (`packages/`)

| Package | Nome | Conteúdo |
|---------|------|----------|
| `packages/auth` | `@gestor/auth` | Lógica de autenticação compartilhada |
| `packages/config` | `@gestor/config` | Configurações compartilhadas |
| `packages/core` | `@gestor/core` | Catálogo de features, permissões, enums, constantes |
| `packages/storefront-ui` | `@gestor/storefront-ui` | Componentes de UI do storefront |
| `packages/theme` | `@gestor/theme` | Design tokens e sistema de tema |
| `packages/types` | `@gestor/types` | Tipos TypeScript compartilhados (DTOs, enums, contratos) |
| `packages/ui` | `@gestor/ui` | Componentes de UI compartilhados |
| `packages/utils` | `@gestor/utils` | Utilitários compartilhados |

### 1.4 Banco de dados
- **Provider:** PostgreSQL (verificado em `prisma/schema.prisma`)
- **ORM:** Prisma 5.20.0
- **Schema:** `apps/api/prisma/schema.prisma` (3551 linhas, ~160KB)
- **Migrations:** 42 migrations aplicadas (verificado em `apps/api/prisma/migrations/`)
- **Estratégia:** `prisma migrate dev` (dev), `prisma migrate deploy` (CI/prod)
- **DIRECT_URL:** Separado de DATABASE_URL (compatível com Neon/Supabase pooling)

### 1.5 Infraestrutura de background
- **Redis:** Opcional mas recomendado para produção. Suporta TLS. Fallback para in-memory se não configurado.
- **BullMQ:** Habilitado por `BULLMQ_ENABLED=true` e `REDIS_ENABLED!=false`
- **Cache:** `cache-manager` com `cache-manager-redis-yet`. Fallback para in-memory.
- **Campanhas:** `CAMPAIGNS_DISPATCH_ENABLED=true` ativa dispatcher de campanhas
- **Automações:** `CAMPAIGN_AUTOMATION_ENABLED=true` registra repeatable job a cada 5 minutos

### 1.6 WebSockets
- `@nestjs/websockets` + Socket.IO 4.8.3
- Gateway de pedidos: `apps/api/src/orders/orders.gateway.ts`
- Uso: notificações em tempo real de pedidos, KDS

### 1.7 CI/CD
- **GitHub Actions:** `.github/workflows/ci.yml`, `docker-publish.yml`, `staging-smoke.yml`
- CI executa: lint, check:no-any, typecheck, build, migrate, seed, start, smoke tests
- Deploy: Render (`render.yaml`) e Docker (`docker-compose.prod.yml`)

---

## 2. Auditoria de autenticação

### 2.1 Tipos de identidade (verificados em código)
| Tipo | Controller | Service | Token |
|------|-----------|---------|-------|
| TenantUser | `tenant-auth.controller.ts` | `tenant-auth.service.ts` | JWT access + refresh |
| Customer (B2C) | `customer-auth.controller.ts` | `customer-auth.service.ts` | JWT access + refresh |
| DeliveryDriver | `driver-auth.controller.ts` | `driver-auth.service.ts` | JWT access + refresh |
| Admin | `apps/api/src/admin/` | — | JWT (admin claims) |

### 2.2 Sessões (verificado em schema e código)
- Model `AuthSession` existe no Prisma com campos: `refreshTokenHash`, `refreshTokenFamilyId`, `status`, `expiresAt`, `revokedAt`
- Suporta: refresh token rotation, revogação, rastreamento de IP/UserAgent
- `AuthSessionService`: `apps/api/src/auth/auth-session.service.ts`

### 2.3 Estratégias
- `passport-jwt` para verificação de tokens
- Estratégias em `apps/api/src/auth/strategies/`
- `VITE_FEATURE_WHATSAPP_CONNECT`: WhatsApp Cloud API como canal alternativo de autenticação

---

## 3. Auditoria de multi-tenancy

### 3.1 Mecanismo verificado
- `TenantInterceptor` (`apps/api/src/common/interceptors/tenant.interceptor.ts`) aplicado globalmente via `APP_INTERCEPTOR`
- `TenantContextModule` (`apps/api/src/common/context/tenant-context.module.ts`) compartilha contexto entre requests

### 3.2 Modelo Tenant (verificado em schema.prisma)
O model `Tenant` tem 60+ relações — é o pivot central do sistema. Campos-chave:
- `id` (UUID, PK)
- `slug` (único, usado para resolução de tenant em rotas públicas)
- `status` (TenantStatus enum)
- `businessGroupId` (opcional, para redes de lojas)
- `businessGroupRole` (enum de papel na rede)

### 3.3 Isolamento verificado
- `AuditLog` tem `tenantId` obrigatório + índice
- `AuthSession` tem `tenantId` opcional (admin sessions podem ser sem tenant)
- Todos os models de operação (orders, catalog, delivery, crm, etc.) relacionam-se ao Tenant

---

## 4. Auditoria de pedidos

### 4.1 Estados de pedido (verificados em `packages/types/src/order.ts`)
```
OrderStatus = 'pending' | 'confirmed' | 'preparing' | 'ready_for_pickup' |
              'ready_for_delivery' | 'out_for_delivery' | 'completed' | 'cancelled' | 'draft'
```

### 4.2 Transições válidas (verificadas em código)
```
ORDER_STATUS_TRANSITIONS = {
  pending:            → ['confirmed', 'cancelled'],
  confirmed:          → ['preparing', 'cancelled'],
  preparing:          → ['ready_for_pickup', 'ready_for_delivery', 'cancelled'],
  ready_for_pickup:   → ['completed'],
  ready_for_delivery: → ['out_for_delivery'],
  out_for_delivery:   → ['completed'],
  completed:          → [],      // terminal
  cancelled:          → [],      // terminal
  draft:              → ['confirmed', 'cancelled'],
}
```

### 4.3 Tipos de entrega (FulfillmentType)
- `delivery` — entrega ao endereço
- `pickup` — retirada no balcão
- `dine_in` — consumo no local (salão)
- `table` — pedido em mesa

### 4.4 Métodos de pagamento (verificados em enums)
- `cash`, `credit_card`, `debit_card`, `pix`, `card_on_delivery`, `other`

---

## 5. Auditoria de feature flags

### 5.1 Fontes de verdade (verificadas em código)
1. **Catálogo central:** `packages/core/src/constants/features.ts` → `FEATURE_CATALOG` (fonte primária)
2. **Overrides globais:** Model `FeatureGlobalSetting` no Prisma (operacional/runtime)
3. **Overrides por tenant:** Model `FeatureTenantOverride` no Prisma
4. **Entitlements de billing:** Model `TenantFeatureEntitlementOverride` + `BillingEntitlementsService`
5. **Module access:** Model `TenantModuleAccess`
6. **Env vars de frontend:** `VITE_FEATURE_*` (fallback, baixa precedência)
7. **Legacy overrides:** `TenantAddon` (legado de compatibilidade)

### 5.2 Features por status (verificadas no catálogo)

**Stable (12 features):**
`auth`, `tenant`, `session`, `rbac`, `audit_log`, `saas_admin`, `tenant_settings`, `onboarding`, `billing_status`, `catalog_core`, `storefront_core`, `checkout_core`, `orders_core`, `upload_core`, `health_check`, `feature_control_center`, `delivery_radius`, `base_menus`, `base_media`, `inventory_advanced`, `finance_advanced`, `coupons`, `scheduling`, `pos`

**Beta (muitas features):**
`delivery_zones_advanced`, `delivery_live_map`, `pizza_template`, `upsells`, `crm_enterprise`, `campaigns`, `whatsapp_connect`, `whatsapp_advanced`, `ifood_marketplace`, `marketplace_orders`, `bi_advanced`, `goals`, `kds`, `printing`, `cashback`, `loyalty`, `dine_in`, `ai_agent`, `franchise`, `admin_integrations`

**Coming Soon (1 feature):**
`delivery_neighborhood`

---

## 6. Auditoria de integrações externas

### 6.1 Mercado Pago
- Webhook configurado via `MERCADO_PAGO_WEBHOOK_SECRET`
- Módulo: `apps/api/src/payment-gateway/`
- Status: `Requer validação` — verificar implementação do gateway

### 6.2 Asaas
- Billing provider principal
- Módulo: `apps/api/src/billing/`
- Webhooks: `ASAAS_WEBHOOK_HMAC_SECRET`, `ASAAS_BILLING_WEBHOOK_SECRET`
- Smoke tests existem: `smoke:billing-asaas-sandbox`
- Status: Parcialmente implementado (billing tem testes, mas sandbox confirmado)

### 6.3 iFood Marketplace
- Módulo: `apps/api/src/marketplace/`
- Status: `Beta` no catálogo
- Serviços: `marketplace-connection.service.ts`, `marketplace-order-ingestion.service.ts`, `marketplace-status-sync.service.ts`
- Testes unitários existem para os serviços

### 6.4 WhatsApp Cloud API
- Módulo: `apps/api/src/whatsapp-channel/`
- Provider: Meta WhatsApp Cloud API
- Config: `WHATSAPP_CLOUD_ACCESS_TOKEN`, `WHATSAPP_CLOUD_PHONE_NUMBER_ID`, `WHATSAPP_WEBHOOK_VERIFY_TOKEN`
- Status: `Beta`

### 6.5 IA / AI Agent
- Providers suportados: OpenAI, Anthropic (Claude), Google Gemini, OpenRouter
- Config via: `OPENAI_API_KEY`, `OPENAI_MODEL`, `OPENAI_BASE_URL`
- Módulo: `apps/api/src/ai-agent/`
- Status: `Beta`

### 6.6 Storage
- Driver: `local` (dev) ou `r2` (Cloudflare R2 em produção)
- Config: `MEDIA_STORAGE_DRIVER`, `R2_*` vars
- Módulo: `apps/api/src/upload/`

### 6.7 Email (SMTP)
- Lib: nodemailer
- Módulo: `apps/api/src/mail/`
- Usado para: redefinição de senha, confirmações

### 6.8 Google Maps
- Usado para geocoding no AI agent
- Config: `GOOGLE_MAPS_KEY`

---

## 7. Auditoria de notificações

### 7.1 WebSocket (VERIFICADO — funcional)
- `OrdersGateway` em `apps/api/src/orders/orders.gateway.ts`
- Namespace Socket.IO
- Usado para atualizações de pedido em tempo real

### 7.2 Push Notifications (**STUB — não funcional**)
- `PushService` em `apps/api/src/notifications/push.service.ts`
- **Não usa pacote `web-push`** — apenas faz log
- `subscribe()` não persiste no banco — `PushSubscription` model **não existe** no schema
- `sendNotification()` não envia notificação real
- **VAPID keys configuradas mas sem implementação real**
- Contradição: `TESTING-NOTIFICATIONS.md` descreve como funcional

### 7.3 Email (VERIFICADO — funcional)
- `MailModule` + nodemailer
- Funcional para operações de autenticação

### 7.4 WhatsApp (VERIFICADO — beta funcional)
- Canal operacional via WhatsApp Cloud API
- Campaigns + automações via BullMQ quando habilitado

---

## 8. Gaps técnicos identificados

| Gap | Severidade | Evidência | Recomendação |
|-----|-----------|-----------|-------------|
| Push Notifications são stub | **Alta** | `push.service.ts` linhas 54-56 | Implementar com `web-push` + model Prisma |
| Timezone hardcoded em campanhas | **Alta** | `campaign.processor.ts` linhas 258-262 | Adicionar campo timezone em TenantSettings |
| `{console.error(e)` arquivo inválido na raiz | **Baixa** | `list_dir` raiz | Remover arquivo |
| Script `drop_models.js` sem documentação | **Alta** | Arquivo na raiz | Documentar uso restrito ou remover |
| Apps/api/.env pode estar comitado | **Crítica** | `list_dir` apps/api | Verificar .gitignore e rotacionar credenciais se necessário |
| README.md não existe | **Alta** | `list_dir` raiz | Criar (feito nesta auditoria) |
| AGENTS.md não existe | **Alta** | `list_dir` raiz | Criar (feito nesta auditoria) |
| `delivery_neighborhood` coming_soon mas tem código | **Média** | features.ts + módulo delivery | Validar implementação |
