# Auditoria de Marketing, Analytics e Desempenho do Cardápio

Data da auditoria: 2026-07-28

Versão do relatório: `1.0.0`

Modo: local, read-only; nenhuma execução contra banco ou provider

Branch/HEAD no início da auditoria: `fix/dashboard-period-theme-consistency` / `9d04645e`

Branch/HEAD no encerramento: `fix/driver-modal-theme-contrast` / `55f36b20` (troca externa durante a sessão; o único delta desde o HEAD auditado é `DriverSelectionModal.tsx`, fora dos domínios desta auditoria)

Árvore do HEAD auditado equivalente a: `origin/main-copy` em `4a5a7d97` (`9d04645e` é ancestral e `git diff --quiet 9d04645e origin/main-copy` retornou 0)

Drift revalidado em: `origin/main-copy` / `fbaa2714` em 2026-07-28

Fundação aprovada para implementação futura: [ADR de Marketing Analytics](../adr/marketing-analytics-foundation.md) e [contrato TypeScript v1](../../packages/types/src/marketing-analytics.ts).

Escopo desta versão: documentação e contrato compartilhado; nenhuma implementação operacional, persistência, provider ou instrumentação foi adicionada.

### Adendo de drift

O diff direcionado de `9d04645e..origin/main-copy` nos domínios auditados (`web-storefront`, dashboard/analytics/integrations/campaigns do tenant, analytics/storefront/orders/campaigns da API, Prisma, `packages/types` e `docs/contracts`) permaneceu vazio. O único delta global foi `apps/web-tenant/src/features/orders/components/DriverSelectionModal.tsx`, classificado como **sem impacto** por pertencer ao fluxo visual de seleção de entregador. Nenhuma mudança teve impacto documental, contratual ou arquitetural, e nenhuma conclusão da auditoria foi invalidada.

## 1. Resumo executivo

O sistema possui analytics **transacional**, tenant-scoped e útil para operação: pedidos por status/canal, receita, ticket médio, horários, produtos vendidos, margem, retenção e métricas de campanhas. A fonte é quase sempre `Order`, `OrderItem`, `OrderTimeline`, `Campaign` e `CampaignDispatch`; não são eventos reais de navegação. Evidências: `AnalyticsController` e suas rotas autenticadas (`apps/api/src/analytics/analytics.controller.ts:11-119`), consultas de pedidos (`apps/api/src/analytics/analytics.service.ts:97-159`) e contratos retornados (`packages/types/src/analytics.ts:3-88`).

Não existe infraestrutura própria de comportamento do cardápio: não há `AnalyticsEvent`, agregado diário, endpoint público de ingestão, `visitorId`, `sessionId` anônimo, eventos `page_view`/`view_item`/`add_to_cart`, UTMs persistidas, GA4, Meta Pixel, Google Ads, consent manager ou categorias de consentimento. Isso foi confirmado por busca textual em `apps/web-storefront`, `apps/web-tenant`, `apps/api`, `packages`, Prisma e migrations; os únicos storages anônimos do storefront são carrinho, preferência de tema/PWA e tokens de tracking (`apps/web-storefront/src/store/use-cart-store.ts:187-213`; `apps/web-storefront/src/pages/OrderConfirmationPage.tsx:59-65`).

Há suporte parcial a marketing:

- campanhas WhatsApp persistem contadores de envio, leitura, clique e conversão (`apps/api/prisma/schema.prisma:2830-2894`);
- conversão de campanha é uma atribuição aproximada ao último dispatch enviado ao mesmo cliente antes de um pedido dentro da janela, sem UTM ou click ID (`apps/api/src/campaigns/services/campaigns.service.ts:272-316`);
- URLs de Google Reviews, Instagram e Facebook existem apenas no JSON da automação pós-pedido e são exibidas na página de feedback (`apps/web-tenant/src/features/campaigns/pages/AutomationsPage.tsx:413-434`; `apps/api/src/orders/public-orders.controller.ts:124-140`; `apps/web-storefront/src/pages/PublicFeedbackPage.tsx:167-200`);
- o WhatsApp público é um número por tenant no payload do cardápio (`apps/api/prisma/schema.prisma:468`; `apps/api/src/storefront/storefront.service.ts:438-469`).

Recomendação: começar por contrato versionado, consentimento mínimo e eventos próprios first-party. Só depois adicionar providers, reutilizando o mesmo dispatcher e o mesmo `eventId`. GA4 deve ser a primeira integração externa; Meta e Ads ficam atrás de consentimento e deduplicação. Não criar uma arquitetura paralela ao módulo `analytics`.

## 2. Estado atual confirmado

