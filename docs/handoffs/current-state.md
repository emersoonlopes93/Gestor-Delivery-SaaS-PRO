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
