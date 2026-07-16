---
title: Handoff — Sprint 5B Reconciliação e Operação iFood
status: current
owner: engineering
last_verified: 2026-07-16
verified_against: feat/ifood-reconciliation-operations / a689dd4 (commit inicial)
---

# Handoff — Sprint 5B: Reconciliação e Operação iFood

## Objetivo e estado

A integração iFood agora possui inbox com claim idempotente, proteção contra eventos fora de ordem, reconciliação recorrente, classificação persistente de divergências, SLA de confirmação, endpoints SaaS Admin sanitizados, retry com linhagem/auditoria, métricas operacionais e rotação de chave AES-GCM.

> Operação e reconciliação validadas por testes contratuais; homologação iFood pendente.

Catálogo, estoque, promoções, segundo marketplace e dashboard analítico não foram iniciados.

## Git e gate inicial

| Item | Valor |
|---|---|
| Sprint 5A confirmada | commit `a689dd484bc59ea5ea79310969bd5ba2e75fe7c5` |
| Branch criada | `feat/ifood-reconciliation-operations` |
| Commit inicial | `a689dd484bc59ea5ea79310969bd5ba2e75fe7c5` |
| Commits da Sprint 5B | nenhum; alterações permanecem no working tree |
| Baseline lint/typecheck/build | PASS; 16 warnings React preexistentes |
| Baseline marketplace | PASS: 9 suítes, 28 testes |

## Arquitetura entregue

```text
webhook HMAC validado
→ inbox unique (provider, dedupeKey)
→ evento com createdAt/sequence/correlation ID
→ claim condicional RECEIVED/QUEUED/FAILED → PROCESSING
→ evento duplicado = sucesso sem efeitos
→ evento antigo = IGNORED sem regressão
→ regra de negócio + máquina de estados
→ PROCESSED ou FAILED reprocessável

operação pendente/aceita/falha
→ scheduler BullMQ a cada 60s
→ paginação por tenant, limite 100
→ claim otimista por updatedAt
→ GET estado atual no provider
→ transição local somente se permitida
→ SUCCEEDED ou MarketplaceDivergence
→ alerta/log/métrica/admin
```

### Eventos

| Cenário | Resultado |
|---|---|
| novo | persiste e processa |
| duplicado | incrementa contador e retorna sucesso sem efeitos |
| fora de ordem | `IGNORED`; pedido não regride |
| assinatura inválida | rejeita antes da persistência e emite log seguro |
| merchant desconhecido | inbox `FAILED`, job/webhook falha para retry e alerta mapping |
| confirmação/cancelamento final | conclui operação e aplica transição válida |
| cancelamento rejeitado | intervenção permanente |
| pedido concluído incompatível | divergência `INVALID_TRANSITION`; sem salto de estado |
| desconhecido | preservado na inbox; sem transição inventada |

### Reconciliação, SLA e divergências

- Job `operation-reconciliation-scan`: ID estável, 60s, limite 100, 3 tentativas, backoff 5s exponencial, timeout HTTP configurável e concorrência do worker 5.
- Varredura enumera tenants por conexão e filtra toda consulta/mutação operacional por `tenantId`.
- Claims otimistas impedem duas execuções simultâneas de chamar o provider para a mesma versão.
- Deadline oficial: imediato `createdAt + 8min`; agendado `preparationStartDateTime + 8min`.
- Persistência: recebimento, criação externa, início de preparo, deadline, enqueue, primeira/última tentativa, aceite, conclusão e atraso de fila.
- Tipos: `LOCAL_AHEAD`, `REMOTE_AHEAD`, `OPERATION_TIMEOUT`, `EVENT_MISSING`, `INVALID_TRANSITION`, `AUTHENTICATION_FAILURE`, `MERCHANT_MAPPING_FAILURE`, `PERMANENT_PROVIDER_REJECTION`, `UNKNOWN_EXTERNAL_STATE`.
- Métricas por tenant: pendências, maior idade, deadlines, duplicatas, fora de ordem, divergências, retries administrativos, autenticação, `429`, `5xx` e tempo até evento conclusivo.

## Administração e segurança

