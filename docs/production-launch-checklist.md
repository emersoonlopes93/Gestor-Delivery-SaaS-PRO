# Production Launch Checklist

Status permitidos: `pending`, `configured`, `validated`, `blocked`.

Data da ultima revisao: 2026-06-10 21:11 BRT.

## Gates Criticos

| Item | Status | Evidencia | Bloqueia GO |
| --- | --- | --- | --- |
| Commit de release identificado | validated | Staging Smoke Gate em `main`, commit `a3a71bf` | Sim |
| `pnpm prisma:validate` | validated | Validacao local passou na Fase 4 | Sim |
| `pnpm --filter @gestor/api prisma:generate` | validated | Geracao local passou na Fase 4 | Sim |
| `pnpm typecheck` | validated | Typecheck local passou na Fase 4 | Sim |
| `pnpm --filter @gestor/api test` | validated | 11 suites / 29 tests passaram na Fase 4 | Sim |
| `pnpm lint` | validated | Passou; warnings antigos no storefront documentados | Sim |
| `pnpm build` | validated | Build passou; warnings de chunk grande em frontend | Sim |
| Staging Smoke Gate | validated | Run verde: `27301493201` | Sim |
| Health staging | validated | API/DB/Redis/BullMQ ok; `productionReady=true` em 2026-06-10 21:11 BRT | Sim |
| Rollback documentado | configured | `docs/release-rollback-runbook.md` | Sim |
| Admin access documentado | configured | `docs/admin-access-runbook.md` | Sim |
| Primeiro tenant checklist | configured | `docs/first-paying-tenant-checklist.md` | Sim |

## Infraestrutura

| Item | Status | Evidencia | Bloqueia GO |
| --- | --- | --- | --- |
| Banco de producao/staging-final definido | pending | Banco staging atual em Neon identificado, mas producao final nao evidenciada | Sim |
| Backup automatico diario | pending | Sem acesso/evidencia do painel Neon/backup automatico | Sim |
| Retencao 7 diarios / 4 semanais | pending | Politica documentada, nao comprovada no provedor | Sim |
| PITR | pending | Nao comprovado no provedor | Sim |
| Restore testado nos ultimos 7 dias | pending | Procedimento documentado, restore real ainda nao executado | Sim |
| Redis configurado | validated | Provider inferido: Upstash; TLS true; senha configurada; `connected=true`; plano/cota pendente de evidencia | Sim |
| `REDIS_ENABLED=true` | validated | Render/API alvo com `REDIS_ENABLED=true` | Sim |
| BullMQ configurado | validated | Render/API alvo com `BULLMQ_ENABLED=true`; health `bullmq=ok` | Sim |
| Ultimo health Redis | validated | Redis `ok`, `connected=true`, cache `redis` em 2026-06-10 21:11 BRT; responsavel: Operacao | Sim |
| Ultimo health BullMQ | validated | BullMQ `ok`, `enabled=true`, `connected=true` em 2026-06-10 21:11 BRT; responsavel: Operacao | Sim |
| Ultimo smoke de filas | validated | `QUEUES_SMOKE_GO` em 2026-06-10 21:11 BRT; fila smoke limpa | Sim |
| Plano/cota Redis | blocked | Plano/cota Upstash nao comprovados; risco se free-tier | Sim |
| Storage remoto R2/S3 | configured | Render tem R2 bucket/base URL configurados; upload real ainda pendente | Sim |
| Upload real em storage remoto | pending | Nao executado nesta fase | Sim |
| CDN validado | pending | Base publica R2 presente; CDN/cache/storefront ainda nao validados | Sim |

## Seguranca E Env

| Item | Status | Evidencia | Bloqueia GO |
| --- | --- | --- | --- |
| JWT secrets fortes/diferentes | configured | Env validation exige em producao | Sim |
| CORS restrito | configured | Env validation exige sem localhost em producao; valor real nao evidenciado | Sim |
| Swagger off | configured | Env validation exige `SWAGGER_ENABLED=false` em producao; smoke infra verifica `/docs` | Sim |
| HMAC webhook | configured | Staging possui HMAC e smoke webhook verde | Sim |
| Legacy webhook token off | configured | Staging possui flag false | Sim |
| Smoke webhook off em producao | configured | Env validation exige false em producao; staging usa true para gate | Sim |
| Secrets sem exposicao em logs | validated | Artifacts do Staging Smoke Gate revisados sem valores sensiveis | Sim |

## Operacao

| Item | Status | Evidencia | Bloqueia GO |
| --- | --- | --- | --- |
| Rate limits criticos | configured | `docs/rate-limit-runbook.md` e decorators nas rotas criticas | Sim |
| Logs estruturados | configured | `StructuredLoggerService` e logs HTTP existentes | Sim |
| Logs centralizados | configured | Render logs disponiveis; retencao/canal final pendente | Nao |
| Sentry/equivalente | pending | Nao configurado/evidenciado | Sim |
| Alertas 5xx/latencia/DB/Redis/filas/webhook/billing/checkout | pending | Politica documentada; alertas reais nao comprovados | Sim |
| Dashboard health | configured | Health publico/admin existentes | Sim |

## Billing E Primeiro Tenant

| Item | Status | Evidencia | Bloqueia GO |
| --- | --- | --- | --- |
| Billing gateway modo correto | configured | Staging em `mock/sandbox`; producao final pendente | Sim |
| Plano/faixa tenant piloto | pending | Checklist criado, execucao pendente | Sim |
| Storefront tenant piloto | pending | Checklist criado, execucao pendente | Sim |
| Pedido controlado/revenue/snapshot/invoice | pending | Coberto por staging smoke, mas tenant piloto real pendente | Sim |
| LGPD minima | pending | Itens documentados nos runbooks; revisao final pendente | Sim |

## Decisao Atual

NO-GO para producao controlada.

Bloqueadores principais:

- backup automatico sem evidencia;
- restore real ainda nao testado;
- plano/cota Redis ainda nao comprovados;
- upload/CDN real ainda nao validado;
- observabilidade/alertas reais ainda nao comprovados.
