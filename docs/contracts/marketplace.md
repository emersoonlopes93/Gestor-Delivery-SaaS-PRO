---
title: Contrato de Marketplace — iFood
status: current
owner: engineering
last_verified: 2026-09-01
verified_against: feat/multi-ifood-foundation-v1
---

# Contrato de Marketplace — iFood

## 1. Status real

| Capacidade | Estado |
|---|---|
| Inbox de eventos, deduplicação e importação de pedido | Implementada; testes automatizados |
| Confirmação e cancelamento via Order API | Implementados; testes contratuais com HTTP mockado |
| OAuth, renovação e coalescência de token | Implementados; testes automatizados |
| Assinatura HMAC-SHA256 do webhook | Implementada; testes automatizados |
| Reconciliação, divergências, SLA e operação administrativa | Implementados; testes automatizados e migration aditiva |
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
- [Polling, duplicidade e ordenação](https://developer.ifood.com.br/pt-BR/docs/guides/modules/events/polling-overview)
- [Pedidos agendados](https://developer.ifood.com.br/en-US/docs/guides/modules/order/scheduled-orders)
- [Fundamentos e deadline de confirmação](https://developer.ifood.com.br/en-US/docs/guides/modules/order/fundamentals)
- [Detalhes do pedido e `delivery.deliveredBy`](https://developer.ifood.com.br/en-US/docs/food/guides/modules/order/details)

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

O vínculo de tenant é a conexão persistida `MarketplaceConnection(tenantId, provider, externalMerchantId/externalStoreId)`. Um tenant pode possuir várias conexões iFood; `provider + externalMerchantId` e `provider + externalStoreId` permanecem globalmente únicos. IDs enviados no webhook nunca são tratados como `tenantId`: resolvem primeiro a conexão e somente então o tenant.

Registros existentes continuam válidos como a primeira conexão do tenant. A migration V1 remove apenas a unicidade single-store `(tenantId, provider)`; não apaga nem reescreve credenciais, pedidos ou eventos.

### 3.1 Gestão tenant-scoped das conexões

- `GET /marketplaces/connections` lista somente conexões do tenant autenticado.
- `POST /marketplaces/:provider/connect/manual` cria uma nova conexão; merchant/store duplicado retorna conflito.
- `GET|PATCH|DELETE /marketplaces/connections/:connectionId` sempre combina o ID com o tenant da sessão. `DELETE` é desconexão lógica e preserva histórico.
- `POST /marketplaces/connections/:connectionId/connect/manual` e `.../disconnect` alteram somente a conexão selecionada.
- Os endpoints provider-scoped de status/disconnect permanecem temporariamente para compatibilidade do onboarding legado e operam sobre a conexão mais recente.
- Respostas retornam somente flags `hasAccessToken`/`hasRefreshToken`; ciphertext, access token e refresh token não são serializados.

## 4. Webhook e ingestão

1. O endpoint público recebe o raw body.
2. `X-IFood-Signature` é validado por HMAC-SHA256 com comparação constante antes do processamento.
3. O evento é normalizado e o merchant/store é resolvido internamente.
4. O inbox persiste `provider + dedupeKey` com unique constraint; a chave incorpora conexão/merchant e mantém leitura compatível das chaves legadas da mesma conexão.
5. Evento duplicado retorna aceite idempotente e não cria outro pedido.
6. O pedido usa unique constraint `(connectionId, provider, externalOrderId)`.
7. Eventos finais não podem violar `ORDER_STATUS_TRANSITIONS`; divergência é registrada em log operacional.

### 4.1 Ownership provider-neutral da logística

`MarketplaceOrder.deliveryOwnership` persiste `MERCHANT`, `PROVIDER` ou `UNKNOWN`, com default seguro `UNKNOWN`. A normalização deve usar somente um campo explícito e documentado do provider; ausência, valor novo ou ambíguo nunca é inferido pela modalidade, endereço ou nome do canal.

No iFood, `delivery.deliveredBy=MERCHANT` mapeia para `MERCHANT` e `delivery.deliveredBy=IFOOD` mapeia para `PROVIDER`; qualquer outro valor mapeia para `UNKNOWN`. A frota própria aceita somente `MERCHANT`; pedidos nativos, sem `MarketplaceOrder`, continuam elegíveis. A inclusão de 99Food deve implementar esse mesmo contrato no adapter próprio quando houver documentação oficial confiável, sem reutilizar por suposição o mapeamento do iFood.

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
| Webhook | conexão/merchant + `eventId` oficial ou hash do raw body | unique `(provider, dedupeKey)` |
| Importar pedido | connection + external order | unique `(connectionId, provider, externalOrderId)` |

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

Fila canônica: `marketplace-event-ingest`; jobs: `event-inbox-process`, `order-status-sync`, `operation-reconciliation-scan`, `ifood-polling-scan` e `ifood-poll-connection`.

O payload contém somente `tenantId`, ID interno, ID externo, tipo, correlation ID, versão e ID da operação. Não contém credenciais ou payload de cliente. O fluxo bidirecional falha com `503` quando Redis/BullMQ não está disponível; não há fallback síncrono.

## 10. Persistência e observabilidade

`MarketplaceOperation` registra tenant, conexão, pedidos interno/externo, operação, status, tentativas, timestamps, HTTP normalizado, código do provider, erro sanitizado e correlation ID. `GET /marketplaces/operations` expõe somente linhas do tenant autenticado.

Migrations relevantes: `20260716050000_marketplace_bidirectional_operations`, `20260716150000_marketplace_reconciliation_operations`, `20260716190000_ifood_polling_fallback` e `20260901013000_multi_ifood_foundation_v1`. A V1 multi-iFood preserva os registros existentes, remove a constraint single-store e torna a identidade do pedido connection-scoped. Rollback seguro primeiro desativa `MARKETPLACE_IFOOD_POLLING_FALLBACK_ENABLED`, depois o bidirecional se necessário, e volta o código preservando auditoria. Reintroduzir a constraint single-store exige consolidar dados e fica fora de rollback automático.

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

Fora do escopo: catálogo, publicação, preços, estoque, promoções, segundo marketplace, scheduling iFood, fiscal e dashboard analítico completo.

## 13. Matriz de eventos e ordenação

| Evento | Entidade | Estado local esperado | Operação relacionada | Pode repetir? |
|---|---|---|---|---|
| `PLACED`/evento de criação | Pedido | `pending` após importação | nenhuma | Sim |
| `CONFIRMED`/`ORDER_CONFIRMED` | Pedido | `confirmed`, somente por transição válida | `CONFIRM` → `SUCCEEDED` | Sim |
| falha permanente de confirmação HTTP | Operação | sem mudança local | `CONFIRM` → `INTERVENTION_REQUIRED` | Sim por retry controlado |
| `CANCELLED`/`ORDER_CANCELLED` | Pedido | `cancelled`, somente por transição válida | `CANCEL` → `SUCCEEDED` | Sim |
| `CANCELLATION_REQUEST_FAILED` | Operação | estado local preservado | `CANCEL` → `INTERVENTION_REQUIRED` | Sim |
| cancelamento remoto sem operação local | Pedido | `cancelled` se a máquina permitir | nenhuma; pode gerar divergência | Sim |
| `COMPLETED`/`ORDER_COMPLETED`/`CONCLUDED` | Pedido | `completed` apenas se a transição direta for permitida | nenhuma | Sim |
| evento desconhecido | Inbox | nenhum efeito de lifecycle | nenhuma | Sim; persiste para auditoria |
| evento mais antigo que `lastExternalEventAt` | Inbox | nenhum; regressão bloqueada | nenhuma | Sim; termina `IGNORED` |

Todo evento persiste `eventId`, `createdAt`, sequência quando disponível, correlation ID, hash e chave de deduplicação. A unique constraint `(provider, dedupeKey)` é a autoridade, mas a chave é derivada de conexão/merchant + identidade do evento. O código lê também a chave legada quando ela pertence à mesma conexão e captura `P2002`, fechando a corrida entre workers. Eventos `PROCESSED` ou `IGNORED` retornam sucesso sem repetir efeitos; `FAILED` pode ser reprocessado com claim condicional.

## 14. Reconciliação e divergências

O scheduler BullMQ executa a cada 60 segundos, com job ID estável, até 100 operações por rodada, ordenação por idade, três tentativas, backoff exponencial, timeout do cliente HTTP e worker com concorrência 5. A varredura enumera conexões iFood e depois consulta operações sempre com `tenantId`. Cada operação usa claim otimista por `updatedAt`, impedindo duas varreduras simultâneas de consultarem o provider para a mesma versão.

Tipos canônicos: `LOCAL_AHEAD`, `REMOTE_AHEAD`, `OPERATION_TIMEOUT`, `EVENT_MISSING`, `INVALID_TRANSITION`, `AUTHENTICATION_FAILURE`, `MERCHANT_MAPPING_FAILURE`, `PERMANENT_PROVIDER_REJECTION` e `UNKNOWN_EXTERNAL_STATE`. Divergências guardam tenant, IDs interno/externo, estados, operação, motivo, última tentativa, correlation ID, ação recomendada e resolução. Nunca autorizam transição fora de `ORDER_STATUS_TRANSITIONS`.

## 15. SLA de confirmação

O prazo oficial é calculado como:

- pedido `IMMEDIATE`: `createdAt + 8 minutos`;
- pedido `SCHEDULED`: `preparationStartDateTime + 8 minutos`.

São persistidos recebimento do evento, `externalCreatedAt`, `preparationStartAt`, deadline, enqueue, primeira tentativa, aceite e atraso de fila. Restando até dois minutos, é emitido alerta estruturado; prazo vencido gera alerta e divergência `OPERATION_TIMEOUT`. A métrica administrativa inclui pendências, idade máxima, deadlines, duplicatas, fora de ordem, divergências, retries, autenticação, `429`, `5xx` e tempo médio até conclusão.

## 16. Administração e retry

Endpoints SaaS Admin exigem `AdminAuthGuard`, `AdminPermissionsGuard`, tenant explícito, paginação e payload sanitizado:

| Endpoint | Permissão | Finalidade |
|---|---|---|
| `GET /admin/marketplace/operations` | `saas.marketplace.read` | listar operações e filtrar status/tipo |
| `GET /admin/marketplace/failures` | `saas.marketplace.read` | listar `FAILED`/`INTERVENTION_REQUIRED` |
| `GET /admin/marketplace/divergences` | `saas.marketplace.read` | listar divergências e resolução |
| `GET /admin/marketplace/operations/:id` | `saas.marketplace.read` | detalhe sanitizado |
| `GET /admin/marketplace/operations/:id/history` | `saas.marketplace.read` | operação original e retries filhos |
| `GET /admin/marketplace/metrics` | `saas.marketplace.read` | métricas operacionais por tenant |
| `POST /admin/marketplace/operations/:id/retry` | `saas.marketplace.manage` | retry após reconciliação, rate limit 5/min |
| `POST /admin/marketplace/divergences/:id/acknowledge` | `saas.marketplace.manage` | reconhecer com auditoria |
| `POST /admin/marketplace/connections/:id/rotate-credentials` | `saas.marketplace.manage` | recifrar credenciais, rate limit 3/min |
| `GET /admin/marketplace/connections/polling` | `saas.marketplace.read` | estado, timestamps e contadores sanitizados |
| `POST /admin/marketplace/connections/:id/poll-now` | `saas.marketplace.manage` | ciclo manual auditado, rate limit 3/min |

Retry administrativo nunca reutiliza silenciosamente o job: reconcilia primeiro, recusa operações concluídas/aceitas/ativas, cria correlation ID e operação filha, registra admin/IP, preserva a original e limita três tentativas por operação.

## 17. Polling e recuperação

O fallback iFood é opt-in e permanece desligado por padrão. Exige `MARKETPLACE_IFOOD_BIDIRECTIONAL_ENABLED=true`, `MARKETPLACE_IFOOD_POLLING_FALLBACK_ENABLED=true`, Redis/BullMQ, feature/entitlement do tenant, tenant ativo, conexão `CONNECTED`, merchant mapeado, `settingsJson.pollingFallbackEnabled=true` e `settingsJson.presenceMode=POLLING`.

O scheduler executa a cada 30 segundos por token/device. Conexões sem refresh token usam o OAuth client centralizado e compartilham um job; seus merchants são agrupados em headers de até 100 IDs. Conexões com refresh token têm token independente e job próprio. Job ID e claim persistente impedem dois schedulers/workers de executar a mesma janela. Eventos são ordenados por `createdAt`, depois sequência, precedência de estado e ID apenas como desempate estável. Webhook e polling compartilham `(provider,dedupeKey)`; a inbox registra primeiro/último canal, entregas e timestamps.

ACK usa lotes conservadores de até 2.000 IDs e só ocorre após commit da nova linha ou confirmação de duplicata existente. Falha de persistência, ID ausente ou merchant inconsistente não recebe ACK. Evento sem tópico/pedido é persistido como `IGNORED`; desconhecidos não interrompem o lote. Falha permanente bloqueia polling da conexão; 429/5xx respeitam `Retry-After`/backoff.

Polling bem-sucedido é o heartbeat oficial. `presenceMode` aceita `WEBHOOK`, `POLLING` ou `DISABLED`; a API rejeita combinação contraditória entre polling e presença. Polling sem heartbeat não se aplica ao contrato iFood vigente. O modo nunca é alterado automaticamente em produção. Detalhes operacionais: [runbook de homologação](../operations/runbooks/ifood-homologation.md).

## 18. E2E local multi-iFood

Com PostgreSQL local efêmero, API em `http://127.0.0.1:3333/api/v1` e configuração explicitamente fake/local, execute `pnpm --filter @gestor/api e2e:multi-ifood-v1`. O harness recusa URLs de banco ou API que não sejam locais e nunca chama o iFood real. Para a camada visual, inicie o web-tenant local e execute `MULTI_IFOOD_E2E_RUN_ID=<run-id> pnpm e2e:multi-ifood-web-tenant`; a evidência é gravada em `qa-artifacts/multi-ifood-e2e-v1/`.

Os seams de polling e OAuth existem somente para tornar falha, retry e isolamento deterministas. Eles não constituem homologação do provider. Mudanças de status usadas no smoke KDS removem temporariamente, apenas no banco efêmero, o vínculo outbound do pedido marketplace para não enfileirar operação contra iFood; o vínculo é restaurado antes do encerramento.

## 19. Criptografia e rotação

Novas cifras usam `enc:v2:<keyVersion>` com AES-256-GCM, nonce aleatório de 12 bytes e auth tag obrigatória. `enc:v1` continua legível apenas com a chave atual para migração; plaintext falha fechado. A leitura aceita somente a versão atual e uma versão anterior explicitamente configurada. O endpoint administrativo recifra tokens sem retornar plaintext, token ou ciphertext.

## 20. 99Food Orders V1

### Production response compatibility (2026-09-05)

Native detail parsing preserves unquoted 64-bit identifiers as decimal strings before JSON parsing. The normalizer accepts the official direct `OrderModel` and bounded native containers (`data`, `order_info`, `order`, `order_detail`, `detail`) only when an `order_id` is present. When the remote detail is sparse, missing address, price, and item fields may be completed from the signed `data.order_info` received with `orderNew`; an incomplete merged snapshot remains retryable and is not imported as a placeholder.

### Native payment method normalization (2026-09-08)

The native `OrderModel` payment source is `pay_channel`, with the documented legacy `pay_type` used only when `pay_channel` is absent. Exact existing-domain mappings are: cash channel `153` to `cash`, PIX channels `212` and `280` to `pix`, POS credit `262` to `credit_card`, POS debit `263` to `debit_card`, and generic POS `154` to `card_on_delivery`. Legacy cash (`pay_type=2`) and courier POS (`pay_type=3`) map to the same existing methods. Unknown, missing, or non-equivalent channels remain `other`; in particular, combined credit/debit channel `150` is not guessed as either card type. Historical orders are not backfilled.

### Native financial and collection semantics (2026-09-09)

`price.order_price` is the gross product sale. `price.customer_need_paying_money` is the customer's payable total; it is not payment evidence by itself. Detailed `pay_channel` takes precedence over legacy `pay_type` when classifying collection. Online channels (`150`, `212`, `280`) establish marketplace collection and a paid customer amount, so `amountToCollect=0`. Cash/POS delivery channels (`153`, `154`, `262`, `263`) establish pending driver collection for the exact customer payable amount. Unknown or missing modes preserve payment, collection and amount-to-collect as unknown rather than zero.

The native `order_index` is the provider's shop order number for the day and is preserved as the operational display number; the internal PedeHub order number remains visible. `order_id` remains a lossless string because official examples exceed JavaScript's safe integer range.

The raw Swagger formula for `real_price`, `real_pay_price`, and `shop_paid_money` remains preserved as provider contract evidence. The formula describes price composition; it does not by itself establish a ledger event.

**Official 99Food support business-semantics clarification (2026-09-12; support response retained in the task record):** `real_price` is the total estimated to be received by the merchant for this order, including delivery and excluding promotions subsidized by 99Food; `real_pay_price` is the total effectively paid by the customer; and `customer_need_paying_money` is the amount the customer needs to pay. Therefore the normalized snapshot adds `merchantEstimatedReceivable` from `real_price`, `customerActuallyPaid` from `real_pay_price`, and `customerNeedsToPay` from `customer_need_paying_money`. These are explicit provider facts, not reinterpretations of legacy generic fields.

`real_price` is never a settled payout, `FinancialAccount.balance`, cash received, or a `FinancialTransaction`. `real_pay_price` is never used as `amountToCollect` or merchant receivable. `customer_need_paying_money` remains the operational collection reference selected only through documented payment mode. `shop_paid_money` remains a cash-order rider advance scenario. `promotions[].shop_subside_price` is the documented merchant-borne promotion cost. Only the order-level promotions array is aggregated because the official fixture repeats item promotions in `promotion_detail`/`promo_list`; item and order arrays must never be summed together. External/platform funding remains unknown.

`others_fees.service_price` is preserved as the provider-reported service fee. The available snapshot does not prove that it is merchant revenue, merchant cost, or part of the merchant estimate, so operational copy remains neutral and no receivable calculation consumes it.

`FinancialProjection.merchantReceivable` continues to mean a projected/estimated receivable, never settlement. For 99Food it is `KNOWN` only when explicit `merchantEstimatedReceivable` is present from `real_price`; actual settlement remains `UNKNOWN`. Order ingestion creates no `FinancialTransaction` and never changes `FinancialAccount.balance`.

`items_discount`, `delivery_discount` and `others_fees.coupon_discount` establish the total discount but do not identify its funder. `delivery_price` and `others_fees.service_price` are customer charges. Merchant-funded discount, platform-funded discount, and platform fees remain unknown because the native order snapshot does not provide those facts. The normalized snapshot persists these distinctions in the existing JSON field; no new database column or inferred settlement exists.

### Marketplace consistency limitations (2026-09-15)

The verified native 99Food callback and snapshot contract do not provide a canonical
`courier arrived`, `picked up`, or `out for delivery` event. The adapter accepts only the
official `orderNew`, `orderConfirm`, `orderReady`, `orderCancel`, `orderPartialCancel`, and
`orderFinish` lifecycle events. Therefore `deliveryStatus`, numeric values, or elapsed time
cannot safely transition an order to `out_for_delivery` or create an urgent courier alert.
Until the provider exposes a supported fact, PedeHub preserves the last confirmed canonical
state and reports the capability limitation rather than inventing an operational state.

Canonical stock is local and recipe-driven: `OrderItem.productId` resolves product recipes
and the idempotent depletion/reversal movements. POS and PedeHub storefront orders have this
canonical identity. Imported iFood and 99Food items currently preserve external IDs only;
there is no persisted tenant-scoped `provider/externalProductId -> Product or Variant` mapping.
They must not be matched by name, so marketplace stock depletion/reversal and outbound
availability synchronization cannot be claimed as implemented. A managed mapped catalog,
including provider contracts and migration, is separate roadmap scope.

### Native action activation and privacy-protected names (2026-09-05)

99Food actions initiated from the operational order board require `orders.update_status`, a tenant-scoped `CONNECTED` 99Food connection, `MARKETPLACE_99FOOD_ENABLED=true`, and operational BullMQ. The connected store is the tenant's explicit opt-in for these native actions. The generic beta `marketplace_orders` preset controls marketplace-management surfaces and does not independently block the normal order-status endpoint; iFood retains its provider-specific feature and entitlement gate.

The provider may return `receive_address.name="privacy protection"`. This value is a privacy marker, not a customer name. The normalizer discards it, prefers documented `first_name` and `last_name` values when available, and otherwise uses the neutral `Cliente 99Food` label. A deliberately withheld customer name does not invalidate a snapshot with an exact order ID and items. The repair scan includes historical orders that persisted the literal marker, without repeatedly fetching already-complete privacy-masked orders.

### Paridade de pedido nativo (2026-09-04)

A fonte normativa do callback nativo Ã© o portal 99Food: [Webhooks](https://openplatform-portal-food.99app.com/docs/v1/node/nodedataget?id=1921) e [Order Webhooks](https://openplatform-portal-food.99app.com/docs/v1/node/nodedataget?id=1981). Os eventos oficiais de lifecycle documentados para este fluxo sÃ£o `orderNew`, `orderConfirm`, `orderReady`, `orderCancel`, `orderPartialCancel` e `orderFinish`. NÃ£o hÃ¡ evento nativo documentado chamado `preparing`; o PedeHub nÃ£o o inventa. `orderConfirm` sincroniza para `confirmed`, `orderReady` para pronto e `orderFinish` para `completed`, sempre respeitando `ORDER_STATUS_TRANSITIONS` e a proteÃ§Ã£o contra eventos atrasados/repetidos.

O snapshot nativo usa `order_info.order_items` e a Ã¡rvore `sub_item_list`; seus preÃ§os inteiros sÃ£o centavos. A importaÃ§Ã£o preserva esses subitens como linhas legÃ­veis de complemento, incluindo quantidade, e mantÃ©m `remark` como observaÃ§Ã£o. JSON de opÃ§Ãµes nÃ£o Ã© exibido ao operador, KDS ou impressÃ£o.

Os valores oficiais consumidos sÃ£o `price.order_price` (venda operacional dos produtos), `price.customer_need_paying_money` (total devido pelo cliente, cujo pagamento depende do modo de cobranÃ§a), `price.items_discount`, `price.delivery_discount`, `price.others_fees.coupon_discount`, `price.delivery_price` e `price.others_fees.service_price`. O snapshot nÃ£o entrega, nesse contrato, um recebÃ­vel/repasse do restaurante; ele nunca Ã© deduzido. Pedidos pagos online exibem “Pago na 99Food”; pedidos de cobranÃ§a pelo entregador exibem o valor exato a cobrar; e o Kanban destaca a venda dos produtos, nÃ£o o total do cliente apÃ³s descontos e taxas.

The preceding historical paragraph predates the 2026-09-12 official support clarification. It remains evidence of the raw Swagger formula, but must not be read to classify `real_price` as an absent merchant estimate: `real_price` is now explicitly modeled as `merchantEstimatedReceivable`, while remaining distinct from settlement and balance.

O Swagger oficial define `delivery_type=1` como entrega da plataforma (`PROVIDER`) e `delivery_type=2` como entrega da loja (`MERCHANT`); ausência ou valor desconhecido vira `UNKNOWN`. O Routing V2 continua fail-closed para `PROVIDER` e `UNKNOWN`.

As ações nativas usam exclusivamente `https://openapi.didi-food.com` (ou `MARKETPLACE_99FOOD_API_BASE_URL`): confirmar `POST /v1/order/order/confirm`, pronto `GET /v1/order/order/ready`, detalhe `GET /v1/order/order/detail` e entregue `GET /v1/order/order/delivered`. Todas exigem resposta HTTP 200 com `errno=0`; confirmar exige adicionalmente `data=true`. IDs são strings decimal no domínio e são enviados como literal JSON decimal quando o Swagger exige inteiro, sem conversão para `number`.

O token por loja usa `GET /v1/auth/authtoken/get` com `app_id`, `app_secret` e `app_shop_id`; refresh chama `GET /v1/auth/authtoken/refresh` e então get. O token retornado em `data.auth_token` permanece criptografado na conexão. A URL de autorização usa `POST /v1/auth/authorizationpage/getUrl` com `app_id` e `app_shop_id`. App ID e Client Secret são configurações de ambiente e nunca retornam pela API.

O callback 99Food valida `didi-header-sign` como o digest MD5 hexadecimal de 32 caracteres dos bytes exatos do corpo bruto concatenados diretamente ao App Secret (`MD5(raw POST body + app_secret)`). Não há ordenação de JSON, timestamp, nonce, path ou query na mensagem assinada. A comparação usa buffers e `timingSafeEqual`; assinatura ausente, malformada ou incorreta falha fechada. O App Secret vem de `MARKETPLACE_99FOOD_CLIENT_SECRET`, sem valor registrado em logs.

O protocolo 99Food recomendado envia um objeto por callback: `app_id`, `app_shop_id`, `type`, `timestamp` e `data`. Para pedidos, `data.order_id` identifica o pedido; `orderNew` também pode fornecer o ID interno da loja em `data.order_info.shop.shop_id`. `app_shop_id` é o identificador da loja no sistema do parceiro e resolve `MarketplaceConnection.externalStoreId`; o ID interno, quando presente, alimenta `externalMerchantId`. Como o contrato não fornece `eventId`, o adapter deriva uma chave determinística com SHA-256 somente desses identificadores técnicos, tipo e timestamp. IDs long oficiais são preservados como strings a partir do corpo bruto assinado, evitando perda de precisão do `JSON.parse` nativo. A resposta atual é `204` somente depois que a inbox aceita o evento. O callback é apenas um sinal: a importação busca o snapshot autoritativo pelo `order_id`.

O polling é opt-in por ambiente e por conexão. Cada loja recebe job e token independentes. O worker persiste ou confirma a duplicata antes de enviar o ACK oficial completo (`id`, `orderId`, `eventType`), em lotes de até 2.000. `429` e `5xx` usam retry exponencial e `Retry-After`; erro permanente bloqueia a conexão sem contaminar outras lojas.

Pedidos usam `marketplace_99food`, preservam itens, opções, taxas, descontos, total, pagamento, troco, endereço e timestamps do snapshot. Somente `MERCHANT` permite entregador, rota e auto-dispatch internos. O lifecycle outbound expõe confirmar e pronto; entregue é permitido somente para `MERCHANT`. Cancelamento permanece indisponível porque o Swagger lista `reason_id` numérico mas não fornece rótulos oficiais, e despacho/aceite/recusa de cancelamento não são enviados para endpoints Open Delivery legados.

Variáveis: `MARKETPLACE_99FOOD_APP_ID`, `MARKETPLACE_99FOOD_CLIENT_SECRET`, `MARKETPLACE_99FOOD_API_BASE_URL`, `MARKETPLACE_99FOOD_FINANCE_API_BASE_URL`, `MARKETPLACE_99FOOD_HTTP_TIMEOUT_MS`, `MARKETPLACE_99FOOD_ENABLED`, `MARKETPLACE_99FOOD_POLLING_ENABLED`, `MARKETPLACE_99FOOD_POLLING_INTERVAL_MS`, `MARKETPLACE_99FOOD_POLLING_LOOKBACK_MS` e `MARKETPLACE_99FOOD_POLLING_CONNECTIONS_PER_SCAN`. Habilitar polling exige Redis e BullMQ. Sem credenciais Sandbox, testes reais de OAuth, webhook, polling, pedido e lifecycle permanecem obrigatoriamente pendentes; a feature não pode ser declarada homologada. O contrato financeiro separado está em [Conciliação financeira 99Food](./99food-financial-reconciliation.md).
