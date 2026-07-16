---
title: Handoff — Sprint 5A iFood bidirecional
status: current
owner: engineering
last_verified: 2026-07-16
verified_against: feat/ifood-bidirectional-core / working tree após 99064d7
---

# Handoff — Sprint 5A: iFood bidirecional

## Objetivo e estado

Os stubs `ifood_confirm_order_stub` e `ifood_cancel_order_stub` foram removidos. O núcleo bidirecional possui OAuth, cliente HTTP oficial, confirmação/cancelamento assíncronos, operação persistente, BullMQ obrigatório, idempotência, reconciliação por evento, HMAC de webhook, logs seguros e testes contratuais.

> Implementada e validada por testes contratuais; homologação iFood pendente.

Não declarar produção concluída e não iniciar Sprint 5B automaticamente.

## Git

| Item | Valor |
|---|---|
| Branch de origem | `main-copy` |
| Commit inicial | `99064d7193008cb02eff30bb687218f31d848fb1` |
| Confirmação do Sprint 4 | Commit `99064d7` presente; working tree estava limpo antes da Sprint 5A |
| Branch criada | `feat/ifood-bidirectional-core` |
| Commits produzidos nesta sessão | Nenhum; alterações permanecem no working tree |

## Gate inicial

| Comando | Resultado |
|---|---|
| `pnpm lint` | PASS; 16 warnings React preexistentes no web-storefront |
| `pnpm typecheck` | PASS |
| `pnpm build` | PASS |
| `pnpm test` | FAIL preexistente: 2 testes `BaseMenusPage` no web-admin |
| `pnpm check:features` | PASS |
| `pnpm prisma:validate` | PASS |
| Jest `src/marketplace` | PASS: 4 suites, 10 testes antes das mudanças |

## Arquitetura implementada

```text
transição local solicitada
→ MarketplaceOperation persistida
→ job BullMQ determinístico
→ token OAuth protegido
→ GET detalhes do pedido
→ POST confirm/requestCancellation
→ 202 = ACCEPTED (não final)
→ evento iFood HMAC-validado
→ SUCCEEDED/INTERVENTION_REQUIRED
→ transição local permitida + status de marketplace
```

### Autenticação e segurança

- `clientId/clientSecret` ficam no ambiente/secret manager.
- Tokens por conexão são cifrados com AES-256-GCM; plaintext legado falha fechado e exige reconexão.
- `expiresIn` é a fonte de validade; refresh concorrente é coalescido por conexão ou aplicativo centralizado.
- Um `401` renova uma vez; segundo `401` marca `TOKEN_EXPIRED`.
- Webhook oficial usa raw body + `X-IFood-Signature` HMAC-SHA256 com comparação constante.
- Headers, tokens, secrets e payload integral não são logados.

### Consistência, idempotência e concorrência

- `202` nunca conclui o pedido local; o evento final é autoridade.
- Unique `(tenantId, idempotencyKey)` protege operações além do `jobId`.
- Jobs revalidam tenant, IDs interno/externo, operação, versão e correlation ID contra o banco.
- Operações concorrentes no mesmo pedido são rejeitadas enquanto há uma ativa.
- Evento final que chega antes do worker encerra também operações `PENDING/QUEUED`, evitando chamada redundante.
- Motivo de cancelamento é consultado dinamicamente no iFood e enviado como código fechado em `marketplaceReasonCode`.
- BullMQ/Redis ausente gera `503`; não há fallback síncrono para confirmação/cancelamento.

## Banco e migration

Migration: `apps/api/prisma/migrations/20260716050000_marketplace_bidirectional_operations/migration.sql`.

Cria enums `MarketplaceOperationType`, `MarketplaceOperationStatus` e tabela `marketplace_operations` com FKs, índices, status, tentativas, códigos normalizados e timestamps. Alteração aditiva, sem reescrita de pedidos.

Validações em PostgreSQL 16 descartável:

- banco vazio: 44/44 migrations aplicadas, índice final verificado;
- schema anterior com tenant, conexão e pedido marketplace preexistentes: migration aplicada, linha preservada e operação criada com defaults `PENDING/0`.

Rollback operacional: desligar `MARKETPLACE_IFOOD_BIDIRECTIONAL_ENABLED` e reverter código mantendo a tabela. Drop de tabela/enums é destrutivo e exige mudança separada, backup e aprovação.

## APIs e contratos

- `GET /marketplaces/operations`: operações do tenant.
- `GET /marketplaces/orders/:marketplaceOrderId/cancellation-reasons`: códigos válidos do pedido.
- `PATCH /orders/:id/status`: aceita `marketplaceReasonCode` opcional; obrigatório ao cancelar pedido iFood.
- Contrato canônico criado em `docs/contracts/marketplace.md` com fontes oficiais consultadas em 2026-07-16.

