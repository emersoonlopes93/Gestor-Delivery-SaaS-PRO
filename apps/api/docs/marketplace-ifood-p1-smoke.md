# Marketplace iFood P1 Smoke

## Preparo

Preparar ou resetar o tenant smoke dedicado:

```bash
ALLOW_SMOKE_RESET=true
pnpm --filter @gestor/api smoke:setup-ifood
```

Aplicar a migration em staging:

```bash
pnpm --filter @gestor/api prisma migrate deploy
```

Subir a API, se necessario:

```bash
pnpm --filter @gestor/api dev
```

## Envs

```bash
SMOKE_API_BASE_URL=https://staging.example.com/api/v1
SMOKE_ADMIN_EMAIL=admin@example.com
SMOKE_ADMIN_PASSWORD=secret
SMOKE_TENANT_EMAIL=smoke@smoke-ifood.local
SMOKE_TENANT_PASSWORD=smoke123
SMOKE_TENANT_SLUG=smoke-ifood
MARKETPLACE_SMOKE_ENABLED=true
```

Opcional:

```bash
SMOKE_CLEANUP=true
SMOKE_ALLOW_CLEANUP_EXISTING_IFOOD_CONNECTION=false
SMOKE_REQUEST_TIMEOUT_MS=30000
SMOKE_RETRY_ATTEMPTS=8
SMOKE_RETRY_DELAY_MS=1500
```

`SMOKE_ALLOW_CLEANUP_EXISTING_IFOOD_CONNECTION=true` so pode ser usado quando `SMOKE_TENANT_SLUG` comeca com `smoke-`.
Para qualquer outro tenant, o smoke continua recusando limpar uma conexao iFood existente.

O setup/reset nunca roda em production e nunca apaga dados de outros tenants. Ele limpa apenas o tenant `smoke-*` informado.

## Execucao

```bash
pnpm --filter @gestor/api smoke:marketplace-ifood-p1
```

## O que o smoke valida

- login admin e tenant;
- criacao de conexao manual iFood;
- webhook mock com modo smoke;
- processamento do `MarketplaceEventInbox`;
- criacao de `MarketplaceOrder`;
- importacao para `Order` interno com `sourceChannel=marketplace_ifood`;
- idempotencia de webhook;
- criacao ou reutilizacao de entregador de smoke;
- atribuicao do entregador ao pedido importado;
- fluxo real de delivery ate `out_for_delivery` e `completed`;
- billing com `marketplace_ifood` ligado e desligado;
- reprocessamento sem duplicar pedido nem `RevenueEvent`.

## GO / NO-GO

- `GO`: saida `MARKETPLACE_IFOOD_P1_SMOKE_GO`
- `NO-GO`: saida `MARKETPLACE_IFOOD_P1_SMOKE_NO_GO`

## Rollback basico

- desconectar a conexao manual iFood criada pelo smoke;
- restaurar billing settings globais;
- se a migration precisar rollback manual, rever o SQL da migration antes de qualquer drop em staging/producao.

## Riscos

- o smoke cria pedidos reais de teste no tenant informado;
- quando `marketplace_ifood` esta desabilitado para billing, o `RevenueEvent` ainda nasce pelo fluxo normal do pedido, mas o usage preview o exclui do calculo;
- `MARKETPLACE_SMOKE_ENABLED` deve permanecer `false` fora do ambiente de teste.
