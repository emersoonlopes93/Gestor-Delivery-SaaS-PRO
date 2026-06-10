# Production Smoke Runbook

## Objetivo

Validar producao sem criar dados reais indevidos.

## Proibido

- Criar tenant real aleatorio.
- Criar pedido real em loja de cliente sem controle.
- Rodar Staging Smoke Gate contra producao.
- Habilitar `WEBHOOK_SECURITY_SMOKE_ENABLED` em producao.

## Smoke Seguro Minimo

1. Health publico:

```bash
curl -fsS https://api.example.com/api/v1/health
```

2. Admin health com usuario controlado.
3. Validar versao/commit no provedor de deploy.
4. Validar DB `ok`.
5. Validar Redis `ok`.
6. Validar BullMQ `ok`.
7. Validar storage remoto por asset ja existente ou tenant interno.
8. Validar storefront demo/internal.

## Billing Smoke Em Producao

Permitido somente com tenant interno marcado e documentado como `internal_smoke`.

- O tenant nao pode ser cliente real.
- Pedidos devem ser claramente identificados como teste interno.
- Cleanup deve ser manualmente conferido.
- Nao deve disparar cobranca externa real.

## Criterio De GO Pos-Deploy

- Health publico `ok`.
- Admin health `ok`.
- DB/Redis/BullMQ `ok`.
- Login admin controlado funciona.
- Storefront demo/internal responde.
- Sem aumento de 5xx/latencia nos primeiros 30 minutos.

## Script Automatizado

Smoke seguro disponivel:

```bash
pnpm --filter @gestor/api smoke:production-infra
```

Variaveis:

- `SMOKE_API_BASE_URL`: URL da API com `/api/v1`.
- `SMOKE_ADMIN_EMAIL` e `SMOKE_ADMIN_PASSWORD`: opcionais; habilitam admin health.
- `SMOKE_EXPECT_PRODUCTION=true`: exige `NODE_ENV=production` no admin health.
- `SMOKE_EXPECT_REDIS=true`: exige Redis conectado.
- `SMOKE_EXPECT_BULLMQ=true`: exige BullMQ habilitado/conectado.
- `SMOKE_EXPECT_STORAGE_REMOTE=true`: exige storage `r2` ou `s3`.
- `SMOKE_EXPECT_SWAGGER_DISABLED=true`: exige Swagger nao publico.

Marcadores:

- `PRODUCTION_INFRA_SMOKE_GO`
- `PRODUCTION_INFRA_SMOKE_NO_GO`

## Evidencia Operacional Atual

Ultima execucao: 2026-06-10.

Smoke estrito contra staging:

```bash
pnpm --filter @gestor/api smoke:production-infra
```

Resultado: `PRODUCTION_INFRA_SMOKE_NO_GO`.

Motivo: Redis nao conectado; BullMQ desabilitado. O smoke confirmou health publico e DB `ok` antes de falhar.

Smoke relaxado para coletar evidencias nao bloqueadas por Redis/BullMQ:

```bash
SMOKE_EXPECT_REDIS=false SMOKE_EXPECT_BULLMQ=false pnpm --filter @gestor/api smoke:production-infra
```

Resultado: `PRODUCTION_INFRA_SMOKE_GO` parcial.

Checks confirmados:

- public health ok;
- database health ok;
- admin login ok;
- admin health ok;
- remote storage configurado;
- billing env ok;
- Swagger nao publico.

Warnings:

- Redis not connected;
- BullMQ disabled.
