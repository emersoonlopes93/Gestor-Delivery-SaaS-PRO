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

### Verdade operacional do portal (C5-A)

O portal do tenant expõe três capacidades independentes:

- **Tentativas de cobrança:** podem estar desativadas, disponíveis manualmente para operadores autorizados ou disponíveis somente em sandbox, conforme a configuração efetiva do gateway.
- **Cobrança recorrente automática:** permanece desabilitada enquanto não existir executor recorrente homologado (scheduler/worker, idempotência operacional, monitoramento e tratamento de falhas).
- **Cobrança real em produção:** permanece bloqueada nesta fase. `NODE_ENV=production` não autoriza cobrança real por si só; o conector Asaas permitido neste fluxo usa exclusivamente o endpoint sandbox.

O tenant não inicia tentativas de cobrança pelo portal. Tentativas permitidas continuam sendo uma operação administrativa com RBAC, e configurações inválidas falham fechadas.

## Adesão comercial self-service

O catálogo público expõe somente planos Billing V2 ativos, públicos e do tipo
`revenue_tiered`. A página de cadastro mostra faixas e preços persistidos nesse
catálogo; não calcula mensalidade no navegador nem aceita preço/fator enviado
pelo cliente.

A adesão cria uma assinatura e registra a versão da oferta, as faixas e a regra
de faturamento vigente no histórico da assinatura. Isso não representa pagamento
confirmado. Quando a oferta exigir forma de pagamento, a assinatura permanece
em estado pendente de acompanhamento no portal Billing até que o fluxo real seja
homologado.

O texto exibido nesta fase é uma confirmação comercial não jurídica. Conteúdo e
versão de termos legais finais ainda requerem aprovação de produto/jurídico.

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

### Asaas sandbox para billing SaaS

```env
BILLING_PAYMENTS_ENABLED=true
BILLING_GATEWAY_PROVIDER=asaas
BILLING_GATEWAY_MODE=sandbox
ASAAS_BILLING_API_KEY=...
ASAAS_BILLING_BASE_URL=https://api-sandbox.asaas.com/v3
ASAAS_BILLING_WEBHOOK_SECRET=...
```

Resultado esperado:

- cria `PaymentAttempt` com provider `asaas` e mode `sandbox`
- reutiliza `TenantBillingSubscription.providerCustomerId` quando já existir
- se não houver customer salvo, consulta o Asaas sandbox por `externalReference=tenant:<tenantId>:subscription:<subscriptionId>` antes de criar
- persiste `providerCustomerId` em `TenantBillingSubscription.providerCustomerId`
- cria cobrança hospedada no Asaas sandbox via `POST /v3/payments`
- salva `providerPaymentId` no attempt
- salva `providerPaymentUrl` na invoice
- invoice `draft -> open`, salvo status pago confirmado pelo provider/webhook
- não armazena cartão bruto
- não usa envs legadas de pedido/split
- não chama produção

### Reserva idempotente antes do gateway

Toda tentativa de cobrança SaaS é primeiro reservada no banco com a chave
`(invoiceId, provider, idempotencyKey)` e status `processing`. A chamada ao
provider ocorre **fora** da transação Prisma; somente a resposta externa
finaliza a tentativa, a invoice e o customer do provider em uma nova
transação. Assim, retry concorrente retorna a reserva existente e não cria
outra cobrança externa.

Se a chamada falhar ou expirar sem resultado autoritativo, a tentativa fica
`processing` com `gatewaySubmission=unknown_outcome`. Não a marque como paga
ou falha pela UI e não reenvie a cobrança com outra chave; reconcilie pela
identidade externa/webhook antes de qualquer nova ação. Asaas continua
estritamente sandbox nesta fase: CPF sintético não pode ser usado em produção.

O webhook SaaS Asaas fica em:

```text
POST /api/v1/billing/webhooks/asaas-saas
```

Autenticidade:

- configurar o `authToken` do webhook no Asaas com o mesmo valor de `ASAAS_BILLING_WEBHOOK_SECRET`
- o Asaas envia esse token no header `asaas-access-token`
- payload sem token válido é rejeitado

Idempotência:

- se o payload vier com `id`, ele é usado como eventId
- se não vier, a chave é `event + payment.id + payment.status + dateCreated`
- eventos já processados ficam registrados no metadata da `PaymentAttempt`

Mapeamento de status Asaas:

