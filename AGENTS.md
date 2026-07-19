# AGENTS.md — Protocolo para Agentes de Desenvolvimento

> **Leia este arquivo no início de toda sessão antes de modificar qualquer código.**
> Branch: `main-copy` | Última verificação: 2026-07-15 | Commit: `c63d394`

---

## 1. Visão geral do sistema

**Gestor Delivery SaaS PRO** é um monorepo TypeScript white-label para gestão de delivery multi-tenant.

### Aplicações
| App | Package | Porta | Finalidade |
|-----|---------|-------|-----------|
| `apps/api` | `@gestor/api` | 3333 | Backend NestJS: REST + WebSocket + Jobs |
| `apps/web-tenant` | `@gestor/web-tenant` | 5173 | Painel da loja (tenant owner/staff) |
| `apps/web-admin` | `@gestor/web-admin` | 5174 | Admin SaaS centralizado |
| `apps/web-storefront` | `@gestor/web-storefront` | 3000 | Cardápio público (cliente final) |
| `apps/web-delivery` | `@gestor/web-delivery` | — | App do entregador |

### Packages compartilhados
| Package | Conteúdo |
|---------|---------|
| `@gestor/core` | Catálogo de features, permissões, enums, constantes — **fonte de verdade de configuração** |
| `@gestor/types` | DTOs, interfaces, tipos de contrato compartilhados |
| `@gestor/auth` | Lógica de autenticação compartilhada |
| `@gestor/config` | Configurações de build e ambiente |
| `@gestor/theme` | Design tokens e sistema de tema |
| `@gestor/ui` | Componentes UI compartilhados |
| `@gestor/utils` | Utilitários compartilhados |

### Stack tecnológico
- **Node.js** ≥ 22 | **pnpm** ≥ 9 | **Turborepo** 2.7.4 | **TypeScript** ~5.5.4
- **Backend:** NestJS 10, Prisma 5, PostgreSQL, Redis, BullMQ, Socket.IO
- **Frontend:** Vite, React, Tailwind CSS
- **CI:** GitHub Actions
- **Deploy atual:** Dokploy + Docker Compose (`render.yaml` permanece apenas como configuração legada)

---

## 2. Fontes de verdade (em ordem de precedência)

1. **Schema Prisma + migrations** → estrutura de dados  
   `apps/api/prisma/schema.prisma`
2. **DTOs e tipos em `@gestor/types`** → contratos de entrada/saída  
   `packages/types/src/`
3. **Catálogo de features em `@gestor/core`** → features, permissões, módulos  
   `packages/core/src/constants/features.ts`
4. **Services NestJS** → regras de negócio  
   `apps/api/src/<domain>/<domain>.service.ts`
5. **Guards e decorators** → autorização  
   `apps/api/src/auth/guards/`, `apps/api/src/common/guards/`
6. **Testes existentes** → comportamento esperado e verificado  
   `apps/api/src/**/*.spec.ts`
7. **Esta documentação** → contexto, contratos e operação  
   `docs/`

---

## 3. Regras inegociáveis

### 3.1 Multi-tenancy
- **Nunca** executar query de dados operacionais sem filtro `tenantId`
- `TenantInterceptor` é global — todo request HTTP já carrega `tenantId` no contexto
- Models sem `tenantId` são dados globais da plataforma (AdminUser, FeatureGlobalSetting, etc.)
- Jobs que processam dados por tenant devem carregar e propagar `tenantId` explicitamente

### 3.2 Pedidos
- **Nunca** alterar status de pedido fora das transições definidas em `ORDER_STATUS_TRANSITIONS`
- `ORDER_STATUS_TRANSITIONS` fica em `packages/types/src/order.ts` — esta é a fonte de verdade
- Estados terminais (`completed`, `cancelled`) não permitem transição

### 3.3 Banco de dados
- **Nunca** usar `prisma db push` em produção — somente `prisma migrate deploy`
- **Nunca** modificar schema sem criar migration correspondente
- **Nunca** fazer alterações destrutivas diretas em produção sem estratégia de rollout em etapas

### 3.4 Segurança
- **Nunca** introduzir credenciais no código-fonte
- **Nunca** logar tokens JWT, senhas, refresh tokens ou dados sensíveis
- **Nunca** ignorar autorização baseado em ocultação de UI

### 3.5 Features
- **Nunca** habilitar feature com `status: 'beta'` ou `status: 'coming_soon'` em preset de produção sem deliberação explícita
- **Nunca** marcar feature como `stable` sem testes e implementação completa
- O catálogo em `@gestor/core` é a fonte canônica — não duplicar em outros arquivos

### 3.6 Pagamentos e webhooks
- **Nunca** alterar fluxo de pagamento sem considerar reconciliação e idempotência
- **Nunca** alterar handlers de webhook sem considerar duplicidade de eventos
- Webhooks usam HMAC-SHA256 — validar assinatura antes de processar

### 3.7 Jobs e automações
- **Nunca** alterar jobs sem considerar idempotência e retries
- Configuração padrão: 3 tentativas, backoff exponencial de 5s
- Jobs de campanha requerem `BULLMQ_ENABLED=true` + `CAMPAIGNS_DISPATCH_ENABLED=true`

