# Billing Runbook

Este runbook cobre o startup seguro da API e as checagens obrigatórias antes de ativar qualquer etapa com gateway real.

## Comando oficial de desenvolvimento

Use qualquer um dos comandos abaixo. Todos devem resolver os mesmos arquivos de ambiente da API:

```bash
pnpm --filter @gestor/api dev
pnpm -C apps/api dev
cd apps/api && pnpm dev
```

O carregamento de env da API é feito por caminhos absolutos, nesta ordem de precedência:

1. `apps/api/.env.local`
2. `apps/api/.env`
3. `.env.local` na raiz do monorepo
4. `.env` na raiz do monorepo

Valores em arquivos mais específicos sobrescrevem valores dos arquivos de raiz.

## Diagnóstico de ambiente

Rode:

```bash
pnpm --filter @gestor/api diagnose:env
pnpm -C apps/api diagnose:env
```

O diagnóstico mascara host/senhas e mostra:

- `NODE_ENV`
- `cwd`
- raiz da API e raiz do workspace
- arquivos env carregados
- host/database/schema de `DATABASE_URL`
- host/database/schema de `DIRECT_URL`
- se ambas apontam para o mesmo banco lógico/schema
- `current_database()`, `current_schema()`, `current_user`
- contagem das tabelas críticas de billing
- flags operacionais de billing/gateway

Os dois comandos devem reportar o mesmo database/schema.

## DATABASE_URL e DIRECT_URL

- `DATABASE_URL`: conexão principal da aplicação. Em Neon normalmente usa o host pooler.
- `DIRECT_URL`: conexão direta para Prisma migrations. Em Neon normalmente usa o host sem `-pooler`.

Ambas devem apontar para o mesmo database e schema. Elas podem ter hosts diferentes, mas `database` e `schema` precisam bater.

## Preflight do Billing DB

A API executa um preflight no startup e verifica as tabelas:

- `BillingPlan`
- `billing_settings`
- `billing_revenue_tiers`
- `tenant_billing_subscriptions`
- `billing_cycles`
- `billing_usage_snapshots`
- `invoices`
- `invoice_items`
- `billing_payment_methods`
- `payment_attempts`

Modo configurável:

```bash
BILLING_DB_PREFLIGHT=strict
```

Política recomendada:

- development: `strict`
- staging: `strict`
- production: `warn` no rollout inicial, `strict` depois da estabilização

Também é possível rodar manualmente:

```bash
pnpm --filter @gestor/api check:billing-db
```

Se alguma tabela sumir, não use `prisma db push`. Confira `DATABASE_URL`, `DIRECT_URL` e rode:

```bash
pnpm --filter @gestor/api exec prisma migrate status
pnpm --filter @gestor/api exec prisma migrate deploy
```

## Gateway e cobrança

### Pagamentos desligados

```env
BILLING_PAYMENTS_ENABLED=false
BILLING_GATEWAY_PROVIDER=manual
BILLING_GATEWAY_MODE=disabled
```

Resultado esperado:

- UI mostra pagamentos desativados
- endpoint de criar tentativa retorna erro claro
- nenhuma `PaymentAttempt` é criada
- invoice permanece `draft`

`BILLING_GATEWAY_MODE=production` só é permitido com `NODE_ENV=production`. Enquanto essas flags estiverem assim, o Billing Console só cria invoice draft manual e não executa cobrança real.

### Manual local

```env
BILLING_PAYMENTS_ENABLED=true
BILLING_GATEWAY_PROVIDER=manual
BILLING_GATEWAY_MODE=manual
```

Resultado esperado:

- cria `PaymentAttempt` manual
- invoice `draft -> open`
- admin pode marcar como `paid` ou `failed`
- `providerPaymentId` e `providerPaymentUrl` permanecem vazios/nulos
- nenhum gateway externo é chamado

### Mock sandbox

```env
BILLING_PAYMENTS_ENABLED=true
BILLING_GATEWAY_PROVIDER=mock
BILLING_GATEWAY_MODE=sandbox
```

Resultado esperado:

- cria `PaymentAttempt` mock
- `providerPaymentId` começa com `mock_pay_`
- simulação `success`, `failure` e `pending` funciona
- nenhum gateway externo é chamado

Manual e mock/sandbox apenas registram `PaymentAttempt` e transições de invoice (`draft -> open -> paid/failed`). Nenhum checkout, PDV, storefront, pedido ou gateway externo é acionado.

## Smokes obrigatórios

Antes de avançar fases de billing:

```bash
pnpm --filter @gestor/api exec prisma validate
pnpm --filter @gestor/api exec prisma generate
pnpm --filter @gestor/api exec prisma migrate status
pnpm --filter @gestor/api diagnose:env
pnpm --filter @gestor/api check:billing-db
pnpm --filter @gestor/api smoke:billing
pnpm --filter @gestor/api smoke:billing-usage
pnpm --filter @gestor/api smoke:billing-cycle
pnpm --filter @gestor/api smoke:billing-payment
pnpm --filter @gestor/api build
pnpm build
```

## Checklist antes de gateway real / Fase 6

- `diagnose:env` igual via raiz e via `apps/api`
- `DATABASE_URL` e `DIRECT_URL` no mesmo database/schema
- preflight billing passou
- contraprova `payments disabled` bloqueia tentativa e não cria `PaymentAttempt`
- contraprova `manual local` cria tentativa local, abre invoice e permite marcação manual
- contraprova `mock sandbox` cobre `pending`, `success`, `failure` e idempotência
- mock webhook, quando habilitado, é idempotente por `eventId`
- RBAC diferencia `saas.billing.read`, `saas.billing.manage` e usuário sem billing
- `BILLING_PAYMENTS_ENABLED=false`
- `BILLING_GATEWAY_MODE=disabled`
- `BILLING_GATEWAY_PROVIDER=mock` exige `BILLING_GATEWAY_MODE=sandbox`
- `BILLING_GATEWAY_PROVIDER=manual` exige `BILLING_GATEWAY_MODE=manual` quando pagamentos estão ativos
- smokes de billing passaram
- `smoke:billing-payment` passou
- build workspace passou
- nenhum cartão bruto armazenado em `billing_payment_methods`
- nenhum HTTP externo para Asaas, Stripe ou Mercado Pago