| Endpoint | Permissão | Finalidade |
|---|---|---|
| `GET /admin/marketplace/operations` | `saas.marketplace.read` | operações paginadas/filtradas |
| `GET /admin/marketplace/failures` | `saas.marketplace.read` | falhas/intervenção |
| `GET /admin/marketplace/divergences` | `saas.marketplace.read` | divergências e resolução |
| `GET /admin/marketplace/operations/:id` | `saas.marketplace.read` | detalhe sanitizado |
| `GET /admin/marketplace/operations/:id/history` | `saas.marketplace.read` | original e retries filhos |
| `GET /admin/marketplace/metrics` | `saas.marketplace.read` | métricas por tenant |
| `POST /admin/marketplace/operations/:id/retry` | `saas.marketplace.manage` | retry controlado, 5/min |
| `POST /admin/marketplace/divergences/:id/acknowledge` | `saas.marketplace.manage` | reconhecimento auditado |
| `POST /admin/marketplace/connections/:id/rotate-credentials` | `saas.marketplace.manage` | recifra tokens, 3/min |

Todos exigem `AdminAuthGuard`, `AdminPermissionsGuard` e `tenantId` explícito. Payloads retornados usam allowlist e não incluem raw payload, token, secret, Authorization ou ciphertext. Retry reconcilia primeiro, recusa `SUCCEEDED`/`ACCEPTED`/ativas, cria operação filha e correlation ID, audita admin/IP e limita três tentativas.

## Criptografia

- AES-256-GCM, nonce aleatório de 12 bytes e auth tag obrigatória.
- Novas cifras: `enc:v2:<keyVersion>`.
- Leitura permitida: versão atual e uma anterior explicitamente configurada.
- `enc:v1` continua legível com a chave atual para migração; plaintext falha fechado.
- Endpoint de rotação recifra sem devolver segredo.

## Banco e migration

Migration: `apps/api/prisma/migrations/20260716150000_marketplace_reconciliation_operations/migration.sql`.

Alteração aditiva:

- metadados de evento e contador de duplicatas na inbox;
- timestamps externos/SLA/último evento em `MarketplaceOrder`;
- timestamps de fila/SLA e linhagem de retry em `MarketplaceOperation`;
- enums e tabela `MarketplaceDivergence` com índices/FKs;
- backfill de `correlation_id` para eventos preexistentes.

Validação PostgreSQL 16 descartável:

- banco vazio: PASS, 45/45 migrations;
- upgrade com tenant, conexão, inbox, pedido e operação da 5A: PASS;
- operação `ACCEPTED` preservada, `admin_retry_number=0`;
- evento preservado, correlation ID preenchido, `duplicate_count=0`;
- container e diretório temporário removidos.

Rollback operacional: desligar `MARKETPLACE_IFOOD_BIDIRECTIONAL_ENABLED` e reverter o código preservando as tabelas. Drop de colunas/tabela/enums é destrutivo e requer migration separada, backup e aprovação.

## Testes e gates finais

| Comando | Resultado |
|---|---|
| `pnpm lint` | PASS; mesmos 16 warnings React preexistentes |
| `pnpm typecheck` | PASS |
| `pnpm build` | PASS; warnings de chunk size preexistentes |
| `pnpm check:no-any` | PASS |
| `pnpm check:features` | PASS; alertas esperados de Beta/homologação |
| `pnpm --dir apps/api exec prisma validate` | PASS |
| Jest marketplace + admin marketplace | PASS: 12 suítes, 44 testes |
| Migration PostgreSQL vazio | PASS |
| Migration sobre dados 5A | PASS |
| `git diff --check` | PASS; somente avisos LF/CRLF do Git |

Cobertura adicionada: novo/duplicado/processado, assinatura inválida, tenant/mapping, fora de ordem, reconciliação resolvida/pendente/timeout/provider indisponível/concorrente, RBAC administrativo, payload sanitizado, criptografia, adulteração, nonce, chave incorreta e versão anterior.

Nenhum teste automatizado chamou o iFood real.

## Documentação

- `docs/contracts/marketplace.md`
- `docs/contracts/queues-and-jobs.md`
- `docs/product/feature-matrix.md`
- `docs/product/known-gaps.md`
- `docs/operations/runbooks/ifood-reconciliation.md`
- documentação de variáveis de ambiente
- este handoff

## Homologação e riscos residuais

| Risco | Severidade | Recomendação |
|---|---|---|
| Homologação oficial ausente | Alta | validar OAuth, webhook, confirmação, cancelamento, deadline e logs com merchant oficial antes de produção |
| Plataforma externa de alertas ausente | Média | conectar logs/métricas/readiness ao canal on-call |
| Polling de fallback ausente | Média | manter webhook-first; só adicionar após validar presença, ACK, filtros e rate limits |
| Detalhe de pedido na ingestão depende do payload recebido | Média | validar formatos oficiais e necessidade de GET por tipo de evento na homologação |
| Tokens plaintext legados | Alta | reconectar; não existe fallback plaintext |
| Dashboard visual ausente | Baixa | endpoints operacionais já cobrem a operação mínima |

## Próximo passo recomendado

