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

### Paridade de pedido nativo (2026-09-04)

A fonte normativa do callback nativo Ã© o portal 99Food: [Webhooks](https://openplatform-portal-food.99app.com/docs/v1/node/nodedataget?id=1921) e [Order Webhooks](https://openplatform-portal-food.99app.com/docs/v1/node/nodedataget?id=1981). Os eventos oficiais de lifecycle documentados para este fluxo sÃ£o `orderNew`, `orderConfirm`, `orderReady`, `orderCancel`, `orderPartialCancel` e `orderFinish`. NÃ£o hÃ¡ evento nativo documentado chamado `preparing`; o PedeHub nÃ£o o inventa. `orderConfirm` sincroniza para `confirmed`, `orderReady` para pronto e `orderFinish` para `completed`, sempre respeitando `ORDER_STATUS_TRANSITIONS` e a proteÃ§Ã£o contra eventos atrasados/repetidos.

O snapshot nativo usa `order_info.order_items` e a Ã¡rvore `sub_item_list`; seus preÃ§os inteiros sÃ£o centavos. A importaÃ§Ã£o preserva esses subitens como linhas legÃ­veis de complemento, incluindo quantidade, e mantÃ©m `remark` como observaÃ§Ã£o. JSON de opÃ§Ãµes nÃ£o Ã© exibido ao operador, KDS ou impressÃ£o.

Os valores oficiais consumidos sÃ£o `price.order_price` (venda operacional dos produtos), `price.customer_need_paying_money` (valor pago pelo cliente), `price.items_discount`, `price.delivery_discount`, `price.others_fees.coupon_discount`, `price.delivery_price` e `price.others_fees.service_price`. O snapshot nÃ£o entrega, nesse contrato, um recebÃ­vel/repasse do restaurante; ele nunca Ã© deduzido. Pedidos prÃ©-pagos exibem “Pago na 99Food”, e o Kanban destaca a venda dos produtos, nÃ£o o valor pago apÃ³s subsÃ­dios.

`delivery_type` distingue entrega de retirada, mas o contrato consultado nÃ£o declara um campo normativo para ownership merchant/provider. Portanto `99FOOD_LOGISTICS_OWNERSHIP_SOURCE=UNAVAILABLE_IN_NATIVE_ORDER_DETAIL_CONTRACT`; a integraÃ§Ã£o de Routing V2 nÃ£o Ã© alterada.

O documento de `orderNew` exige confirmaÃ§Ã£o em `/order/order/confirm`, mas o contrato completo de parÃ¢metros/resposta da aÃ§Ã£o ainda nÃ£o foi obtido. Enquanto isso, o cliente nÃ£o deve executar os endpoints Open Delivery v4 como se fossem a API nativa: as aÃ§Ãµes 99Food ficam indisponÃ­veis ao tenant com mensagem operacional, nunca com erro tÃ©cnico nem bypass de feature/billing.

A integração 99Food usa o protocolo Open Delivery v4 e permanece desligada por padrão. Cada `MarketplaceConnection` representa uma loja e exige `externalMerchantId` e `externalStoreId` (`AppShopId`). O OAuth `client_credentials` usa `client_id=<AppID>_<AppShopId>`; o access token é armazenado exclusivamente com a criptografia versionada existente. App ID e Client Secret são configurações de ambiente e nunca retornam pela API.

O callback 99Food valida `didi-header-sign` como o digest MD5 hexadecimal de 32 caracteres dos bytes exatos do corpo bruto concatenados diretamente ao App Secret (`MD5(raw POST body + app_secret)`). Não há ordenação de JSON, timestamp, nonce, path ou query na mensagem assinada. A comparação usa buffers e `timingSafeEqual`; assinatura ausente, malformada ou incorreta falha fechada. O App Secret vem de `MARKETPLACE_99FOOD_CLIENT_SECRET`, sem valor registrado em logs.

O protocolo 99Food recomendado envia um objeto por callback: `app_id`, `app_shop_id`, `type`, `timestamp` e `data`. Para pedidos, `data.order_id` identifica o pedido; `orderNew` também pode fornecer o ID interno da loja em `data.order_info.shop.shop_id`. `app_shop_id` é o identificador da loja no sistema do parceiro e resolve `MarketplaceConnection.externalStoreId`; o ID interno, quando presente, alimenta `externalMerchantId`. Como o contrato não fornece `eventId`, o adapter deriva uma chave determinística com SHA-256 somente desses identificadores técnicos, tipo e timestamp. IDs long oficiais são preservados como strings a partir do corpo bruto assinado, evitando perda de precisão do `JSON.parse` nativo. A resposta atual é `204` somente depois que a inbox aceita o evento. O callback é apenas um sinal: a importação busca o snapshot autoritativo pelo `order_id`.

O polling é opt-in por ambiente e por conexão. Cada loja recebe job e token independentes. O worker persiste ou confirma a duplicata antes de enviar o ACK oficial completo (`id`, `orderId`, `eventType`), em lotes de até 2.000. `429` e `5xx` usam retry exponencial e `Retry-After`; erro permanente bloqueia a conexão sem contaminar outras lojas.

Pedidos usam `marketplace_99food`, preservam itens, opções, taxas, descontos, total, pagamento, troco, endereço e timestamps do snapshot. `delivery.deliveredBy` define a autoridade logística: somente `MERCHANT` permite entregador, rota e auto-dispatch internos; `MARKETPLACE` ou valor desconhecido falham fechado. O lifecycle outbound cobre confirmar, pronto, despachar, entregar/retirar e solicitar cancelamento; aceite e recusa de cancelamento existem no adapter para o fluxo assíncrono.

Variáveis: `MARKETPLACE_99FOOD_APP_ID`, `MARKETPLACE_99FOOD_CLIENT_SECRET`, `MARKETPLACE_99FOOD_API_BASE_URL`, `MARKETPLACE_99FOOD_HTTP_TIMEOUT_MS`, `MARKETPLACE_99FOOD_ENABLED`, `MARKETPLACE_99FOOD_POLLING_ENABLED`, `MARKETPLACE_99FOOD_POLLING_INTERVAL_MS`, `MARKETPLACE_99FOOD_POLLING_LOOKBACK_MS` e `MARKETPLACE_99FOOD_POLLING_CONNECTIONS_PER_SCAN`. Habilitar polling exige Redis e BullMQ. Sem credenciais Sandbox, testes reais de OAuth, webhook, polling, pedido e lifecycle permanecem obrigatoriamente pendentes; a feature não pode ser declarada homologada.