| Item | Estado confirmado | Evidência |
|---|---|---|
| Branch inicial | `fix/dashboard-period-theme-consistency` | primeira execução de `git branch --show-current` |
| HEAD inicial auditado | `9d04645e` | primeira execução de `git rev-parse --short HEAD` |
| Branch/HEAD final | `fix/driver-modal-theme-contrast` / `55f36b20` | troca externa; `9d04645e` é ancestral e o único arquivo alterado entre os SHAs é `DriverSelectionModal.tsx` |
| `origin/main-copy` | `4a5a7d97`, não o `6e5acfa3` informado | `git fetch origin --prune`; `git rev-parse --short origin/main-copy` |
| Relação Git inicial | `9d04645e` é ancestral do remoto; árvores iguais | `git merge-base --is-ancestor 9d04645e origin/main-copy` = 0; `git diff --quiet 9d04645e origin/main-copy` = 0 |
| Working tree inicial | limpo | primeira execução de `git status --short`, sem saída |
| Alteração externa durante a auditoria | `M apps/web-tenant/src/features/orders/components/DriverSelectionModal.tsx`, não relacionada e não tocada por esta auditoria | diff observado: alteração visual/acessibilidade no botão de fechar |
| Stash | `stash@{0}: On release/main-copy-consolidation: local unrelated files before PR11 smoke fix` | `git stash list --max-count=5` |
| Deploy/DB/providers | não utilizados | limite operacional desta auditoria |

`NÃO CONFIRMADO`: o motivo pelo qual `origin/main-copy` avançou do SHA informado para `4a5a7d97`. O commit remoto é o merge do PR #23 conforme `git log -1 origin/main-copy`; nenhuma API do GitHub foi consultada.

Documentos canônicos de `api.md`, arquitetura multi-tenancy, integrações e user flows são referenciados por `docs/README.md`, mas não existem nos caminhos indicados. Foram usados os contratos presentes de isolamento, pedidos e filas. O contrato de isolamento está parcialmente desatualizado: afirma resolução de slug pelo interceptor, porém o interceptor atual só cria contexto a partir de JWT tenant (`docs/contracts/tenant-isolation.md`, seção 2; `apps/api/src/common/interceptors/tenant.interceptor.ts:16-29`).

## 3. O que já existe

1. Rotas públicas de cardápio, checkout, pedido, pagamento, tracking e feedback (`apps/web-storefront/src/App.tsx:44-55`).
2. Resolução server-side do tenant pelo slug, sem confiar em `tenantId` do corpo, tanto no cardápio quanto no checkout (`apps/api/src/storefront/storefront.service.ts:66-92`; `apps/api/src/orders/orders.service.ts:179-227`).
3. Carrinho local tenant-aware, persistido em `localStorage` e limpo na troca de slug/tenant (`apps/web-storefront/src/store/use-cart-store.ts:60-81,187-213`).
4. Checkout idempotente: chave UUID por montagem da página e unicidade `(tenantId, idempotencyKey)` no banco (`apps/web-storefront/src/pages/CheckoutPage.tsx:226-227`; `apps/api/src/orders/orders.service.ts:238-247`; `apps/api/prisma/schema.prisma:1003-1004`).
5. Analytics operacional/comercial/custos/financeiro autenticado e tenant-scoped (`apps/api/src/analytics/analytics.controller.ts:21-70`; `apps/api/src/analytics/analytics.service.ts:97-207`).
6. Produtos mais vendidos e receita por produto derivados de pedidos concluídos (`apps/api/src/analytics/analytics.service.ts:126-159,560-587`).
7. Vitrine “Mais vendidos” baseada em quantidade vendida nos últimos 30 dias, não em visualizações (`apps/api/src/analytics/business-intelligence.service.ts:355-367`; `apps/api/src/storefront/storefront.service.ts:506-531`).
8. Eventos WebSocket operacionais `order.created`, `order.cancelled`, `order.ready` e atualização de status (`apps/api/src/orders/orders.gateway.ts:70-184`).
9. Histórico persistido de status em `OrderTimeline` e evento idempotente de receita no billing (`apps/api/src/orders/orders.service.ts:1146-1167`; `apps/api/prisma/schema.prisma:1067-1081`).
10. Rate limit global e limites específicos nas rotas públicas (`apps/api/src/app.module.ts:200-206,338-345`; `apps/api/src/orders/orders.controller.ts:34-51`; `apps/api/src/storefront/storefront.controller.ts:11-50`).

## 4. O que existe parcialmente

- “Conversão” no BI significa conversão de campanhas (`converted/sent`), não conversão do cardápio (`apps/api/src/analytics/business-intelligence.service.ts:48-85,253-269`).
- “Origem” no dashboard é `Order.sourceChannel`; todos os checkouts do cardápio enviam `direct_online`. Não representa referrer, campanha ou UTM (`apps/web-storefront/src/pages/CheckoutPage.tsx:468,542`; `apps/api/prisma/schema.prisma:957`).
- Cliques sociais só são registrados no fluxo pós-feedback e colapsados em `OrderFeedback.publicReviewClicked/clickedChannel`; não são links sociais gerais do cardápio (`apps/api/prisma/schema.prisma:2927-2945`; `apps/api/src/orders/public-orders.controller.ts:175-199`).
- Campanhas guardam métricas, mas `totalClicked/clickedAt` não possui mecanismo de click tracking encontrado no storefront; a migration apenas adiciona colunas (`apps/api/prisma/migrations/20260609090000_phase9_campaign_automation_metrics/migration.sql:5-15`).
- Sessões autenticadas existem em `AuthSession`, mas não são identidade anônima de analytics (`apps/api/prisma/schema.prisma:161-190`).
- `ChatSession.cartData` e automação de carrinho abandonado pertencem ao canal WhatsApp, não ao carrinho web (`apps/api/prisma/schema.prisma:2658-2689`).