Revisar o diff, criar commit(s) da Sprint 5B, aplicar a migration em staging, sincronizar novas permissões administrativas, configurar versões de chave, manter o kill switch desligado e executar o roteiro de homologação oficial. Não iniciar catálogo ou outra sprint automaticamente.

---

# Sprint 5C — Polling de fallback e preparação para homologação iFood

Data: 2026-07-16

Branch: `feat/ifood-polling-fallback`
Base confirmada: `cbbfbf5334c1de33f64e6f68694c004c2b427773` (Sprint 5B commitada)

## Objetivo e decisões

Foi implementado polling iFood opt-in, desligado por padrão e protegido por dois kill switches. A documentação oficial foi validada antes do código. A cadência é 30 segundos; cada job consulta um merchant via `x-polling-merchants`; ACK usa lotes conservadores de 2.000 IDs e ocorre apenas após persistência/duplicata durável.

Webhook e polling reutilizam a mesma inbox e a mesma unique `(provider,dedupeKey)`. A inbox registra primeiro/último canal, contador e último recebimento. Ordenação usa `createdAt`, sequência e precedência; ID é apenas desempate estável. Presença webhook por merchant exclui conexões opt-in no polling para impedir presença dupla.

## Implementação

- `MarketplacePollingService`: scan periódico, jobs determinísticos por conexão/janela, jitter, claim contra simultaneidade, retry compatível, tenant/feature/merchant governance, persist-before-ACK e bloqueio permanente.
- Cliente/provider iFood: `GET /events/v1.0/events:polling`, 200/204, filtros configuráveis, `POST /events/v1.0/events/acknowledgment`, lotes únicos e `Retry-After` existente.
- Inbox: telemetria WEBHOOK/POLLING, deduplicação multicanal, redispatch seguro quando a fila falha, heartbeat `KEEPALIVE` 202.
- Lifecycle: sequência/tópico do último evento e precedência determinística para timestamps iguais.
- Administração: listagem sanitizada de polling e `poll-now` auditado/rate-limited.
- Readiness: fila e contagens healthy/degraded/blocked/stale no health administrativo.
- Runbook: `docs/operations/runbooks/ifood-homologation.md`.

## Migration

`20260716190000_ifood_polling_fallback` é exclusivamente aditiva:

- enums `MarketplaceEventChannel` e `MarketplacePollingStatus`;
- telemetria de canal/entrega na inbox;
- estado, timestamps e contadores de polling na conexão;
- sequência/tópico do último evento no pedido marketplace;
- três índices e duas CHECK constraints não destrutivas.

Validação PostgreSQL 16 local/descartável:

- banco vazio: PASS, 46 migrations aplicadas;
- estado Sprint 5B com conexão, inbox, pedido marketplace, operação e divergência: PASS;
- contagens antes/depois: `1|1|1|1|1`;
- defaults existentes: `DISABLED`, `WEBHOOK`, `WEBHOOK`, `deliveryCount=1`;
- nenhum banco remoto acessado e nenhum `db push` executado.

O diff Prisma pós-migration não apontou drift da Sprint 5C. Permanecem diferenças anteriores em `system_configs.platform_logo_media_id` e tipos de `tenant_settings.handoff_sound/ready_sound`; não foram alteradas por estarem fora do escopo.

## Testes e gates

| Comando | Resultado |
|---|---|
| baseline `pnpm lint`, `pnpm typecheck`, `pnpm build` | PASS; 16 warnings React preexistentes |
| `pnpm lint` pós-implementação | PASS; mesmos 16 warnings |
| `pnpm typecheck` | PASS |
| `pnpm check:no-any` | PASS |
| `pnpm check:features` | PASS com alertas Beta esperados |
| `pnpm prisma:validate` | PASS |
| build API | PASS |
| Jest marketplace | PASS: 12 suítes, 50 testes |
| `git diff --check` | PASS |
| `pnpm test` | FAIL por suites preexistentes fora do marketplace |

Falhas integrais fora do escopo observadas novamente: dois testes de `ConversationService`, compilação da fixture `location-provider.service.spec.ts`, HMAC em `webhook-security.service.spec.ts` e dois testes de `BaseMenusPage` no web-admin. Web-tenant passou 12/12 e storefront 1/1. Nenhuma falha toca arquivos da Sprint 5C.

## Riscos e próximo passo

- Homologação real ainda pendente; não chamar a integração de homologada.
- Presença deve ser configurada por merchant no portal; não usar presença webhook e polling simultaneamente para o mesmo merchant.
- Filtros `types/groups` geram auto-ACK dos eventos excluídos; ambos ficam vazios por padrão e não podem ser combinados.
- O container de validação é removido ao encerrar a sessão.
- Próximo passo: revisar o diff/SQL, aplicar migration somente em staging, configurar um tenant piloto e executar integralmente o runbook com evidências. Não iniciar catálogo ou outra sprint automaticamente.