### 3.8 Tipagem
- **Nunca** usar `any` ou `as any` — regra `check:no-any` é executada na CI
- Manter tipagem estrita em toda alteração

---

## 4. Comandos verificados

### Instalação
```bash
pnpm install                    # Instalar todas as dependências
```

### Desenvolvimento
```bash
pnpm dev:api                    # Apenas a API (NestJS)
pnpm dev:web-tenant             # Apenas web-tenant
pnpm dev:web-admin              # Apenas web-admin
pnpm dev:web-storefront         # Apenas web-storefront
pnpm dev:all                    # Todos em paralelo
```

### Build
```bash
pnpm build                      # Build completo (todos os apps)
pnpm build:api                  # Build apenas da API
pnpm build:web-tenant           # Build apenas do web-tenant
pnpm build:web-admin            # Build apenas do web-admin
```

### Qualidade
```bash
pnpm lint                       # ESLint em todos os workspaces
pnpm typecheck                  # TypeScript check em todos os apps
pnpm check:no-any               # Verificação de uso de `any`
pnpm check:boundaries           # Verificação de fronteiras de pacotes
pnpm check:theme                # Verificação crítica de classes hardcoded de tema
```

### Banco de dados (Prisma)
```bash
pnpm db:generate                # Gerar Prisma Client
pnpm db:migrate                 # prisma migrate dev (somente desenvolvimento)
pnpm db:seed                    # Seed do banco
pnpm db:studio                  # Abrir Prisma Studio
# CI usa: pnpm --filter @gestor/api prisma:migrate:deploy
```

### Testes e smokes
```bash
pnpm smoke:p1                   # Smoke test P1 (auth, orders, catalog)
pnpm smoke:media                # Smoke test de mídia
# Via apps/api:
pnpm --filter @gestor/api smoke:all           # Suite completa de smokes
pnpm --filter @gestor/api smoke:billing       # Smoke de billing
pnpm --filter @gestor/api smoke:queues        # Smoke de filas
pnpm --filter @gestor/api smoke:orders        # Smoke de pedidos
```

### Produção (preview)
```bash
pnpm start:api                  # Iniciar API em modo produção (node dist/...)
pnpm start:web-tenant           # Preview build web-tenant
pnpm start:web-admin            # Preview build web-admin
```

---

## 5. Fluxo obrigatório antes de alterar código

1. **Localizar o domínio** — qual módulo/app está envolvido?
2. **Ler este AGENTS.md** — regras aplicáveis ao domínio
3. **Ler o contrato do domínio** em `docs/contracts/`
4. **Localizar** types (em `@gestor/types`), DTOs, service, model Prisma e testes relacionados
5. **Identificar feature flags** — a feature está habilitada? Qual preset?
6. **Identificar efeitos colaterais** — jobs, eventos, WebSocket, webhooks
7. **Verificar** `docs/handoffs/current-state.md` — há trabalho em andamento no domínio?
8. **Propor a menor mudança segura**
9. **Implementar** — sem alterar comportamento de outros domínios
10. **Executar validações:** `pnpm lint && pnpm typecheck && pnpm check:no-any`
11. **Atualizar** documentação e handoff

---

## 6. Definition of Done

Uma alteração só está concluída quando:

- [ ] Compila sem erros
- [ ] Passa em `pnpm typecheck`
- [ ] Passa em `pnpm lint`
- [ ] Passa em `pnpm check:no-any`
- [ ] Testes relevantes passam (ou há justificativa documentada para ausência)
- [ ] Novos comportamentos têm testes ou explicação de por que não
- [ ] Multi-tenancy respeitado (queries com filtro de tenant)
- [ ] RBAC respeitado (guards e permissões verificadas)
- [ ] Contratos de entrada/saída respeitados (DTOs em `@gestor/types`)
- [ ] Erros tratados adequadamente
- [ ] Logs apropriados (sem dados sensíveis)
- [ ] Segredos fora do código-fonte
- [ ] Documentação atualizada (este arquivo, contratos afetados)
- [ ] `docs/handoffs/current-state.md` atualizado
- [ ] Riscos residuais registrados

---

## 7. Módulos da API (verificados em `app.module.ts`)