## 5. O que não existe

Confirmado por schema, migrations e busca de imports/chamadas:

- `AnalyticsEvent`, `AnalyticsDailyAggregate`, `TenantMarketingIntegration`, `TenantSocialLinks`, `ConsentRecord`;
- endpoint público para eventos do cardápio;
- visitas, visitantes únicos, product views, cart views, checkout starts ou abandono web persistidos;
- UTMs, referrer, landing page, first touch e last touch;
- GA4 Measurement ID, Meta Pixel ID, Google Ads ID/Label;
- loader `gtag`, `fbq` ou scripts de tags;
- consent banner/manager, revogação, versão e categorias necessary/analytics/marketing;
- retenção/purge de telemetria comportamental;
- testes de analytics comportamental, consentimento ou provider mapping.

Evidência estrutural: lista completa de models em `apps/api/prisma/schema.prisma:11-3127`; payload público limitado a tenant/categorias/combos/upsells/customização (`packages/types/src/storefront.ts:209-215`); `TenantSettings` sem os campos citados (`apps/api/prisma/schema.prisma:403-471`).

## 6. Fluxo atual do cardápio

| Etapa | Rota e símbolo | Momento do negócio | Dados disponíveis |
|---|---|---|---|
| Entrada | `/:tenantSlug`, `StorefrontPage` (`App.tsx:46`; `StorefrontPage.tsx:87-124`) | montagem + GET do payload | slug; depois `tenant.id`; sem session/order/product |
| Resolução do tenant | `GET /public/storefront/:slug`, `getStorefrontPayload` (`storefront.controller.ts:18-29`; `storefront.service.ts:66-92`) | antes do catálogo | tenantId resolvido server-side |
| Catálogo | `getStorefrontPayload` (`storefront.service.ts:88-185,217-347`) | leitura pública | categoryId/productId/price/availability; tenantId no backend |
| Categoria | clique/scroll em `CategoryNavigation` (`StorefrontPage.tsx:396-415`) | navegação local | slug/id no componente; nenhum evento |
| Produto selecionado | `onSelectProduct` (`StorefrontPage.tsx:516-537`) | abre modal | tenantId no store; productId/categoryId no React; sem sessionId |
| Detalhe | `ProductDetailsModal` (`ProductDetailsModal.tsx:48-60`) | modal montado | produto, categoria, opções, preço; nenhum evento |
| Busca | ausente | — | não existe input/estado de busca no fluxo mapeado |
| Item no carrinho | `handleAddToCart` (`ProductDetailsModal.tsx:376-389`) | após validação local | productId, quantidade, preço, opções; cria `cartLineId` UUID (`use-cart-store.ts:110-129`) |
| Carrinho visto | botão e `CartDrawer` (`StorefrontPage.tsx:590-609`; `CartDrawer.tsx:12-20`) | drawer aberto | itens/subtotal/tenantSlug; sem cartId persistente |
| Checkout iniciado | `navigate(/:slug/checkout)` (`CartDrawer.tsx:17-20`) | clique em finalizar | itens, subtotal, slug; sem evento |
| Validação | `POST /orders/public-checkout/:slug/validate` (`CheckoutPage.tsx:260-320`; `orders.controller.ts:44-51`) | alterações de endereço/pagamento | payload completo; resolve tenant pelo slug |
| Pedido submetido | `handleSubmit`/`handleCardSubmit` (`CheckoutPage.tsx:443-510,512-597`) | POST confirmado pelo backend | customer/cart/payment/order source/idempotencyKey |
| Pedido criado | `OrdersService.createOrder` (`orders.service.ts:179-356`) | transação cria `Order`, itens, endereço e timeline `pending` | tenantId/orderId/productId/timestamp |
| Confirmação UI | `/:slug/order/:identifier` (`OrderConfirmationPage.tsx:10-33`) | resposta do checkout ou GET summary | orderId/token/status/items |
| Pagamento | `/:slug/payment/:transactionId` (`PaymentPage.tsx:20-93`) | polling de transação | transactionId/orderId quando provider responde |
| Falha | `catch` do checkout (`CheckoutPage.tsx:494-509,576-596`) | POST/validação falha | erro e payload local; nada persistido como analytics |
| Cancelamento | transição backend (`orders.service.ts:1083-1186`) | status `cancelled` válido | tenantId/orderId/timestamp em timeline e socket |

Respostas objetivas:

