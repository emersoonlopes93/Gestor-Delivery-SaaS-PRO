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

Antes da Fase 5, mantenha:

```bash
BILLING_PAYMENTS_ENABLED=false
BILLING_GATEWAY_PROVIDER=manual
BILLING_GATEWAY_MODE=disabled
```

`BILLING_GATEWAY_MODE=production` só é permitido com `NODE_ENV=production`. Enquanto essas flags estiverem assim, o Billing Console só cria invoice draft manual e não executa cobrança real.

Para testar a fundação local de pagamentos sem gateway real:

```env
BILLING_PAYMENTS_ENABLED=true
BILLING_GATEWAY_PROVIDER=mock
BILLING_GATEWAY_MODE=sandbox
```

Para tentativas manuais locais:

```env
BILLING_PAYMENTS_ENABLED=true
BILLING_GATEWAY_PROVIDER=manual
BILLING_GATEWAY_MODE=manual
```

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
pnpm --filter @gestor/api build
pnpm build
```

## Checklist antes da Fase 5

- `diagnose:env` igual via raiz e via `apps/api`
- `DATABASE_URL` e `DIRECT_URL` no mesmo database/schema
- preflight billing passou
- `payment_attempts = 0` antes de testes de gateway
- invoices de Fase 4 seguem `draft`
- `BILLING_PAYMENTS_ENABLED=false`
- `BILLING_GATEWAY_MODE=disabled`
- `BILLING_GATEWAY_PROVIDER=mock` exige `BILLING_GATEWAY_MODE=sandbox`
- `BILLING_GATEWAY_PROVIDER=manual` exige `BILLING_GATEWAY_MODE=manual` quando pagamentos estão ativos
- smokes de billing passaram
- build workspace passou
