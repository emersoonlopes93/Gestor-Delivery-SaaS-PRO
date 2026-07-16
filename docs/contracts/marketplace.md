---
title: Contrato de Marketplace — iFood
status: current
owner: engineering
last_verified: 2026-07-16
verified_against: feat/ifood-bidirectional-core / 99064d7 (commit inicial)
---

# Contrato de Marketplace — iFood

## 1. Status real

| Capacidade | Estado |
|---|---|
| Inbox de eventos, deduplicação e importação de pedido | Implementada; testes automatizados |
| Confirmação e cancelamento via Order API | Implementados; testes contratuais com HTTP mockado |
| OAuth, renovação e coalescência de token | Implementados; testes automatizados |
| Assinatura HMAC-SHA256 do webhook | Implementada; testes automatizados |
| Homologação no ambiente oficial iFood | Pendente por ausência de credenciais/merchant de homologação |
| Production-ready | Não declarado até homologação, migration no ambiente-alvo e smoke oficial |
| Catálogo, preços, estoque e promoções | Fora do escopo |

> Implementada e validada por testes contratuais; homologação iFood pendente.

## 2. Fontes oficiais vigentes

Consulta realizada em 2026-07-16:

- [Autenticação OAuth 2.0](https://developer.ifood.com.br/pt-BR/docs/guides/modules/authentication/intro)
- [Fluxo de autenticação centralizado](https://developer.ifood.com.br/pt-BR/docs/guides/modules/authentication/centralized)
- [Workflow da Order API](https://developer.ifood.com.br/pt-BR/docs/guides/modules/order/workflow)
- [Endpoints da Order API](https://developer.ifood.com.br/pt-BR/docs/guides/modules/order/endpoints)
- [Eventos de pedido](https://developer.ifood.com.br/pt-BR/docs/guides/modules/order/events/)
- [Boas práticas](https://developer.ifood.com.br/en-US/docs/getting-started/documentation/best-practices)
- [Assinatura de webhook](https://developer.ifood.com.br/pt-BR/docs/guides/modules/events/webhook-signature)

O código não fixa o tempo de validade de token: usa `expiresIn`, pois o valor pode mudar. O `202 Accepted` de confirmação/cancelamento significa somente aceite assíncrono; o resultado final vem por evento.

## 3. Autenticação e credenciais

- Base oficial padrão: `https://merchant-api.ifood.com.br`.
- Token: `POST /authentication/v1.0/oauth/token`, `application/x-www-form-urlencoded`.
- Grants suportados pelo cliente: `refresh_token` quando a conexão possui refresh token; caso contrário, `client_credentials`.
- Chamadas usam `Authorization: Bearer <token>`.
- `clientId` e `clientSecret` são segredos do aplicativo e ficam somente no secret manager/ambiente da API.
- Access/refresh tokens opcionais por conexão são cifrados em repouso com AES-256-GCM e chave externa ao banco.
- Valores legados em texto puro falham fechados e exigem reconexão.
- O token é renovado cinco minutos antes de `expiresIn`; renovações concorrentes são coalescidas por conexão distribuída ou por aplicativo centralizado.
- Um `401` renova o token uma única vez. Um segundo `401` marca a conexão como `TOKEN_EXPIRED` e não entra em retry infinito.
- Tokens, secrets, Authorization e payloads pessoais não são registrados em logs.

O vínculo de tenant é a combinação persistida `MarketplaceConnection(tenantId, provider, externalMerchantId/externalStoreId)`. IDs enviados no webhook nunca são tratados como `tenantId`; são resolvidos contra esse vínculo interno único.

## 4. Webhook e ingestão

1. O endpoint público recebe o raw body.
2. `X-IFood-Signature` é validado por HMAC-SHA256 com comparação constante antes do processamento.
3. O evento é normalizado e o merchant/store é resolvido internamente.
4. O inbox persiste `provider + dedupeKey` com unique constraint.
5. Evento duplicado retorna aceite idempotente e não cria outro pedido.
6. O pedido usa unique constraint `(tenantId, provider, externalOrderId)`.
7. Eventos finais não podem violar `ORDER_STATUS_TRANSITIONS`; divergência é registrada em log operacional.

O bypass `x-marketplace-smoke` só é aceito fora de produção ou quando o smoke foi explicitamente habilitado.

## 5. Confirmação

Fluxo:

```text
transição local solicitada
→ MarketplaceOperation PENDING/QUEUED
→ job BullMQ idempotente
→ GET /order/v1.0/orders/{id}
→ POST /order/v1.0/orders/{id}/confirm
→ 202: MarketplaceOperation ACCEPTED
→ evento CONFIRMED/ORDER_CONFIRMED
→ MarketplaceOperation SUCCEEDED
→ transição local confirmada pela máquina de estados
```

O pedido local não muda para `confirmed` enquanto só existe `202`. Uma chamada duplicada usa a mesma chave persistente e não duplica o efeito.

## 6. Cancelamento e motivos

Não existe mapeamento fixo inventado pelo sistema. Os códigos válidos são dependentes do pedido e devem ser obtidos por:

```text
GET /marketplaces/orders/{marketplaceOrderId}/cancellation-reasons
→ GET iFood /order/v1.0/orders/{id}/cancellationReasons
```

O consumidor envia o código escolhido em `marketplaceReasonCode`. Antes do POST, o provider consulta novamente os motivos e rejeita códigos ausentes. O POST oficial é `/order/v1.0/orders/{id}/requestCancellation` com `{ "reason": "<code>" }`.

`202` gera estado `ACCEPTED`, não cancelamento final. Somente `CANCELLED/ORDER_CANCELLED` conclui a operação e altera o pedido local. `CANCELLATION_REQUEST_FAILED` leva a `INTERVENTION_REQUIRED` e preserva o estado local anterior.

## 7. Idempotência e concorrência

| Operação | Chave persistente | Proteção |
|---|---|---|
| Confirmar | `ifood:confirm:<marketplaceOrderId>:v1` | unique `(tenantId, idempotencyKey)` + jobId determinístico + status condicional |
| Cancelar | `ifood:cancel:<marketplaceOrderId>:<hash-do-código>` | mesma proteção; código não aparece no jobId |
| Webhook | `eventId` oficial ou hash do raw body | unique `(provider, dedupeKey)` |
| Importar pedido | external order por tenant/provider | unique `(tenantId, provider, externalOrderId)` |

Enquanto há operação `PENDING`, `QUEUED`, `PROCESSING` ou `ACCEPTED`, uma operação conflitante é rejeitada. O worker revalida `tenantId`, pedido interno, pedido externo, tipo, versão e correlation ID contra a linha persistida antes de chamar o provider.

No cenário “iFood aceitou e a API caiu antes de persistir”, o retry repete uma operação documentada como idempotente pelo iFood; a linha persistente e o evento final reconciliam o resultado sem promover silenciosamente o estado local.

## 8. Retry e erros

| Resposta/falha | Classe | Ação |
|---|---|---|
| timeout/rede | Temporária | até 3 tentativas, backoff exponencial |
| `429` | Temporária | backoff exponencial respeitando o maior valor entre backoff e `Retry-After` |
| `5xx` | Temporária | até 3 tentativas |
| primeiro `401` | Autenticação recuperável | renovar token uma vez e repetir |
| segundo `401`, `403` | Permanente/autorização | conexão degradada e intervenção |
| `400`, `404`, `409`, `422` | Permanente/negócio | sem retry automático; intervenção |

Erros permanentes terminam em `INTERVENTION_REQUIRED`. Erros temporários ficam `FAILED` durante retries e permanecem visíveis caso as tentativas se esgotem.

## 9. Filas e payload

Fila canônica: `marketplace-event-ingest`; job: `order-status-sync`.

O payload contém somente `tenantId`, ID interno, ID externo, tipo, correlation ID, versão e ID da operação. Não contém credenciais ou payload de cliente. O fluxo bidirecional falha com `503` quando Redis/BullMQ não está disponível; não há fallback síncrono.

## 10. Persistência e observabilidade

`MarketplaceOperation` registra tenant, conexão, pedidos interno/externo, operação, status, tentativas, timestamps, HTTP normalizado, código do provider, erro sanitizado e correlation ID. `GET /marketplaces/operations` expõe somente linhas do tenant autenticado.

Migration: `20260716050000_marketplace_bidirectional_operations`. É aditiva: cria dois enums, a tabela, índices e FKs; não altera nem reescreve pedidos existentes. Rollback seguro de aplicação deve primeiro desativar `MARKETPLACE_IFOOD_BIDIRECTIONAL_ENABLED` e voltar o código, preservando a tabela. Remover tabela/enums é destrutivo e só pode ocorrer em mudança separada, com backup e confirmação de que não há auditoria a preservar.

Logs estruturados incluem IDs operacionais, duração, tentativa/resultado e classificação, mas nunca token, secret, Authorization ou payload integral.

## 11. Feature e comportamento degradado

O fluxo exige simultaneamente:

- `ifood_marketplace` habilitada e entitlement válido;
- `MARKETPLACE_IFOOD_BIDIRECTIONAL_ENABLED=true`;
- Redis e BullMQ ativos;
- conexão `CONNECTED` e merchant/store vinculados;
- credenciais do aplicativo e chave de criptografia válidas;
- migration aplicada.

“Feature contratada”, “conexão configurada”, “credencial válida”, “capacidade técnica” e “homologação” são estados distintos. A UI/API não deve chamar a integração de homologada enquanto o smoke oficial estiver pendente.

## 12. Homologação e fora do escopo

Pendente: obtenção/refresh real, pedido de teste, confirmação, cancelamento elegível, repetição de evento, timeout e inspeção de logs no ambiente oficial. Sem essas evidências a feature permanece Beta.

Fora do escopo: catálogo, publicação, preços, estoque, promoções, segundo marketplace, scheduling iFood, fiscal e painel completo de reconciliação.