- uma visita começa na montagem de `StorefrontPage` e no GET `/public/storefront/:slug`, mas não é registrada;
- um produto é considerado visualizado tecnicamente quando o modal é aberto; hoje isso não gera evento;
- um item entra no carrinho em `ProductDetailsModal.handleAddToCart`;
- checkout começa no clique de `CartDrawer.handleCheckout`;
- pedido é criado após a transação em `OrdersService.createOrder`;
- pedido é concluído somente quando a transição de domínio chega a `completed`, não na página de sucesso (`orders.service.ts:1090-1167,1227-1234`).

## 7. Fluxo atual do pedido

Checkout público cria `pending`; os status seguintes obedecem `ORDER_STATUS_TRANSITIONS` (`packages/types/src/order.ts`, símbolo `ORDER_STATUS_TRANSITIONS`; `docs/contracts/order-lifecycle.md`, seções 1-4). A criação persiste `OrderTimeline.pending` (`orders.service.ts:348-356`) e emite `order.created` após a transação (`orders.service.ts:482-490`; `orders.gateway.ts:80-98`). Cada transição grava timeline e revenue event (`orders.service.ts:1117-1167`).

“Pedido submetido” e “pedido confirmado” devem ser eventos separados. `order_submitted` ocorre após resposta 2xx da criação. `order_confirmed` só ocorre no status `confirmed`; `purchase`/conversão comercial interna deve ser definido explicitamente como `created`, pagamento aprovado ou `completed`. Recomendação: o dashboard de funil use `order_submitted`, e receita/Ads use apenas o marco de pagamento/conclusão escolhido.

## 8. Analytics atual

| Capacidade atual | Classificação | Fonte |
|---|---|---|
| pedidos por status/canal/fulfillment | completo, backend | `analytics.service.ts:97-123` |
| receita/ticket/categorias/top produtos | completo para pedidos concluídos | `analytics.service.ts:126-159` |
| margem por produto/categoria/canal | parcial; depende de custo cadastrado | `analytics.service.ts:164-203,207-386` |
| retenção/LTV/frequência | derivada de pedidos/clientes | `business-insights.service.ts:67-115` |
| melhor vendedor no storefront | completo como vendas, não views | `business-intelligence.service.ts:355-367` |
| conversão de campanhas | parcial/aproximação | `campaigns.service.ts:272-316` |
| eventos de comportamento | ausente | nenhum model/endpoint/call site |

Dados retroativos:

- podem ser reconstruídos: pedidos, vendas por produto/categoria/canal, ticket, recorrência, cancelamentos e tempos quando timeline existe;
- não podem ser reconstruídos: visitas, visitantes, views, add-to-cart, checkout start, abandono, referrer, dispositivo, UTMs e conversão de produto. Esses eventos nunca foram persistidos.

## 9. Dashboard atual

O dashboard premium e a página de relatórios consultam `GET /analytics/dashboard` com período atual/anterior (`apps/web-tenant/src/features/dashboard/useDashboardOverview.ts:33-84`; `apps/web-tenant/src/features/analytics/ReportsPage.tsx:42-67`). O backend exige auth, `reports.read` e feature `reports` (`analytics.controller.ts:11-34`).

| Métrica solicitada | Estado |
|---|---|
| visitas/visitantes únicos | não existe |
| product views/add-to-cart/checkout start | não existe |
| pedidos concluídos | existe e está correta para `status=completed` |
| abandono/taxa do cardápio/funil | não existe |
| origem de tráfego/UTMs/dispositivo | não existe |
| pedidos/receita por canal | existe; canal de pedido, não tráfego |
| produto mais visto/adicionado | não existe |
| produto mais vendido | existe |
| conversão por produto | não confiável/impossível hoje, pois falta denominador de views/sessões |
| conversão exibida no BI | campanha enviada → pedido aproximado, não cardápio |

## 10. Integrações atuais

| Item | Armazenamento/UI/público | Avaliação |
|---|---|---|
| Instagram/Facebook | `MarketingAutomation.config` JSON; UI pós-pedido; página pública de feedback | parcial, URL arbitrária, tenant-scoped pela automação |
| Google Reviews | mesmo fluxo | parcial; não é GA4/Ads |
| WhatsApp | `TenantSettings.orderWhatsappNumber` e `WhatsAppInstance` | link/número público + integração real beta |
| site | ausente como campo social canônico | ausente |
| TikTok | ausente | ausente |
| GA4/Meta/Ads | ausentes | ausentes |
| iFood | tela de integrações marketplace | não atende marketing analytics (`IntegrationsPage.tsx:49-120`) |

`MarketingAutomation.config` aceita JSON sem DTO específico (`campaigns.controller.ts:87-99`; `campaign-automation.service.ts:74-85`). A UI usa `type=url`, mas o backend não valida protocolo/host. Não há execução como HTML/JS no fluxo encontrado; ainda assim URLs devem ser normalizadas para `https:` antes de exposição pública.

