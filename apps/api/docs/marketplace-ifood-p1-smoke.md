# Marketplace iFood P1 Smoke

## Preparo

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
SMOKE_TENANT_EMAIL=owner@example.com
SMOKE_TENANT_PASSWORD=secret
SMOKE_TENANT_SLUG=minha-loja
MARKETPLACE_SMOKE_ENABLED=true
```

Opcional:

```bash
SMOKE_CLEANUP=true
SMOKE_REQUEST_TIMEOUT_MS=30000
SMOKE_RETRY_ATTEMPTS=8
SMOKE_RETRY_DELAY_MS=1500
```

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