## Testes e gates finais

| Comando | Resultado |
|---|---|
| `pnpm lint` | PASS; mesmos 16 warnings preexistentes |
| `pnpm typecheck` | PASS |
| `pnpm build` | PASS |
| `pnpm check:no-any` | PASS |
| `pnpm check:features` | PASS; alerta esperado sobre homologação/credencial legada documentadas |
| `pnpm prisma:validate` | PASS |
| Jest `src/marketplace` | PASS: 9 suites, 28 testes |
| `pnpm --filter @gestor/api test` | 36 suites PASS / 3 suites FAIL; 137 testes PASS / 3 FAIL |
| Migration PostgreSQL vazio | PASS |
| Migration sobre dados existentes | PASS |
| `git diff --check` | PASS (somente avisos de conversão LF/CRLF do Git) |

Falhas preexistentes confirmadas e fora do Sprint 5A:

- `src/ai-agent/services/conversation.service.spec.ts`: duas expectativas/mocks defasados;
- `src/billing/webhook-security.service.spec.ts`: assinatura HMAC do fixture inválida;
- `src/location/location-provider.service.spec.ts`: cast de mock `ConfigService` rejeitado pelo ts-jest;
- root `pnpm test`: dois testes `BaseMenusPage` do web-admin já falhavam no baseline.

Todos os testes de marketplace, provider, OAuth, credenciais, webhook inbox, jobs e autenticação de sessão passaram. Nenhuma chamada real ao iFood foi feita por testes automatizados.

## Arquivos alterados

### Código e schema

- `.env.example`, `apps/api/.env.example`
- `apps/api/prisma/schema.prisma`
- `apps/api/prisma/migrations/20260716050000_marketplace_bidirectional_operations/migration.sql`
- `apps/api/src/config/env.validation.ts`
- `apps/api/src/marketplace/controllers/marketplace-tenant.controller.ts`
- `apps/api/src/marketplace/marketplace.module.ts`, `marketplace.types.ts`
- `apps/api/src/marketplace/processors/marketplace-event.processor.ts` e spec
- `apps/api/src/marketplace/providers/ifood.provider.ts`, interface, erro e specs
- `apps/api/src/marketplace/services/ifood-http-client.service.ts` e spec
- `apps/api/src/marketplace/services/ifood-token.service.ts` e spec
- `apps/api/src/marketplace/services/marketplace-credential.service.ts` e spec
- `apps/api/src/marketplace/services/marketplace-status-sync.service.ts` e spec
- `apps/api/src/marketplace/services/marketplace-connection.service.ts` e spec
- `apps/api/src/marketplace/services/marketplace-order-ingestion.service.ts` e spec
- `apps/api/src/orders/orders.service.ts`
- `packages/types/src/order.ts`

### Documentação

- `docs/contracts/marketplace.md`
- `docs/contracts/order-lifecycle.md`
- `docs/contracts/queues-and-jobs.md`
- `docs/getting-started/environment-variables.md`
- `docs/api-environment-variables.md`
- `docs/product/feature-matrix.md`
- `docs/product/known-gaps.md`
- `docs/audits/contradictions.md`
- `docs/audits/documentation-validation.md`
- `docs/handoffs/current-state.md`

## Homologação e bloqueios

Não havia credenciais oficiais, merchant de teste ou acesso ao portal de homologação na sessão. Portanto permanecem bloqueados:

1. token real e renovação no iFood;
2. recebimento de pedido oficial;
3. confirmação e verificação do evento final;
4. cancelamento elegível e motivo real;
5. repetição, timeout, 401 e inspeção de logs no ambiente oficial.

## Riscos residuais e próximo passo

| Risco | Severidade | Próximo passo |
|---|---|---|
| Homologação externa ausente | Alta | Executar roteiro do contrato com merchant de teste antes de ativar kill switch em produção |
| Tokens legados em plaintext | Alta | Reconectar integrações; não habilitar fluxo até todos estarem em `enc:v1` |
| Painel completo de reconciliação ausente | Média | Sprint futura; API de operações já fornece base |
| Métricas dedicadas ausentes | Baixa | Integrar contadores ao stack observável |

Próximo passo recomendado: revisar o diff, criar commit(s) da Sprint 5A, aplicar migration em staging, configurar secrets, manter `MARKETPLACE_IFOOD_BIDIRECTIONAL_ENABLED=false`, e então executar homologação oficial. Não iniciar Sprint 5B automaticamente.