`WhatsAppInstance.apiKey` e `webhookSecret` são segredos no schema (`schema.prisma:2639-2655`). Eles não devem integrar payload público. O schema não indica criptografia em repouso: `NÃO CONFIRMADO` se há criptografia transparente fora do Prisma.

## 11. Multi-tenancy e segurança

Pontos positivos:

- slug resolve o tenant no servidor para catálogo e checkout (`storefront.service.ts:78-92`; `orders.service.ts:179-227`);
- `tableId` livre do frontend é revalidado com `{id, tenantId}` (`orders.service.ts:198-205`);
- produtos e categorias públicos são buscados com tenantId (`storefront.service.ts:88-99,160-167`);
- analytics autenticado recebe tenantId do JWT (`analytics.controller.ts:23-32`);
- IDs principais são UUIDs e token público possui 96 bits antes do truncamento alfanumérico (`schema.prisma:24-28,821-826,943-946`; `tracking-token.util.ts:3-12`);
- checkout possui rate limit e idempotência.

Riscos:

1. **ALTO — evento público falsificável por natureza.** CORS/origin não autentica um browser; um endpoint futuro precisa resolver tenant pelo slug/chave pública, validar allowlist de `eventName` e schema, limitar tamanho/frequência e aceitar que contagens brutas incluem fraude/bots.
2. **ALTO — ausência de deduplicação planejada.** Exigir `eventId` UUID/ULID e unique `(tenantId,eventId)`, mais `occurredAt` limitado e `receivedAt` server-side.
3. **ALTO — consentimento ausente.** Providers de marketing não podem ser carregados por padrão.
4. **MÉDIO — contrato documental divergente.** `TenantInterceptor` não resolve slug nem headers; rotas públicas resolvem tenant em services (`tenant.interceptor.ts:16-29`).
5. **MÉDIO — feedback-click aceita qualquer `channel` string e não valida URL/protocolo no backend (`public-orders.controller.ts:175-197`).
6. **MÉDIO — `MarketingAutomation.config` é JSON sem schema específico (`campaigns.controller.ts:87-99`).

Endpoint futuro recomendado:

- rota `POST /public/storefront/:slug/analytics/events`;
- tenant resolvido somente por slug no servidor;
- batch pequeno (por exemplo, máximo 20) e corpo limitado;
- DTO discriminado/versionado e rejeição de campos extras;
- rate limit por IP + tenant + visitor, amostragem/bot flag;
- `eventId` único tenant-scoped, `receivedAt` do servidor, `occurredAt` com janela;
- `sessionId`/`visitorId` opacos, nunca usados para autorização;
- validação de product/order contra o mesmo tenant quando aplicável;
- não aceitar `tenantId`, HTML, JS, tokens, email, telefone ou endereço no payload.

## 12. Sessão e visitante anônimo

Estado atual:

- não há `visitorId`, `analyticsSessionId`, `deviceId` ou fingerprint;
- carrinho usa um único storage `gestor_cart_temp`, com `tenantSlug`, `tenantId`, itens e UUID por linha (`use-cart-store.ts:28-57,60-129,187-213`);
- o checkout gera uma chave idempotente por montagem, não uma sessão analítica (`CheckoutPage.tsx:226-227`);
- autenticação do cliente persiste token em `customer-storage` (`api-client.ts:16-31`);
- tracking de pedido usa `sessionStorage` por orderId (`OrderConfirmationPage.tsx:59-65`);
- `AuthSession` é autenticação e pode armazenar user-agent/IP; não deve ser reutilizada como tracking anônimo (`schema.prisma:161-190`).

Estratégia mínima sem fingerprint:

1. `visitorId` first-party aleatório por tenant, persistido em `localStorage` somente após consentimento analytics; antes disso, usar identificador efêmero em memória.
2. `sessionId` aleatório em `sessionStorage`, rotacionado após 30 minutos de inatividade e sempre tenant-scoped.
3. nenhum fingerprint, canvas, lista de fontes ou combinação de IP/user-agent;
4. vinculação opcional ao `customerId` apenas no backend após autenticação/pedido e conforme finalidade/consentimento;
5. hash/truncamento de IP apenas para abuso, com retenção curta e separada de produto analytics.

## 13. Consentimento e privacidade

Classificação: **ausente**.

- GA4 seria carregado hoje sem consentimento? Não seria carregado: GA4 não existe.
- Meta Pixel seria carregado hoje sem consentimento? Não seria carregado: Pixel não existe.
- há separação necessary/analytics/marketing? Não.
- há revogação? Não.
- há versão de consentimento? Não.

Storages necessários/funcionais já são usados sem banner (carrinho, auth, tema, PWA e tracking do pedido). A política futura deve catalogá-los e não bloquear carrinho/checkout. Providers e `visitorId` persistente devem aguardar consentimento correspondente. Esta é uma avaliação técnica, não parecer jurídico; base legal, textos, retenção, controlador/operador e tratamento de dados por Google/Meta exigem revisão LGPD/jurídica.

## 14. Matriz de cobertura