---

# Sprint 6A — baseline global e RC de staging

Data: 2026-07-16

Branch: `release/ifood-staging-rc`
Base inicial: `cbbfbf5334c1de33f64e6f68694c004c2b427773`

## Resultado

Release candidate preparado parcialmente para staging. Integração ainda não homologada pelo iFood. Kill switches permanecem desabilitados.

Commits criados:

- `2b04dbd` — checkpoint da Sprint 5C, polling/ACK e telemetria;
- `1a48016` — cadência por token/device, agrupamento de merchants, presença coerente e concorrência;
- `7f7a20a` — restauração da confiabilidade da suíte global.

Conexões sem refresh token compartilham o OAuth client/token centralizado e agora geram um job por janela, com merchants em lotes de até 100. Conexões com refresh token usam token/device independente. Dois schedulers/workers concorrentes são protegidos por job ID determinístico e claim persistente. `presenceMode` é explícito (`WEBHOOK`, `POLLING`, `DISABLED`) e a API rejeita polling com presença contraditória.

## Baseline e gates

| Gate | Antes | Depois |
|---|---|---|
| `pnpm test` | FAIL: Conversation, Location, WebhookSecurity e BaseMenusPage | PASS: API 43 suítes/178 testes; web-admin 10; web-tenant 12; storefront 1 |
| `pnpm lint` | PASS com 16 warnings React | PASS com os mesmos 16 warnings |
| `pnpm typecheck` | PASS | PASS |
| `pnpm build` | não reexecutado no gate inicial | PASS; warnings preexistentes de chunk size |
| `pnpm check:no-any` | PASS | PASS |
| `pnpm check:features` | PASS com alertas Beta | PASS com alertas Beta/gaps registrados |
| `pnpm prisma:validate` | PASS | PASS |

Causas raiz do baseline: fixtures de Conversation desatualizadas para `findMany`/gateway estático; cast estrutural inválido no teste Location; teste HMAC sujeito à precedência de variável real do processo; teste React reutilizando nó desmontado e buscando título dividido por ícone.

## Migrations e drift

Em PostgreSQL 16 local/efêmero, passaram: banco vazio, upgrade desde pré-5A, upgrade desde 5B e redeploy de 5C. `handoff_sound` e `ready_sound` terminam como `VARCHAR(255)` e coincidem com o schema. O único diff remanescente é aditivo: coluna/index/FK `system_configs.platform_logo_media_id`, introduzidos no commit de branding sem migration. A criação da migration aguarda aprovação específica da Sprint 6A.

O smoke de startup com ambos kill switches desligados alcança inicialização dos módulos, mas termina em `P2022` no `SystemConfigService` devido ao drift de `platform_logo_media_id`. Portanto o RC ainda é **no-go** até a migration aditiva ser aprovada, criada e validada.

## Incidente de validação

Na primeira tentativa de validação, apenas `DATABASE_URL` foi sobrescrita; como o schema usa `DIRECT_URL` para migrations, o Prisma carregou o valor remoto de `apps/api/.env`. As migrations aditivas 5A, 5B e 5C foram aplicadas nesse banco remoto antes da detecção; comandos seguintes apenas retornaram “sem pendências”. Nenhuma credencial foi lida/exibida e não houve operação destrutiva, mas a ação violou a restrição de não executar migration remota.

Ações tomadas: nenhuma outra chamada Prisma foi feita até identificar a causa; todas as validações posteriores sobrescreveram `DATABASE_URL` e `DIRECT_URL` e confirmaram destino `127.0.0.1`; o incidente foi registrado. Próxima ação operacional: identificar formalmente o ambiente remoto, auditar `_prisma_migrations`/backup com o responsável do banco e manter os kill switches desligados. Como as três migrations são aditivas, o rollback imediato recomendado é funcional por flags/código; não executar `DROP` nem apagar eventos, operações ou divergências.

## Documentação e próximo passo

- contrato e matriz de feature atualizados;
- gaps e limites de readiness registrados;
- homologação/reconciliação atualizadas;
- novo [runbook de staging](../operations/runbooks/ifood-staging-rollout.md) com piloto, go/no-go e rollback.

Próximo passo: obter aprovação para a migration aditiva de branding, validar novamente as quatro trajetórias e o smoke de startup, concluir gates, criar commits de migration/documentação e somente então classificar o RC como go para staging. Não ativar tenant real nem iniciar nova sprint.