- `RECEIVED`, `CONFIRMED`, `RECEIVED_IN_CASH` -> attempt `succeeded`, invoice `paid`
- `PENDING`, `AWAITING_RISK_ANALYSIS`, `APPROVED_BY_RISK_ANALYSIS`, `AUTHORIZED` -> attempt pending/open
- `OVERDUE`, `REFUNDED`, `REFUND_REQUESTED`, `CHARGEBACK_REQUESTED`, `CHARGEBACK_DISPUTE`, `AWAITING_CHARGEBACK_REVERSAL` -> attempt `failed`, invoice `failed` se não houver tentativa pendente
- `DELETED`, `CANCELLED` -> attempt `canceled`, invoice `failed` se não houver tentativa pendente
- status desconhecido -> attempt `processing`, invoice permanece aberta

Observabilidade segura:

- logs estruturados registram `provider`, `mode`, `tenantId`, `invoiceId`, `paymentAttemptId`, `providerPaymentId`, `eventId`, transição de status e resultado
- audit log registra cobrança sandbox criada, webhook Asaas processado e transição de invoice para `paid`/`failed` quando ocorrer
- não logar API key, webhook secret, CPF/CNPJ completo, dados de cartão ou payload completo do webhook

## Rollback operacional Asaas sandbox

### Desligar Asaas imediatamente

```env
BILLING_PAYMENTS_ENABLED=false
BILLING_GATEWAY_PROVIDER=manual
BILLING_GATEWAY_MODE=disabled
```

Após alterar as flags, reinicie a API e rode:

```bash
pnpm --filter @gestor/api diagnose:env
pnpm --filter @gestor/api check:billing-db
```

Resultado esperado:

- endpoint de criar tentativa retorna erro claro por pagamentos desligados
- Billing Console deixa o botão de cobrança desabilitado
- invoice permanece `draft` ou `open`, sem cobrança automática
- nenhum tenant é bloqueado e nenhum enforcement é ativado

### Invalidar webhook sandbox

- remova ou desative o webhook no painel Asaas sandbox
- troque `ASAAS_BILLING_WEBHOOK_SECRET`
- reinicie a API
- valide que payload com token antigo é rejeitado em `POST /api/v1/billing/webhooks/asaas-saas`

### Reverter UI

- com `BILLING_PAYMENTS_ENABLED=false`, o Billing Console não deve oferecer ação de cobrança
- com provider diferente de `asaas`/`sandbox`, não deve existir botão de produção Asaas
- links já salvos permanecem apenas como histórico de sandbox e não disparam cobrança automática

### Limpar dados de teste

- remova apenas tenants de QA/sandbox criados para validação
- limpe invoices/attempts sandbox somente se necessário e documentando os IDs
- não apague dados reais
- não use `prisma db push`

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
pnpm --filter @gestor/api smoke:billing-asaas-sandbox
pnpm --filter @gestor/api build
pnpm build
```

`smoke:billing-asaas-sandbox` pula com mensagem clara quando as credenciais sandbox não estão configuradas; ele não faz parte do build padrão.

## Checklist antes de gateway real / Fase 6

- `diagnose:env` igual via raiz e via `apps/api`
- `DATABASE_URL` e `DIRECT_URL` no mesmo database/schema
- preflight billing passou
- contraprova `payments disabled` bloqueia tentativa e não cria `PaymentAttempt`
- contraprova `manual local` cria tentativa local, abre invoice e permite marcação manual
- contraprova `mock sandbox` cobre `pending`, `success`, `failure` e idempotência
- contraprova Asaas sandbox cobre criação de cobrança hospedada e idempotência quando credenciais estiverem configuradas
- mock webhook, quando habilitado, é idempotente por `eventId`
- RBAC diferencia `saas.billing.read`, `saas.billing.manage` e usuário sem billing
- `BILLING_PAYMENTS_ENABLED=false`
- `BILLING_GATEWAY_MODE=disabled`
- `BILLING_GATEWAY_PROVIDER=mock` exige `BILLING_GATEWAY_MODE=sandbox`
- `BILLING_GATEWAY_PROVIDER=asaas` exige `BILLING_GATEWAY_MODE=sandbox`
- `ASAAS_BILLING_BASE_URL` aponta para `https://api-sandbox.asaas.com/v3`
- `BILLING_GATEWAY_PROVIDER=manual` exige `BILLING_GATEWAY_MODE=manual` quando pagamentos estão ativos
- smokes de billing passaram
- `smoke:billing-payment` passou
- build workspace passou
- nenhum cartão bruto armazenado em `billing_payment_methods`
- nenhum HTTP externo para Asaas, Stripe ou Mercado Pago