| Capacidade | Existe | Parcial | Ausente | Fonte atual | Risco | Próxima ação |
|---|---:|---:|---:|---|---|---|
| Visitas ao cardápio |  |  | X | — | sem denominador | `menu_viewed` |
| Visualização de produto |  |  | X | modal local | impossível retroagir | `product_viewed` |
| Adição ao carrinho |  |  | X | Zustand local | perda total | `add_to_cart` |
| Checkout iniciado |  |  | X | navegação local | perda total | `checkout_started` |
| Pedido concluído | X |  |  | Order/Timeline | sem vínculo com sessão | ligar `orderId` ao evento |
| Funil |  |  | X | — | não calculável | eventos + agregado |
| UTMs/referrer |  |  | X | — | atribuição perdida | first/last touch |
| GA4 |  |  | X | — | consentimento | fase 5 |
| Meta Pixel |  |  | X | — | consentimento/dedup | fase 6 |
| Google Ads |  |  | X | — | duplicidade | fase 7 |
| Instagram/Facebook links |  | X | automação pós-feedback | JSON tenant-scoped | URL não validada | modelo canônico |
| Consentimento |  |  | X | — | técnico/LGPD alto | fase 0/4 |

## 15. Riscos

### Críticos

Nenhum vazamento cross-tenant confirmado no fluxo auditado.

### Altos

1. Instrumentar providers antes de consentimento e governança.
2. Aceitar `tenantId` ou IDs cross-tenant em ingestão pública.
3. Contabilizar eventos sem deduplicação, schema e proteção de abuso.
4. Definir “purchase/conversão” de forma divergente entre criação, pagamento e `completed`.
5. Guardar PII/segredos em payload de analytics ou expor configuração privada no storefront.

### Médios

1. BI atual pode ser interpretado como web analytics quando é order analytics.
2. Conversão de campanha é atribuição temporal aproximada.
3. URLs sociais em JSON não possuem contrato/validação canônica.
4. Consultar evento bruto indefinidamente degradará PostgreSQL.
5. Não há política de retenção/anonimização.
6. Documentação de multi-tenancy diverge do interceptor real.

## 16. Arquitetura recomendada

Reutilizar `AnalyticsModule`:

`Storefront React → dispatcher first-party → POST /public/storefront/:slug/analytics/events → validação/tenant resolution/dedup → AnalyticsEvent → job de agregação BullMQ → AnalyticsDailyAggregate → endpoints tenant-auth → dashboard`

O mesmo dispatcher envia, após consentimento, mapeamentos para GA4/Meta/Ads. Eventos de domínio (`OrderTimeline`, revenue ledger) permanecem autoritativos para status/receita. Não publicar scripts arbitrários; o payload público de configuração deve conter somente IDs validados e flags.

`INFERÊNCIA`: em baixo volume, persistência síncrona em batch pequeno é aceitável. Em médio/alto volume, a escrita pode continuar direta e a agregação deve ir para BullMQ; o contrato de filas exige tenantId e idempotência (`docs/contracts/queues-and-jobs.md`, seções 3-5).

## 17. Contrato inicial de eventos

Envelope sugerido, não definitivo:

```ts
type AnalyticsEventEnvelope = {
  schemaVersion: 1;
  eventId: string;
  eventName:
    | 'menu_viewed' | 'category_viewed' | 'product_viewed' | 'product_selected'
    | 'add_to_cart' | 'remove_from_cart' | 'cart_viewed'
    | 'checkout_started' | 'checkout_step_completed'
    | 'order_submitted' | 'order_confirmed'
    | 'search_performed' | 'coupon_applied'
    | 'social_link_clicked' | 'whatsapp_clicked';
  occurredAt: string;
  sessionId: string;
  visitorId?: string;
  page: { path: string; landingPath?: string; referrerHost?: string };
  attribution?: { source?: string; medium?: string; campaign?: string; content?: string; term?: string };
  context?: { categoryId?: string; productId?: string; cartId?: string; orderId?: string };
  metrics?: { quantity?: number; value?: number; currency?: 'BRL' };
  consent: { analytics: boolean; marketing: boolean; version: string };
};
```

Pontos de instrumentação:

