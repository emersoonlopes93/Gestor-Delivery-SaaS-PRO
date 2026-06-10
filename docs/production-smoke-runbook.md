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