| Módulo | Caminho | Descrição |
|--------|---------|-----------|
| `AuthModule` | `src/auth/` | Autenticação multi-identidade |
| `CustomerAuthModule` | `src/auth/` | Autenticação de clientes B2C |
| `TenantModule` | `src/tenant/` | Gestão de tenants |
| `RbacModule` | `src/rbac/` | Controle de acesso baseado em papéis |
| `AdminModule` | `src/admin/` | Painel administrativo SaaS |
| `BillingModule` | `src/billing/` | Assinatura e billing |
| `PaymentGatewayModule` | `src/payment-gateway/` | Gateway de pagamentos |
| `FeatureControlModule` | `src/feature-control/` | Central de governança de features |
| `CatalogModule` | `src/catalog/` | Produtos, categorias, combos |
| `StorefrontModule` | `src/storefront/` | Cardápio público |
| `OrdersModule` | `src/orders/` | Pedidos e checkout |
| `DeliveryModule` | `src/delivery/` | Logística e entrega |
| `CashModule` | `src/cash/` | Caixa e sessões de caixa |
| `PosModule` | `src/pos/` | Ponto de venda |
| `KdsModule` | `src/kds/` | Kitchen Display System |
| `CrmModule` | `src/crm/` | Clientes e relacionamento |
| `PromotionsModule` | `src/promotions/` | Cupons, cashback, fidelidade |
| `InventoryModule` | `src/inventory/` | Estoque e receitas |
| `AnalyticsModule` | `src/analytics/` | Relatórios e analytics |
| `GoalsModule` | `src/goals/` | Metas gerenciais |
| `SchedulingModule` | `src/scheduling/` | Agendamentos |
| `SplitPaymentModule` | `src/split-payment/` | Pagamento dividido |
| `UploadModule` | `src/upload/` | Upload de mídia |
| `PurchasingModule` | `src/purchasing/` | Compras e fornecedores |
| `FinanceModule` | `src/finance/` | Financeiro |
| `NotificationsModule` | `src/notifications/` | Notificações (push stub, WebSocket real) |
| `WhatsAppChannelModule` | `src/whatsapp-channel/` | Canal WhatsApp |
| `AiAgentModule` | `src/ai-agent/` | Agente IA |
| `CampaignsModule` | `src/campaigns/` | Campanhas e automações |
| `ChatModule` | `src/chat/` | Chat interno |
| `MailModule` | `src/mail/` | Email (nodemailer) |
| `PrintingModule` | `src/printing/` | Impressão e spooler |
| `MarketplaceModule` | `src/marketplace/` | Integrações marketplace (iFood) |

---

## 8. Catálogo de features (resumo)

> Fonte canônica: `packages/core/src/constants/features.ts`

**Stable:** auth, tenant, session, rbac, audit_log, saas_admin, tenant_settings, onboarding, billing_status, catalog_core, storefront_core, checkout_core, orders_core, upload_core, health_check, feature_control_center, delivery_radius, base_menus, base_media, inventory_advanced, finance_advanced, coupons, pos

**Beta / Stub:** scheduling, kds, delivery_zones_advanced, delivery_live_map, pizza_template, upsells, crm_enterprise, campaigns, whatsapp_connect, whatsapp_advanced, ifood_marketplace, marketplace_orders, bi_advanced, goals, printing, cashback, loyalty, dine_in, ai_agent, franchise, admin_integrations

**Coming Soon:** delivery_neighborhood

> Ver detalhes em `docs/product/feature-matrix.md`

---

## 9. Conhecidos gaps críticos (resumo)

| Gap | Severidade |
|-----|-----------|
| Push Notifications são stub (não enviam notificações reais) | Alta |
| Timezone hardcoded em campanhas (`America/Sao_Paulo`) | Alta |
| `apps/api/.env` pode estar comitado (verificar) | Crítica |
| Script `drop_models.js` na raiz sem documentação de uso seguro | Alta |

> Ver detalhes em `docs/product/known-gaps.md` e `docs/audits/contradictions.md`

---

## 10. Protocolo de início de sessão

Antes de modificar qualquer código:

1. Leia `AGENTS.md` (este arquivo)
2. Leia `docs/README.md`
3. Leia o contrato do domínio afetado em `docs/contracts/`
4. Verifique `docs/handoffs/current-state.md`
5. Inspecione código, tipos, schema e testes do domínio
6. Confirme feature flags e permissões aplicáveis
7. Liste contratos potencialmente afetados pela mudança
8. Execute `pnpm lint && pnpm typecheck` como baseline
9. Faça a menor mudança segura
10. Atualize documentação e `docs/handoffs/current-state.md`

---

## 11. Protocolo de encerramento de sessão

Ao finalizar uma sessão, atualize `docs/handoffs/current-state.md` com:

- Objetivo e contexto da sessão
- Alterações feitas (arquivos modificados)
- Decisões tomadas e por quê
- Contratos afetados
- Testes executados e resultados
- Pendências e próximo passo recomendado
- Riscos conhecidos

> Template em `docs/handoffs/session-template.md`

---

## 12. Documentação canônica por domínio

| Domínio | Contrato canônico |
|---------|-----------------|
| Autenticação | `docs/contracts/authentication.md` |
| Autorização / RBAC | `docs/contracts/authorization-rbac.md` |
| Multi-tenancy | `docs/contracts/tenant-isolation.md` |
| Pedidos | `docs/contracts/order-lifecycle.md` |
| Feature Flags | `docs/contracts/feature-flags.md` |
| Banco e Migrations | `docs/contracts/database-and-migrations.md` |
| Pagamentos | `docs/contracts/payments.md` |
| Filas e Jobs | `docs/contracts/queues-and-jobs.md` |
| WebSockets | `docs/contracts/events-and-websockets.md` |
| Marketplace | `docs/contracts/marketplace.md` |
| API REST | `docs/contracts/api.md` |