| Evento | Local | Disparo correto | Duplicação/dependência |
|---|---|---|---|
| `menu_viewed` | `StorefrontPage.tsx:115-124` | primeira carga bem-sucedida por sessão/slug | dedup SPA/cache |
| `category_viewed` | `StorefrontPage.tsx:396-415` | clique; opcional IntersectionObserver separado | virtual sections duplicam produtos |
| `product_selected/viewed` | `StorefrontPage.tsx:533-536` / modal | clique e montagem visível | não disparar por render de card |
| `add_to_cart` | `ProductDetailsModal.tsx:376-389`; combo `104-135` | após `addItem` | incluir quantidade e linha UUID |
| `remove_from_cart` | `CartDrawer.tsx:122-139` | ação do usuário | quantidade zero também remove |
| `cart_viewed` | `StorefrontPage.tsx:590-595` | drawer aberto | uma vez por abertura |
| `checkout_started` | `CartDrawer.tsx:17-20` | clique que navega | não usar render da página |
| `checkout_step_completed` | `CheckoutPage` | avanço/validação explícita | formulário atual não tem wizard canônico |
| `order_submitted` | `CheckoutPage.tsx:563-575` | apenas após 2xx | depende backend; usar orderId |
| `order_confirmed` | backend `orders.service.ts:1117-1167` | transição confirmada | evento de domínio, não browser |
| `search_performed` | — | após futura busca/debounce | ausente hoje |
| `coupon_applied` | `CheckoutPage`/`CouponInput` | após validação backend | não no simples typing |
| `social_link_clicked` | `PublicFeedbackPage.tsx:52-54` | antes de abrir URL | hoje só pós-feedback |
| `whatsapp_clicked` | `OrderConfirmationPage.tsx:223-225` e futuro header | clique | distinguir contexto |

## 18. Modelo de dados sugerido

Opções compatíveis; nenhuma migration criada:

- `AnalyticsEvent`: UUID, `tenantId`, `eventId`, `schemaVersion`, enum/string allowlisted, `occurredAt`, `receivedAt`, `sessionId`, `visitorId?`, `productId?`, `orderId?`, `payload Json`, consent flags, bot flag; unique `(tenantId,eventId)`; índices `(tenantId,eventName,occurredAt)`, `(tenantId,sessionId,occurredAt)`, `(tenantId,productId,eventName,occurredAt)`.
- `AnalyticsDailyAggregate`: tenant/date/dimension/event counters, unique por dimensão; evitar JSON irrestrito para dimensões consultadas.
- `TenantMarketingIntegration`: tenant/provider, IDs públicos, status, testedAt/lastError; segredo cifrado separado quando realmente necessário.
- `TenantSocialLinks`: campos URL normalizados por rede, ou extensão tipada de settings.
- `ConsentRecord`: tenant, visitor/customer opcional, purpose, granted, policyVersion, source, timestamps.

Evitar colocar tudo em `TenantSettings` ou `MarketingAutomation.config`. O primeiro já concentra operação/pagamento/UI (`schema.prisma:403-471`); o segundo é automação de mensagens (`schema.prisma:2897-2910`).

## 19. Estratégia de agregação

Sem números reais de produção, estes são cenários, não previsão:

| Cenário | Eventos/dia/tenant | Estratégia |
|---|---:|---|
| baixo | até ~10 mil | batch insert + índices + agregado diário periódico |
| médio | ~10 mil–1 milhão | batch, BullMQ para rollup, dashboard apenas em agregados, retenção curta de bruto |
| alto | acima de ~1 milhão | particionamento temporal, fila/stream dedicado, rollups horários/diários e possível storage analítico |

`INFERÊNCIA`: eventos brutos deixam de ser adequados para queries interativas quando scans por tenant/período já não usam poucos milhares de linhas ou excedem o orçamento de latência. A decisão deve ser tomada por `EXPLAIN ANALYZE`, tamanho de índice, p95 e taxa de ingestão, não apenas por um número fixo.

Retenção inicial sugerida para deliberação: bruto 90 dias, agregados 24 meses, consentimentos conforme obrigação definida, dados antiabuso por prazo menor. `NÃO CONFIRMADO`: prazos jurídicos adequados.

## 20. Estratégia de testes

Existente:

- storefront service unitário (`apps/api/src/storefront/storefront.service.spec.ts`);
- checkout/idempotência em smokes (`apps/api/scripts/smoke-test-storefront-checkout.ts:38-55`; `smoke-test-orders.ts:309-350`);
- isolamento de dois tenants no P1 (`apps/api/scripts/smoke-test-p1.ts:350-426`);
- guardas de checkout (`apps/api/src/orders/public-checkout-guards.util.spec.ts`);
- atomicidade (`apps/api/src/orders/orders.atomicity.spec.ts`);
- dashboard utils/componentes (`apps/web-tenant/src/features/dashboard/dashboard.utils.test.ts`; `components/OperationsDashboard.test.tsx`);
- campanhas tenant-safe/dedup/BullMQ/provider fake (`apps/api/src/campaigns/services/campaigns.service.spec.ts`; `campaign.processor.spec.ts`; `campaign-bullmq.redis.spec.ts`; `campaign-operations.ephemeral.spec.ts`).

Lacunas:

- unit: schema/normalização/mapeamento provider;
- integration: ingestão, unique eventId, rollup e retenção;
- E2E: jornada menu → produto → cart → checkout → pedido;
- security: spoof de tenant/product/order, payload oversized, replay, rate limit;
- tenant isolation: mesmos IDs de evento/sessão em tenants distintos;
- consent: default deny, grant, revoke, mudança de versão;
- provider: GA4/Meta/Ads fake collectors e deduplicação client/server;
- bots: classificação sem excluir silenciosamente dados reais.

