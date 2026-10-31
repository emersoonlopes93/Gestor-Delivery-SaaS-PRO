# Contrato de agregação diária de Analytics

Status: implementado na PR 2A, sem endpoint de consulta e sem ativação de produção.

## Grão e chave

`AnalyticsDailyAggregate` materializa um dia local de um tenant. A chave lógica é:

`(tenantId, bucketDate, eventName, dimensionType, dimensionKey)`

Todos os componentes são obrigatórios. `overall` usa `dimensionKey = "__all__"`;
nenhuma unique constraint depende de `NULL`. `dimensionKey` preserva IDs opacos
de produto/categoria sem FK, para não apagar histórico quando o catálogo mudar.

As dimensões suportadas são somente as presentes em `AnalyticsEvent`:

- `overall`
- `product`
- `category`
- `utm_source`
- `utm_medium`
- `utm_campaign`

Não existe dimensão de dispositivo nesta versão.

## Fórmulas

Cada evento canônico do Marco 1 contribui uma vez para `overall` e, quando o
campo existe, uma vez para cada dimensão aplicável:

- `eventCount`: quantidade de eventos;
- `uniqueSessions`: `COUNT DISTINCT sessionId` no bucket/dimensão;
- `valueSum`: soma decimal de `AnalyticsEvent.value`;
- `quantitySum`: soma de `quantity`;
- `itemCountSum`: soma de `itemCount`;
- `firstOccurredAt` / `lastOccurredAt`: extremos de `occurredAt`;
- `sourceMaxReceivedAt`: maior `receivedAt`.

`valueSum` de browser é telemetria comportamental, não receita autoritativa.
Pedidos e billing continuam sendo as fontes de receita realizada para as PRs
2B/2C.

## Timezone e determinismo

O scheduler resolve `TenantSettings.timezone`, com o fallback canônico já usado
pelo sistema (`America/Sao_Paulo`). Luxon converte o dia local para o intervalo
UTC, incluindo offsets e DST. A timezone usada fica gravada no agregado.

Uma recomposição com timezone diferente da já gravada para o mesmo tenant/dia
falha com `analytics_rollup_timezone_change_requires_explicit_migration`; uma
mudança de configuração não reescreve história silenciosamente.

O processor lê eventos em páginas de 1.000, limitado a 250.000 eventos por
tenant/dia. Cada dia executa em transação serializável e adquire advisory lock
por `(tenantId, bucketDate)`. Linhas idênticas são preservadas; linhas alteradas
ou obsoletas são substituídas atomicamente. Retry, reordenação e jobs
sobrepostos não incrementam métricas.

## Fila e janela tardia

- fila: `analytics-rollup`;
- job: `analytics.daily-rollup`;
- payload: contrato Zod `AnalyticsRollupJobV1Schema`;
- job ID: `analytics-rollup__<tenant>__<from>__<to>__<reason>` (BullMQ
  5.76.5 rejeita `:` em IDs customizados);
- concorrência do worker: 2;
- retry: 3 tentativas, backoff exponencial de 5 segundos;
- janela tardia default: hoje mais os dois dias anteriores;
- frequência default: 6 horas.

Kill switches:

- `ANALYTICS_ROLLUP_ENABLED=true` registra producer/worker;
- `ANALYTICS_ROLLUP_SCHEDULER_ENABLED=true` ativa o scheduler;
- `ANALYTICS_ROLLUP_RECENT_DAYS` aceita 1 a 31;
- `ANALYTICS_ROLLUP_INTERVAL_MS` aceita 1 minuto a 24 horas.

Tudo fica desativado por default. `NODE_ENV=test` nunca agenda
automaticamente. Jobs concluídos são removidos para permitir a recomposição
manual posterior da mesma janela. O scheduler acrescenta um slot determinístico
de frequência ao job ID e retém o concluído por 24 horas, evitando duplicação
entre boots/réplicas no mesmo slot; o próximo slot recompõe novamente a janela.
Job ID e advisory lock impedem concorrência duplicada durante a execução.

## Backfill local/efêmero

O comando exige tenant e período, limita a 31 dias, processa um dia por
transação e rejeita produção ou URLs fora de localhost/host efêmero:

```bash
pnpm analytics:rollup-backfill --tenant <id> --from 2026-07-01 --to 2026-07-07
pnpm analytics:rollup-backfill --tenant <id> --from 2026-07-01 --to 2026-07-07 --dry-run
```

`--dry-run` consulta e calcula, mas não escreve agregados. Não existe opção
implícita para todos os tenants ou período ilimitado.

## Retenção

`AnalyticsRetentionService` oferece purge tenant-scoped e em chunks somente
quando `ANALYTICS_RAW_RETENTION_ENABLED=true`. Não há scheduler de retenção e a
flag fica desativada por default até decisão operacional/jurídica. O serviço
remove apenas `AnalyticsEvent` anterior ao limite explícito e nunca consulta ou
remove `AnalyticsDailyAggregate`.

## Limites para a PR 2B

Esta camada não oferece endpoint nem serviço público de consulta. A PR 2B deve
nascer de `feat/analytics-daily-rollups`, consultar sempre por `tenantId` e usar
o schema, dimensões, fórmulas e timezone definidos acima.

DEFERIDO PARA MARCO 2 FINAL: Playwright, screenshots, light/dark/mobile,
validação visual do dashboard, teste de carga amplo, p95 em volume de produção,
comparação manual de todas as métricas e integrações GA4/Meta/Ads.