## 21. Plano por fases

0. Contrato, taxonomia, definição de conversão, consent defaults e threat model.
1. Evento interno mínimo: menu/product/cart/checkout/order; endpoint e bruto.
2. Agregados e dashboard de funil/produto.
3. UTMs/referrer + links sociais canônicos.
4. Centro de consentimento, revogação e registro.
5. GA4 por tenant.
6. Meta Pixel por tenant.
7. Google Ads, preferencialmente importado do GA4 salvo necessidade comprovada de tag direta.
8. Server-side/CAPI somente com volume, qualidade e governança que justifiquem.

## 22. Plano de PRs

| PR | Objetivo | Arquivos prováveis | Migration | Riscos/testes/aceite |
|---|---|---|---|---|
| 0A | ADR + contrato/event names/conversão | `docs/`, `packages/types` | não | revisão produto/privacidade; contrato aprovado |
| 0B | consent UI/storage mínimo | storefront + types | talvez `ConsentRecord` | default deny/revoke/version E2E |
| 1A | `AnalyticsEvent` + endpoint | Prisma, analytics module/controller/service | sim | cross-tenant/replay/rate/payload; batch dedup |
| 1B | dispatcher frontend | storefront `lib/analytics`, pontos mapeados | não | uma emissão por ação e consentimento |
| 1C | eventos autoritativos de pedido | orders + analytics consumer | não ou sim conforme ligação | idempotência por order/status |
| 2A | agregado diário/worker | Prisma, analytics, BullMQ | sim | replay e recomputação determinística |
| 2B | endpoints de funil/produto | analytics/types | não | queries tenant-scoped e p95 |
| 2C | dashboard | web-tenant | não | estados vazios, períodos, RBAC, visual/E2E |
| 3A | atribuição UTM | storefront + schema/event payload | talvez não | first/last touch e navegação |
| 3B | links sociais canônicos | settings/types/storefront | sim | somente https, nenhum script |
| 4 | consent center completo | storefront/API/tenant UI | sim | grant/revoke/audit/version |
| 5 | GA4 | settings/API/storefront | sim | ID validado, mock collector, consent |
| 6 | Meta Pixel | mesmos módulos | sim | `event_id`, consent, sem CAPI duplicada |
| 7 | Google Ads | mesmos módulos | sim | transaction_id/value/currency, dedup |
| 8 | CAPI/server-side opcional | worker/provider adapter | talvez | fake provider, retries, reconciliation |

## 23. Decisões pendentes

1. Marco canônico de conversão: pedido criado, pagamento aprovado ou `completed`.
2. Consentimento necessário para analytics próprio agregado e para identificador persistente.
3. Retenção e exclusão/anonimização.
4. GA4 por tenant próprio ou propriedade central com dimensão tenant.
5. Google Ads via importação GA4 ou tag direta.
6. Links sociais em modelo próprio ou settings tipado.
7. Necessidade real de CAPI/server-side.
8. Limiares operacionais medidos para particionamento/storage externo.
9. Política de bots e visualização de métricas brutas versus filtradas.

## 24. Recomendação final

**APROVADO — auditoria concluída, pronta para revisão e planeamento.**

Não iniciar pelos providers. Primeiro fechar taxonomia, conversão, consentimento e ingestão tenant-safe. O primeiro incremento útil deve produzir um funil interno confiável (`menu_viewed → product_viewed → add_to_cart → checkout_started → order_submitted`) e relacionar o pedido autoritativo sem PII. Em seguida, o mesmo contrato pode alimentar GA4, Meta e Ads com consentimento e deduplicação.

### Viabilidade dos providers

- **GA4:** guardar Measurement ID validado por tenant em integração tipada; expor somente esse ID público; carregar no bootstrap do slug após consentimento; mapear `page_view`, `view_item`, `add_to_cart`, `begin_checkout`, `purchase`; testar com collector fake/DebugView em ambiente não produtivo. Nunca aceitar ID vindo de query/body do visitante.
- **Meta Pixel:** guardar Pixel ID público por tenant; carregar após consentimento marketing; mapear `PageView`, `ViewContent`, `AddToCart`, `InitiateCheckout`, `Purchase`; reutilizar `eventId` para futura CAPI e impedir browser+CAPI duplicados.
- **Google Ads:** preferir importação de conversão GA4 para reduzir tags. Se tag direta for necessária, guardar Conversion ID/Label tipados por tenant; enviar `value`, `currency=BRL`, `transaction_id=orderId`; disparar uma vez no marco canônico.
- **Instagram/Facebook v1:** somente links públicos validados e clique first-party. Login social, publicação automática, Ads API e mensagens ficam fora da primeira versão.

### Evidência de encerramento

Os comandos finais obrigatórios devem ser lidos junto ao handoff terminal desta auditoria. Nenhum teste funcional foi executado porque a tarefa é análise read-only e não altera comportamento; a evidência é inspeção estática de rotas, imports, chamadas, schema, migrations e testes existentes.
