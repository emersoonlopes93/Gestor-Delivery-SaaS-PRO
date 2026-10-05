## Storefront C2.5E.3 - preco e semantica de selecao (2026-09-28)

- O Storefront agora deriva o preco exibido "A partir de" somente de itens `replace` ativos, efetivamente disponiveis e ligados ao eixo `primary`; o payload publico ja filtra grupos/itens arquivados e resolve o override de preco por produto antes dessa exibicao. Sem candidato elegivel, o preco-base continua sendo mostrado.
- No modal generico, uma opcao `replace` selecionada no eixo `primary` passa a substituir o preco-base na previa local; adicionais fixos e percentuais sao calculados sobre essa base efetiva. O Checkout continua como autoridade e reaplica a mesma regra no servidor.
- `single` usa radio, `multiple` usa checkbox e `quantity` usa somente stepper, com quantidade inicial zero e remocao explicita ao voltar para zero. Pizza Engine, schema, migrations, C2.6, checkout payload e comportamento de loja fechada nao foram alterados.
- O Web Tenant explica `replace` como "Define o preco final" e esclarece que `primary` identifica o grupo que define o preco principal. Validacoes focadas: Storefront 10/10, Checkout 3/3 e builds Storefront/API passaram; gates globais permanecem em execucao nesta sessao.

## Operational Control Center (2026-09-13)

- O Gestor V2 passou a reutilizar o board canônico para um cockpit compacto: estado operacional da loja, atalhos permissionados para taxas, Radar, caixa e mesas, e contadores de Delivery, Retirada e Comandas sem pedidos terminais ou dupla contagem.
- A pausa da loja usa exclusivamente `PATCH /tenant/store-pause` com `settings.manage`. Delivery, taxas, caixa, PDV/mesas e Radar seguem as telas e permissões canônicas já existentes; não houve schema, lifecycle, provider, GPS, mapa novo ou dado de localização sintético.
- O Radar permanece a superfície Leaflet existente, com localização ausente/desatualizada explicitamente tratada. Retirada abre o Gestor V2 com filtro de fulfillment real pela URL.
- Validação local: teste focado do read model e TypeScript/build web-tenant passaram. Próximos gates: lint, typecheck global, no-any, boundaries, features, theme, build e diff check antes da PR única.

## Operational flow final close: KDS and manual delivery (2026-09-13)

- KDS agrupa produção por estação e só cria jobs para `preparing`. A conclusão tenant-scoped de um job verifica os demais jobs kitchen e move o pedido uma única vez pelo `OrdersService` quando o último termina; a mesma transição canônica preserva eventos e sincronização provider.
- Estação KDS desligada permanece desligada durante a sincronização. Pedido que contém item de categoria ligada a essa estação é bloqueado antes de produção parcial, com mensagem de item/categoria/estação.
- O Gestor de Pedidos V2 oferece confirmação de entrega manual apenas para uma parada `CURRENT`/`ARRIVED` de rota própria. Exige motivo auditável com código estável, usa `delivery.dispatch`, transação serializável, timeline, ledger e reconciliação por `order.changed`; repetição após entrega não duplica efeitos.
- Documentação atualizada: contratos de operações/delivery e `docs/operations/operational-radar-readiness-matrix.md`. Sem migration, provider real, banco remoto, deploy, GPS, mapa, outbox ou reescrita de adapter.
- Validação parcial desta sessão: API focused 2 suites/44 testes e build web-tenant passaram. Próximos gates: build API, typecheck, lint, no-any, boundaries, theme, features, diff check, commit, PR e CI no SHA final.

## 99Food Settlement & Reconciliation (2026-09-12)

- Bill Data e Settlements Data agora possuem adapters read-only separados no host financeiro oficial, paginação de 200 itens, janelas de até 31 dias, backfill manual de até três meses e parsing lossless antes do `JSON.parse`. Acesso sem WhiteList retorna `FINANCE_ACCESS_NOT_ENABLED`; nenhum scheduler ou chamada real foi introduzido.
- A migration `20260912120000_99food_financial_reconciliation` adiciona `MarketplaceBillEntry`, `MarketplaceSettlement`, a relação estruturada de day payments e a conta de destino nullable na conexão. Bills usam identidade tenant/provider/conexão/pedido/tipo/businessTs e nunca alteram saldo; repasses usam weekPaymentId tenant/provider.
- Posting segue confirmação manual. Conta ativa do mesmo tenant é obrigatória e explicitamente configurada. Uma transaction serializável cria exatamente um lançamento, aplica uma vez o valor líquido assinado e vincula o repasse. Drift posterior marca discrepância sem mutar o lançamento ou saldo; o endpoint genérico também impede criar ou editar lançamentos pertencentes a esse lifecycle.
- A tela Financeiro ganhou visão de conciliação 99Food com período, eventos, comissão, refunds/ajustes, repasses, composição, divergências, conta e ação manual. Gestor legado e Gestor 2.0 continuam compartilhando `OrderPaymentSection`; FinancialProjection e DRE permanecem sem reclassificação.
- Validação local: migration fresca com 73/73 migrations; 21 suítes API/195 testes focados; 5 arquivos web/18 testes; PostgreSQL 16 com 3 suítes/13 testes de constraints, concorrência, rollback, compras e estoque; typecheck do repositório, no-any, boundaries, features, theme, lint e builds API/web passaram. O diff Prisma contém apenas quatro renames de índices já preexistentes e fora desta migration. Nenhum provider real, banco remoto, Dokploy ou deploy foi tocado.

## Purchase Lifecycle Completion (2026-09-10)

- `POST /purchasing/purchases` continua representando recebimento imediato, agora com chave de idempotência tenant-scoped e fingerprint persistente; retries equivalentes retornam a compra existente sem duplicar estoque ou financeiro.
- Novas entradas possuem vínculo estruturado entre Purchase, PurchaseItem e StockMovement. Histórico sem vínculo não sofre backfill por texto e tem cancelamento automático bloqueado.
- Compras pagas exigem conta ativa do mesmo tenant e gravam despesa realizada, débito e PurchaseSettlement único atomicamente. Compras pendentes podem ser liquidadas integralmente por `POST /purchasing/purchases/:id/pay`; partial permanece legado e não suportado.
- `POST /purchasing/purchases/:id/cancel` preserva movimentos e lançamentos originais, cria reversões imutáveis de estoque e, quando pago, lançamento financeiro compensatório na mesma conta. Estoque insuficiente bloqueia toda a operação sem efeitos parciais.
- Migration `20260910120000_purchase_lifecycle_completion` é aditiva, deixa campos históricos nullable e não executa backfill heurístico. Frontend gera chave estável por tentativa, exige conta em compra paga e oferece pagar/cancelar com proteção contra duplo submit.
- Validação local: 10 suítes focadas API/79 testes, 1 suíte PostgreSQL/7 testes de concorrência e rollback, 1 arquivo web/3 testes, migration from-zero com 72/72 migrations, API/web typecheck, no-any, lint, builds, theme, features, boundaries e `git diff --check` passaram. Regressões 99Food/Marketplace/WhatsApp também passaram em suítes focadas. Nenhum deploy, banco remoto ou provider real faz parte desta entrega.

## Gestor de Pedidos UX V2 — Slice 3 (2026-09-06)

- O socket `/orders` já montado por notificações agora publica um bus interno tipado; conexão só é considerada pronta após `joinedTenant`, sem criar SSE ou conexão adicional.
- `order.changed` é um hint tenant-scoped com ID/motivo/data. Kanban e drawer reconciliam somente `GET /orders/:id`; terminal sai do board, inserção preserva `createdAt` e troca de coluna não reordena os demais cards.
- Durante DnD, hints do pedido arrastado são acumulados e a leitura autoritativa antecede a ação. Conflitos 400/404/409 também reconciliam o pedido.
- Polling completo do Kanban é fallback sem sobreposição: 90s conectado e 30s desconectado/reconectando; 120s sem confirmação ativa o aviso discreto de snapshot antigo. Builder de entrega só acompanha reconciliação lenta ou motivo de driver.
- A Lista não se reordena por socket: exibe `Há atualizações` e só refaz a consulta por ação explícita, preservando busca, filtros, página e drawer. O drawer aberto atualiza silenciosamente apenas quando seu próprio ID muda.
- Backend aditivo emite hints após criação/status/edição, estados marketplace e alterações de rota/driver; sem schema, migration, adapter ou lifecycle novo.
- Harness determinístico cobre 1440x900, 1024x768, 768x1024 e 390x844, conexão/reconexão, realtime por pedido, filtros ativos, drawer aberto e contadores de requests. Screenshots continuam temporários fora do Git.
- Slice 3 concluída localmente: typecheck, no-any, features, boundaries, theme, lint, builds API/web-tenant, 165 testes web, 4 shards API (644 testes, 10 skips) e E2E responsivo passaram. Avaliação visual independente aprovou; observações não bloqueantes: toast de atraso pode sobrepor drawer e screenshot full-page 1024px pode aparentar recorte de card. Nenhum deploy, produção, banco remoto ou schema/migration foi executado.

## Gestor de Pedidos UX V2 — Slice 2 (2026-09-06)

- Objetivo: transformar a fundação segura da Slice 1 em um cockpit operacional responsivo para Kanban e Lista, sem alterar schema, lifecycle, adapters marketplace, Routing V2, KDS, pagamentos ou realtime.
- O Kanban ganhou hierarquia visual por prioridade/tempo, busca por número/cliente/telefone/motoboy, filtros rápidos provider-neutral, uma única ação dominante e menu acessível para ações secundárias. Tablet usa abas de coluna sem ocultar pedidos e o último snapshot permanece visível em falha de refresh.
- A Lista passou a consumir a mesma projeção `OrderOperationalViewModel`, os mesmos presenters de status/provider/ownership/financeiro e o mesmo `OrderDrawer`; estados `completed` e `cancelled` continuam consultáveis. Busca e filtros de status, origem, período, atendimento e ownership são aplicados pela API com `tenantId` obrigatório e combinação segura entre filtros relacionais.
- O drawer foi reorganizado por fluxo operacional: prioridade/tempo, alerta marketplace, ação principal, cliente, itens, produção/KDS, logística/ownership/rota, financeiro e histórico. O resumo de rota diferencia `ROAD` de `DEGRADED`; “Ver no mapa” só aparece após confirmar membership no run tenant-scoped existente.
- Contratos afetados: DTO autenticado de lista/board e documentação do view model operacional. Sem migration ou alteração de persistência.
- Validação: testes focados API 3 suítes/14 testes; web focado 3 arquivos/17 testes; web completo 42 arquivos/158 testes; API completa em quatro shards com 130 suítes/643 testes aprovados e 5 suítes/10 testes ignorados. `typecheck`, lint, `check:no-any`, `check:boundaries`, `check:features`, `check:theme`, builds API/web-tenant e `git diff --check` passaram. O lint mantém 17 warnings preexistentes do web-storefront, sem erros.
- E2E Playwright determinístico passou em 1440x900 e 390x844 claro/escuro, além de 1024x768 e 768x1024 claro, cobrindo board, lista e drawer com PedeHub/iFood/99Food e estados marketplace pending/failed. Artefatos temporários: `C:\wt\pedehub\pedehub-orders-ux-v2-artifacts`.
- Riscos residuais: o contrato de lista mantém `operational` opcional para compatibilidade tipada com consumidores legados, embora a API autenticada agora sempre o projete; ausência de dados autoritativos continua apresentada como desconhecida, nunca como valor financeiro ou ETA preciso.

## Gestor de Pedidos UX V2 — Slice 1 (2026-09-06)

- Objetivo: corrigir segurança operacional do Kanban sem redesign amplo, schema, migration, lifecycle, adapters marketplace, Routing V2, pagamentos ou realtime.
- O backend passou a entregar `OrderOperationalViewModel` aditivo e único para board/detalhe, com origem provider-neutral, `MERCHANT`/`PROVIDER`/`UNKNOWN`, capabilities, ações contextuais, estado de operação marketplace e resumos financeiro/logístico/produção.
- Card, drawer e DnD consomem `availableActions`; 99Food mantém confirmação/pronto outbound e não oferece cancelamento outbound. Provider/unknown não abrem atribuição ou despacho de frota própria.
- O card mantém uma ação dominante e move ações secundárias para overflow. O drawer ganhou policy compartilhada, diálogo modal, Escape, focus trap e restauração de foco. Falha de refresh preserva o último snapshot do board.
- O DnD resolve somente `CONFIRM`, `START_PREPARATION` ou `MARK_READY` quando há uma ação inequívoca; cancelamento, conclusão e dispatch nunca são executados silenciosamente por drop.
- Contratos afetados: DTO autenticado de pedidos e apresentação operacional. Sem alteração de persistência ou do contrato público de tracking.
- Validação concluída: resolver/board/marketplace/ownership API com 4 suites e 27 testes; web-tenant focado com 2 arquivos e 11 testes; web-tenant completo com 41 arquivos e 152 testes; API completa em quatro shards com 129 suites/642 testes aprovados e 5 suites/10 testes ignorados. `typecheck`, `check:no-any`, `check:features`, `check:boundaries`, `check:theme`, lint, builds API/web-tenant e `git diff --check` passaram. O lint preserva 17 warnings preexistentes do web-storefront, sem erros.
- Risco residual: pagamento permanece explicitamente `UNKNOWN` quando não existe fonte autoritativa no agregado; cancelamento iFood continua oculto até um fluxo com seleção de motivo reutilizar o contrato oficial já existente.

## 99Food native actions and privacy-name correction (2026-09-05)

- Confirmed that the order endpoint already enforces `orders.update_status`, the provider environment switch, a tenant-scoped `CONNECTED` connection and BullMQ. Removed only the duplicate `marketplace_orders` beta-preset gate from 99Food native actions; the iFood feature and entitlement gate remains unchanged.
- The 99Food normalizer no longer persists the provider marker `privacy protection` as a customer name. It prefers documented first/last name fields and otherwise stores the neutral `Cliente 99Food` label without inventing identity data.
- Complete 99Food snapshots now require an exact external order ID and at least one item, not a disclosed customer name. The repair scan targets already-persisted privacy markers and empty historical orders, and stops retrying valid privacy-masked orders indefinitely.
- No schema, migration, secret, deployment, production database or provider call was changed.

## 99Food production-log contract audit (2026-09-05)

- O log real do Dokploy comprovou webhook `POST /api/v1/webhooks/marketplaces/99food` com 204 e detalhe `/v1/order/order/detail` com HTTP 200; o texto `OFFLINE` era apenas o badge generico da tela aplicado ao status de inbox `FAILED`, nao uma conexao offline. Eventos agora exibem `Falhou`, `Processando`, `Processado` ou `Ignorado` separadamente do estado da conexao.
- Causa de identidade confirmada: o detalhe nativo era lido com `response.json()`, arredondando `order_id` inteiro de 64 bits. O callback mantinha o ID exato, mas lifecycle posterior nao encontrava o `MarketplaceOrder` salvo com ID arredondado. A leitura nativa agora preserva IDs longos como strings antes do parse; requests continuam enviando o literal inteiro exigido pela Swagger.
- O normalizador aceita o `OrderModel` direto e wrappers nativos limitados e combina detalhe remoto parcial com `data.order_info` do webhook assinado. Cliente, endereco, precos e itens do callback completam somente campos ausentes; snapshot incompleto continua fail-closed e retryable.
- Eventos lifecycle de pedidos existentes agora persistem topico/ID/data/sequencia antes da transicao. A reconciliacao consulta callbacks terminais armazenados, inclui eventos anteriormente FAILED e repara um ID historicamente arredondado apenas quando existe uma unica correspondencia numerica na mesma conexao/tenant. O reprocessamento manual tambem tenta reparar imediatamente um pedido 99Food incompleto.
- Validacao: 4 suites API com 41 testes, teste focado web com 2 testes, lint API/web, builds API/web, TypeScript e `check:no-any` passaram. Nenhum deploy, migration, banco remoto ou chamada manual ao provider foi executado.

## 99Food direct-detail recovery and historical lifecycle reconciliation (2026-09-05)

- Causa confirmada do pedido vazio: o client HTTP já removia o envelope `StandardResponse.data` de `GET /v1/order/order/detail`, mas o normalizador reconhecia somente `data.order_info`. O `OrderModel` direto oficial caía no fallback Open Delivery e persistia `Cliente 99Food`, zero itens e total zero. O normalizador agora reconhece `order_id` na raiz antes do fallback.
- Novas importacoes 99Food recusam snapshots sem `order_id`, sem cliente ou sem itens, mantendo o inbox retryable em vez de criar outro pedido placeholder. A reconciliacao a cada minuto reconsulta somente pedidos 99Food existentes com cliente fallback ou sem itens e substitui somente os dados comerciais/endereco/itens; o status do pedido nao e alterado por essa reparacao.
- Historicos ativos sao encerrados/cancelados somente quando o ultimo webhook persistido e `orderFinish`/`orderCancel`; a implementacao nao deduz lifecycle a partir do `status` numerico nao documentado pela Swagger. A mesma reconciliacao e idempotente e continua sujeita a `MARKETPLACE_99FOOD_ENABLED` e fila marketplace ja existentes.
- Validacao local: TypeScript API, `check:no-any`, 3 suites marketplace/99Food com 31 testes e `git diff --check` passaram. Nenhum deploy, Dokploy, chamada real a 99Food, migration, banco remoto ou promocao de `main-copy` foi executado.

## 99Food Kanban freshness and legacy status lookup (2026-09-05)

- The operational board now sends a refresh nonce and the API response is explicitly `Cache-Control: no-store, private`, preventing an intermediary or browser cache from keeping an older 99Food state in Entrada while the order list is fresh.
- `GET /orders/:id/status` is a tenant-scoped, read-only compatibility lookup for an older tenant bundle that requested it and received 404. Status changes remain exclusively `PATCH /orders/:id/status`; no GET can confirm or mutate an order.
- The official Swagger host is aligned in validation and examples as `https://openapi.didi-food.com`. No real provider call, Dokploy action, deployment, migration, or `main-copy` promotion was performed.

## 99Food Live Order Parity Fix (2026-09-04)

- Follow-up lifecycle: eventos 99Food jÃ¡ `PROCESSED` eram bloqueados como duplicatas e eventos terminales tentavam buscar snapshot antes de aplicar a transiÃ§Ã£o. O reprocessamento agora reaplica com seguranÃ§a somente `orderConfirm`, `orderReady`, `orderCancel` e `orderFinish`, sem reimportar o pedido ou chamar o provider. Eventos futuros de lifecycle de pedido existente aplicam a transiÃ§Ã£o antes do snapshot. O reprocessamento de um `MarketplaceOrder` jÃ¡ importado tambÃ©m reaplica seu Ãºltimo lifecycle nativo quando cabÃ­vel.
- As mensagens 99Food do endpoint e do Kanban foram regravadas em ASCII para eliminar os caracteres mojibake observados no tenant.
- ValidaÃ§Ã£o do follow-up: inbox 10/10, ingestÃ£o/status 13/13, typecheck global, build web-tenant e `git diff --check` passaram. Nenhum deploy/Dokploy/provider/banco remoto foi acessado.

- Objetivo: corrigir a paridade operacional de pedido nativo 99Food sem promover a feature ou tocar Routing V2, pagamentos, Pix, DRE, WhatsApp ou `main-copy`.
- A causa do lifecycle parado era o adapter aceitar o webhook nativo `orderConfirm`/`orderReady`/`orderFinish` mas o mapper reconhecer somente nomes Open Delivery. O mapper agora aplica os nomes oficiais, preservando dedupe, ordenaÃ§Ã£o e `ORDER_STATUS_TRANSITIONS`; nÃ£o inventa um evento `preparing` que o contrato nativo nÃ£o documenta.
- A causa de itens/valores errados era normalizar o snapshot como Open Delivery. O adapter agora reconhece `data.order_info`, `order_items`, `sub_item_list`, `remark` e valores em centavos. Complementos chegam como linhas legÃ­veis no pedido, KDS e impressÃ£o; o Kanban destaca a venda dos produtos e o drawer identifica pedido prÃ©-pago como “Pago na 99Food”. RecebÃ­vel do restaurante permanece indisponÃ­vel, nunca inferido.
- SeguranÃ§a: o contrato nativo documenta `/order/order/confirm`, mas nÃ£o foi obtido o contrato completo de request/response para a chamada. A UI e o endpoint impedem aÃ§Ãµes 99Food com mensagem operacional, em vez de enviar aÃ§Ãµes para o cliente Open Delivery incompatÃ­vel ou expor erro tÃ©cnico. Inbound webhook continua sujeito Ã  connection/tenant e feature existentes.
- Fonte normativa: 99Food [Webhooks](https://openplatform-portal-food.99app.com/docs/v1/node/nodedataget?id=1921) e [Order Webhooks](https://openplatform-portal-food.99app.com/docs/v1/node/nodedataget?id=1981). `delivery_type` diferencia entrega/retirada, mas ownership merchant/provider nÃ£o aparece nesse contrato: `99FOOD_LOGISTICS_OWNERSHIP_SOURCE=UNAVAILABLE_IN_NATIVE_ORDER_DETAIL_CONTRACT`.
- ValidaÃ§Ã£o: 4 suites API/33 testes (provider, ingestÃ£o, status sync e KDS) passaram; typecheck, no-any, features, boundaries, theme, lint (17 warnings preexistentes do storefront), builds API/web-tenant e diff check passaram. O filtro web focado nÃ£o encontrou arquivo de teste para `OrderItemsSection`. Nenhum deploy, Dokploy, provider, banco remoto, migration ou pedido real pÃ³s-fix foi executado.

## Multi-iFood E2E Hardening V1 (2026-09-02)

- Objetivo: validar localmente a fundacao multi-iFood promovida em `3ae47f570ffd22965e104016449d6337865a854b`, sem provider real, deploy ou banco remoto.
- Bugs objetivos corrigidos: o `PlanGatingGuard` agora extrai tambem o subject do JWT verificado antes dos guards de rota, permitindo que a resolucao de feature avalie a permissao real do usuario; a criacao dos papeis default passou a inserir os vinculos de permissao em lote/idempotentemente, evitando expirar a transacao de signup com o catalogo completo.
- Harness API `e2e:multi-ifood-v1`: PostgreSQL real + HTTP Nest + seams fake do iFood cobrem Alpha A/B, Beta C, unicidade global merchant/store, isolamento cross-tenant, polling/falha por conexao, refresh token isolado, mesmo `order-001` em duas conexoes, replay, merchant desconhecido, redacao de headers, KDS preparing-only/retry, dispatch e desconexao independente.
- Harness web `e2e:multi-ifood-web-tenant`: navegador Playwright autenticado valida listagem/status A/B, ausencia de tokens/ciphertext e inclusao de uma terceira loja; evidencia em `qa-artifacts/multi-ifood-e2e-v1/multi-ifood-connections.png`.
- Banco: PostgreSQL 16 local recebeu 65 migrations do zero e seed canonico. Redis/BullMQ nao foram necessarios porque polling/OAuth usaram seams deterministicas e o KDS foi exercitado sem operacao outbound. A repeticao do caminho de upgrade foi tentada, mas o Docker Desktop deixou de expor o engine; nenhum resultado foi inferido. O hardening nao altera schema/migration.
- Validacao: E2E API `MULTI_IFOOD_E2E_PASS`; E2E web `WEB_TENANT_MULTI_IFOOD_E2E_PASS`; API completa em quatro shards com 119 suites/560 testes aprovados e 4 suites/9 testes ignorados; web-tenant 39 arquivos/140 testes; lint, typecheck global e dos harnesses, no-any, features, boundaries, theme, builds API/web-tenant e diff check aprovados. O lint preserva 17 warnings preexistentes do web-storefront, sem erros.
- Limitacao visual: a CLI `agent-browser` instalou Chromium, mas nao conseguiu inicializar uma sessao CDP no host Windows; a evidencia visual aceita e versionada e a execucao Playwright real, nao uma inferencia por source.
- Fora de escopo preservado: iFood real, credenciais reais, pagamentos, routing V2, catalogo amplo, Dokploy, producao e bancos remotos.

## Multi-iFood Foundation V1 (2026-09-01)

- Objetivo: remover a suposição `1 tenant = 1 iFood` preservando o agregado e a operação marketplace já existentes.
- Source of truth: `MarketplaceConnection`; um tenant pode possuir várias conexões, enquanto `provider + externalMerchantId` e `provider + externalStoreId` continuam globalmente únicos.
- Schema: a migration `20260901013000_multi_ifood_foundation_v1` remove a unicidade `(tenantId, provider)`, adiciona índice por tenant/provider/status e muda a unicidade do pedido para `(connectionId, provider, externalOrderId)`.
- Compatibilidade: linhas existentes já representam a primeira conexão e são preservadas sem backfill ou dual-write. Status/provider endpoints legados permanecem temporariamente para onboarding; a gestão nova usa `connectionId`.
- API/UI: create lista novas conexões; get/update/reconnect/disconnect/delete lógico validam tenant + connection. A UI lista nome, merchant, store e status por loja, com ações independentes e sem material criptográfico.
- Ingestion: webhook resolve merchant/store para conexão e tenant; dedupe inclui a conexão/merchant com fallback para a chave legada da mesma conexão. Pedido, idempotência interna e lifecycle são connection-scoped.
- OAuth/polling: mantido o modelo real existente — client credentials centralizadas agrupam merchants; refresh token cria isolamento e lock por conexão. Polling e falhas continuam por conexão.
- Segurança: AES-256-GCM existente continua sendo a primitive de credenciais; respostas administrativas expõem apenas flags booleanas, nunca ciphertext/token. Logs novos incluem connectionId e merchant mascarado.
- Validação PostgreSQL local: 65 migrations from zero passaram; upgrade de 64 migrations preservou conexão legada e aceitou segunda conexão do mesmo tenant. Teste PostgreSQL comprovou merchant globalmente único, credenciais/status independentes e mesmo externalOrderId válido entre conexões. O `migrate diff` mostrou somente quatro renames de índices preexistentes e idênticos nos dois bancos, fora desta migration.
- Follow-ups: homologação OAuth/iFood real e E2E autenticado; eventual remoção dos endpoints provider-scoped legados; nenhum routing V2, catálogo amplo ou reconciliação financeira foi incluído.
- Fora de escopo preservado: KDS, auto-dispatch, payment foundation, providers financeiros, Dokploy, produção e banco remoto.
- Validação final: API completa em quatro shards com 119 suites/558 testes aprovados e 4 suites/9 testes ignorados; regressão marketplace + KDS/POS/printing com 17 suites/88 testes; web-tenant completo com 39 arquivos/140 testes; teste PostgreSQL com 1 suite/1 teste; `typecheck`, lint, builds API/web-tenant, `check:no-any`, `check:features`, `check:boundaries`, `check:theme` e `git diff --check` passaram. Após o ajuste final da identidade de dedupe, a suite de inbox (8/8), lint/build da API e `check:no-any` foram reexecutados com sucesso.

## Storefront preview boundary extraction (2026-08-31)

- Criado `@gestor/storefront-preview` como camada neutra e fonte unica dos
  primitives compartilhados de renderizacao, fallback de imagem e conversao de
  produtos. `@gestor/storefront-ui` preserva a API anterior por re-export.
- O web-tenant deixou de importar `@gestor/storefront-ui`; nenhuma regra ou
  allowlist do checker foi relaxada. O novo package foi classificado para nao
  depender de apps, `@gestor/ui` ou da fachada `@gestor/storefront-ui`.
- Tailwind e o scanner de tema passaram a cobrir a nova origem dos componentes.
  Nao houve mudanca intencional de UI/UX, tema, API, payments, billing, Prisma ou
  migrations.
- Validacao: package novo lint/build e 2 testes; fachada build; web-tenant 38
  arquivos/139 testes e web-storefront 14 arquivos/73 testes; lint/build dos
  dois apps; boundaries, theme, typecheck, no-any e features passaram.

## Payment Monetization Foundation R2 (2026-08-24)

- Isolated branch `feat/payment-monetization-foundation-r2`, based on `origin/main-copy`
  `df2566cd621c109853b367123e7b770aa83fa0ac`.
- Added provider-neutral transaction monetization: versioned policy, immutable snapshot,
  Platform Fee lifecycle, idempotent receivable and explicit local activation.
- Classification now reuses the side-effect-free billing entitlement decision shared with the
  operational guard and lifecycle. `active`, valid trial and valid grace use paid pricing;
  expired windows, raw `past_due`, blocked states and no subscription use `FREE`. Paid plans
  can use `PLAN:<billingPlanId>` and otherwise use `PAID_DEFAULT`.
- Refund does not erase an earned fee. Provider reversal creates `DUE_FROM_TENANT`, deduped by
  `(tenantId, sourceType, sourceId)` and limited to expected fee minus retained amount.
- Signup creates no onboarding, provider connection or external account. Tenant endpoints
  require `billing.read/write` and record actor plus technical terms version.
- No provider, deployment or remote database was touched. Prisma validate/generate, all 64
  migrations from zero, API lint/build, global typecheck, no-any/features, 4 focused suites
  (21 tests), the full API suite in 4 shards (115 suites/519 tests passed; 4 suites/9 tests
  skipped), and the PostgreSQL smoke passed. Boundaries/theme reproduced only their unchanged
  baseline findings outside this diff.
- Entitlement correction validation: 5 focused suites/41 tests and the full API suite in four
  shards passed (117 suites/543 tests; 4 suites/9 tests skipped). API lint/build, global
  typecheck, no-any/features and `git diff --check` passed. PostgreSQL 16 smoke proved Free,
  Active, valid/expired Trial, valid/expired Grace, raw Past Due and immutable snapshots.

## Payment Foundation R1 (2026-08-20)

Branch: `feat/payment-foundation-r1`
Base: `origin/main-copy` / `7413cf4bb6a901d600eef574cb13cd9cfc5fb655`

- `PaymentProviderConnection` guarda uma conexão por tenant/provider e protege credenciais
  com o envelope AES-256-GCM versionado já usado por marketplace. Respostas de tenant/admin,
  telemetria e erros persistidos foram sanitizados; a storefront continua retornando somente
  seu contrato explícito.
- O Mercado Pago atual prefere a conexão criptografada. Credenciais ainda presentes em
  `TenantSettings` são migradas e limpas atomicamente no primeiro uso quando o keyring está
  configurado; sem a chave, o caminho legado permanece apenas como compatibilidade temporária
  e requer migração operacional posterior.
- `OrderPaymentAttempt` preserva várias tentativas por pedido, provider imutável, status
  canônicos e idempotência tenant-scoped. Constraints e compare-and-set protegem corridas de
  criação e transição.
- A inbox provider-neutral registra somente eventos autenticados, persiste hash do payload,
  valida tenant/provider/conexão/tentativa e deduplica processamento concorrente antes de
  executar efeitos de pagamento.
- O Pix Mercado Pago cria a tentativa antes da chamada e usa seu ID como chave idempotente.
  Timeout externo permanece pendente/ambíguo e não aciona fallback financeiro silencioso.
- Contratos afetados: pagamentos, isolamento de tenant, checkout Pix, webhook Mercado Pago e
  transição existente de pedido pago. Não houve endpoint novo, split, Platform Fee, router,
  chamada a Asaas, deploy, provider real adicional ou banco remoto.
- Validação local: API integral com 111 suites/497 testes aprovados e 9 ignorados; lint e
  build da API, typecheck global, `check:no-any`, `check:features` e `git diff --check`
  passaram. `check:boundaries` (2 ocorrências) e `check:theme` (4 ocorrências) reproduziram
  exatamente o baseline limpo, sempre fora do diff.
- PostgreSQL 16 efêmero recebeu as 63 migrations do zero; Prisma validate/generate passaram.
  Smoke SQL confirmou idempotência cross-tenant, múltiplas tentativas, provider imutável e
  dedupe do inbox. O container efêmero foi removido depois da validação.
- Riscos residuais: as colunas legadas continuam no schema para rollout compatível; tenants
  sem keyring configurado exigem migração manual. O endurecimento completo da assinatura e
  adapter Mercado Pago permanece para a fase de homologação.

---

## 99Food Orders V1 — branch pronta para Sandbox (2026-09-03)

- Objetivo: implementar o adapter 99Food/Open Delivery v4 sobre a fundação marketplace multi-loja existente, sem deploy, produção ou chamadas autenticadas ao provider.
- Branch/worktree: `feat/99food-orders-v1`, criada de `origin/main-copy` em `a723413124b0ac7af5914eebda02396318da89ed`; trabalho executado em `C:\wt\pedehub\99food-orders`.
- Alterações: OAuth por loja com credencial criptografada, autorização estrutural, webhook HMAC do corpo bruto, inbox idempotente, polling por conexão com persist-before-ACK, snapshot autoritativo, normalização completa, lifecycle bidirecional e migration aditiva dos tipos de operação.
- Logística: `delivery.deliveredBy=MARKETPLACE` e ownership desconhecido bloqueiam atribuição, rota e auto-dispatch internos; somente `MERCHANT` é elegível.
- Contratos: marketplace, pedidos/status, filas/jobs, eventos/webhooks, multi-tenancy e delivery. Nenhuma mudança de pagamento, fiscal, catálogo, estoque ou preço.
- UI tenant: 99Food não aparece mais como “Em breve”; a ação de autorização abre a URL oficial e exibe erro explícito quando as credenciais não estão configuradas. Admin continua consumindo as estruturas genéricas já existentes de conexões, operações e divergências.
- Validação Sandbox: indisponível porque não há App ID/Client Secret Sandbox no ambiente. Permanecem pendentes OAuth real, evento assinado real, polling/ACK, importação de pedido e lifecycle completo. Decisão de promoção: `READY_FOR_SANDBOX_VALIDATION`; não promover para `main-copy` antes dessas evidências.

### Correção focada da assinatura do callback (2026-09-04)

- O callback real alcançava `POST /api/v1/webhooks/marketplaces/99food`, mas era rejeitado antes do merchant mapping porque o verifier usava o contrato Open Delivery (`X-App-Signature`, HMAC-SHA256) em vez do contrato de webhook do protocolo 99Food recomendado.
- O verifier agora exige `didi-header-sign` e compara, em tempo constante, o MD5 dos bytes exatos do corpo bruto concatenados ao App Secret. Assinaturas ausentes, malformadas ou inválidas continuam falhando fechadas.
- O log de rejeição inclui somente nomes de headers, presença/comprimento/categoria do formato, metadados HTTP, tamanho e SHA-256 do corpo bruto; assinatura, corpo, tokens e secrets não são registrados.
- Merchant/store mapping, conexão, snapshot, ingestão, lifecycle, logística, pagamentos, routing e UI não foram alterados. A validação de um webhook real após deploy permanece um gate separado.

### Correção focada do payload real do callback (2026-09-04)

- Depois do ajuste de assinatura, callbacks reais passaram a responder `204`, mas chegavam à ingestão com merchant, pedido e evento nulos. A causa era o parser Open Delivery camelCase aplicado ao envelope nativo 99Food em snake_case.
- O callback nativo agora é normalizado de `app_shop_id`, `type`, `timestamp`, `data.order_id` e, em `orderNew`, `data.order_info.shop.shop_id`. A conexão é resolvida pelo AppShopID em `externalStoreId`, sem alterar valores persistidos.
- IDs long são preservados como strings usando os bytes assinados. Como o contrato oficial não possui `eventId`, uma identidade determinística é derivada apenas de IDs técnicos, tipo e timestamp para deduplicação.
- Payloads incompletos registram somente chaves e tipos estruturais em profundidade limitada. Nenhum valor de cliente, item, preço, assinatura, token, corpo ou secret é registrado.
- Eventos antigos já persistidos não guardam os bytes crus e podem conter IDs long arredondados pelo parser anterior; eles não devem ser reprocessados como se fossem exatos. Um novo callback real é necessário para a validação externa.

---

## Compatibilidade light/dark do web-tenant (2026-08-27)

- Corrigidas superfícies, textos, estados, tabs, toggles e permission gates que
  combinavam classes do tema claro com o tema dark, com foco nas zonas de
  entrega, estoque, promoções, compras, entregadores, onboarding e automação de
  pedidos.
- Relatórios e Business Intelligence passaram a reutilizar estilos semânticos
  de Recharts para tooltip, grade, eixos e cursor. O Leaflet recebeu tiles
  escurecidos somente no tema dark e controles/legenda baseados em tokens.
- O store de tema agora mantém `resolvedTheme`, inclusive quando a preferência
  `system` muda durante a sessão; os controles desktop e mobile refletem o tema
  efetivamente aplicado.
- O gate `check:theme` passou a detectar `bg-white` e texto neutro escuro sem
  variante no `web-tenant`, ignorando testes e exceções deliberadamente
  documentadas, e foi adicionado ao job principal da CI.
- O E2E autenticado foi ampliado para dashboard, zonas de entrega, relatórios,
  estoque e promoções em light/dark e desktop/mobile. BI permanece coberto pelo
  teste contratual porque o fixture efêmero não possui o plano `bi_advanced`.
- Após a revisão visual, a tabela de Fornecedores passou a usar superfícies,
  divisórias e estados semânticos; as variantes Tailwind inválidas que mantinham
  o cabeçalho claro no dark foram removidas. O `OperationalRouteMap` recebeu
  `theme-aware-map`, reutilizando o filtro dark de tiles já adotado nos mapas de
  zonas e entrega. Fornecedores entrou no smoke visual autenticado.

Validação: `check:theme`, TypeScript do web-tenant, lint do web-tenant, build do
web-tenant e build da API passaram; a suíte do web-tenant passou com 38 arquivos
e 138 testes. O E2E canônico passou (`WEB_TENANT_THEME_E2E_PASS`) contra
PostgreSQL efêmero com 64 migrations e seed de teste, sem overflow, erros de
console/página/rede nas rotas cobertas. Screenshots light/dark foram
inspecionados e preservados fora do worktree em
`C:\Users\Emerson\AppData\Local\Temp\gestor-theme-audit-20260827`.

Nenhum schema/migration, dependência, banco remoto, produção, Dokploy ou deploy
foi alterado. A publicação e o merge seguem o gate controlado autorizado ao fim
da sessão.

## KDS production jobs: preparing-only consistency (2026-08-20)

Branch: `fix/kds-production-job-consistency`
Base: `origin/main-copy` / `7413cf4bb6a901d600eef574cb13cd9cfc5fb655`

- Kitchen production jobs are now created only after the canonical transition to `preparing`. The confirmed POS side effects continue creating the customer receipt and notifications, but no longer call `createProductionJobs`.
- Saving a POS draft no longer creates kitchen production jobs. `KdsService.createProductionJobs` also rejects any order whose persisted status is not `preparing`, protecting future callers from bypassing the invariant.
- Existing idempotency remains in force through active-job checks and the persisted kitchen job idempotency key. Focused regression coverage proves confirmed produces no kitchen job, preparing produces one logical set across retry, the customer receipt remains produced, and KDS queries remain limited to `type = kitchen` while allowing a legitimate kitchen station named `MAIN`.
- Validation: API full suite passed (103 suites, 477 tests; 4 suites/9 tests skipped), focused KDS/orders/POS tests passed (3 suites, 19 tests), API lint/build passed, and `pnpm typecheck`, `check:no-any`, `check:features`, and `git diff --check` passed. `check:boundaries` and `check:theme` reproduce the same pre-existing violations outside this diff (2 boundary imports and 4 theme opacity classes).
- No schema, migration, lockfile, deploy, Dokploy, production, remote database, or external provider was touched.

---

## Reorganizar Cardápio: Categorias e Toggles (2026-08-18)

Branch: `feat/catalog-category-availability-ux`
Base: `origin/main-copy`

- **Visualização Padrão**: O modo "Categorias" agora é o padrão da página de cardápio (`ProductsPage.tsx`) e a escolha é persistida no `localStorage`.
- **Seleção Múltipla**: Adicionado um botão "Seleção Múltipla" (`isBulkMode`) que exibe ou oculta os checkboxes, reduzindo a poluição visual administrativa padrão.
- **Toggles (Switches)**: 
  - O cabeçalho de categorias agora possui um `Switch` integrado para ativar ou desativar categorias rapidamente.
  - Produtos vinculados a categorias inativas são renderizados esmaecidos (`opacity-50`) para indicar a indisponibilidade herdada sem corromper o estado `isActive` interno.
  - As ações redundantes de menu ("Ativar", "Pausar", "Esgotado") de produtos foram condensadas em um único `Switch` prático na visualização em lista e nos cards.
- **Complementos Inline**: Criado o componente `ProductComplementsInline.tsx`. Os produtos exibem um botão de expansão "Complementos (N)" que carrega os grupos do produto sob demanda e permite alternar o estado (`isActive`) de itens individuais inline via `PATCH`. Prevenimos N+1 adicionando contagem no backend.
- **Validação Local**: A tipagem de `_count` em `Product` foi ajustada. `pnpm typecheck`, lint do web-tenant e o script `check:no-any` completaram com sucesso. Sem push, hook de actions ou deploy.

---

## Storefront Checkout Bugfixes (2026-08-17)

- **Checkout v2 Layout Fixes**: 
  - A transparência de bg-card/90 foi consertada aplicando um estilo CSS nativo para manter `rgba(255,255,255,0.92)` independente das variáveis CSS de Hex code do Tailwind.
  - O sumiço do botão "Continuar" na "Etapa 2" (Fulfillment) foi resolvido corrigindo um bug clássico de layout do iOS Safari. O footer usava `fixed bottom-0`, que em páginas curtas (sem scroll) fica oculto atrás da barra de endereço inferior do navegador, pois o layout viewport não é ajustado automaticamente.
  - A solução foi alterar as tags `<main>` em `StorefrontLayout` para `flex flex-col` (permitindo aos filhos herdar a altura de `100dvh`), ajustar o contêiner base de `CheckoutPage` para flex column (`flex-1 flex flex-col`) e mudar o footer de `fixed` para `sticky bottom-0`. Isso garante que o footer repouse naturalmente na parte inferior da tela usando unidades `dvh` reais sem sobreposição da UI nativa.

---

## Production quick fixes - store status, delivery coordinates, and switches (2026-08-17)

Branch: `fix/production-quick-fixes`
Base: `origin/main-copy` / `92effcdecadf98d38e1385ae9c5f9b262d01c465`

- O status operacional da loja passou a usar um resolver único para horário, pausa manual, turnos múltiplos/noturnos e próxima abertura. O sidebar concentra `Loja Aberta`, `Loja Pausada` ou `Loja Fechada`; fora do horário o toggle fica desabilitado e não permite que uma retomada force abertura. O bloco duplicado foi removido de Configurações.
- O toggle do sidebar reutiliza `PATCH /tenant/store-pause`; o efeito de notificação só compara estados depois que o tenant existe e nunca cruza estados de tenants diferentes.
- O checkout agora preserva as coordenadas resolvidas pelo serviço canônico de cobertura/geocoding e as grava tanto no snapshot `OrderDeliveryAddress` quanto no endereço salvo do cliente. A configuração/endereço da loja já geocodificava e persistia latitude/longitude pelos fluxos existentes de Configurações e onboarding.
- A proteção financeira do modo `DRIVER_RATE_TABLE` permanece fechada: coordenadas ausentes continuam impedindo a atribuição, com mensagens humanas específicas para loja, entrega ou ambos, sem expor latitude/longitude e com UTF-8 correto. Modos não baseados em distância não ganharam exigência nova.
- Um `Switch` compartilhado, acessível e de tamanho fixo (`44x24`, `shrink-0`) substitui toggles locais em sidebar, horários, Inventário, Despacho, Integrações e Notificações. O layout mantém texto flexível e switch estável sem posicionamento absoluto.
- Validação visual autenticada local passou em 390x844, 430x932, 768x900, 1024x900 e 1440x900, light/dark, com checagem automatizada de dimensões e overflow. Evidências: `C:\Users\Emerson\Documents\GitHub\pedehub-production-quick-fixes-qa`.
- API: 4 shards cobriram a suíte integral com 103 suites/474 testes aprovados e 9 ignorados; testes focados de delivery/orders passaram com 3 suites/32 testes. O comando agregado `pnpm --filter @gestor/api test` excedeu duas janelas locais (5 e 15 minutos), mas todos os arquivos listados foram executados pelos quatro shards com exit 0. Lint e build da API passaram.
- Tenant: 37 arquivos/134 testes, lint e build passaram. `pnpm typecheck`, `check:no-any`, `check:features` e `git diff --check` passaram. `check:boundaries` e `check:theme` reproduziram exatamente na base as mesmas 2 violações de boundary e 4 ocorrências críticas de tema fora do diff, portanto permanecem baseline only.
- Smoke HTTP efêmero confirmou pausa `false -> true -> false`; o smoke visual confirmou loja fechada/toggle desabilitado fora do horário, loja aberta dentro do horário e ausência do bloco duplicado. O smoke de atribuição ficou coberto em serviço/testes, sem criar uma rota real via HTTP.
- Contratos preservados: isolamento por `tenantId`, transições de pedido, remuneração por distância, DTO compartilhado de validação do checkout e provider de geocoding existente. Não houve schema, migration, dependência, feature flag ou alteração no app do entregador.
- Risco residual: o gate agregado da API não concluiu dentro do timeout local, embora a mesma lista integral tenha passado em shards; a atribuição não recebeu smoke HTTP com uma rota persistida. Nenhum deploy, Dokploy, produção, banco remoto, provider ou GitHub Actions foi acessado.

---

## R15 PR B/C - settlement tenant and driver UI (2026-08-14)

- O modal do entregador no tenant exibe resumo, turnos pendentes/pagos, período, seleção integral, confirmação explícita e histórico auditável; `finance.read` controla leitura e `finance.manage` controla o registro.
- Retry exato preserva uma chave idempotente; mudanças de turnos, meio, data ou observações rotacionam a chave. Double-click é bloqueado antes da atualização assíncrona do estado e conflito 409 recebe mensagem específica.
- O app do entregador mostra saldo atual, último pagamento, histórico e snapshots de turnos exclusivamente em leitura, deixando explícito que não realiza PIX, transferência, saque ou payout.
- Detalhes financeiros usam modal superior isolado do conteúdo de fundo, com `inert`/`aria-hidden`, focus trap, Escape exclusivo, scroll lock e restauração de foco. Tabs seguem `tablist`/`tab`/`tabpanel`; ArrowLeft/ArrowRight circulam entre as opções e Home/End levam ao primeiro/último tab.
- A listagem backend de turnos pagos usa os snapshots imutáveis de `DriverSettlementItem` para bruto, recebido diretamente e devido, inclusive quando o ledger recebe ajustes posteriores; suite focada da API passou com 9/9 testes após build de types.
- Cobertura frontend inclui permissões, erro versus vazio, filtros, tabs e navegação completa por teclado, seleção, confirmação, double-click, retry idempotente, rotação de payload, conflito, refresh de sucesso, detalhe/auditoria e isolamento modal. As interações RTL do tenant rodam com `pnpm --dir apps/web-delivery exec vitest run --config vitest.tenant.config.ts`, pelo toolchain Vitest/Testing Library/jsdom já declarado no web-delivery; `apps/web-tenant/package.json` e `pnpm-lock.yaml` permanecem inalterados.
- Validação local após instalação offline com lock congelado: web-tenant 34 arquivos/124 testes, interações RTL do tenant 1 arquivo/7 testes pelo runner dedicado e web-delivery 15 arquivos/43 testes passaram; build de types, `pnpm typecheck`, ESLint focado dos dois frontends, ambos os builds, `check:no-any`, `check:features` e `git diff --check` passaram. `check:theme` e `check:boundaries` mantêm apenas violações baseline fora do escopo.
- Sem payout real, provider, deploy, produção, banco remoto, edição/reversão de settlement ou alteração do ledger R14.

---

## R15 PR A - settlement domain (2026-08-14)

- `DriverSettlement` e `DriverSettlementItem` registram quitação integral de turnos sem alterar o ledger R14.
- Elegibilidade exige turno encerrado, diária aplicável lançada, nenhuma rota/retorno ativo, saldo positivo e turno ainda não pago.
- Total é recalculado no backend; gorjeta cash é excluída do devido à loja.
- Transação serializável, chave idempotente por tenant e unicidade de `shiftId` protegem retry, double-click e gestores concorrentes.
- Settlements confirmados e itens são imutáveis no PostgreSQL. Reversão auditável ficou como follow-up.
- APIs tenant usam `finance.read`/`finance.manage`; driver possui somente leitura do próprio histórico.
- Sem payout, pagamento parcial, deploy ou banco remoto.

---

## R13 PR C - driver route map and Android background tracking

Date: 2026-08-12
Branch: `feat/r13-driver-background`
Base: `origin/main-copy` / `2d3c58eb`

- The courier page has an accessible internal schematic map, numbered stop sequence, textual equivalent, optional Google Maps/Waze/system navigation, and an explicit no-ETA/no-optimization explanation.
- `@capacitor-community/background-geolocation` 1.2.26 is the sole new Capacitor background plugin: MIT licensed, Capacitor 7 compatible, and active only while the route requires tracking.
- Plugin decision: selected for its maintained Capacitor 7 bridge and notification-backed Android foreground service; Transistorsoft Background Geolocation was rejected because production use requires a commercial license.
- Native points reuse the bounded FIFO/replay path with source `background`, event-key idempotency, and device timestamps. A GPS outage after start announces reconnection and does not cancel the route.
- `DeliveryRunDTO.origin` is nullable and tenant-scoped. A return renders or navigates to the store only when a real store coordinate exists; otherwise the destination is explicitly unavailable.
- `cap sync android` and `gradlew test assembleDebug` passed with the local Android Studio JDK 21 and local SDK. No device was attached for hardware smoke.

Validation: driver app test suite passed with 13 files/39 tests, lint and production build passed; focused API delivery-runs suite passed with 16 tests after building shared types/core. Design evaluation passed after a correction round. No migration, remote database, provider, production, Dokploy, or deploy was accessed.

---

## R13 PR B - tenant maps and order route history

Date: 2026-08-12
Branch: `feat/r13-tenant-maps`
Base: `origin/main-copy` / `85d9775c`

- The tenant delivery map keeps waiting-dispatch and in-route orders visible while adding active-run context, numbered stops, store origin, a motorcycle marker, and fresh/stale/unavailable location states.
- The order drawer resolves `GET /delivery/runs/order/:orderId` before offering `Ver no mapa`; the tenant-scoped endpoint only returns a route whose stop contains that order.
- The accessible tracking dialog shows the matching driver/run, complete stop addresses, current route history inside 30 days, and an explicit expired-history state without inventing ETA, optimization, or distance.
- Leaflet/OpenStreetMap dependencies already present in the tenant app are reused; no provider, schema, migration, or new dependency was introduced.
- Focus trapping, Escape dismissal, focus restoration, scroll locking, responsive safe-area sheet behavior, textual map summaries, and light/dark semantic tokens are covered by focused tests and independent UI evaluation.

Validation: focused API tests passed with 2 suites/21 tests. Focused tenant coverage passed with 4 files/17 tests after restoring the R6 mobile safe-area contract; TypeScript checks for API and tenant and `git diff --check` passed. Full gates and CI are recorded in the PR handoff. No production, Dokploy, remote database, or deploy was accessed.

---

## R11 PR B — PWA instalável e offline previsível

Data: 2026-08-11
Branch: `feat/r11-driver-pwa`
Base: `main-copy` / `d74d49de`

- O manifest agora tem `id`, `scope`, ícones PNG reais em todas as dimensões declaradas e variantes maskable 192/512 geradas da identidade SVG existente.
- O service worker versiona o app shell, não intercepta API, usa navegação network-first e assets cache-first, e aguarda confirmação explícita antes de `skipWaiting`.
- Um banner global comunica offline, oferece instalação somente após `beforeinstallprompt` e oferece atualização quando existe worker em espera.
- O smoke Playwright serve o build real, valida manifest/MIME/dimensões, confirma worker ativo/controlador e recarrega `/login` offline.
- Foi removido o import runtime do enum compartilhado na tela de entregas, evitando que decorators de DTO exijam `reflect-metadata` no browser.
- Sem API, schema, migration, banco remoto, Dokploy ou deploy.

---

## R13 PR A - route tracking, history, and retention

Date: 2026-08-12
Branch: `feat/r13-tracking-history`
Base: `origin/main-copy` / `c7eae324`

- `trackingRequired` is active only for an active shift plus an `IN_PROGRESS` or `RETURNING` run; a delivered stop does not end capture while the run continues.
- HTTP and WebSocket ingestion derives tenant and driver from the session, revalidates socket JWTs, validates plausibility, samples at about 10 seconds, and deduplicates the local event key.
- The driver app creates one point for WS and HTTP, keeps a bounded 500-point FIFO buffer, and removes only acknowledged replay items in batches of 100.
- `DeliveryDriverLocation` has nullable shift/run relations, a device timestamp, and optional quality/source metadata. The additive migration preserves prior history and adds tenant-scoped indexes.
- `GET /delivery/runs/:id/locations` returns the operational summary and detailed path inside 30 days. Daily purge removes only old samples in bounded batches.
- The shared freshness helper distinguishes current, stale, and unavailable positions. Map consumption remains in PR B.

Validation: all 57 migrations, including the additive R13 migration, applied to an ephemeral PostgreSQL 16 database. Focused API coverage passed with 7 suites/42 tests; web-delivery passed with 10 files/29 tests. API/web-delivery lint and build, global typecheck, `check:no-any`, `check:features`, and `git diff --check` passed. The full API suite exceeded the 10-minute local command limit without producing a result; CI remains the authoritative full-suite gate. `check:boundaries` reports only the two known baseline imports from `@gestor/storefront-ui`, unchanged by this branch. No remote database, provider, production, Dokploy, or deploy was accessed.

---

## R11 PR A — confiabilidade em tempo real do entregador

Data: 2026-08-11
Branch: `feat/r11-driver-realtime-reliability`
Base: `main-copy` / `3114fd4b`

- Atribuições, atualizações e cancelamentos chegam pelo namespace `/delivery` em sala privada derivada da sessão do entregador; não existe join controlado pelo cliente.
- O app atualiza a lista imediatamente e mantém polling de 15 segundos como fallback. Atribuição toca um único alerta em foreground, com deduplicação pelo mesmo `eventId` usado no push.
- Web Push recebeu tag, dados e deep link; em janela visível o service worker encaminha o evento ao app e evita notificação duplicada.
- Logout tenta remover todas as subscriptions do destinatário no backend e a subscription do navegador sem bloquear a saída em caso de falha.
- Login/sessão, disponibilidade operacional e GPS ficaram separados. O servidor impede `available`/`offline` durante entrega ativa e conserva `busy`.
- Revogar uma sessão publica somente seu `sid`; o gateway desconecta apenas sockets dessa sessão.
- Sem schema, migration, banco remoto, Dokploy ou deploy. `DeliveryRun`/`Stop`, múltiplos pedidos, ganhos e background tracking continuam fora do escopo.

---

## Configuração de largura de papel por impressora

Data: 2026-08-10
Branch: `fix/printing-paper-width`
Base: `main-copy` / `9158d881`

- A origem do valor histórico é `PrinterDevice.paperWidth`, cujo schema Prisma define `@default(58)`; a tela também usava fallback visual de 58 mm quando não havia impressora compatível.
- O setup agora permite escolher 58 mm ou 80 mm e persiste o valor no campo existente do dispositivo. Alterar carrega a largura previamente persistida.
- O ticket para Bluetooth e QZ é quebrado em 32 colunas para 58 mm e 48 para 80 mm; browser print da tela de impressoras recebe a largura do dispositivo. Não há autodetecção QZ ou Bluetooth.
- Sem impressora compatível, a tela não apresenta 58 mm como configuração ativa: informa que a largura será definida ao configurar uma impressora.
- Testes focados: 5 arquivos / 19 testes PASS; lint, `check:no-any`, `check:features` e diff check PASS. Suite completa e build/typecheck locais permanecem bloqueados pelas duas resoluções preexistentes de `@gestor/storefront-ui` nesta worktree. Nenhuma API, schema, migration, dependência, banco remoto ou deploy foi alterado.

---

## Correção das ações de configuração de impressão

Data: 2026-08-10
Branch: `fix/printing-setup-actions`
Base: `main-copy` / `5b17e5ff`

- A abertura do setup agora registra imediatamente um feedback visível e carrega o destino explícito: impressora principal ou `PrintStation` selecionada em Alterar.
- O diálogo é remontado por destino e pré-seleciona o setor solicitado; não há fallback silencioso para a impressora principal.
- Sem QZ/dispositivo encontrado, a configuração continua aberta e explica como habilitar impressão automática, preservando o browser print como alternativa manual.
- Mobile web responde que apenas browser print está disponível; Android mantém o fluxo Bluetooth.
- Testes focados: 4 arquivos / 15 testes PASS; lint PASS. Suite completa, build e typecheck locais bloqueados por duas resoluções preexistentes de `@gestor/storefront-ui` nesta worktree. Nenhuma API, Prisma, migration, dependência, banco remoto ou deploy foi alterado.

---

## Correção de dispositivo de impressão por plataforma

Data: 2026-08-10
Branch: `fix/printing-current-device-filter`
Base: `main-copy` / `a27d0b1`

- A lista de `PrinterDevice` continua tenant-global, mas a impressora apresentada como atual passa a ser selecionada exclusivamente entre os dispositivos compatíveis com a plataforma local.
- A matriz canônica da tela é reutilizada: Android Capacitor aceita Bluetooth SPP; desktop aceita QZ Tray; mobile web não promove hardware persistido. Browser/system print permanece independente.
- Overview, impressoras por setor e spooler compartilham a mesma verificação de compatibilidade. Registros incompatíveis não são desativados ou removidos do servidor.
- Testes focados: 3 arquivos / 12 testes PASS. A execução completa local encontrou duas falhas preexistentes de resolução de `@gestor/storefront-ui`; build/typecheck local também ficou impedido por dependências compartilhadas ausentes nesta worktree. A CI da PR é o gate definitivo.
- Nenhuma API, Prisma, migration, dependência, banco remoto ou deploy foi alterado.

---

## Production preflight read-only do RC `ff3d602a`

Data: 2026-08-09

- Freeze reconfirmado: `origin/main-copy` continua em `ff3d602aa8d5aee238abb3b0574d447ac000b6f8`; PR #51 segue Draft, OPEN, MERGEABLE/CLEAN e verde, sem merge.
- API pública respondeu HTTP 200, TLS válido e `status=ok`, mas não expõe SHA/imagem. Não havia sessão Dokploy, alvo SSH, PostgreSQL read-only ou backup system acessível; imagem implantada, `_prisma_migrations`, drift, env/config, Redis/storage e rotação de secrets permanecem `UNKNOWN`.
- Backup/restore continua `BLOCKED`: a política está documentada, porém último backup, retenção, restore point e restore real não foram comprovados.
- O tooling E0 está presente no RC construível: `apps/api/Dockerfile` copia o script de revogação e dependências. O comando alcança toda `AuthSession active`, inclusive customer, é idempotente e retorna contagens agregadas; não possui dry-run. Como o runner não copia os manifests do workspace, a execução do comando versionado com `pnpm --filter` precisa ser provada dentro da imagem; presença na imagem atualmente implantada também permanece desconhecida.
- Decisão: **PARTIAL**. Nenhuma escrita de produção foi executada. O próximo passo é acesso/evidência operacional estritamente read-only para concluir backup, imagem/SHA, migrations, schema e configuração; qualquer E0-OPS/deploy/migration continua exigindo autorização posterior separada.
- Evidência detalhada e checkpoints: `docs/releases/rc-ff3d602a.md`, seção `Production preflight — read only`.

---

## Release Candidate consolidado - `ff3d602a`

Data: 2026-08-09

- Branch documental `docs/release-candidate-ff3d602a`, criada em worktree isolada no SHA exato `ff3d602aa8d5aee238abb3b0574d447ac000b6f8`; checkout principal, alterações Android preexistentes, `stash@{0}` e demais worktrees foram preservados.
- A cadeia #33–#50 está integralmente `MERGED` e todos os merge commits são ancestrais do RC. R1–R10, Customer Session Hardening e Android branding guard foram classificados como `PRESENT`.
- CI do RC verde: run `31300824997`, Secret scanning `31300824990`/`31300823609`; prova PostgreSQL pré-merge `31246727716`; PR tree e merge tree idênticos em `d4cf7960322101440176f771c6bae2f3d1e0b3fc`.
- Gates locais verdes para install, Prisma generate, validação canônica do schema, lint, typecheck, no-any, features, branding, testes focados/completos dos frontends e builds API/web. O PostgreSQL efêmero local ficou bloqueado pela ausência do daemon Docker, com cobertura equivalente na CI.
- As 55 migrations foram inventariadas. O status atual de produção é `UNKNOWN — MUST VERIFY IN PRODUCTION`; nenhuma foi classificada como aplicada ou pendente sem evidência remota. As seis mais recentes são aditivas; migrations históricas destrutivas/backfill exigem revisão se aparecerem pendentes.
- `RISK-RC-01` aceito: refresh token do customer persiste em Zustand/localStorage; mitigado por rotation single-use, TTL, `sid`, `AuthSession`, revogação e isolamento tenant/customer. Follow-up HttpOnly deve tratar CORS/CSRF/transporte em iniciativa separada.
- Dívidas não bloqueantes: `CI-DEBT-01` (actions Node 20) e `RC-DEBT-02` (wrapper raiz de `prisma:validate`; comando canônico passou).
- Documento operacional completo: `docs/releases/rc-ff3d602a.md`. Ordem segura documentada: E0-OPS autorizado → staging da imagem → migrations aprovadas → ativação do deploy → smoke.
- Decisão: **RC APROVADO**. Go-Live permanece bloqueado por E0-OPS, backup/status de migrations/config real, deploy e smoke de produção. Nenhuma operação de produção foi executada.

---

## Customer session hardening - access curto, rotation e revogacao

Data: 2026-08-08

- Branch `fix/go-live-customer-session-hardening`, criada em worktree isolada no merge da PR #48 em `origin/main-copy` (`f74db71f`). Checkout principal com alteracoes Android, `stash@{0}`, worktree R10 e branches remotas foram preservados.
- PR #49 ja estava integrada por `2b943b7b`; CI pos-merge `30981998283` e branding guard passaram. PR #48 foi integrada por merge commit `f74db71f`; CI pos-merge `31245025516` e secret scanning passaram, incluindo branding guard e notification audio.
- `AuthSession` ja possuia `AuthSubjectType.customer` e `subjectId`; nenhuma mudanca Prisma ou migration foi necessaria. O script global existente de revogacao alcanca customer porque opera sobre todas as sessoes `active`.
- `CustomerSessionService` e o issuer unico para OTP, Google ja vinculado e conclusao do primeiro link Google por OTP. O access JWT possui apenas customer ID, tenant ID, marker customer, `sid`, `iat` e `exp`; TTL canonico de 15 minutos, sem telefone/nome no token.
- Refresh reutiliza o contrato existente: JWT em body/storage, SHA-256 persistido, family/reuse detection e TTL canonico `JWT_REFRESH_EXPIRES_IN` (default 7 dias). Customer rotation preserva o expiry absoluto original e consome o hash atual atomicamente, impedindo duas rotacoes validas concorrentes.
- Logout customer revoga a sessao atual. Guards exigem `sid` e validam status, expiry, subject/customer e tenant; JWT customer legado sem `sid` recebe 401. Impacto de deploy: clientes autenticados existentes precisam entrar novamente.
- Storefront faz bootstrap, refresh single-flight, no maximo um retry por 401, logout local em falha definitiva e revogacao antes da troca de tenant. Login/refresh nao limpam carrinho nem address draft.
- Guest checkout continua sem `AuthSession`; R1/R2 e R10 permanecem preservados. Nao ha estados blocked/deleted/archived em `Customer`, portanto essa regra e NOT APPLICABLE.
- Testes focados: API 4 suites/25 testes PASS; storefront 1 arquivo/5 testes PASS. Regressao completa: API 88 suites/370 testes PASS (4 suites/9 testes skipped); storefront 12 arquivos/63 testes PASS.
- Prisma/schema/migrations, Android `applicationId`, E0-OPS, provider real, banco remoto, producao e deploy nao foram alterados. O applicationId canonico permanece `com.getcapacitor.app`.

---

## R10 - Google Sign-In de cliente com linking explícito

- Branch `feat/go-live-r10-customer-google-auth`, baseada no merge da PR #47 (`7f0f9dea`).
- A identidade Google é persistida somente por tenant, provider e `sub`; e-mail nunca faz auto-link e tokens Google não são persistidos.
- O primeiro login Google exige OTP de WhatsApp já existente; a capability tem audience própria, expira em cinco minutos e não serve como JWT customer. Logins posteriores da mesma identidade tenant-scoped autenticam sem novo OTP.
- O débito de sessão originalmente deixado pela R10 foi encerrado nesta branch: OTP/Google convergem em `CustomerSessionService`, com access curto, `sid`, `AuthSession`, refresh rotativo e logout server-side. O histórico da R10 continua válido para identidade/linking.
- Guest checkout, carrinho, fulfillment, cupom, endereço draft e estado de checkout permanecem independentes do login opcional Google. Nenhum deploy, produção, migration remota, Google Cloud ou E0-OPS foi tocado.

---

## R9 - disponibilidade por categoria e controles em lote

- Branch `feat/go-live-r9-category-product-availability`, baseada no merge da PR #46 (`785aad14`).
- `activeDays` é persistido em `ProductCategory` por migration estritamente aditiva; `[]` preserva categorias existentes como disponíveis todos os dias.
- O `AvailabilityService` agora considera `Product.isActive`, `Product.isAvailable`, categoria ativa e dias ativos no timezone do tenant.
- Bulk de produtos e categorias opera somente em `isActive`, valida todos os IDs tenant-scoped em uma transação e invalida o cache do storefront uma vez. Não há cascade para produtos filhos.
- Nenhum deploy, produção, migration remota, E0-OPS ou E0H foi tocado.

---

## R8 - importacao opcional e duravel de cardapio base

Data: 2026-08-03

- Branch `feat/go-live-r8-optional-base-menu-import`, baseada no merge da PR #45 em `origin/main-copy` (`7222f947`). Checkout principal, alteracoes Android preexistentes, `stash@{0}` e worktrees anteriores foram preservados.
- Auditoria canonica: `docs/audits/r8-optional-base-menu-import-audit.md`.
- A action capability server-side `baseMenu.import` fica OFF por default no Go-Live e pode ser reativada por `BASE_MENU_IMPORT_ENABLED=true`. A API bloqueia o POST antes do service; onboarding/settings/produtos escondem a UX e evitam fetch de templates quando OFF.
- `BaseMenuImportLog.operationKey` nullable/unique identifica novas operacoes por tenant + versao do template. Logs historicos permanecem NULL, sem backfill ou reinterpretacao.
- Novas importacoes usam uma unica transacao Serializable e nao retornam `partial`. Retry/requisicao concorrente recupera somente a operacao equivalente concluida; outros P2002 continuam erro real.
- Catalogo nao vazio bloqueia nova importacao com `BASE_MENU_IMPORT_REQUIRES_EMPTY_CATALOG`; nao existe merge, overwrite ou deduplicacao por nome humano.
- Selecionar template apenas abre confirmacao explicita; importacao nao grava nem sobrescreve `businessSegment`. O caminho de cardapio vazio e o fallback visual R7 permanecem independentes.
- Migration estritamente aditiva. Nenhuma migration de producao, seed, deploy, E0-OPS, E0H ou acesso remoto foi executado.

---

## Recuperação do E2E de áudio de notificações

Data: 2026-08-02

- Branch `fix/notification-audio-e2e-race`, criada em worktree isolada a partir
  de `origin/main-copy` no merge da PR #42 (`b1492d5e`). Checkout principal,
  alterações Android preexistentes, R5 e `stash@{0}` permanecem preservados.
- O run pós-merge `30733764157`, job `91458946872`, falhou porque as duas abas
  tentavam clicar simultaneamente no CTA. A primeira confirmação de áudio era
  sincronizada por `localStorage`, removendo legitimamente o CTA da outra aba
  durante o hit-test do Playwright. Os artefatos mostraram uma aba `running` e
  a outra `not-created`, sem erro de página, console ou rede.
- Não havia overlay funcional bloqueando o usuário. A página mantinha o controle
  canônico `Ativar notificacoes sonoras` visível e acionável após a transição.
  Portanto, a causa foi classificada como race do E2E durante uma transição de
  estado legítima; nenhum código de produto foi alterado.
- O E2E agora ativa a primeira aba pelo CTA e, depois da confirmação
  compartilhada, ativa a segunda pelo controle canônico da página. Ambas ainda
  precisam provar `AudioContext` em `running`, CTA ausente e `Testar som`
  disponível antes de validar eventos, dedupe, silêncio de conectividade e
  troca de liderança.
- A primeira execução da PR confirmou a ativação do `AudioContext`, mas revelou
  uma segunda espera instantânea: o teste consultava `Testar som` antes do commit
  de render do React. A asserção agora aguarda explicitamente o CTA ficar oculto
  e o controle canônico ficar visível, sem sleep ou force click.
- A execução seguinte expôs um seletor não exato: `Ativar notificacoes sonoras`
  também casava o toggle `Desativar notificacoes sonoras`. O fallback agora usa
  o nome acessível exato, preservando strict mode do Playwright.
- Gates locais: build da API e web-tenant, lint, typecheck, `check:no-any`,
  `check:features` e `git diff --check` passaram. O E2E completo permanece como
  prova no ambiente efêmero da CI; nenhuma migration, seed, produção ou deploy
  foi executado. A R6 não foi iniciada e só pode ser liberada após CI verde da
  PR de correção e do merge em `main-copy`.

---

## R3 — login do entregador sem slug visível

Data: 2026-08-01

- Branch `feat/go-live-r3-driver-login-no-slug`, criada em worktree isolada no
  merge da PR #39 em `origin/main-copy` (`c386a13d`). Checkout principal,
  worktrees anteriores e `stash@{0}` permanecem preservados.
- A auditoria prévia está em `docs/audits/r3-driver-login-no-slug-audit.md`.
  O modelo permite o mesmo telefone em vários tenants e não possui identidade
  global compartilhada; por isso foi adotado o fluxo B, sem migration.
- O login agora recebe telefone + PIN. Um único vínculo autenticado cria a
  sessão tenant-bound existente; múltiplos vínculos autenticados recebem um
  seletor pós-auth limitado por capability JWT de cinco minutos. Nenhum
  `tenantId` arbitrário é aceito e o `tenantSlug` ficou apenas como entrada
  opcional compatível para clientes antigos.
- Falhas pré-auth retornam a mesma mensagem e os logs não registram telefone,
  slug ou token. O rate limit do login e da seleção é 5 por 60 segundos usando
  o `ThrottlerGuard` já existente.
- O guard do entregador valida JWT, `AuthSession`, subject, tenant, expiração,
  driver ativo e tenant ativo/trial. Refresh rotation e logout continuam no
  mecanismo canônico. O WebSocket do entregador envia o access token no
  handshake e deriva `driverId`/`tenantId` dos claims verificados.
- Gates locais: install frozen, lint, typecheck, `check:no-any`,
  `check:features`, build API, build web-delivery e `git diff --check` PASS.
  Testes focados: 5 suites/19 testes API PASS e 1 suite/1 teste frontend PASS.
- Prisma/schema, migrations, seed, dependências, lockfile, provider, secrets,
  E0-OPS, banco remoto, produção e deploy não foram alterados.
- Recuperação do proof da PR #40: o run `30693717516` perdeu o diagnóstico
  quando a API encerrou antes do health check porque consultava somente
  containers em execução (`docker compose ps -q api`) e abortava antes do
  bloco sanitizado. O workflow agora captura o container criado com `ps -aq`,
  preserva o ID após saída e limita `docker inspect` aos campos seguros de
  estado, exit code, OOM, erro e timestamps. A próxima execução instrumentada
  continua sendo o gate; a PR permanece Draft e sem deploy.

---

## R2.5 — vitrine inteligente configurável

Data: 2026-08-01

- Branch `feat/go-live-r2-5-smart-storefront-showcase`, criada em worktree isolada
  no merge da R2 em `origin/main-copy` (`8d7acb4a`). Checkout principal,
  worktrees R0/R1/R2/E0 e `stash@{0}` permanecem preservados.
- A auditoria obrigatória anterior à implementação está em
  `docs/audits/r2-5-smart-storefront-showcase-audit.md`. A decisão foi `YES`:
  o JSON `TenantSettings.storefrontLayoutJson`, o payload público, o filtro
  canônico de disponibilidade, o ranking BI e o cache existentes são suficientes.
- O layout normalizado agora possui uma vitrine opcional com título, modo manual,
  automático ou híbrido, máximo entre 1 e 12 e IDs manuais ordenados/deduplicados.
  Configurações antigas e presets recebem a vitrine desligada por padrão.
- O backend valida que todos os IDs configurados pertencem ao tenant autenticado.
  A seleção ocorre apenas sobre produtos já ativos, publicáveis e disponíveis no
  canal pelo `AvailabilityService`; lista vazia omite o bloco.
- `BEST_SELLING` reutiliza a soma de quantidades de pedidos `completed`, tenant-scoped,
  na janela existente de 30 dias, com desempate determinístico. `PROMOTIONS`
  reutiliza o badge canônico. `MOST_ORDERED` e `COMBOS` não são anunciados porque
  os contratos existentes não sustentam essas semânticas sem agregação ou renderer novo.
- Manual vence automático no modo híbrido; duplicados e IDs inelegíveis são removidos,
  e menos itens que o máximo é aceito sem preenchimento aleatório.
- O storefront renderiza uma faixa mobile-first com overflow/scroll-snap no topo do
  menu e reutiliza `ProductRenderer` e o fluxo atual de seleção/modal. A navegação
  horizontal existente continua usando `CategoryNavigation` e categorias canônicas.
- O painel configura a vitrine no local já existente de personalização e mostra a
  seleção manual no preview existente. Ranking automático completo no preview e
  convergência de renderers permanecem no escopo futuro da R5.
- O payload público continua no cache `storefront:<slug>:<fulfillmentType>`; o PATCH
  existente já invalida delivery/pickup. Não há N+1, chamada por card ou cache novo.
- Testes focados: backend 3 suites/7 testes e storefront 1 suite/2 testes, todos PASS.
  Builds de theme, types, API, web-storefront e web-tenant passaram. O Prisma Client
  foi apenas regenerado localmente para refletir o schema já existente.
- Nenhum Prisma/schema, migration, seed, provider, credencial, dependência, lockfile,
  feature flag, E0-OPS, banco remoto, deploy ou produção foi alterado.

---

## R2 - checkout guided steps and progressive address

Data: 2026-08-01

- Branch `feat/go-live-r2-checkout-steps-address`, criada em worktree isolada a
  partir do merge da R1 em `origin/main-copy` (`23b67f68`). Checkout principal,
  worktrees R0/R1/E0 e `stash@{0}` permanecem preservados.
- O checkout do storefront foi dividido em etapas móveis e progressivas para
  identificação, recebimento, endereço quando aplicável, pagamento e revisão.
  Voltar preserva o estado existente; retirada pula endereço; a revisão reutiliza
  o resumo final da R1.
- Endereços salvos, autocomplete Google já configurado e consulta ViaCEP existente
  continuam sendo as únicas fontes automáticas. O fallback manual é explícito;
  número, complemento e referência permanecem sob controle do cliente.
- Respostas tardias de CEP são descartadas quando o CEP ou um campo material foi
  editado. Autofill não sobrescreve campos já editados e falha de busca revela o
  formulário manual sem apagar dados.
- Mudança material do endereço invalida imediatamente taxa/cobertura anteriores.
  O avanço exige nova validação autoritativa da API; erro mantém o formulário e
  permite correção.
- O guard síncrono, fingerprint e tentativa lógica da R1 não foram alterados.
  Navegação entre etapas mantém a mesma tentativa; retry ambíguo do mesmo payload
  continua reutilizando a chave, sem duplicar pedido.
- Nenhum contrato amplo de API, Prisma/schema, migration, seed, provider, SDK,
  dependência, lockfile, feature flag, E0-OPS, banco remoto ou deploy foi alterado.

---

## E0 — JWT secret containment

Data: 2026-07-31
Branch: `security/e0-jwt-secret-containment`

Atualização de estado E0:

- Tokens JWT antigos foram rejeitados após a rotação; nenhum valor foi registrado.
- O HEAD está sanitizado e o gate Gitleaks/CI da PR #35 está verde.
- O SHA que inclui o comando operacional ainda não foi redeployado. A
  revogação global de `AuthSession` e os smokes de nova sessão permanecem
  pendentes; `DB_PASSWORD` continua NÃO CONFIRMADO.
- E0 está MITIGADO: a pendência E0-OPS (redeploy, revogação e smokes) e E0H
  (purga coordenada do histórico) bloqueia o Go-Live definitivo, mas não a
  continuidade documental da R0.

- O HEAD deixa de rastrear `.env.docker`; o arquivo local fica ignorado e
  `.env.docker.example` contém somente placeholders não utilizáveis.
- A auditoria redigida confirmou material JWT concreto no arquivo rastreado e
  identificou `DB_PASSWORD` como credencial adicional a confirmar no runtime.
  Valores, hashes parciais e tamanhos não foram registrados.
- O gate `Secret scanning` usa Gitleaks com checkout completo, redaction e
  permissões `contents: read`. A varredura inclui PR, HEAD e histórico que o
  GitHub Actions disponibilizar.
- `AuthSession` possui revogação global idempotente por status ativo. O comando
  operacional exige `NODE_ENV=production` e
  `CONFIRM_GLOBAL_SESSION_REVOCATION=true`, retorna somente contagens e não
  roda no startup.
- A rotação no Dokploy, captura de tokens antigos, smoke e merge permanecem
  bloqueados até confirmar acesso, serviço correto, backup utilizável e fonte
  canônica de environment. E0H planejará a purga coordenada do histórico sem
  reescrevê-lo nesta sessão.

---

## Branding Android — nome, ícones e splash

Data: 2026-07-31

Branch: `fix/mobile-notification-lifecycle-safe-area`

- Fonte canônica: `apps/web-tenant/public/favicon.svg` e o nome móvel
  `PedeHub Lojista` já definido em `apps/web-tenant/capacitor.config.ts`.
  Os recursos template do Capacitor (`My App` e ícone/splash genéricos) foram
  substituídos por launcher, round/adaptive icon e splash derivados do SVG.
- `LocalNotifications` agora usa o vetor monocromático
  `drawable/ic_stat_pedehub.xml`, com tint `#22c55e`; o canal
  `new-orders-v2` e o chime não foram alterados.
- `pnpm --filter @gestor/web-tenant build`, lint, typecheck, `check:no-any`,
  `check:features`, 22 testes de notificações e `git diff --check` passaram.
  `cap sync android` e `clean assembleDebug --stacktrace` passaram usando
  JBR 21 do Android Studio. O APK foi inspecionado por `aapt2`: label
  `PedeHub Lojista`, applicationId preservado `com.getcapacitor.app`,
  MainActivity launchable, launcher/round/adaptive icon e small icon presentes.
- Não havia alvo em `adb devices` nem AVD local; instalação e confirmação visual
  no launcher/configurações/diálogo permanecem pendentes. PR segue Draft;
  não houve deploy, merge, migration, lockfile ou dependência nova.

---

## Notificações mobile — lifecycle, permissões, safe area e áudio

Data: 2026-07-30

Branch: `fix/mobile-notification-lifecycle-safe-area`

Base: `origin/main-copy` / `ca762a79`

- `socket.disconnect` deixou de significar internet offline. Background/hidden
  suspende avisos; offline real usa debounce de 1,2 s; socket/serviço usa grace
  period de 5 s e health check WebSocket.
- Conectividade é visual, deduplicada e silenciosa. Novo pedido mantém som,
  liderança multi-tab e dedupe por pedido.
- Preferência sonora ficou durável, versionada e isolada por tenant/usuário.
  O onboarding web/nativo ocorre por gesto, não repete `denied` automaticamente
  e possui fechamento acessível.
- Toasts possuem `aria-label="Fechar notificação"`, Escape, máximo de dois e
  pilha sem sobreposição. Banner inferior e toasts respeitam safe areas, header
  mobile e landscape.
- Novo chime Web Audio tem duração superior a 1 s. Android usa canal
  `new-orders-v2` e WAV original de 1,48 s, pico 0,86.
- Não existe push nativo/FCM; alertas com tela desligada não são prometidos e
  permanecem como PR separada.
- Gates: web-tenant lint, typecheck, build, 10 arquivos/46 testes,
  `check:no-any`, `check:features`, diff-check e E2E visual mobile passaram.
  `npx cap sync android` passou e confirmou Local Notifications 7.0.6.
- Pendente: `assembleDebug` e validação em dispositivo. O ambiente não possui
  Java/JDK (`JAVA_HOME` ausente; Gradle exit 9009).
- Nenhum Prisma, migration, analytics, billing, regra de pedido, dependência,
  lockfile, banco remoto ou deploy foi alterado.

---

## PR 2B - Performance API

Branch `feat/analytics-performance-api`, stacked on `feat/analytics-daily-rollups` at `a9d11ca7`.
Authenticated tenant-scoped routes under `/analytics/performance/*` expose overview,
funnel, products and partial UTM acquisition. Behavioral reads use daily rollups;
realized revenue and completed quantities use authoritative orders and order items.
Acquisition is deliberately `utm_tagged_only`: direct/unknown and channel revenue
are unavailable and must not be shown by UI. PR 3A owns direct/referrer,
first/last-touch and session-to-order attribution. No Prisma schema, migration,
rollup, worker, storefront, UI, provider or dependency change is part of this PR.

---

## Marco 2 — PR 2A agregação diária determinística de Analytics

Data: 2026-07-29

Branch: `feat/analytics-daily-rollups`

Base: `origin/main-copy` / `f4552d10`

- `AnalyticsDailyAggregate` usa chave lógica integralmente não nula por tenant,
  dia, evento, tipo e chave de dimensão. `overall` usa `__all__`; checks no
  PostgreSQL restringem taxonomia, dimensões, chave overall e métricas.
- O rollup lê `AnalyticsEvent` tenant-scoped em páginas, calcula overall,
  product, category e UTM, soma decimais sem ponto flutuante e substitui somente
  linhas alteradas dentro de transação serializável com advisory lock por
  tenant/dia. Replay idêntico não reescreve linhas.
- O bucket usa `TenantSettings.timezone` e Luxon. Timezone divergente de
  histórico já materializado falha fechada e exige migração explícita.
- A fila `analytics-rollup` processa `analytics.daily-rollup` com payload Zod,
  job ID determinístico compatível com BullMQ, 3 tentativas, backoff exponencial
  de 5 segundos e concorrência 2. Scheduler e worker ficam desativados por
  default; `NODE_ENV=test` não agenda.
- O scheduler recompõe 3 dias a cada 6 horas por default. Um slot determinístico
  no job ID impede duplicação entre boots/réplicas no mesmo período.
- O backfill exige tenant/from/to, limita 31 dias, rejeita produção/banco não
  efêmero e oferece `--dry-run`. A retenção é tenant-scoped, em chunks, sem
  scheduler e exige `ANALYTICS_RAW_RETENTION_ENABLED=true`.
- Migration PostgreSQL efêmera: exit 0. Provas focadas com PostgreSQL 16 e Redis
  7: 10 suítes / 42 testes, exit 0, cobrindo migration, unique/checks/FK/defaults,
  isolamento, dimensões/somas/sessões, determinismo, timezone/boundary, late
  events, concorrência, rollback, fila/jobId/retry, backfill e retenção.
- Backfill efêmero: dry-run exit 0 e 0 escritas; execução exit 0 e 1 agregado com
  `eventCount=1` / `valueSum=12.50`.
- Gates locais: types build, API lint, API build, typecheck, check:no-any,
  check:features e diff-check em exit 0. O comando regex literal
  `test -- analytics` colide com o nome absoluto desta worktree e seleciona
  testes alheios; o gate equivalente por `--runTestsByPath` executou somente os
  10 arquivos canônicos de Analytics e passou.
- Nenhum storefront, web-tenant, regra de pedidos, provider, dependência,
  lockfile, banco remoto, migration de produção, merge ou deploy foi alterado.

DEFERIDO PARA MARCO 2 FINAL: Playwright, screenshots, light/dark/mobile,
validação visual do dashboard, teste de carga amplo, p95 de produção,
comparação manual de todas as métricas e GA4/Meta/Ads.

Status: implementação e gates locais concluídos. Draft PR #30 publicada contra
`main-copy`; code head validado `bdb791ed`. CI do SHA final da documentação
ainda pendente neste ponto do handoff. Nenhum merge ou deploy realizado.

---

## Marco 1 — PR 1C eventos autoritativos de pedido (Draft publicada)

Data: 2026-07-29
Branch: `feat/order-analytics-authoritative`
Base: `feat/storefront-analytics-dispatcher` / `31de6fbf76505e08f9de0d969780f3c09d36cc4a`

- O backend origina `order_confirmed`, `order_completed` e `order_cancelled` no serviço central de transição e no caminho de confirmação de PDV.
- Cada evento é gravado na mesma transação do pedido, é `source: server`, tenant-scoped, sem dependência do browser e sem PII.
- O `eventId` é determinístico por `(tenantId, orderId, eventName)` e usa `skipDuplicates`, protegendo reprocessamentos sem duplicidade.
- Eventos usam `schemaVersion: 1`, `sessionId` técnico não persistente de browser, `consentAnalytics: true`, `consentMarketing: false` e valor/currency do pedido.
- Testes focados de analytics passaram: 2 suítes / 10 testes. API build e lint passaram. O teste legado de atomicidade não iniciou por resolução de `@gestor/core` na worktree isolada; não houve falha funcional observada nesse caminho.
- Nenhuma migration, alteração de schema, provider, dependência, lockfile, banco remoto, merge ou deploy foi realizado.

Status: PR #29 Draft publicada; validação consolidada local passou em 1 suíte / 3 testes. Novo SHA aguarda CI remoto. Nenhum merge ou deploy realizado.

---

## Marco 1 — PR 1B storefront analytics dispatcher (Draft local)

Data: 2026-07-29
Branch: `feat/storefront-analytics-dispatcher`
Base: `feat/analytics-event-ingestion` / `bdd194d7162645dc69042a9012a4fecd23cf53f5`

- Reutiliza `AnalyticsEventEnvelopeV1`, `AnalyticsConsentSnapshotV1`, a taxonomia browser e o consent manager canônicos.
- Implementa sessão efêmera tenant-scoped em `sessionStorage`, rotação após 30 minutos, fallback em memória e limpeza por tenant na revogação; não adiciona visitorId, fingerprint ou fila persistente.
- Implementa dispatcher first-party com validação Zod v1, lotes de até 20, flush curto, retry limitado preservando eventId e descarte seguro em revogação.
- Instrumenta menu, seleção/detalhe de produto, add/remove, abertura do carrinho, início do checkout e submissão somente após resposta 2xx. Não envia tenantId, PII ou metadata irrestrita.
- Alterações limitadas ao storefront e testes focados; Prisma, migration da 1A, API, providers, dependências e lockfile não foram alterados.
- Gates locais: types build, storefront lint, storefront tests (6 arquivos / 32 testes), storefront build, typecheck, check:no-any, check:features e diff-check passaram. Lint mantém 17 warnings preexistentes, sem erros.
- Playwright completo, dois tenants no navegador, offline real, screenshots, carga, funil consolidado e eventos autoritativos da PR 1C permanecem deferidos para o Marco 1 final.

Status operacional: branch ainda não publicada; nenhum merge, deploy ou acesso a banco remoto realizado.

---

## PR 1A — ingestão segura de eventos de analytics (Draft publicada, CI verde)

Data: 2026-07-29
Branch: `feat/analytics-event-ingestion`
Base: `origin/main-copy` / `f41d488d`

- Adicionados o modelo tenant-scoped `AnalyticsEvent`, migration explícita `20260729120000_add_analytics_event_ingestion` e índice único `(tenantId, eventId)`.
- A rota pública proposta é `POST /public/storefront/:slug/analytics/events`. Ela resolve o tenant somente pelo slug, usa o contrato Zod v1 estrito, aceita no máximo 20 eventos, aplica o consent gate, restringe eventos a browser, valida referências por `tenantId`, limita timestamps e usa `createMany(skipDuplicates)` para deduplicação protegida pelo banco.
- Testes focados passaram: contrato e serviço de ingestão, 2 suites / 16 testes. Lint da API passou.
- Não houve alteração do runtime do storefront, provider, dashboard, dependências, lockfile, banco remoto, migration de produção, merge ou deploy.
- A Draft PR #27 foi validada no head real `bdd194d7162645dc69042a9012a4fecd23cf53f5`. A CI validou `build-and-migrate`, `Ephemeral PostgreSQL proof`, `smoke-with-ephemeral-seed`, typecheck/build incluídos nos quality gates e os checks globais, todos com sucesso. Estado da PR: `OPEN`, `Draft`, `CLEAN`.
- Os gates locais de migration, build e typecheck permanecem inconclusivos por Docker indisponível/limite de 120s, mas foram substituídos pela validação equivalente da CI.

### Contrato para PR 1B (somente após a PR 1A verde)

- rota: `POST /public/storefront/:slug/analytics/events`
- request: `{ events: AnalyticsPublicBrowserEventV1[] }`, máximo 20
- response: `{ accepted, duplicates, ignored }`
- consent rule: `analytics=false` retorna sucesso estável e não persiste
- branch base: `feat/analytics-event-ingestion`
- HEAD SHA: `bdd194d7162645dc69042a9012a4fecd23cf53f5`

title: Handoff — Sprint 5B Reconciliação e Operação iFood
status: current
owner: engineering
last_verified: 2026-07-28
verified_against: feat/storefront-consent-foundation / 5a3422a4 (base)
---

## Fundação mínima de consentimento do storefront (PR 0B)

Data: 2026-07-28

Branch: `feat/storefront-consent-foundation`

Base: `origin/main-copy` / `5a3422a4`

- O storefront público agora resolve consentimento somente depois de obter o identificador confiável do tenant e persiste uma decisão versionada em chave isolada por tenant.
- O contrato compartilhado Zod/TypeScript mantém `necessary: true`, inicia `analytics` e `marketing` em `false`, registra versão da política, versão do schema, origem e timestamps, e produz o snapshot compatível com a fundação de Analytics da PR 0A.
- O banner permanece no fluxo do documento e não cobre carrinho, checkout ou CTA de instalação. A ação permanente no rodapé reabre um diálogo acessível com foco inicial, trap de foco, `Escape` e restauração de foco.
- Aceitar tudo, aceitar somente necessários, personalizar, salvar preferências e revogar foram implementados. Decisão ausente, inválida ou de versão antiga falha fechada e volta a exibir o banner.
- Carrinho, autenticação de cliente, tema, PWA/cache e tracking funcional existente foram classificados como storage necessário e não são apagados nem condicionados por esta fundação.
- Testes Node cobrem contrato, persistência, `default deny`, versão e isolamento. O E2E real cobre sete cenários, incluindo reload, revogação, tenant A/B, política antiga, teclado e ausência de overflow, com oito capturas light/dark em desktop e mobile.
- Gates locais: `pnpm lint` exit `0` (16 warnings preexistentes no storefront); `pnpm typecheck` exit `0`; build e testes focados do storefront exit `0` (4 arquivos, 26 testes); build de `@gestor/types`, `check:no-any`, `check:features` e E2E exit `0`.
- Escopo excluído: ingestão de eventos, GA4, Meta Pixel, Google Ads, cookies opcionais, backend/Prisma/migrations, providers, banco remoto e deploy.
- Pendente: commits, push, Draft PR contra `main-copy` e CI no SHA publicado. Merge e deploy permanecem proibidos.

## Fundação canônica de Marketing Analytics do cardápio

Data: 2026-07-28

Branch: `feat/marketing-analytics-foundation` (PR #25, mergeada)

Merge em `main-copy`: `5a3422a4`

- A auditoria foi versionada sem alterar suas 24 seções. O drift direcionado desde `9d04645e` ficou vazio; o único delta global, `DriverSelectionModal.tsx`, foi classificado como sem impacto.
- A ADR define analytics first-party como fonte do dashboard, separa comportamento/domínio/provider e formaliza métricas, consentimento default deny, PII, atribuição, retenção, escala, threat model e plano de PRs.
- O contrato `schemaVersion: 1` exporta 14 eventos de browser e 3 eventos autoritativos de servidor por união discriminada e schemas Zod estritos. O envelope público não aceita `tenantId`, metadata livre, PII ou currency diferente de BRL.
- Escopo alterado: documentação, `packages/types` e um teste contratual; Prisma, migrations, runtime, providers, dependências, lockfile e CI permanecem inalterados.
- Gates locais finais: `pnpm lint` exit `0` (16 warnings preexistentes no storefront); `pnpm typecheck` exit `0`; `pnpm --filter @gestor/types build` exit `0`; teste focado Jest exit `0` (1 suíte, 11 testes); lint focado do teste exit `0`; `pnpm check:no-any` exit `0`; `pnpm check:features` exit `0`; `git diff --check` exit `0`.
- `@gestor/types` não possui scripts próprios de lint ou teste. O lint raiz e o Jest existente da API foram usados, sem adicionar scripts ou dependências.
- A validação na worktree reutilizou a instalação local existente por junctions ignoradas pelo Git; nenhum pacote foi instalado. Nenhum banco, provider, deploy ou migration foi acessado.
- PR #25 mergeada; CI pós-merge verde. O runtime de produção permaneceu inalterado e não houve deploy.

## Dashboard comercial premium do tenant

### Consistência de tema (pendente de prova visual autenticada)

Data: 2026-07-28
Branch: `fix/dashboard-theme-consistency`
Base: `main-copy` / `17e436a7`

- O pulso de operação deixou de usar superfície escura fixa: light usa fundo branco, borda clara e texto escuro; dark usa superfície elevada, borda escura e texto claro.
- O menu de ações rápidas agora declara explicitamente superfície e texto para ambos os temas, com hover, foco e estado disabled legíveis.
- A validação automatizada local cobre os pares de tema do status e os estados de ação. A prova autenticada foi adicionada à CI com PostgreSQL efêmero, seed suportado, login e seis capturas light/dark. O tenant efêmero agora recebe onboarding concluído somente sob `NODE_ENV=test`, pois o dashboard é corretamente bloqueado pelo `OnboardingGuard` em tenants pendentes. O login local disponível retornou `Credenciais inválidas ou erro no servidor`, portanto nenhum banco remoto foi acessado.

Data: 2026-07-28
Branch: `feat/premium-commercial-dashboard`
Base: `main-copy` / `e07ed925`

- O dashboard foi reorganizado como central operacional compacta: status real da loja, fluxo do dia e ação contextual aparecem na primeira dobra.
- KPIs, fluxo, atenção, receita, canais, cozinha, produtos, horários de pico e delivery usam apenas os contratos existentes.
- O seletor acessível oferece Hoje, Ontem e Últimos 7 dias. `/analytics/dashboard` consulta o período escolhido e o período anterior equivalente; comparações sem baseline válido aparecem como indisponíveis.
- Receita, ticket e produtos são rotulados como dados de pedidos concluídos. `cancellationRate` é exibido diretamente, sem multiplicação adicional.
- Status aberto/fechado/pausado deriva de `/tenant/me`, timezone, horários e pausa manual. Billing é permissionado por `billing.read` e reduzido a aviso compacto.
- Receita horária, impressora, SLA real e cozinha no prazo não existem no contrato atual e não foram simulados.
- `SetupWizard` foi preservado. Sidebar/AppLayout, backend, Prisma, migrations, auth, RBAC e regras de pedidos/KDS não foram alterados.
- Analytics exige simultaneamente `reports.read` e o módulo `reports`; sem o módulo, a consulta não é disparada e a UI mostra o estado de acesso indisponível sem falso erro parcial.
- Testes cobrem derivações puras, períodos, gating, estado vazio, conteúdo suportado e ausência de detalhes técnicos da sessão.
- Gates finais: lint `0`; 33 testes web `0`; build web `0` (5692 módulos); typecheck raiz `0`; check:no-any `0`; check:features `0`; diff-check `0`.
- A validação visual autenticada usou `http://localhost:5173` com fixture local e plano local ativado pela API suportada, sem banco remoto ou provider real. Capturas dark em 1440×900, 1366×768, 1024×768 e 390×844, mais light em 1440×900, ficaram sem overflow horizontal em `qa-artifacts/dashboard-premium/` (não versionado).
- A avaliação visual independente terminou `PASS` (8/12), sem bloqueadores. O aviso global de desbloqueio sonoro sobrepõe parte do cabeçalho no mobile e permanece fora deste escopo por pertencer ao layout global.

---

# Handoff — Sprint 5B: Reconciliação e Operação iFood

## UX de ativacao sonora

Data: 2026-07-28
Branch: `fix/notification-sound-activation-ux`
Base: `main-copy` / `e07ed925`

- Preferencia local de som permanece ativa por padrao, enquanto `AudioContext` usa estados reais e nao persistidos: `not-created`, `suspended`, `running`, `closed` e `unavailable`.
- O banner grande pertence apenas ao primeiro mount da sessao: nao e recuperado por rota, foco, visibilitychange ou reconexao. A ativacao bem-sucedida registra a dispensa da sessao e o remove imediatamente.
- O banner bloqueado exibe somente Ativar sons; Testar som so aparece na configuracao quando o contexto esta `running`. Erros de `resume()` viram Tentar novamente, sem expor detalhes tecnicos ao operador.
- Mobile posiciona o CTA na parte inferior, sem cobrir header ou menu. Sidebar, eventos, deduplicacao, lideranca e browser notification leader-only permanecem inalterados.
- Gates: lint `0`; testes web `0` (6 arquivos / 28 testes); build web `0`; typecheck raiz `0`; check:no-any `0`; check:features `0`; diff-check `0`.
- Pendente somente a captura autenticada: API local indisponivel e `apps/api/.env` aponta para host remoto, que ficou fora do escopo. Nenhum banco remoto, provider, push, PR, merge ou deploy foi usado.

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

---

## Atualização RC — migration de branding aprovada e validada

Data: 2026-07-16
Branch: `release/ifood-staging-rc`

### Alteração entregue

Migration exclusivamente aditiva: `20260716210000_add_system_config_platform_logo_media`.

```sql
ALTER TABLE "system_configs"
  ADD COLUMN "platform_logo_media_id" TEXT;

CREATE INDEX "system_configs_platform_logo_media_id_idx"
  ON "system_configs"("platform_logo_media_id");

ALTER TABLE "system_configs"
  ADD CONSTRAINT "system_configs_platform_logo_media_id_fkey"
  FOREIGN KEY ("platform_logo_media_id")
  REFERENCES "media_assets"("id")
  ON DELETE SET NULL
  ON UPDATE CASCADE;
```

Não houve `prisma db push`, alteração destrutiva, acesso remoto adicional, nem mudança de schema fora desta coluna, índice e FK. A confirmação no PostgreSQL local foi: `media_assets.id = text`, compatível exatamente com a nova coluna `text`.

### Validação local/efêmera

Antes de cada comando Prisma, `DATABASE_URL` e `DIRECT_URL` foram sobrescritas e validadas como PostgreSQL local em `127.0.0.1:55433`, apontando para o mesmo banco efêmero. A execução abortaria para host/porta/esquema diferentes.

| Cenário | Resultado |
|---|---|
| Banco vazio | PASS, 47 migrations |
| Upgrade pré-5A | PASS, 47 migrations |
| Upgrade 5B | PASS, 47 migrations |
| Upgrade 5C | PASS, 47 migrations |
| Redeploy sobre 5C + branding | PASS, sem migrations pendentes |
| `prisma migrate diff` pós-migration | PASS, migration vazia |
| `pnpm prisma:validate` | PASS |
| Smoke de startup que falhava em `P2022` | PASS, Nest iniciou sem `P2022`; filas e automações desabilitadas |
| `pnpm --filter @gestor/api test` | PASS |
| `pnpm typecheck` | PASS |
| `pnpm build` | PASS |

Checksum SHA-256 do arquivo e checksum registrado pelo Prisma: `510ce2bc60f3467cfe48614f7dbc9fc9cafe82e38c423d45f02d1c8dbef5dcf2`.

### Go/no-go e incidente separado

O RC passa a **go para staging somente como artefato validado localmente**; não autoriza aplicar migrations ou ativar polling em staging/produção. Polling continua desabilitado por padrão e protegido pelos kill switches.

O incidente histórico de `DIRECT_URL` permanece separado e aberto: antes de qualquer staging ou produção, o responsável pelo banco deve identificar formalmente o banco remoto afetado, conferir `_prisma_migrations`, confirmar backup recuperável e demonstrar que apenas as migrations aditivas 5A–5C foram aplicadas. Esta sessão não realizou nova consulta nem qualquer alteração remota.

---

## Segurança do startup e migration operacional no Dokploy

Data: 2026-07-16
Branch: `fix/production-entrypoint-safety`
Base: `main-copy` / `6cdd98a3`

### Objetivo e decisões

O startup normal da API foi separado da gestão de schema. `docker-entrypoint.sh` agora valida somente a presença de `DATABASE_URL` e `DIRECT_URL`, não imprime valores, não executa limpeza ou migration e delega ao `CMD` da imagem com `exec`. O `CMD` inicia diretamente o artefato Node compilado.

O Compose de produção ganhou o serviço manual `api-migrate`, isolado pelo profile `operations`, com `restart: "no"` e comando exclusivo `npx prisma@5.22.0 migrate deploy`. O serviço não possui dependência da API, seed ou limpeza e não participa do `docker compose up` padrão.

`clean_db.js` deixou de ser copiado para a imagem, foi desacoplado de `prisma:migrate:deploy`, exige `CLEAN_DB=true` em comando local explícito e falha fechado em `NODE_ENV=production`.

Durante a validação efêmera foi identificado que `.dockerignore` não excluía arquivos `.env`. Como o Dockerfile usa `COPY . .` no estágio de build, isso poderia incluir um `.env` local no contexto. A correção passa a excluir `.env` em qualquer diretório, preservando apenas arquivos `.env.example`; o build posterior confirmou que `prisma generate` carregou somente o schema, sem carregar `.env`.

### Arquivos e contratos afetados

- startup/infra: `.dockerignore`, `apps/api/docker-entrypoint.sh`, `apps/api/Dockerfile`, `docker-compose.prod.yml`, `apps/api/package.json`, `apps/api/clean_db.js`;
- operação: novo `docs/operations/runbooks/dokploy-deployment.md` e atualizações no rollout iFood, índice documental, ambiente, pacote Dokploy histórico e `AGENTS.md`;
- nenhum schema, migration, contrato REST, feature flag ou comportamento de domínio foi alterado.

### Validações

| Comando | Resultado |
|---|---|
| baseline e final `pnpm lint` | PASS; 16 warnings React preexistentes |
| baseline e final `pnpm typecheck` | PASS |
| `pnpm build` | PASS; warnings preexistentes de chunk size |
| `pnpm test` | PASS: API 43 suítes/178 testes; web-admin 10; web-tenant 12; storefront 1 |
| `pnpm prisma:validate` com ambas URLs sobrescritas para host local | PASS |
| `pnpm check:no-any` | PASS |
| `docker compose -f docker-compose.prod.yml config --quiet` com URLs fictícias | PASS |
| runtime direto de `docker-entrypoint.sh` com placeholders | PASS; somente startup e comando delegado, sem secret ou migration |
| prova PostgreSQL 16 efêmera | NÃO CONCLUÍDA: Docker Desktop perdeu o daemon durante o build, antes de qualquer migration |

Nenhum deploy, banco remoto, migration, seed, limpeza, push ou merge foi executado. Os kill switches do iFood permaneceram inalterados e desligados.

Tentativa posterior de prova efêmera: o build passou por `prisma generate` e pela compilação da API sem carregar `.env`, mas o Docker Desktop ficou bloqueado ao transferir a imagem final. Nenhum container de teste, migration, seed ou limpeza foi iniciado; os arquivos temporários de Compose e variáveis fictícias foram removidos.

### Pendência e próximo passo

Repetir a prova efêmera quando o daemon Docker estiver saudável: comprovar startup sem `_prisma_migrations`, duas execuções idempotentes de `api-migrate`, isolamento de falha e startup da API após schema aplicado. Depois revisar o diff e obter aprovação explícita antes de integrar em `main-copy`; não fazer deploy automaticamente.

---

## Metadados dinâmicos do storefront e títulos de abas

Data: 2026-07-17
Branch: `feat/dynamic-meta-and-page-titles`

### Objetivo e auditoria

O storefront é uma SPA Vite, mas a imagem de produção já inicia `apps/web-storefront/server.js`, um servidor Express que entrega o `index.html` inicial. A implementação anterior de SEO estava incompleta: buscava a rota inexistente `/storefront/:slug`, não escapava HTML, não emitia canonical/`og:url` e não normalizava imagens para URL absoluta. Alterações de título, favicon e descrição no React ocorrem somente após a API responder no navegador e, isoladamente, não atendem crawlers de compartilhamento.

O tenant é resolvido pelo primeiro segmento da rota pública e pelo endpoint `GET /public/storefront/:slug`; a identidade disponível sem alteração de schema é nome do tenant, `TenantSettings.logoUrl` e hero/banner em `storefrontThemeJson`. A biblioteca de mídia existente continua sendo a responsável por URLs públicas. Não existem campos específicos persistidos para descrição social, imagem social ou favicon; não foram criados campos nem uma segunda infraestrutura de upload. O fallback de descrição é o texto público padrão e a ordem de imagem é banner, logo e logo global.

O nome global canônico vem de `SystemConfig.appName`; a logo global vem de `SystemConfig.platformLogoMedia`. Foi exposto somente esse payload público e não sensível em `GET /public/storefront/branding` para permitir o fallback do renderizador. O painel tenant já concentrava labels de menu e breadcrumb em `SIDEBAR_GROUPS`; o painel SaaS Admin faz o mesmo. Os títulos da aba agora reutilizam essas configurações, com exceções amigáveis para páginas de detalhe.

### Alterações feitas

- `apps/web-storefront/server.js`: corrigida a chamada da API pública, HTML inicial com title, description, canonical, Open Graph, Twitter Card, manifest e favicon por tenant; sanitização de conteúdo HTML, URLs absolutas e cache local de cinco minutos.
- `apps/api/src/storefront/storefront.controller.ts` e `storefront.service.ts`: endpoint público mínimo de branding global, sem dados internos ou segredos.
- `apps/web-tenant/src/layouts/AppLayout.tsx`: título `{systemName} - {label atual}` sincronizado com breadcrumb/menu.
- `apps/web-admin/src/layouts/AppLayout.tsx`: título dinâmico baseado no menu, incluindo detalhes conhecidos de tenant e cardápio base.

### Validações

| Comando | Resultado |
|---|---|
| `pnpm --filter @gestor/web-storefront build` | PASS |
| TypeScript API, web-tenant e web-admin | PASS |
| `node --check apps/web-storefront/server.js` | PASS |
| `pnpm --filter @gestor/api test -- storefront.service.spec.ts` | PASS, 1 suíte/1 teste |
| `pnpm --filter @gestor/web-storefront test` | PASS, 1 arquivo/1 teste |
| `git diff --check` | PASS |

### Limitações e próximo passo

O servidor atualiza o cache interno em até cinco minutos; previews já guardados por WhatsApp/Facebook/LinkedIn/Telegram dependem do cache de cada plataforma e não são invalidáveis pela aplicação. Antes de publicação, confirmar que o deploy do storefront utiliza `Dockerfile.storefront`/`server.js`, pois um host que sirva apenas o build estático continuará sem metatags por tenant no HTML inicial. Não houve migration, acesso a ambiente remoto, deploy, push ou merge.

---

## Sprint 6A — núcleo operacional da loja

Data: 2026-07-21
Branch: `feat/sprint-6-operational-core`
Base: `main-copy` em `37ae8430`

### Alterações concluídas

- Perfil operacional acessível pela lista de clientes, com contatos, indicadores, ticket médio, último pedido, endereços, observações internas e os dez pedidos mais recentes. As consultas permanecem filtradas por tenant e usam as permissões CRM existentes.
- `GET /kds/print-jobs/:id` deixou de responder `NotImplementedException`; agora consulta o job e o pedido associado com filtro explícito do tenant e retorna 404 fora do escopo.
- Baixa teórica de estoque agrega a receita por insumo e executa em transação. Reexecuções de um mesmo pedido não duplicam movimentos; decrementos exigem saldo suficiente e toda a operação é revertida se algum insumo não puder ser baixado.

### Auditoria operacional

| Domínio | Estado | Evidência resumida |
|---|---|---|
| Perfil do cliente | Completo | rota CRM, RBAC, perfil e histórico recentes |
| PDV | Parcial | caixa obrigatório, idempotência e pedidos suportados; mesa ainda usa número visual |
| Caixa | Completo | abertura, suprimento, sangria, venda, fechamento e resumo por meio de pagamento |
| Impressão/reimpressão | Parcial | jobs, retry e fallback de navegador; hardware continua opcional |
| KDS | Parcial | estações, status, endpoint de job e polling de fallback |
| Estoque/ficha técnica | Parcial | receitas e reversão existem; baixa agora é idempotente e sem saldo negativo |

### Validações focadas

| Comando | Resultado |
|---|---|
| `pnpm --filter @gestor/api build` | PASS |
| `pnpm --filter @gestor/web-tenant build` | PASS; aviso preexistente de chunk grande |
| `pnpm --filter @gestor/api lint` | PASS |
| `pnpm --filter @gestor/web-tenant lint` | PASS |
| testes KDS/estoque focados | PASS, 2 suítes / 5 testes |
| `git diff --check` | PASS |

### Pendência e risco

Não houve migration, deploy, acesso a banco remoto, alteração de `main` ou ativação iFood. O vínculo de pedido de mesa continua por `tableNumber`, pois não há `tableId` no contrato atual; uma correção requer migration aditiva e revisão do ciclo de mesa antes de ser proposta.

---

## Sprint 6A — fechamento do retry serializável

Data: 2026-07-21
Branch: `feat/sprint-6-operational-core`

- POS, checkout público e baixa autônoma de estoque usam o mesmo wrapper `Serializable`, com no máximo três tentativas, retry exclusivo para Prisma `P2034` e backoff de 10ms/20ms limitado a 50ms.
- A unidade repetida inclui todas as escritas atômicas; WebSocket, KDS, WhatsApp e pagamentos externos continuam após o commit e são disparados uma única vez.
- Testes unitários cobrem sucesso após conflito, repetição da operação completa, limite de tentativas, preservação do último erro e ausência de retry para erros não `P2034`.
- PostgreSQL 16 local/descartável comprovou duas baixas realmente concorrentes: 1 movimento, saldo final 8 a partir de 10, sem saldo negativo, 1 pedido, 1 movimento de caixa, 1 cashback, 1 uso de cupom e 1 evento de receita. O container foi removido ao final.
- A CI executa essa prova no PostgreSQL efêmero do job após aplicar as migrations existentes.
- Gates globais: lint, typecheck, build, 51 suites/210 testes da API, testes dos frontends, Prisma validate, anti-`any`, features e diff-check aprovados.

Nenhuma migration ou alteração de schema foi criada; nenhum banco remoto, deploy, `main` ou `main-copy` foi alterado.

---

## Sprint 6C — CRM, campanhas e WhatsApp

Data: 2026-07-22
Branch: `feat/sprint-6c-crm-campaigns-whatsapp`

- `CustomerOptOut` permanece o modelo canônico e tenant-scoped, com unicidade
  `(tenantId, phone)`. O `customerId` passou a ser opcional para registrar o
  pedido recebido antes de existir vínculo com cliente; a FK usa `ON DELETE SET
  NULL`. Não existe segundo modelo concorrente de opt-out.
- O webhook normaliza telefone e palavras-chave, usa upsert idempotente antes da
  deduplicação da mensagem e não despacha o fluxo pesado de IA para opt-out.
- A migration `20260722120000_campaign_status_and_opt_out_compatibility`
  converte `running` para `processing` e `paused` para `cancelled`, preservando
  dados existentes. A máquina passa a usar `draft`, `scheduled`, `queued`,
  `processing`, `completed`, `failed` e `cancelled` na API, tipos e UI.
- Jobs validam campanha, dispatch, cliente e tenant antes do provider. IDs de
  BullMQ são determinísticos, sucesso persistido não é reenviado e a fila exige
  os três kill switches de Redis, BullMQ e campanhas.
- Quiet hours usam `TenantSettings.timezone`; timezone ausente ou inválido tem
  fallback explícito para `America/Sao_Paulo`.
- A Inbox continua canonicamente em `ChatSession` e `ChatMessage`. Mensagens de
  campanha gravam `campaignId` e `dispatchId` em `metadata`; nenhum
  `MessageHistory` paralelo foi criado.
- PostgreSQL 16 efêmero validou banco vazio, base populada pré-migration e
  reaplicação. Redis/BullMQ efêmero validou deduplicação, retry limitado,
  backoff, falha final e recuperação. O smoke integrado usou exclusivamente
  provider fake e comprovou envio elegível, opt-out com motivo, reentrega sem
  duplicação, resposta fake e ordenação da Inbox.

Nenhum banco remoto ou provider real foi acessado. Não houve deploy, merge,
alteração de `main`/`main-copy` ou aplicação/remoção de stash.

---

## Sprint 6B.2 — relação persistida Pedido–Mesa

Data: 2026-07-22
Branch: `feat/sprint-6b2-table-relation`

- Migration aditiva cria `Order.tableId` nullable, FK para `DineInTable` com `ON DELETE SET NULL` e índice `(tenantId, tableId)`; `tableNumber` não foi removido.
- O backfill normaliza espaços e só relaciona pedidos com uma única mesa de mesmo tenant. Sem correspondência e nomes ambíguos ficam nulos; a instrução é idempotente.
- PDV, garçom e criação pública escrevem `tableId` e o snapshot visual em conjunto. A API rejeita mesa inexistente/cross-tenant e conflito entre ID e nome; claim, transferência e liberação terminal usam `activeOrderId` de modo atômico e tenant-scoped.
- A UI seleciona mesas do salão pelo ID. Leituras devolvem resumo da relação quando ela existe e preservam o fallback por `tableNumber`; impressão continua baseada no snapshot legível.

PostgreSQL 16 local/descartável aplicou as 48 migrations, incluindo `20260722090000_add_order_table_relation`; a prova cobriu backfill unívoco, ambíguo e sem correspondência, FK/índice, `ON DELETE SET NULL` e reexecução idempotente. O container foi removido ao final. Nenhum banco remoto, deploy, merge, `main` ou `main-copy` foi alterado; o stash preexistente deve ser preservado.

---

## Refinamento visual — Configurações do Tenant

Data: 2026-07-24
Branch: `feat/settings-ui-refinement`
Working tree inicial: `M apps/web-tenant/src/features/settings/SettingsPage.tsx` + `?? scripts/screenshot-settings.ts`

- `apps/web-tenant/src/features/settings/SettingsPage.tsx` foi refinada visualmente sem mudar rotas, APIs, payloads, regras de negócio, sidebar ou RBAC.
- As abas Loja, Endereço, Fiscal & Pagamento e Horários agora compartilham container, navegação responsiva com estados ativo/foco, cards e ações de salvamento contextuais.
- Loja, endereço, pagamentos, upload de logo e horários preservam os handlers existentes; as mudanças são somente de estrutura visual, texto e acessibilidade.
- A correção estrutural removeu a coluna vazia do conteúdo e alinhou painéis, cards e barras de salvamento à largura das abas; a Loja usa uma grade 7/5 (Cardápio Base 7/12 + Status 5/12) e os demais painéis usam a grade de 12 colunas full-width no desktop.

### Gates determinísticos (exit codes)

| Gate | Exit code | Últimas linhas |
|---|---|---|
| `pnpm --filter @gestor/web-tenant build` | 0 | tsc --noEmit + vite build; 5686 modules; dist/index.html + CSS/JS gerados |
| `pnpm typecheck` (todos os apps) | 0 | api/web-tenant/web-admin/web-delivery/web-storefront sem erros |
| `pnpm check:no-any` | 0 | Auditoria anti-any concluída, nenhuma tipagem frouxa |
| `pnpm check:features` | 0 | Validação de stubs e gaps concluída; NotImplementedException somente em split-payment (preexistente) |

### Sessão autenticada e ambiente

- Banco: PostgreSQL 16-alpine em Docker (local/efêmero), porta host 5433, container `gestor-delivery-postgres`.
- Redis: 7-alpine em Docker (local), porta 6379, container `gestor-delivery-redis`.
- Conta de seed (seed oficial do repositório, conta não-efêmera): `demo@demo.com` / `demo123` / tenant `pizzaria-demo` (Pizzaria Demo).
- 49 migrations aplicadas via `prisma migrate deploy`, seed completo via `prisma:seed` (permissions, roles, billing foundation, base menus, tenant Pizzaria Demo, catálogo, 12 mesas dine-in).
- Nenhum banco remoto acessado. Nenhum bypass de autenticação. Backend/Prisma/migrations não foram alterados.

### Screenshots geradas (Playwright headless, storageState via localStorage inject)

Diretório (não versionado): `tmp/settings-visual-proof/`

**1440×900:**
- Loja → `settings-loja-1440x900.png`
- Endereço → `settings-endereco-1440x900.png`
- Fiscal & Pagamento → `settings-fiscal-pagamento-1440x900.png`
- Horários → `settings-horarios-1440x900.png`

**1366×768:**
- Loja → `settings-loja-1366x768.png`
- Endereço → `settings-endereco-1366x768.png`
- Fiscal & Pagamento → `settings-fiscal-pagamento-1366x768.png`
- Horários → `settings-horarios-1366x768.png`

### Revisão visual rigorosa (APROVADO)

Verificado nas 8 capturas, zoom 100%, sidebar visível, sem skeleton/toasts cobrindo painéis:

- ✅ Abas/painéis alinhados (Δleft ≤ 2px e Δright ≤ 2px em ambos viewports)
- ✅ Identidade e Contato (Loja) = full-width
- ✅ Endereço (card + barra Salvar endereço) = full-width
- ✅ Dados Fiscais & Integração + Configuração de Pagamento = full-width cada
- ✅ Horário Semanal (cards de Domingo a Sábado) = full-width
- ✅ Cardápio Base (7/12) + Status da loja (5/12) = proporção 7:5 mantida em ambos viewports
- ✅ Sem espaço vazio estrutural à direita (coluna vazia eliminada)
- ✅ Sem card torto (todos cards com cantos arredondados consistentes)
- ✅ Sem scroll horizontal (scrollWidth ≤ clientWidth+4px)
- ✅ Sidebar inalterada (mesmos grupos: DASHBOARD/CARDÁPIO/PEDIDOS/LOGÍSTICA/PDV E CAIXA/GESTÃO/CRM E MARKETING/GESTÃO & PERFORMANCE/WHATSAPP/SISTEMA)

### Gates finais

| Gate | Exit code |
|---|---|
| `pnpm --filter @gestor/web-tenant lint` | 0 (max-warnings 0) |
| `pnpm --filter @gestor/web-tenant test` | 0 (5 arquivos / 14 testes PASS) |
| `git diff --check` | 0 |

### Pendências e decisão

- Nenhuma pendência objetiva. Todos exit codes = 0.
- Screenshots reais confirmam o alinhamento estrutural pretendido em 2 resoluções desktop.
- Nenhum push, PR, merge, deploy, stash apply/drop ou commit foi realizado até aqui.
- Próximo passo: commit somente de `SettingsPage.tsx` + `docs/handoffs/current-state.md` (o arquivo `scripts/screenshot-settings.ts` e o diretório `tmp/` permanecem fora do commit, conforme protocolo).

---

## R1 - checkout summary and submit safety

Data: 2026-08-01

- Branch `feat/go-live-r1-checkout-submit-safety`, baseada no merge da PR #36 em
  `origin/main-copy` (`2da1d750`). Checkout principal, worktrees R0/E0 e
  `stash@{0}` preservados.
- Frontend submit path: `CheckoutPage.tsx` monta `CreateOrderDTO` a partir do
  carrinho/formulário e chama `POST /orders/public-checkout/:slug` por
  `api-client.ts`.
- API route: `OrdersController.checkout`; server create path:
  `OrdersService.createOrder`; transaction boundary:
  `runSerializableTransactionWithRetry` cobrindo pedido, itens, endereço,
  timeline, mesa, estoque, cashback e cupom. Efeitos externos continuam depois
  do commit.
- Existing idempotency mechanism: **YES, completed in R1**. `Order` já possuía
  `idempotencyKey` e `@@unique([tenantId, idempotencyKey])`; R1 adiciona
  fingerprint versionado, rejeição de payload incompatível, recuperação da
  corrida `P2002` e guard síncrono no cliente.
- O resumo final usa o mesmo carrinho e estados que montam o payload e cobre
  itens, quantidades, opções, slots, observações, totais, descontos/cashback,
  entrega/retirada, endereço, pagamento e troco quando aplicáveis.
- Retry de erro de rede/timeout preserva a chave enquanto o payload não muda;
  erro HTTP definitivo libera nova tentativa; sucesso fecha o guard e navega
  uma única vez. Mudança material de payload altera automaticamente a chave.
- Nenhum Prisma/schema, migration, seed, dependência, lockfile, feature flag,
  E0-OPS, Dokploy, banco remoto ou deploy foi alterado.

---

## R0 Go-Live readiness - retomada funcional documental

Data: 2026-08-01

- Worktree `Gestor-Delivery-SaaS-PRO-go-live-audit`, branch
  `docs/go-live-readiness-audit`, iniciou limpa no SHA `0ecfe5df` (base E0
  `efbfefa3`). Checkout principal e `stash@{0}` foram preservados.
- CI pos-merge da E0: CI `30678152290` e Secret scanning `30678152243` PASS.
  O remoto `main-copy` avancou para `6e5acfa3`; nao houve merge dessa deriva na
  PR R0 documental.
- Auditoria estatica R1-R10 concluida em `docs/go-live/`. Nenhum novo P0 foi
  encontrado no preset estavel. `NotImplementedException` de split payment e
  feature beta, portanto fica fora do V1.
- R1/R2/R3/R4/R9 sao P1 de prova e ajuste limitado; R5-R8 sao P2; Google login
  esta fora do V1 sem decisao comercial. Nenhuma mudanca funcional, Prisma,
  migration, seed, dependencia, feature flag, producao, Dokploy ou banco remoto
  foi realizada.
- Decisao: P1 pode iniciar por R1, mas Go-Live definitivo continua bloqueado
  exclusivamente por E0-OPS (redeploy, revogacao global de `AuthSession` e
  smokes de nova sessao). E0H permanece follow-up sem reescrita.

---

## R0 Go-Live Readiness — interrompida por P0 de segurança

Data: 2026-07-31

Branch: `docs/go-live-readiness-audit`

Base: `origin/main-copy` / `6ed4c043e693bac98cb21509e87590f080d599f2`

- O checkout principal e `stash@{0}` foram preservados; a auditoria ocorreu em
  worktree isolada.
- PR #33 foi confirmada integrada no SHA-base. PR #34 permanece aberta, Draft e
  fora de `main-copy`.
- `.env.docker` está versionado e contém valores concretos para os dois secrets
  JWT. Os valores não foram copiados para o handoff.
- O arquivo está no histórico Git. O compose de produção atual lê `.env`, não
  `.env.docker`; o uso efetivo dos valores na VPS não foi verificado porque
  acesso à produção é proibido.
- O achado foi classificado P0 de segurança e acionou a stop-rule do briefing.
  A auditoria consolidada, o escopo do Go-Live, R1-R10 e os checklists não foram
  concluídos.
- Foram criados localmente apenas `docs/go-live/README.md`,
  `docs/go-live/readiness-audit-2026-07-31.md` e
  `docs/go-live/issue-matrix.md` para registrar o bloqueador.
- Baselines: `pnpm lint` exit 1 por `eslint` ausente; `pnpm typecheck` exit 1 por
  `tsc` ausente. Nenhuma dependência foi instalada.
- Nenhum código funcional, Prisma, migration, dependência, lockfile, feature
  flag, banco, produção ou deploy foi alterado.
- Nenhum commit, push, PR, merge ou deploy foi realizado.
- Próximo passo obrigatório: E0 emergencial para rotação dos secrets, invalidação
  de sessões, saneamento do arquivo/histórico e gate de secret scanning. Retomar
  a R0 somente após evidência da contenção.

---

## R4 - segurança da criação de filiais e bloqueio inicial

Data: 2026-08-01

- Branch `fix/go-live-r4-branch-creation-safety`, worktree isolada, baseada no
  merge da PR #40 em `origin/main-copy` (`940d60f8`). Checkout principal,
  `stash@{0}` e worktrees R0/R1/R2/R2.5/R3/E0 foram preservados.
- Auditoria canônica: `docs/audits/r4-branch-creation-safety-audit.md`.
  Filial é um `Tenant`; `TenantUser` é identidade tenant-scoped; a semântica
  aprovada é **CREATE NEW LINK**, sem `User` global ou membership separado.
- Constraint observada: `tenant_users_tenant_id_email_key`. O mesmo email em
  tenants distintos é permitido. O erro prova um vínculo preexistente no mesmo
  tenant-alvo, mas a primeira execução isolada do código auditado usa o UUID do
  novo Tenant; por isso nenhum `upsert` cego foi adotado.
- A criação agora relê matriz/grupo/owner dentro de transação `Serializable`,
  recupera somente estado completo equivalente por slug natural e retorna 409
  estável para conflito de slug ou de owner link. Todos os writes permanecem na
  mesma transação e não há efeito externo pós-commit.
- `branches.create` foi adicionada à resposta canônica de
  `/tenant/capabilities` com política de release OFF. O controller bloqueia o
  POST com HTTP 403 e código `BRANCH_CREATION_TEMPORARILY_DISABLED`; a UI consome
  a mesma capability, mostra indisponibilidade e mantém leitura das lojas.
- O cliente possui trava síncrona de reentrada além de `isPending`; erro HTTP
  estável continua mapeado para a mensagem do formulário.
- Testes focados: API branch/controller/feature-control e frontend safety PASS.
  Cobrem criação, vínculo owner, grupo na mesma transação, retry equivalente,
  conflito cross-group, permissão, P2002 específico, falha intermediária,
  capability server/client, leitura preservada, erro e double-submit.
- Gates locais PASS: install frozen, lint (0 erros; 17 warnings preexistentes no
  storefront), typecheck, check:no-any, check:features, API build, web-tenant
  build, web-admin build e diff-check.
- Prisma/schema/migration/seed, billing/subscription, dependência/lockfile,
  provider, credencial, E0-OPS, produção e deploy não foram alterados.
- R4 deve permanecer Draft e não deve ser integrada nesta sessão.

---

## R5 — paridade do preview administrativo com o storefront

Data: 2026-08-01

- Branch `fix/go-live-r5-storefront-preview-parity`, worktree isolada, baseada no
  merge da PR #41 em `origin/main-copy` (`7b9d89c6`). Checkout principal,
  `stash@{0}` e worktrees anteriores foram preservados.
- Auditoria canônica: `docs/audits/r5-storefront-preview-parity-audit.md`.
  O público já era autoritativo para catálogo, availability por fulfillment e
  ranking R2.5; o preview usava catálogo bruto, filtros, tema, categorias, cards
  e showcase manual reimplementados no navegador.
- Foi adicionada uma rota autenticada e tenant-scoped de preview. Ela reutiliza
  `StorefrontService.getStorefrontPayload`, aplica somente os overrides locais
  ainda não salvos, respeita delivery/pickup e não lê ou grava cache público.
- O editor agora consome `StorefrontPayload` e reutiliza `StorefrontShell`,
  `StorefrontThemeProvider`, `CategoryNavigation`, `ProductRenderer`, o adapter
  de produto e `SmartShowcase` compartilhados. O storefront público usa o mesmo
  adapter e showcase compartilhado.
- MANUAL, AUTOMATIC BEST_SELLING, AUTOMATIC PROMOTIONS e HYBRID permanecem
  resolvidos apenas no servidor, com ordem, deduplicação, maxItems,
  eligibility/availability e fallback canônicos. Não há ranking no browser.
- O estado não salvo continua local; não há autosave, publicação automática,
  versão draft persistida nem alteração da semântica de publicação.
- Não houve Prisma/schema/migration/seed, provedor externo, credencial,
  produção, Dokploy, deploy, E0-OPS ou refactor global de tema R6.
- Testes focados de API, showcase público e preview administrativo passam. Não
  existe fixture Playwright econômica para este editor; a validação visual
  pesada não foi criada.

---

## R6 - safe area, viewport mobile e consistência light/dark

Data: 2026-08-03

- Branch `fix/go-live-r6-mobile-safe-area-theme`, worktree isolada, baseada em
  `origin/main-copy` (`012795d3`). Checkout principal, alterações Android
  preexistentes, `stash@{0}` e worktrees anteriores foram preservados.
- Auditoria canônica: `docs/audits/r6-mobile-safe-area-theme-audit.md`.
- A causa do drawer no APK era estrutural: o drawer mobile é fixed e não herda
  o safe-left do app shell. O inset lateral agora pertence ao root do drawer
  somente abaixo do breakpoint desktop; header, footer e nav scrollável foram
  preservados.
- Bottom sheet, painel móvel do mapa, CTA do checkout e banner PWA usam os
  primitives safe-bottom existentes. Layouts mobile full-height confirmados
  usam `100dvh`; não houve substituição global de viewport.
- Tooltip portal, superfícies do delivery e CTA do checkout passaram a usar os
  tokens semânticos existentes. Preferência `system` do tenant/storefront agora
  acompanha mudanças do sistema sem perder persistência do usuário.
- Dez testes focados cobrem drawer, desktop, fixed actions, modal/portal,
  light/dark, persistência, tokens, checkout, delivery e `StorefrontShell`.
- Não houve API, Prisma/schema/migration/seed, dependência/lockfile, plugin
  Capacitor, branding/applicationId, E0-OPS, produção ou deploy.
- R1-R5 permanecem como contratos de regressão; a R6 deve permanecer Draft e
  não deve ser integrada nesta sessão.

---

## R7 - segmento canônico, uploads de branding e fallback de produto

Data: 2026-08-03

- Branch `feat/go-live-r7-branding-uploads-niche-fallback`, worktree isolada,
  baseada no merge da PR #44 em `origin/main-copy` (`0a434924`). Checkout
  principal, alterações Android preexistentes, `stash@{0}` e worktrees
  anteriores foram preservados.
- A decisão de escopo autorizou uma migration aditiva: enum
  `BusinessSegment` e `TenantSettings.businessSegment` nullable. Não existe
  default, backfill, `UPDATE`, drop ou rename; tenants existentes continuam
  `NULL` e o payload visual os normaliza para `OTHER`.
- O onboarding persiste apenas escolhas explícitas. Pular mantém `NULL`; não há
  inferência por nome, slug, produtos ou logs de importação. Settings permite
  editar o segmento sem alterar cardápio ou template.
- Logo e banner do onboarding agora usam os endpoints existentes de upload
  direto, com preview, substituição, remoção, estado de erro e os formatos já
  permitidos. A biblioteca permanece no cadastro e editor de produtos.
- `@gestor/storefront-ui` concentra a cadeia produto -> segmento -> genérico e
  a recuperação de URL quebrada. Storefront público, preview e SmartShowcase
  passam o mesmo `businessSegment`; fallback de categoria permanece desativado
  até certificação do campo legado.
- Assets neutros são WebPs gerados para o projeto e versionados, sem hotlink,
  dependência, provider, CDN ou credencial nova.
- Nenhuma migration remota/produção, seed, E0-OPS, Dokploy ou deploy foi
  executado. A R7 deve permanecer Draft e não deve ser integrada nesta sessão.

---

# Campaign BullMQ custom job ID compatibility

Data: 2026-08-10

- Branch `fix/campaign-bullmq-job-id`, baseada em `origin/main-copy` (`a2b35f15`).
- Corrigidos os IDs customizados de enqueue e reagendamento de campanhas para
  não usarem `:`, caractere rejeitado pelo BullMQ 5.76.5 nos IDs compostos.
- A semântica determinística, a idempotência, o `tenantId`, as três tentativas e
  o backoff exponencial de 5 segundos foram preservados.
- Testes unitários cobrem dispatch inicial, status e reagendamento, incluindo a
  ausência de `:` nos IDs enviados à fila.
- Validações locais: testes focados 3/3 PASS; domínio campaigns 16/16 PASS com
  2 integrações condicionais sem PostgreSQL/Redis ignoradas; lint global,
  typecheck global, lint/typecheck da API, `check:no-any` e `git diff --check`
  com exit 0.
- `check:boundaries` continua com exit 1 por duas importações preexistentes de
  `@gestor/storefront-ui` no preview de settings do web-tenant, já presentes no
  SHA-base e fora deste patch.
- Nenhum Prisma/schema/migration, feature flag, credencial, produção, Dokploy ou
  deploy foi alterado.

---

## Printing - experiência adaptativa e hardening do spooler

Data: 2026-08-10

- Branch `fix/printing-platform-ux`, worktree isolada, baseada em
  `origin/main-copy` (`681b2d1547e4bb14091c19860ac5b6ba6afb7009`). O checkout principal dirty e
  `stash@{0}` foram preservados.
- A UI de `/pos/printers` agora diferencia Android Capacitor, mobile web e
  desktop web sem usar viewport como capability. Android expõe somente
  Bluetooth pareado; mobile web somente impressão do navegador; desktop web
  oferece navegador e impressora térmica integrada via QZ. Bridge, USB direto e
  rede/IP direta não são exibidos.
- O assistente acessível usa diálogo modal, foco inicial/trap/restauração,
  Escape, radio groups, `aria-live`, loading e single-flight. O card principal
  lê somente o dispositivo persistido; seleção draft fica no diálogo.
- O spooler inicia automaticamente apenas para device ativo, configurado,
  auto-print habilitado e adapter compatível. Uma única instância executa por
  montagem, respeita 3000 ms, faz cleanup e limita feedback de erro de polling a
  uma atualização por 30 segundos.
- O claim de `PrintJob` é condicional e transacional, mantém stale-lock recovery
  de cinco minutos e garante um vencedor. Create/update validam `stationId` no
  tenant; claim/ACK/fail validam device e job no tenant e o dono do lock.
- Pedidos confirmados criam o recibo `MAIN` pelo serviço existente quando há
  impressora principal elegível. A chave
  `auto_print_<order>_<type>_<station>` preserva idempotência e não duplica os
  tickets KDS.
- Test print recebe `requestId` UUID por ação e usa single-flight no cliente;
  cliques posteriores podem criar novos jobs, enquanto o mesmo request continua
  idempotente.
- Gates: web-tenant lint/build PASS e 93/93 testes PASS; API lint/build PASS e
  384/384 testes executados PASS (9 testes condicionais skipped). Após o ajuste
  final que preserva o papel da impressora principal ao alterar preferências, o
  teste focado passou 16/16 e lint, `tsc` e Nest build passaram novamente; o
  rerun integral adicional foi encerrado pelo host com OOM nativo, sem falha de
  asserção. Typecheck, check:no-any, check:features e diff-check PASS.
  `check:boundaries` mantém exit 1 somente nas duas violações preexistentes de
  storefront preview; diff contra o SHA-base nesses arquivos teve exit 0.
- Contrato detalhado: `docs/printing-platform-experience.md`.
- QA visual autenticado e screenshots não foram produzidos: `agent-browser`
  0.33.2 encontrou o Chrome, mas o launch encerrou antes de criar
  `DevToolsActivePort`; a tentativa recomendada com `--no-sandbox` também
  falhou no host. Matriz, responsividade/safe-area e estados permanecem cobertos
  por testes de componente/contrato e build, mas hardware/visual real continua
  pendente.
- Não houve migration/schema, dependência/lockfile, plugin Capacitor, provider,
  credencial, produção, banco remoto, Dokploy ou deploy.
- Dívida remanescente: consolidar futuramente `/printing/spooler/*` e
  `/kds/spooler/*`; validar impressora Android real e QZ Tray real.

---
## Quick fix — categoria ativa no scroll do storefront

Data: 2026-08-11
## R12 PR B — construtor e operação tenant de rotas

Data: 2026-08-11
Branch: `feat/r12-tenant-route-builder`
Base: `origin/main-copy` / `288fe8ed` (merge da PR #63)

- Novos endpoints tenant-scoped entregam dados elegíveis do builder, rotas ativas, configuração de aceite e reorder versionado; criação + atribuição ocorrem na mesma transação serializável.
- Respostas usam DTOs compartilhados e não expõem objetos Prisma, PIN, histórico interno ou `tenantId` controlável pelo cliente.
- A tela de despacho agora monta uma rota com 1..N pedidos, permite ordenação manual por botões acessíveis, mostra rotas/paradas ativas e preserva cancelamentos/falhas/retornos visíveis.
- Apenas entregadores ativos, `available`, com turno ativo e sem rota ativa são oferecidos. Apenas pedidos `ready_for_delivery` sem parada ativa são oferecidos.
- A exigência de aceite é configurável por tenant e cada alteração gera `AuditLog` sem dado sensível.
- Os consumidores do quadro operacional e drawer criam rota canônica de uma parada em vez de usar atribuição direta. O endpoint legado de atribuição foi marcado com headers de depreciação.
- Realtime de pedidos invalida também builder/rotas em `orderCancelled`; polling de 15 segundos permanece como fallback.
- Sem migration, dependência, provider, mapa, otimização, financeiro, background tracking ou mudança de feature flag neste PR.

### Validação

- Testes focados da API: 2 suites/15 testes passaram, incluindo rota atômica com três pedidos e reordenação completa antes do início.
- Teste focado do web-tenant: 1 arquivo/2 testes passou.
- Suíte integral da API: 95 suites/412 testes passaram; 4 suites/9 testes condicionais foram ignorados.
- Suíte integral do web-tenant: 27 arquivos/109 testes passaram.
- Lint e build da API e do web-tenant, `pnpm typecheck`, `pnpm check:no-any`, `pnpm check:features` e `git diff --check` passaram com exit code 0. O build web manteve somente o aviso preexistente de chunk grande.
- `pnpm check:boundaries` manteve exit code 1 exclusivamente nas duas violações preexistentes em `StorefrontPreview.tsx` e `product-image-fallback.test.ts`; ambos estão sem diff contra `origin/main-copy`.
- A avaliação visual/estrutural independente do construtor retornou PASS. A captura autenticada não estava disponível no ambiente local, portanto a evidência funcional da tela ficou nos testes, lint, typecheck e build.

### Próximo passo

- PR C deve migrar `/delivery/driver/active-runs` para o DTO canônico e expor o lifecycle do turno/rota/paradas no app do entregador com eventos privados tenant+driver.

---

## R12 PR A — domínio de turnos e rotas multi-pedido

Data: 2026-08-11
Branch: `feat/r12-logistics-domain`
Base: `origin/main-copy` / `404f0dcb`

- Introduzidos, de forma aditiva, `DriverShift`, `DeliveryRun` e `DeliveryStop`, seus estados, relações tenant-scoped, snapshots e timestamps operacionais.
- A migration não cria corridas históricas. Constraints parciais impedem turno/rota ativos duplicados, pedido em duas rotas ativas e duas paradas atuais na mesma rota.
- `DeliveryRunsService` concentra as operações canônicas de turno, criação/atribuição/aceite/recusa/início/reordenação da rota, chegada/conclusão/falha/retorno/cancelamento das paradas e conclusão da rota.
- Operações usam transações serializáveis com retry. Reordenação usa versão otimista e aceita somente o conjunto exato de paradas futuras.
- `Order.status` permanece separado: início move pedidos prontos para `out_for_delivery`; entrega conclui apenas seu pedido; falha exige retorno e não cancela o pedido. Cancelamento de pedido cancela a parada associada, preservando histórico.
- A liberação legada do entregador agora verifica rota canônica ativa, evitando `available` antes do último retorno. O status operacional também considera rota/retorno além dos pedidos legados.
- Contratos afetados: schema/migration, `@gestor/types`, ciclo de pedido, isolamento tenant e novo contrato `docs/contracts/delivery-runs.md`. Nenhum endpoint/UI/realtime novo foi exposto neste PR.

### Validação

- Baseline antes das alterações: API lint e typecheck global passaram com exit 0.
- Testes focados: 2 suites/12 testes passaram.
- Suíte integral da API: 94 suites/407 testes passaram; 4 suites/9 testes condicionais ignorados.
- API lint/build, Prisma validate com URLs locais sintéticas, `check:no-any`, `check:features` e `git diff --check` passaram.
- Docker Desktop estava indisponível; a migration não pôde ser aplicada a PostgreSQL efêmero local. Nenhum banco remoto, produção, Dokploy ou deploy foi acessado.

### Próximo passo

- PR B deve expor contratos REST tenant-scoped e o construtor/monitor de rota no web-tenant, sem adicionar pedidos depois do início e sem dependência nova de drag-and-drop.

---

Branch: `fix/storefront-category-scrollspy`
Base: `origin/main-copy` / `e7caf433`

- A navegação de categorias agora recebe a categoria ativa de um scrollspy baseado em `IntersectionObserver`; antes, o storefront não mantinha nenhum estado ativo e o clique apenas executava `window.scrollTo`.
- O clique seleciona a categoria imediatamente e mantém essa seleção durante o scroll suave, evitando flicker ao atravessar seções intermediárias. Após alcançar o destino, o observer volta a ser a fonte do estado.
- O cálculo cobre a categoria inicial e força a última categoria no fim da página. A troca da lista desconecta o observer anterior e coleta somente as seções atuais.
- O menu horizontal centraliza suavemente o item ativo quando ele sai da área visível. O item ativo também expõe `aria-current="true"`.
- Alteração somente em frontend; API, schema, migration, storage, feature flags e contratos HTTP não foram alterados.

### Validação

- Testes focados cobrem scroll manual, categoria inicial, fim da página, lista re-renderizada, trava durante clique/scroll suave e visibilidade horizontal. A suíte completa do storefront passou com 14 arquivos/72 testes; a suíte do web-tenant passou com 24 arquivos/102 testes.
- `web-storefront` lint/build, `web-tenant` lint/build, `pnpm typecheck`, `pnpm check:no-any`, `pnpm check:features` e `git diff --check` passaram com exit code 0.
- O baseline global de `typecheck` inicialmente falhou porque o Prisma Client ainda não havia sido gerado na worktree limpa; após `pnpm db:generate`, passou com exit code 0.
- `pnpm check:boundaries` continua com exit code 1 por duas violações preexistentes em `StorefrontPreview.tsx` e `product-image-fallback.test.ts`; ambos já importavam `@gestor/storefront-ui` em `origin/main-copy` e não foram modificados nesta branch.
- A validação visual local depende de API e dados locais; nenhuma API, PostgreSQL ou Redis estava ouvindo nas portas do projeto durante esta sessão. Nenhum ambiente remoto foi acessado.
## Quick fix — salvar upload na biblioteca de mídia

Data: 2026-08-11
Branch: `fix/media-library-save-upload`
Base: `origin/main-copy` / `37df7257` (merge da PR #57)

- A causa estava no cliente de autenticação do upload: requisições JSON renovavam a sessão e repetiam a chamada após HTTP 401, enquanto `api.upload` encerrava imediatamente com `ApiError`. Assim, uma sessão renovável podia navegar normalmente e falhar especificamente ao clicar em “Salvar na biblioteca”.
- `api.upload` agora renova a sessão e repete o mesmo `FormData` uma única vez. O primeiro 401 é respondido pelo guard antes da persistência, portanto o retry autenticado produz um único save lógico.
- O modal usa uma trava síncrona além do estado visual, impedindo dois saves por cliques imediatos. O botão mostra “Salvando imagem...” durante a operação.
- Em sucesso, a resposta persistida entra imediatamente na biblioteca, aparece a confirmação “Imagem salva na biblioteca.” e o GET de refresh reconcilia a lista.
- Em falha, o arquivo selecionado permanece disponível para retry, o modal não troca de aba e a UI mostra apenas mensagens humanas para tamanho, formato/imagem inválida ou falha genérica. Detalhes de bucket, provider e erro interno não são exibidos.
- Tenant isolation, guards, endpoint, storage, Prisma/schema, migrations, feature flags e dependências não foram alterados.

### Validação

- Testes focados: 2 arquivos/5 testes, cobrindo 401 + refresh + retry do mesmo corpo, happy path, double click, preservação para retry e mensagens de validação/erro.
- A suíte completa do web-tenant passou com 26 arquivos/107 testes. Lint/build do web-tenant, `pnpm typecheck`, `pnpm check:no-any`, `pnpm check:features` e `git diff --check` passaram com exit code 0.
- `pnpm check:boundaries` manteve exit code 1 somente nas duas importações preexistentes de `@gestor/storefront-ui` em `StorefrontPreview.tsx` e `product-image-fallback.test.ts`; nenhum desses arquivos foi alterado.
- Docker Desktop não estava disponível localmente; nenhum banco remoto, provider externo, produção ou deploy foi acessado.

---

## P0 - isolamento de tenant nos WebSockets de pedidos e entrega

Data: 2026-08-11
Branch: `fix/websocket-tenant-isolation`
Base: `origin/main-copy` / `2cc7d18f`

- As rooms operacionais `tenant:<id>` dos namespaces `/orders` e `/delivery`
  agora exigem credencial tenant validada pelo JWT e pelo `AuthSession` canônicos.
  O `tenantId` da room vem das claims; o valor opcional do payload é somente uma
  checagem de compatibilidade e mismatch é rejeitado com erro genérico.
- O web-tenant envia o access token atual no handshake de suas duas conexões de
  `/orders`. Tracking público e storefront continuam conectando sem JWT.
- `joinOrder` e `joinTracking` validam a existência do `publicTrackingToken` e
  vinculam cada socket público a um único pedido, inclusive contra dois joins
  concorrentes. Esse socket não adquire identidade tenant e não pode ingressar
  em room operacional.
- O namespace `/delivery` distingue identidade tenant, identidade de entregador
  e consumidor público. A credencial do entregador continua derivando
  `driverId`/`tenantId` das claims e agora é revalidada antes de cada update de
  localização.
- Sessões tenant são revalidadas antes dos joins sensíveis e sessões de
  entregador antes de updates. Revogação depois que um socket tenant já entrou
  numa room ainda não o remove imediatamente; isso exige um mecanismo central
  de disconnect/revoke e permanece follow-up P1, sem ampliar esta correção P0.
- O fluxo explícito e curto de impersonação administrativa foi preservado; JWT
  tenant legado sem `sid` e sem marcador de impersonação é rejeitado.
- Testes com clientes Socket.IO reais provam que tenant A recebe eventos de A,
  tentativas A -> B são rejeitadas e não recebem o evento emitido para B,
  socket sem autenticação não entra em room tenant, token público A recebe A
  mas não B, e token público não escala para tenant-global.

### Validação

- Testes focados: 3 arquivos/9 testes PASS, incluindo vazamento real, corrida de
  joins públicos e revalidação de sessão no join.
- API: lint e build PASS; suíte integral PASS com 92 suítes/391 testes executados
  e 4 suítes/9 testes condicionais ignorados.
- Web-tenant: lint/build PASS; 26 arquivos/107 testes PASS.
- `pnpm typecheck`, `pnpm check:no-any`, `pnpm check:features` e
  `git diff --check`: PASS.
- `pnpm check:boundaries`: exit 1 somente pelas duas violações preexistentes em
  `StorefrontPreview.tsx` e `product-image-fallback.test.ts`; ambos permanecem
  idênticos ao SHA-base (diff exit 0).
- Nenhum Prisma/schema/migration, dependência/lockfile, feature flag, provider,
  credencial, banco remoto, produção, Dokploy ou deploy foi alterado.

---

## R11 PR C — Capacitor/Android do entregador

Data: 2026-08-11
Branch: `feat/r11-driver-capacitor`
Base: `origin/main-copy` / `b704020e` (merge da PR #61)

- Foi criado um projeto Capacitor Android próprio do `web-delivery`, com nome
  `PedeHub Entregador` e identidade exclusiva `com.pedehub.driver` em todos os
  pontos nativos. Launchers e splash usam o asset PedeHub da PWA e o small icon
  de notificação é monocromático.
- O tracking usa `@capacitor/geolocation` no runtime nativo, pede permissão
  foreground por ação humana e preserva `navigator.geolocation` na web/PWA.
  Não foi adicionada permissão de background, foreground service ou plugin de
  background location.
- Local Notifications podem sinalizar um assignment já deduplicado quando o
  app está ativo e autorizado. PushNotifications foi apenas sincronizado:
  FCM/`google-services.json`, token de dispositivo e backend não existem nesta
  entrega, então a UI reporta push nativo como não configurado e não registra.
- Safe areas usam as primitives CSS existentes, ajuste edge-to-edge do Capacitor
  e `adjustResize` para teclado. Smoke real em Chromium passou em 390x844 light
  e 430x932 dark, sem overflow ou sobreposição de header/conteúdo.
- Testes do driver: 8 arquivos/18 testes PASS. Lint, TypeScript e build web
  passaram. `cap sync android` encontrou Geolocation, LocalNotifications e
  PushNotifications. `assembleDebug` passou com JBR 21 do Android Studio; o Java
  global 26 é incompatível com Gradle 8.11 e não foi usado no rerun.
- APK debug local: `apps/web-delivery/android/app/build/outputs/apk/debug/app-debug.apk`.
  O AAPT confirmou package `com.pedehub.driver`, label `PedeHub Entregador`,
  compile/target SDK 35, min SDK 23 e ausência de background location.
- O APK final tem 5.386.460 bytes e SHA-256
  `247EE35425296A3D77E02F4501D924B2F9272D122E115B5706B8BBCEF12E1117`.
  Não havia device/emulador conectado ao ADB; permissão e GPS nativos foram
  validados por adapter tests e build, mas o smoke em hardware permanece pendente.
- Nenhuma API, schema Prisma, migration, credencial, banco remoto, produção,
  Dokploy, deploy, release signing ou publicação de APK foi realizada.

---

## R12 PR C — ciclo operacional do entregador

Data: 2026-08-11
Branch: `feat/r12-driver-route-lifecycle`
Base: `origin/main-copy` / `921fcaa8` (merge da PR #64)

- O app do entregador agora consome `DriverShift`, `DeliveryRun` e `DeliveryStop` canônicos por `GET /delivery/driver/work-state`, com polling de reconciliação e eventos privados por rota.
- Turno explícito, aceite/recusa por rota, início, chegada, entrega, falha, próxima parada, devolução e conclusão final são expostos por endpoints autenticados que derivam tenant e entregador exclusivamente do JWT.
- Eventos `driverRouteEvent` são emitidos somente para a sala privada derivada pelo servidor. Atribuição e cancelamento preservam os eventos/push legados de R11 enquanto o fluxo operacional migra para o contrato canônico.
- O logout fica bloqueado enquanto existe turno ou rota ativa. Quando permitido, remove as inscrições push tenant-scoped antes de revogar a sessão; a UI só limpa tracking e estado local após sucesso HTTP.
- A tela mobile mostra a ordem textual completa das paradas, estados e retornos, anuncia cancelamentos/reordenações com `aria-live`, mantém alvos de toque e safe areas, e não adiciona mapa, ETA, valor por corrida ou tracking em background.
- `GET /delivery/driver/active-runs` foi mantido apenas como alias depreciado do estado canônico singular; o consumidor e o smoke mobile usam `work-state`.

### Validação

- API: 4 suítes focadas/23 testes e suíte integral com 96 suítes/419 testes passaram; 4 suítes/9 testes condicionais foram ignorados. Lint, TypeScript e build passaram. O primeiro run integral encontrou somente workspaces locais sem `dist`; depois de compilar `@gestor/core`, `@gestor/utils` e `@gestor/theme`, o rerun passou integralmente.
- Web-delivery: 9 arquivos/26 testes passaram, incluindo 8 cenários da nova tela, branding Android, GPS foreground, PWA, notificações e push. Lint, TypeScript e build passaram.
- Regressão PWA real: manifest instalável, service worker ativo/controlando a página e navegação offline passaram. Layout mobile passou em 390x844 light e 430x932 dark.
- `cap sync android` passou. `assembleDebug` passou com JBR 21 e o SDK Android local, gerando `app-debug.apk` com 5.404.653 bytes e SHA-256 `AFB1E769F84B697924BFEE92317C126D44B4E4FFE503A04E8516DD0012DCA385`.
- Os gates globais, a CI da PR e a CI pós-merge ainda devem ser registrados antes de encerrar a sprint.
- Nenhum schema Prisma, migration, dependência, feature flag, banco remoto, provider, produção, Dokploy, deploy ou publicação faz parte desta PR.
## R14 PR C - driver earnings UX and canonical cash tips (2026-08-13)

- App do entregador e painel tenant exibem o resumo do ledger do turno, incluindo diária prevista/lançada, entregas, gorjetas cash, ajustes, recebido diretamente e devido pela loja.
- Entregador e gestor registram gorjeta cash somente para pedidos elegíveis devolvidos pelo resumo tenant-scoped; pedidos continuam disponíveis após a conclusão da rota.
- A gorjeta usa chave canônica por parada: retry do mesmo valor é idempotente, valor divergente retorna conflito e correções permanecem append-only via ajuste com motivo.
- Sem settlement, payout, gorjeta online, deploy ou mutação de produção.

## R14 PR A/B - driver pay snapshots and immutable ledger

Date: 2026-08-13
Branch: `feat/r14-driver-pay-snapshots`
Base: `origin/main-copy` / `dd5bbb45`

- Added tenant defaults and tenant-scoped driver overrides for daily rate and delivery pay modes: own distance table, normal delivery fee, percentage of normal fee, or fixed amount.
- `Order.normalDeliveryFee` preserves the normal delivery base separately from customer charged `deliveryFee`; existing rows are safely backfilled from their known charged fee without inventing discounts.
- Shift and stop pay snapshots freeze applied configuration before posting. Delivery, paid attempt/cancellation after arrival, daily rate, cash tip and audited adjustment post to an immutable idempotent driver ledger.
- Cash tip is marked already received by the driver and does not increase due from store. Settlement, payout, online tips and global driver accounts remain intentionally absent.
- Tenant delivery UI configures defaults and driver overrides. Driver earnings UX follows in the next PR.

Validation so far: Prisma schema validation PASS, API TypeScript PASS, focused API suites 5 files/37 tests PASS plus expanded ledger coverage, tenant TypeScript PASS and focused tenant tests PASS. Docker Desktop was not running locally, so the canonical ephemeral migration gate is delegated to PR CI. No production, Dokploy, remote database or deploy was accessed.

---

## R15.1 - turno financeiro controlado pela loja e hotfix do app do entregador (2026-08-14)

- `DriverShift.businessDate` e a migration aditiva criam uma unicidade parcial por tenant, entregador e data comercial. O serviço calcula a data no fuso do tenant, inicia o motorista offline e reutiliza apenas o turno ativo; encerrar o turno continua bloqueado por rota/retorno ativos e lança a diária uma vez.
- Os endpoints de iniciar/encerrar turno agora pertencem ao painel tenant e exigem `delivery.manage_drivers`; os antigos endpoints do motorista devolvem `403`. O status `available` só é permitido com turno ativo, sem criar ou alterar lançamentos financeiros.
- O app do motorista separa disponibilidade de turno, expõe navegação persistente Início/Rotas/Ganhos/Conta com URLs diretas e deixa localização foreground orientada por permissão. Alertas Web Push reaproveitam uma inscrição existente antes de assinar novamente; recursos nativos não configurados continuam explicitamente declarados.
- O painel exibe o estado e os comandos de turno somente no modal de edição do entregador e respeita a mesma permissão no cliente e no servidor.

Validação local: TypeScript nos três apps, lint focado, 4 suítes/34 testes de API e 3 arquivos/16 testes focados do app entregador passaram; builds dos três apps, `check:no-any` e `git diff --check` também passaram. A migração efêmera local foi bloqueada porque Docker Desktop não estava em execução. A PR #73 foi aberta em `2b3dcf12`, mas Actions não iniciou `build-and-migrate`, Gitleaks nem a prova PostgreSQL porque a conta GitHub informou pagamentos recentes falhos ou limite de gastos; os previews Vercel passaram. A integração está bloqueada até a regularização da conta e rerun dos checks. Nenhum banco remoto, produção, Dokploy ou deploy foi acessado.

---

## R16 - Auto-Dispatch V1 assistido, FIFO e trava KDS (2026-08-14)

- Branch `feat/r16-auto-dispatch-v1`, baseada em `2d6993fc` da R15.1. A PR R16 permanece deliberadamente não aberta enquanto a PR #73 estiver bloqueada por infraestrutura de Actions.
- A configuração tenant habilita modo assistido, fila FIFO, bypass por distância/GPS, carona por raio e limite de paradas. A sugestão é tenant-scoped, humana e recalculada atomicamente no aceite; a criação final reutiliza as constraints serializáveis de `DeliveryRun`.
- `dispatchQueueJoinedAt` preserva ordem operacional: online entra no fim, offline/busy/turno encerrado sai e a conclusão de rota com turno ativo reinsere no fim. O bypass não reordena a fila.
- `DeliveryRunDTO.kds` deriva o bloqueio dos stops ativos e dos pedidos canônicos. O start é bloqueado enquanto houver pedido em preparo, salvo override tenant com motivo, histórico e `AuditLog`; o override não muda status de pedido.
- O tenant recebeu sugestão, fila, aceite, fallback manual e modal acessível de override. O driver recebe mensagem humana, números dos pedidos bloqueadores e atualização canônica por `driverRouteEvent`, sem motivo/ator/IDs administrativos.
- As migrations aditivas são `20260814050000_auto_dispatch_v1` e `20260814051000_delivery_run_kds_override`. `prisma validate` passou, mas `migrate deploy` local permanece não verificado porque o daemon Docker/PostgreSQL efêmero não estava disponível. Nenhum banco remoto foi acessado.
- A avaliação independente da UI passou. Testes e gates finais da branch devem ser registrados no relatório/commits desta sessão; nenhum deploy, Dokploy, produção ou publicação faz parte desta entrega.

---
## Routing V2 / ETA + Logistics Ownership - validação final local (2026-09-04)

- Branch isolada `feat/routing-v2-eta`, base `a723413124b0ac7af5914eebda02396318da89ed`, em `C:\wt\pedehub\routing-v2`.
- Implementação local adiciona adapter OSRM configurável, fallback Haversine explicitamente degradado, sequência determinística, snapshots de rota/trechos/ETA, versionamento, cache, recálculo pre-start, mapa/ETA no painel e sequência/ETA mobile do entregador.
- Prisma recebeu as migrations aditivas `20260904090000_routing_v2_eta` e `20260904100000_marketplace_delivery_ownership`. A segunda persiste ownership provider-neutral `MERCHANT | PROVIDER | UNKNOWN`, com default fail-closed `UNKNOWN`.
- O adapter iFood lê exclusivamente `delivery.deliveredBy`: `MERCHANT` permanece `MERCHANT`, `IFOOD` vira `PROVIDER` e qualquer ausência/valor novo vira `UNKNOWN`. Nenhuma alteração foi feita no adapter 99Food; seu ponto de extensão é o mesmo contrato normalizado quando existir documentação oficial confiável.
- Pedidos nativos e marketplace `MERCHANT` são elegíveis. `PROVIDER` e `UNKNOWN` são removidos do builder/Auto-Dispatch e rejeitados antes de escrita na criação manual, `createAssignedRun` e defesa em profundidade do Routing V2. Logs estruturados contêm somente tenant/order/provider/ownership/reason.
- Segurança concorrente: o compare-and-set tenant/status da rota ocorre antes das escritas de paradas dentro da transação; uma saída simultânea rejeita o recálculo sem reordenar stops.
- PostgreSQL 16.15: 67 migrations passaram do zero; upgrade de 65 para 67 passou e preservou pedido marketplace legado com backfill `UNKNOWN`. O E2E real com provider fake passou (1/1): três pedidos native/MERCHANT, `PROVIDER` e `UNKNOWN` excluídos, ordem determinística, ETA em todas as paradas e repetição mantendo exatamente 1 run/3 stops. Containers/bases descartáveis foram removidos.
- Mobile Playwright passou em 390x844 light e 430x932 dark: sem overflow horizontal, mapa contido, paradas 1/2/3 e ETAs legíveis, navegação acionável e estado degradado explícito. Artifacts locais ficaram em `apps/web-delivery/artifacts/mobile-layout/` e não foram versionados. A skill `agent-browser` não iniciou CDP no host Windows; o fallback Playwright real do projeto forneceu a evidência.
- Validação final: API em quatro shards com 122 suítes/581 testes aprovados e 5 suítes/10 testes condicionais ignorados; após o hardening concorrente, shard impactado 30 suítes/168 testes e teste focado 6/6 passaram. Web-tenant 39/140 e web-delivery 15/47 passaram. Typecheck, no-any, features, boundaries, theme, lint (0 erros; 17 warnings preexistentes no storefront), builds API/web-tenant/web-delivery e diff check passaram.
- Implementação consolidada em `bbc31a809568b78cc1bf1d2d5d5274b6a006066b` e publicada por push normal somente em `origin/feat/routing-v2-eta`. Após `git fetch`, `origin/main-copy` permanecia em `a723413124b0ac7af5914eebda02396318da89ed`.

---

## Inventory contract alignment (2026-09-07)

- Branch isolada `fix/inventory-contracts`, baseada em `origin/main-copy` / `eb878454`.
- O web-tenant agora usa os endpoints existentes `POST /inventory-counts` e `GET/POST /losses`; a contagem envia `ingredientId`, `theoreticalStock` e `physicalStock`, que são o contrato do DTO da API.
- A listagem de perdas, consumida pela tela existente, foi adicionada como leitura tenant-scoped de movimentos `WASTE`, com custo do snapshot do movimento e sem alteração da baixa, custo, pedidos, PDV, marketplace ou schema.
- Validação: 3 suítes API/9 testes e 1 arquivo web/2 testes passaram; lint API/web, `check:no-any`, build API/web e `git diff --check` passaram. Sem migração, banco remoto, deploy, Dokploy ou promoção de `main-copy`.

---

## 99Food native lifecycle reconciliation (2026-09-05)

- Official Swagger contract applied on `integrate/99food-orders-v1-main-copy`: token get/refresh, authorization page, native detail, confirm, ready and merchant-owned delivered now use the documented V1 endpoints and StandardResponse (`errno=0`) semantics. IDs above JavaScript safe integer range remain decimal strings end-to-end.
- `delivery_type=1` maps to `PROVIDER`, `2` to `MERCHANT`, otherwise `UNKNOWN`. Confirm and ready are exposed through the queue without optimistic local state; delivered is blocked unless ownership is `MERCHANT`. Cancellation, dispatch, and cancellation accept/deny remain unavailable because official labeled cancellation reasons are not available.
- `ORDERCONFIRM` reaches `confirmed` then `preparing` through the canonical idempotent KDS entry. Missing-confirm `ORDERREADY` reaches ready without a late KDS ticket. `ORDERFINISH` and `ORDERCANCEL` reconcile terminal state with an audit timeline and no retroactive KDS, own-fleet, or financial side effects.
- Focused local validation passed: 5 suites / 37 tests for native token/client/provider/status/controller, API and web-tenant TypeScript, anti-any, API build, web-tenant build, and diff check. No remote database, provider, Dokploy, deploy, migration, merge, or promotion was performed. State: READY_FOR_REAL_RETEST.
- Fora de escopo preservado: branch/adapter 99Food, provider real, deploy, Dokploy, produção, banco compartilhado, merge e promoção para `main-copy`.
---

## Financial Projection V1 foundation (2026-09-07)

- Isolated branch `feat/financial-projection-v1`, based on `origin/main-copy` / `6f11b9482f73c39154a1d0cac6529f00245dd556`, in `C:\wt\pedehub\finproj-v1`.
- Additive migration `20260907120000_financial_projection_v1` creates `FinancialProjection`, the provider-neutral `FinancialProjectionSource` and `FinancialProjectionValueState` enums, tenant/order relations, logical uniqueness `(tenant_id, order_id, projection_version)`, and read indexes. No backfill exists.
- `FinancialProjectionService` provides direct-only `projectOrder`, `reprojectOrder`, and `getProjection`, all with an explicit tenant filter. Writes use the logical-key upsert; there is no endpoint, automatic hook, or order mutation.
- The projection stores value plus `KNOWN | UNKNOWN | NOT_APPLICABLE` state for gross, discounts, delivery, service, received amount, marketplace fee/receivable, refund, and COGS. It records field provenance and a `MarketplaceOrder` reference when present. A cancelled order does not prove a refund.
- PedeHub and POS use only persisted facts; a declared payment method is not payment evidence. POS may observe `CashMovement.sale` without writing Cash. iFood keeps fees, receivable, and payment unknown without persisted financial facts. 99Food reads only `normalizedPayload`: `itemsSubtotal` (from `order_price`) for gross and `total` only when `isPrepaid` for payment; it does not reparse raw payloads or convert IDs to `number`. COGS is known only from `theoretical_depletion` movements with persisted `unitCost`.
- Scope preserved: no change to Cash, manual Finance, Analytics, frontend, iFood/99Food adapters, feature flags, dependencies, lockfile, remote database, production, Dokploy, or deploy.

### Validation

- `prisma generate`, `prisma validate`, `prisma migrate diff --from-empty --to-schema-datamodel`, and `git diff --check`: PASS.
- Focused tests: `financial-projection.service.spec.ts`, 7/7 PASS; covers tenant scope, idempotent reprocessing, PedeHub, POS, iFood, 99Food, COGS, and cancellation without inferred refund.
- Global gates: `pnpm typecheck`, `pnpm lint` (0 errors; 17 pre-existing web-storefront warnings), `pnpm check:no-any`, `pnpm check:boundaries`, `pnpm check:features`, `pnpm check:theme`, and `pnpm build:api`: PASS.
- Full API suite: 135/135 executed suites PASS, 658/658 tests PASS; 5 suites/10 conditional tests skipped.
- Required PostgreSQL 16 zero-to-upgrade `prisma migrate deploy` proof is locally blocked: `docker version` cannot connect to `dockerDesktopLinuxEngine`, and no local `psql`, PostgreSQL service, or database URL is available. No remote database was accessed. Run this ephemeral gate before integration.

---

## Management quick fixes: inventory factor and suppliers (2026-09-07)

- Isolated branch `fix/management-quick-fixes`, based on `origin/main-copy` / `2ec9ffd1399f5d4e5d7225c5b8bfe2d36b86e344`, in `C:\wt\pedehub\mgmt-quickfix`.
- The ingredient editor preserves an explicitly entered conversion factor. The factor means the number of base-consumption units contained in one purchase unit: for example, 1 kg to g is 1000 and a box of 12 units is 12. Client and API reject zero, negative, and non-finite values; a missing legacy value remains 1.
- Supplier CNPJ/CPF is optional end-to-end. Empty input is normalized to `null`, duplicate lookup remains tenant-scoped for a real identifier, and supplier removal now archives through `isActive=false` instead of deleting purchase history. The tenant UI surfaces failures with accessible messages and offers explicit activate/inactivate actions; the nonfunctional document action was removed.
- No schema, migration, remote database, deploy, Dokploy, marketplace, Cash, Finance, Analytics, or Financial Projection behavior was changed.

### Validation

- Focused API tests: ingredients 7/7 PASS (1, 10, 12, 1000, 0.5, zero and negative rejection); suppliers 5/5 PASS (optional CNPJ, normalization, archive, and tenant scope). Focused web contract test: 2/2 PASS.
- `pnpm typecheck`, `pnpm check:no-any`, API lint, web-tenant lint, `pnpm build:api`, `pnpm build:web-tenant`, and `git diff --check`: PASS.
- Authenticated browser smoke was not run because no authenticated local runtime/session was established for this isolated change.

---

## Finance P0-A and P0-B balance integrity (2026-09-07)

- Isolated branch `fix/finance-p0-cash-balance`, based on `origin/main-copy` / `17a19b8a`.
- Cash refunds now preserve the original POS payment method and expected physical cash includes only cash sales and cash refunds. Legacy refunds without a method resolve their method from the linked sale movement. A repeated refund for the same tenant/session/order is ignored.
- Financial transactions compute the previous and next paid-account effects. Within a serializable Prisma transaction they revert the previous effect and apply the next effect with atomic account increments. Paid amount changes, account changes, and paid-to-pending/cancelled transitions therefore preserve balance integrity.
- Purchases remain unchanged: unpaid purchases create pending expenses and do not mutate account balances. No schema, migration, Financial Projection, web-tenant, remote database, deployment, Dokploy, or main-copy promotion was performed.

### Validation

- Focused Cash, POS, Finance, and Purchasing tests: 22/22 PASS. Full API suite: 140 passed suites / 684 passed tests; 5 suites / 10 conditional tests skipped.
- `pnpm typecheck`, `pnpm check:no-any`, API lint, API build, and `git diff --check`: PASS.

---

## Finance P0-C V2 - persisted Mercado Pago refund lifecycle (2026-09-07)

- Branch `feat/payment-refund-lifecycle`, based on `origin/main-copy` / `a094c90f`, in
  `C:\wt\pedehub\refund-v2`.
- Additive migration `20260907140000_payment_refund_lifecycle` creates tenant-scoped
  `PaymentRefund`, its `REQUESTED | PROCESSING | SUCCEEDED | FAILED | UNKNOWN` lifecycle,
  tenant/order/payment-transaction FKs, logical idempotency uniqueness and unique provider
  refund identity. No backfill exists.
- `PaymentRefundService` supports full Mercado Pago refunds only. It validates the same-tenant
  confirmed payment/order relation, persists and reuses a stable idempotency key, never turns an
  ambiguous provider result into failure, and reconciles active refunds only by provider
  payment/refund identity. No endpoint or web UI was added.
- Authenticated payment webhook handling maps `refunded` only to a matching active refund;
  duplicate and out-of-order events preserve terminal state. Order cancellation remains separate
  from refund success.

### Validation

- Focused refund adapter/lifecycle/webhook: 3 suites / 15 tests PASS. Cash, POS, Finance,
  Purchasing and order-cancellation regressions: 5 suites / 23 tests PASS.
- Full API suite: 142 passed suites / 697 passed tests; 5 suites / 10 conditional tests skipped.
  Typecheck, no-any, boundaries, features, API lint, API build and diff check passed.
- Prisma generate/validate passed. PostgreSQL 16 from-zero applied 70 migrations; upgrade from
  the 69-migration `a094c90f` baseline applied only this migration. The schema diff retained
  only the four known baseline index renames (Analytics, Customer External Identities, Driver
  Ledger, Order Payment Attempts); no refund-specific drift remains.
- No real Mercado Pago request, remote database, Dokploy, deploy or `main-copy` promotion.
  P0-D COGS reversal remains deferred.

---

## Finance P0-D V2 - immutable stock reversal (2026-09-07)

- Branch `feat/immutable-stock-reversal`, based on `origin/main-copy` /
  `8eb37b4256db95c8cca5a8ae8a1b195182befa35`, in `C:\wt\pedehub\cogs-reversal-v2`.
- Additive migration `20260907150000_immutable_stock_reversal` adds the explicit
  `StockMovementType.theoretical_reversal`, nullable `reversalOfMovementId`, a self-relation,
  unique reversal-per-original enforcement and a tenant/order/type index. No existing movement,
  balance or historical record is rewritten; no backfill exists.
- Cancellation preserves `theoretical_depletion` and creates one compensating
  `theoretical_reversal` with the original ingredient, quantity, order and persisted `unitCost`.
  The reversal does not read the current recipe or ingredient cost. A tenant/order advisory
  transaction lock plus the database uniqueness constraint make retry and concurrency safe.
- `OrdersService.updateOrderStatus` calls the reversible stock operation with its existing
  transaction, so the cancelled status and stock reversal commit or roll back together. POS keeps
  using that canonical order transition. Cash, FinancialAccount, PaymentRefund, marketplace
  adapters and FinancialProjection schema remain unchanged.
- Analytics now excludes depletion from cancelled orders when calculating operational COGS, which
  preserves the pre-existing net-sales meaning after depletion history becomes immutable.
  FinancialProjection continues to use only the persisted depletion snapshot as historical COGS.
- Historical depletion movements that were deleted before this change cannot be reconstructed
  safely (`CANNOT_RECONSTRUCT`).

### Validation

- Focused stock, cancellation, POS, Analytics and FinancialProjection tests: 5 suites / 31 tests
  PASS. This includes original preservation, link, historical cost, changed recipe/cost isolation,
  multi-ingredient order, tenant scope, idempotency/concurrency and transaction rollback.
- Full API suite: 143 passed suites / 706 passed tests; 5 suites / 10 conditional tests skipped.
- `pnpm typecheck`, `pnpm check:no-any`, `pnpm check:boundaries`, `pnpm check:features`, API lint,
  API build and `git diff --check`: PASS.
- Prisma generate/validate and schema diff: PASS. PostgreSQL 16 from-zero applied 71 migrations;
  upgrade from the 70-migration P0-C baseline applied only this migration. The schema diff retained
  only the four known baseline index renames (Analytics, Customer External Identities, Driver
  Ledger and Order Payment Attempts); no P0-D drift was introduced. Ephemeral local container
  only; no remote database, deploy or Dokploy action was performed.

---

## Purchasing date contract and local demo seed audit (2026-09-07)

- Branch `fix/purchasing-date-and-seed-audit`, based on `origin/main-copy` /
  `63c1e16a95c8d31118b89e68529e3ef2c3bd6616`, accepts the browser's valid
  `YYYY-MM-DD` purchase date contract as a business date and persists it at UTC noon. Valid full
  ISO timestamps remain accepted; empty, malformed and impossible dates return a friendly HTTP
  400 before Prisma is called.
- Purchase creation now verifies that both supplier and ingredients belong to the current tenant
  before creating the purchase, stock movement or finance record. Paid purchases retain their
  existing no-financial-transaction behavior and unpaid purchases still create a pending expense.
- The local demo seed is idempotent for delivery rules and now provides the minimum purchasing
  path: demo supplier, two stocked ingredients, recipe rows for the existing demo pizza, a cash
  financial account and one open cash session. It deliberately does not create purchases, orders,
  POS transactions, refunds, reversals or financial projections.
- Fresh ephemeral PostgreSQL 16 validation applied 71 migrations and ran the seed twice. Both
  runs succeeded; final counts were tenant=1, users=1, suppliers=1, ingredients=2, recipes=2,
  financial_accounts=1, open_cash_sessions=1 and delivery_rules=3. No remote database, migration,
  deploy or Dokploy action was performed.

### Validation

- Focused Purchasing, Finance and Inventory tests: 5 suites / 19 tests PASS. This includes the
  controller-to-service date-only contract, invalid-date HTTP 400 behavior, exact business date
  persistence, paid/unpaid finance behavior, stock effects and tenant isolation.
- `pnpm typecheck`, `pnpm check:no-any`, API lint and API build: PASS. No web-tenant source,
  Prisma schema or migration changed.

---

## Navigation metadata foundation - Slice 1 (2026-09-07)

- Branch `feat/navigation-metadata-v2`, based on `origin/main-copy` /
  `02bde8a031b04661e715f6ad88f82de7242e88c6`, introduces a static navigation registry separate
  from `AppLayout`. The visible sidebar projection preserves its ten groups and 42 entries, order,
  labels, paths, permissions and feature keys.
- The registry additionally classifies contextual, deep-link and valid-hidden routes. Breadcrumb
  resolution now uses metadata, supports dynamic product/combo editor patterns and follows a
  declared parent without needing a visual sidebar entry.
- `App.tsx` keeps the existing router declarations and all `PermissionGate`, `ModuleGate` and
  `FeatureGate` behavior. No paths, backend, schema, migration, deploy, remote database or Dokploy
  behavior changed.

### Validation

- Focused navigation registry contracts cover stable IDs, sidebar projection/filtering, capability
  metadata, dynamic route precedence, parent breadcrumb resolution and hidden/deep-link routes.
- Web typecheck, `check:no-any`, web lint, web build and `git diff --check`: PASS.

---

## Navigation V2 - Slice 2 sidebar regrouping (2026-09-07)

- Branch `feat/navigation-sidebar-v2`, based on `origin/main-copy` /
  `742707dd9d5d5b2cf78b2510bdf1ac72c85ab3f1`, reorganizes the existing 42 visible navigation
  entries into six workflow groups: Operação, Cardápio e Produção, Financeiro, Gestão, Canais e
  Relacionamento and Configurações.
- All stable IDs, paths, route components, permissions, feature flags and module metadata remain
  in the Slice 1 registry. `AppLayout` continues to consume only the registry projection; its
  initial accordion group is now Operação.
- Cash remains a single visible `/cash` entry in Operação. A contextual financial shortcut or hub
  is deferred to Slice 3, avoiding a duplicate visible path. Billing and Partners remain
  temporarily in Configurações; a future account/user-menu placement is deferred.
- No backend, API, Prisma schema, migration, route declaration, remote database, deploy or Dokploy
  behavior changed.

### Validation

- Focused navigation registry tests: 5 passed. Web typecheck, `check:no-any`, web lint, web build
  and `git diff --check`: PASS.

## Navigation V2 - Slice 3 internal hubs (2026-09-07)

- Scope: frontend-only navigation refinement in `apps/web-tenant`. Financeiro keeps `/management/finance` as its primary entry and now links contextually to Caixa e Fechamento (`/cash`) and Relatórios (`/analytics/reports`). Estoque keeps its native tabs and adds contextual links to Compras and Fornecedores. No destination page data, route guard, financial, cash, stock, marketplace, refund, WhatsApp or business logic was changed.
- Route strategy: `/channels` is a protected tenant route requiring the established `orders.read` permission. Its cards reuse the existing registry item permission, feature and module metadata, so it presents only destinations already available to the current tenant. All retained destination routes and their authoritative guards remain unchanged.
- Sidebar discovery is now Sidebar -> Hub -> destination: Caixa remains in Operação; report, purchases and suppliers are removed from the sidebar and reached through their hubs; Canais e Relacionamento has the stable `channels.hub` entry. Breadcrumb metadata declares Financeiro, Estoque and Canais e Relacionamento as parents for the relevant old child routes.
- Deferred: no new connection/status presentation, aggregate dashboard data or backend capability endpoint was added. Any future navigation changes should continue to use the registry and individual route guards.
- Validation: offline frozen dependency bootstrap completed. Focused navigation registry and hub structural contract tests: 2 files / 10 tests PASS. Web typecheck, `check:no-any`, web lint, web build and `git diff --check`: PASS. Independent visual evaluation of the responsive hub structure: PASS.

## Navigation V2 - Slice 4 management landing (2026-09-08)

- Scope: frontend-only navigation refinement in `apps/web-tenant`. The new `/management` landing reuses `NavigationHub` to provide access to existing Relatórios Gerenciais, Metas, Desempenho de Vendas, BI Avançado and Equipe routes; it neither fetches data nor adds an endpoint, metric, calculation or dashboard aggregation.
- Registry: stable `management.hub` is now the only direct item in the Gestão sidebar group. The existing Metas, Desempenho de Vendas, BI Avançado and Equipe IDs, paths, permissions, feature keys and module metadata are preserved and now declare the hub as their breadcrumb parent. Relatórios remains a Financeiro contextual destination as well as a management landing entry, preserving the existing finance breadcrumb and avoiding any change to financial routing.
- Navigation: Dashboard remains the operational cockpit; Financeiro remains separate and no Cash, account, transaction or financial detail was added to Gestão. The sidebar has 28 visible items (from 31), with the four former Gestão direct destinations available through the landing. `NavigationHub` filters every card through the existing permission, feature and module metadata, including partial-access users.

| Item anterior no grupo Gestão | Mantém sidebar | Disponível na landing | Justificativa |
| --- | --- | --- | --- |
| Metas | Não | Sim | Agrupa objetivos e progresso em uma entrada gerencial única. |
| Desempenho de Vendas | Não | Sim | Mantém a análise de vendas, aquisição e produtos acessível sem poluir a barra. |
| BI Avançado | Não | Sim | Mantém o gate de BI e concentra análises avançadas. |
| Equipe | Não | Sim | Mantém a permissão de usuários em uma área gerencial. |
| Gestão (hub) | Sim | Sim | Porta de entrada estável para as áreas acima. |

- Deferred: no new management KPIs, data summaries, route aliases, redirects or dashboard redesign. A future visual redesign or legacy cleanup must retain the registry and route guards as sources of truth.

## Functional audit V2 after UX V2 (2026-09-08)

- A auditoria confirmou que Gestao e Financeiro reutilizam o mesmo item `analytics.reports`, rota `/analytics/reports` e `ReportsPage`. Como o item possui um unico `parentId`, o breadcrumb permanece Financeiro mesmo quando a origem e Gestao. A definicao do dominio canonico foi adiada para decisao de produto; rotas, IDs e guards nao foram alterados.
- Duas correcoes frontend pequenas foram aplicadas: a busca de clientes agora consome o envelope paginado real de `GET /crm/customers`, e o Financeiro carrega metricas e lancamentos de forma independente para que a indisponibilidade de Analytics nao descarte transacoes financeiras autorizadas.
- Achados adiados incluem divergencias de permissoes de mutacao em Financeiro, Metas e Equipe; gates de Financeiro, Inbox e Marketplaces; reset de desenvolvimento do WhatsApp; refund de venda apos fechamento de caixa; validacao de perdas de estoque; saldo financeiro exibido e lifecycle de compras.
- Nenhum backend, schema, migration, dependencia, provider, banco remoto ou deploy foi alterado. Testes focados web: 7 arquivos / 26 testes; typecheck, no-any, lint, build e diff check passaram. Smoke visual autenticado nao foi executado por ausencia de ambiente local autenticado.

## Management/Finance reports dedup (2026-09-08)

- Decisão de produto aplicada: `/analytics/reports` e o stable ID `analytics.reports` permanecem canônicos no Financeiro. A landing Gestão deixou de expor o card duplicado, sem alterar rota, `ReportsPage`, breadcrumb Financeiro, registry, guards, backend, schema ou providers.

## 99Food native payment method normalization (2026-09-08)

- Branch `fix/99food-payment-method`, based on `origin/main-copy` / `15cc571000bd5d4c560b71b43ab206c7125ad424`, replaces the native order adapter's unconditional `other` value with documented `pay_channel` mappings to existing PedeHub payment methods. Legacy `pay_type` is used only when the detailed channel is absent.
- Exact supported mappings are cash, PIX, POS credit, POS debit and card on delivery. Unknown, missing and ambiguous channels remain `other`; combined online credit/debit channel `150` is deliberately not guessed because the existing domain distinguishes credit from debit.
- Provider IDs remain lossless strings. Confirmation, BAPP/OpenAPI lifecycle, persistence/API contracts, schema, migrations and other providers are unchanged. Previously stored orders are not backfilled.
- Focused backend coverage verifies supported channels, legacy fallback, unknown/missing fallback and long order IDs (1 suite / 29 tests PASS). Focused web coverage verifies normalized labels, including `card_on_delivery` and the neutral `other` label (1 file / 8 tests PASS). API and web typecheck, lint and build, global `check:no-any`, and `git diff --check` passed.

## Permissions and mutation guards (2026-09-08)

- Branch `fix/permissions-mutation-guards`, based on `origin/main-copy` / `b01ffe2c70aba50d6779e896eeb657e99a88a02b`, aligns frontend mutation affordances with existing backend permission decorators only. Finance remains readable with `finance.read`, while transaction creation requires `finance.manage`.
- Goals now independently guard create, update and delete with `goals.create`, `goals.update` and `goals.delete`. Employee management keeps `users.read` for listing, requires `users.create` plus `users.roles` to create, `users.update` plus `users.roles` to edit, and `users.delete` to delete.
- WhatsApp Inbox discovery and route access now require `chat.read`, matching the chat read endpoints. Sending, handoff, closing and quick-reply management are independently guarded by their existing `chat.*` permissions. `orders.read` no longer grants Inbox access or chat actions.
- No backend guard, route path, stable ID, schema, migration, dependency, remote database, provider, Dokploy or deployment changed. Focused web contracts, typecheck, `check:no-any`, lint, build and diff check passed; the known Vite chunk-size warning remains unchanged.

## Refund after cash close (2026-09-09)

- Branch `fix/refund-after-cash-close`, based on `origin/main-copy` /
  `c840ddaae2ee6e05d22fbe668a8f08e94cbed8c2`, keeps the cash ledger and a closed
  session's persisted reconciliation fields consistent when the existing POS cancellation
  flow records a late cash refund against the original session.
- Cash sessions are hybrid: open sessions derive expected physical cash from movements;
  closed sessions expose a persisted `closingAmountCalculated` and `closingDifference`.
  A late cash refund now recalculates and atomically updates only those two reconciliation
  fields on the original closed session. `closingAmountDeclared` remains historical, and a
  non-cash refund does not change physical-cash totals or any current/new session.
- The refund registration transaction now takes a tenant/session/order-scoped PostgreSQL
  advisory lock before its existing duplicate lookup, preserving idempotency for concurrent
  retries without a schema change. PaymentRefund, FinancialAccount, FinancialTransaction,
  FinancialProjection, providers and cancellation-to-provider-refund behavior remain unchanged.
- Focused Cash, POS, PaymentRefund, FinancialTransaction, FinancialProjection and order
  atomicity suites: 6 suites / 46 tests PASS. API typecheck, lint, `check:no-any`, API build
  and `git diff --check`: PASS. No database, provider, Dokploy or deploy action was performed.

## Inventory loss hardening (2026-09-09)

- Branch `fix/inventory-loss-hardening`, based on `origin/main-copy` /
  `c71154a802cc02352ae75bebcb85e346d1984c06`, rejects zero, negative and non-finite loss
  quantities before any lookup or write.
- A loss now applies its stock decrement through one tenant-scoped conditional write
  (`currentStock >= quantity`). A zero-row result rejects as insufficient stock and creates no
  movement. The decrement and existing `WASTE` movement remain inside one transaction, so a
  movement-write failure rolls the decrement back. The existing `currentCost` is retained as the
  historical `unitCost` snapshot.
- No schema, migration, frontend, Purchasing, recipe/theoretical depletion, immutable reversal,
  FinancialAccount, FinancialTransaction, FinancialProjection, Cash or provider code changed.
  Focused loss, inventory count, theoretical stock and order atomicity suites: 4 suites / 26
  tests PASS. The loss test launches concurrent requests over a shared conditional-update model;
  no local PostgreSQL 16 image was present for a database integration variant.

## 99Food order financial and payment semantics (2026-09-09)

- Branch `fix/99food-financial-payment-semantics`, based on `origin/main-copy` /
  `f6f2a374564238ad74a1a606db340def5a397427`, separates the native gross product sale,
  customer payable total, confirmed online payment, amount to collect and collection owner.
- `pay_channel` remains authoritative over legacy `pay_type`. Online channels are marketplace-paid
  and carry zero collection; cash/POS delivery channels remain pending for the exact driver collection
  amount. Unknown payment modes keep payment and collection values unknown instead of converting them
  to zero. The existing payment-method mapping is unchanged.
- Total discounts and customer delivery/service charges retain their documented raw sources. Discount
  funding, platform fees and merchant receivable remain unknown because the native order snapshot does
  not provide them. FinancialProjection reads only the explicit normalized customer-paid fact and never
  treats gross value as receivable. No automatic FinancialTransaction is created for marketplace orders.
- The order board now labels the gross product sale explicitly. The drawer separates payment status,
  paid amount, collection amount and unknown expected payout. Customer tickets say not to charge for
  marketplace-paid orders or print the exact delivery collection amount. Cash writes remain untouched.
- No schema, migration, dependency, historical backfill, iFood/own-app behavior, provider action,
  confirmation mode, BAPP/OpenAPI, remote database or deployment changed.

## Terminal order SLA freeze (2026-09-09)

- Branch `fix/99food-terminal-order-sla`, based on `origin/main-copy` /
  `0766a51cd534a7775852d4003a0839e2a4c1a587`, stops the order-details SLA display
  from measuring terminal orders through the present time.
- The shared presenter now uses the persisted `OrderTimeline` entry for the final
  `completed` or `cancelled` status. That timeline event is created in the canonical
  order status transition, including marketplace events. Active orders still use the
  current time. A terminal order without a valid persisted terminal event displays that
  its final time is unavailable instead of silently using `Date.now()` or `updatedAt`.
- The change is frontend-only. It does not alter provider status mapping, BAPP/OpenAPI,
  payment or financial semantics, printing, KDS, schema, migrations, API contracts or
  dependencies.
- Focused order presenter/reconciliation/payment UI tests, web typecheck, `check:no-any`,
  web lint, web build and `git diff --check` passed. No authenticated visual smoke,
  remote database, provider action, Dokploy action or deployment was run.

## Canonical financial balance source (2026-09-09)

- `Saldo em contas` remains backed by the persisted `FinancialAccount.balance` ledger, not by
  sales, cash sessions, marketplace receivables, projections or a second transaction sum.
- The Analytics aggregation is tenant-scoped and now includes only active financial accounts;
  inactive account history remains stored but is excluded from available balance.
- No write path, transaction semantics, cash/refund behavior, marketplace semantics, schema,
  migration, API contract, dependency or historical data was changed.
## 99Food order contract closure (2026-09-10)

- Worktree/branch: `C:\wt\pedehub\99food-contract-closure` / `fix/99food-order-contract-closure`.
- Preserved the native 99Food provider order number (`order_index`) alongside the internal PedeHub number in order details and print.
- Separated gross product sale, customer-paid amount, amount to collect, estimated merchant receivable and actual settlement in operational presentation. Unknown estimates/settlements remain “A confirmar”.
- Customer tickets now print `customerPaid` for paid marketplace orders and never label the gross order value as paid; paid-online orders explicitly say not to collect.
- Preserved `real_price`, `real_pay_price`, and `shop_paid_money` as non-inferred provider facts. Aggregates only order-level `promotions[].shop_subside_price` to avoid order/item duplicate counting; platform funding remains unknown.
- `FinancialProjection.merchantReceivable` and actual settlement remain unknown. No automatic `FinancialTransaction`, `FinancialAccount` mutation, schema change, migration, backfill, provider action or deployment.

## Order Manager V2 live-operation fixes (2026-09-11)

- Worktree/branch: `C:\wt\pedehub\order-manager-v2-live-fixes` / `fix/order-manager-v2-live-operations`, based on `origin/main-copy` / `38599fe53f28ff7a200ee0fa6f1adc4d6f6719b3`.
- The V2 modal shell is centered at all breakpoints. The prior mobile-only bottom-sheet alignment was removed while portal, focus trap, Escape handling and scroll locking remain intact.
- V2 cards and details now render only enabled status actions with a canonical target status. They call the existing tenant/RBAC-protected `PATCH /orders/:id/status` endpoint and reconcile the returned authoritative order. Driver assignment/dispatch remains outside this status-only control because it requires the existing delivery-run selection flow.
- New-order notifications were already emitted by the Orders gateway. The sound/voice gap was the leader-only playback gate: a visible follower displayed the notification but did not announce it. Visible tabs now announce the deduplicated event; the existing leader event-sharing remains in place.
- Focused V2 tests: 2 files / 10 tests PASS. Focused ESLint and `pnpm check:no-any`: PASS. `git diff --check`: PASS. Full web build remains blocked by pre-existing implicit-any and unresolved shared-package errors outside this change; no authenticated browser smoke was possible because `agent-browser` is not installed. No database, provider, Dokploy or deploy action was performed.

## Order Manager V2 card quick action follow-up (2026-09-11)

- Worktree/branch: `C:\wt\pedehub\order-manager-v2-card-quick-action` / `fix/order-manager-v2-card-quick-action`, based on `origin/main-copy` / `5cb007b1569e1d6fc9b0bf34291ae884940dc45b`.
- The card action button was nested under the visual `pointer-events-none` layer, so clicks passed through to the full-card detail button. The action button now explicitly restores pointer events while retaining its foreground stacking and click propagation stop.
- Focused V2 tests: 2 files / 10 tests PASS. Focused ESLint and `git diff --check`: PASS. No database, provider, Dokploy or deploy action was performed.

## Order Manager V2 cockpit refinement (2026-09-11)

- Worktree/branch: `C:\wt\pedehub\order-manager-v2-cockpit-refinement` / `feat/order-manager-v2-cockpit-refinement`, based on `origin/main-copy` / `3428d30baf7fa8ce350e4d78c293e04a269646ab`.
- The V2 header now has a session-persisted, accessible operational cockpit panel. Its compact row preserves the manager context, compact real KPIs, synchronization, alert state and expand/collapse control; search and origin filters remain outside it and always available.
- Cards, lanes, filters and modal spacing use the existing Tailwind radius scale for denser, less square presentation. No domain metric, lifecycle, provider, RBAC or alert rule changed.
- Card and modal print icons call `printOrderCustomerReceipt`, which uses the legacy board's customer-ticket endpoint (`GET /pos/sales/:id/print?type=customer`), print logging (`POST /orders/:id/print-log`), primary Bluetooth transport on native and `printThermalText` browser fallback. A blocked window or transport error is surfaced through the existing V2 error region.
- Focused V2 contracts: 2 files / 12 tests PASS; V2 plus tab-leader regression: 3 files / 19 tests PASS. Focused lint, `check:no-any` and `git diff --check`: PASS. The full web build is blocked by existing implicit-any errors and unresolved shared-package dependencies outside this change. Authenticated visual smoke remains unavailable because the browser automation CLI is not installed.

## 99Food financial contract reconciliation V2 (2026-09-12)

- Worktree/branch: `C:\wt\pedehub\99food-finance-v2` / `fix/99food-financial-reconciliation-v2`, based on `origin/main-copy` / `04c9772cf0902b00ef0c195d00ad1ef1560d1c11`.
- The internal contract now preserves the raw Swagger price formulas and records the official provider-support clarification as a separate business-semantics layer. `order_price` remains gross sale, `real_pay_price` is an explicit customer-actually-paid fact, `customer_need_paying_money` remains the operational collection reference, and `real_price` is an explicit merchant-estimated-receivable fact. Neither estimate nor customer-paid fact is settlement, cash, a `FinancialTransaction`, or `FinancialAccount.balance`.
- The normalized marketplace JSON and shared operational DTO gained additive explicit fields. Legacy generic `customerPaid` and `merchantReceivable` fields retain their compatibility meaning; order details, Gestor legacy, Gestor 2.0 (via the shared detail section), and customer printing consume the explicit facts. Printing prefers the explicit customer-paid field while retaining legacy fallback for non-99Food callers.
- `FinancialProjection.merchantReceivable` is documented and tested as an estimated receivable, never settlement. No schema/migration, backfill, provider call, account mutation, financial transaction, KDS, lifecycle, BAPP/OpenAPI, Marketplace Gate, remote database, Dokploy, or deploy change was made. Get Bill Data remains deferred because its complete official API contract was not found.
- Validation: focused API contract/projection/order-view-model/printing suites: 4 suites / 71 tests PASS; focused financial-balance and financial-transaction suites: 2 suites / 10 tests PASS; focused web legacy-order and Gestor 2.0 suites: 2 files / 19 tests PASS. API/web lint and builds, repository typecheck, `check:no-any`, `check:boundaries`, `check:features`, and `git diff --check`: PASS.
## Alert Engine 2.0 (2026-09-13)

- Branch: `feat/order-alert-engine-v2`, based on `origin/main-copy` / `cde5a0b69a06e3dc5d30b72e2096c1a49d5d112c`.
- Adds the tenant-scoped `OrderAlert` persistence model and additive migration. Active conditions reuse only existing operational facts: pending action, the established 30-minute delayed rule, failed marketplace operations, and open marketplace reconciliation divergences. There is no inferred SLA or time-only escalation.
- Alert lifecycle is authoritative in the API: fingerprinted active occurrence, idempotent ACK scoped to the authenticated tenant user, recovery retaining history, and dedicated `order.alert.changed` room event. Board reconciliation refreshes authoritative alert state.
- Gestor V2 exposes a compact alert center with severity ordering, ACK, recovered history, and order navigation. Sound/voice reuse the notification queue and tab leader; ATTENTION repeats every 60s and CRITICAL every 30s only while active and unacknowledged. INFO does not repeat.
- Validation: focused API alert service 3/3 PASS; API/web lint, `check:no-any`, API and web typechecks, API build, web build, and `git diff --check` PASS. No migration was applied to a database, no provider/Dokploy/deploy action was performed. Live multi-tab and deployed acceptance remain required.

## Operational Control Center UX correction (2026-09-13)

- Branch: `fix/operational-control-center-ux`, based on `origin/main-copy` / `1d702e761281b691e732ee7bc2cd3bfa6ee11c16`.
- The duplicate store pause control introduced in the cockpit was removed. The existing sidebar store toggle remains the sole UI and endpoint owner; no tenant/store endpoint or sidebar behavior changed.
- Quick actions now open an accessible in-place overlay: delivery times/rates reuses the canonical rates page, Radar reuses the existing Leaflet/GPS map fullscreen, and launches reuse the existing cash page. The shell has close button, Escape support, focus containment and focus restoration; it does not alter the board socket, reconciliation or alert coordinator.
- Delivery, pickup and dine-in now select the reconciled board locally. Each tab filters the same searched/origin-filtered source before canonical lane grouping; delivery retains kitchen/ready/route, pickup and dine-in omit route, and terminal orders remain excluded by lane/status rules. Dine-in remains an embedded order-operational view only: no table-session or POS domain was invented.
- No API, schema, migration, lifecycle transition, delivery run, KDS, marketplace/provider, alert-engine, sidebar, deploy or remote mutation changed. Focused web tests: 2 files / 17 tests PASS. Focused API POS/table regression: 1 suite / 9 tests PASS. Root typecheck, root lint (17 pre-existing storefront warnings, zero errors), `check:no-any`, `check:boundaries`, `check:features`, `check:theme`, API build, web build and `git diff --check`: PASS. Live acceptance remains required after an approved CI-gated promotion.

## Order Manager V2 UX density/topbar/mobile refinement (2026-09-13)

- Branch: `fix/order-manager-v2-ux-density-topbar-mobile`, based on `origin/main-copy` / `ca430622fa16b41ece835d734f8a2944fceb7f52`.
- The Gestor V2 cockpit is denser: shared clock presentation was removed, compact KPI/synchronization controls remain, the search is constrained to 240px from `sm`, and the operational mode block uses compact three-column tab cards with the same reconciled board counters.
- The operational alert trigger now sits beside the theme control in desktop and mobile global headers only on `/orders/manager`. It polls only the existing authoritative alert read endpoint, dispatches a local UI event, and the Gestor still owns alert rendering, refresh and ACK; sound/voice/tab-leader/realtime behavior remains unchanged.
- Mobile lanes now use the usable viewport width, retain snap/horizontal scroll and move to three desktop columns at `xl`; card padding and type scale were tightened without changing actions, print, status, provider, lifecycle, KDS or RBAC behavior.
- No API, schema, migration, lifecycle transition, provider, sidebar store control, remote action or deployment changed. Focused web test/typecheck/lint results are recorded with this branch's final gate run; authenticated visual acceptance remains required after CI-gated promotion.

## Operational Control Center Premium (2026-09-13)

- Branch: `feat/operational-control-center-premium`, based on `origin/main-copy` / `caef8a15dec4e6e585366fe7c8de281ed4442e4e` after PR #92 promotion.
- The fullscreen Radar now consumes the reconciled V2 delivery board for filters, normalized deep search, queues and order detail entry. It joins canonical dispatch data only to render real coordinates and addresses on the existing Leaflet map; missing coordinates stay in the list and never create a pin.
- Drivers and active routes continue to use their existing tenant-scoped queries and five-second refresh. The existing freshness helper labels current, stale and unavailable GPS explicitly. No dispatch, GPS, route optimization or lifecycle engine was added.
- Delivery/Pickup/Dine-in remain local board projections. Pickup still has no route lane, and Comandas exposes only real `dine_in` counters (active, kitchen and ready); table/session, partial value and close behavior are deliberately not inferred from order data. Cards expose only canonical primary actions. Active Alert Engine records now produce a compact severity trigger that opens the existing alert center without changing ACK/audio behavior.
- No API, schema, migration, KDS, printing, provider, RBAC, sidebar, remote database, deploy or provider action changed. Focused API suites: 6/63 PASS. Focused web suites: 4/24 PASS; web typecheck PASS. Package gates and authenticated live acceptance remain pending.

## Operational Control Center mode strip refinement (2026-09-13)

- Branch: `fix/operational-control-mode-strip`, based on `origin/main-copy` / `6d728806ea426690af6f731eba24818f22d87dbd`.
- Delivery, Balcão and Comandas now render as a compact horizontal mode strip: circular channel icon, active count and compact real-state chips. Delivery exposes kitchen and delivery counts; pickup exposes kitchen and ready-to-collect counts.
- Comandas intentionally labels its derived order state as `Operação`, not table occupancy: the order board does not carry a canonical occupancy/session fact. The active-state label is derived only from real active `dine_in` orders.
- The presentation uses existing semantic light/dark tokens and does not alter tabs, counters, lifecycle, Alert Engine, Radar, permissions, API, schema or any provider integration. Focused web tests, typecheck, lint, critical theme check and diff check PASS; visual acceptance remains required.

## Operational Control Center cockpit action placement (2026-09-13)

- Continuing on PR #94 / `fix/operational-control-mode-strip`, the Delivery, Balcão and Comandas mode strip remains below the compact cockpit header. Its layout and counters are unchanged.
- The existing Tempos e taxas, Radar and Lançamentos actions now sit beside Ativos, Atenção and Em rota in that cockpit. They retain their existing overlays, permission and feature checks. The visible and semantic page title reads `Painel de Operações`.

## Gestor V2 UI polish and mobile navigation (2026-09-14)

- Branch: `feat/gestor-v2-ui-polish-mobile-navigation`, based on the operational UI work rooted at `origin/main-copy` / `6d728806ea426690af6f731eba24818f22d87dbd`.
- The cockpit is denser without removing behavior: title, compact KPI group, quick-action overlays, synchronization and filters retain their existing contracts. The Delivery, Balcão and Comandas selector has reduced padding/height, and desktop/mobile lanes retain their canonical filtering and horizontal snap behavior with a comfortable mobile lane width.
- Order-card alert and elapsed-time indicators now share one compact header cluster, preserving alert-centre access, print, status, synchronization and primary-action contracts.
- `AppLayout` gains a mobile-only, safe-area-aware bottom navigation. It only links to existing permitted/feature-visible routes (Operações, Pedidos, Cozinha and Entregas); More opens a compact filtered sheet. The sidebar is hidden below `md` and remains unchanged from `md` upward, preventing two simultaneous mobile navigation systems.
- No API, schema, migration, lifecycle, KDS rules, provider integration, RBAC contract, remote database or deploy action changed. Focused web suites: 3 files / 22 tests PASS; web typecheck, lint, no-any, boundaries, features, critical theme check, Vite build and diff check PASS. Authenticated desktop/mobile visual acceptance and CI remain pending.

### Mobile reference alignment follow-up (2026-09-14)

- On `/orders/manager`, the mobile global header is hidden so the operation cockpit starts at the top of the viewport. The mobile sequence matches the approved reference: title/synchronization, three quick actions, eight compact KPIs, search/channel filters, compact operational tabs, lanes and bottom navigation.
- The mobile bottom navigation now uses Operações, Pedidos, Financeiro, Clientes and Mais, each linked only when its existing permission allows it. Desktop navigation and its sidebar behavior remain unchanged.

### Mobile kanban stage navigation follow-up (2026-09-14)

- Mobile now has explicit lane tabs below Delivery/Balcão/Comandas. Cozinha, Prontos and Em rota are derived from the selected operational channel and show their canonical card count; pickup and dine-in omit Em rota.
- Only the selected lane renders below `sm`, removing horizontal kanban scrolling on phones. From `sm` upward, the prior multi-lane scroll/grid behavior remains available.

### Mobile control-strip alignment follow-up (2026-09-14)

- Delivery, Balcão and Comandas are a three-column row on phones. The operation header keeps title, compact synchronization status and expand/collapse control on one line, with the control immediately after the status.

## KDS station operational control (2026-09-15)

- `PrintStation.isActive` is exposed in the existing printing settings surface. `printing.read` lists station state and `printing.manage` persists the narrow ON/OFF action; device controls remain unchanged.
- OFF excludes future KDS kitchen tickets only. It remains available with pending, printing or failed tickets: that existing work is not hidden, cancelled or treated as done and its per-station counts remain visible. Failed tickets remain explicit readiness blockers.
- Orders containing only OFF-station items advance through `OrdersService` to their canonical ready status, preventing a permanent `preparing` status without active KDS work. No migration, provider, remote database, deploy or device-state change was made.
- Focused API validation was started for KDS and printing service suites; record the final gate before promotion.

## Marketplace consistency final (2026-09-15)

- Branch: `feat/marketplace-consistency-final`, based on `origin/main-copy` / `574e0d4f47bb072aaeef2eae011ebe3553a5cc09`.
- `ORDER_WAITING_ACTION` remains one tenant-scoped persisted occurrence per order. Its browser announcement now repeats every 30 seconds even after acknowledgement while the canonical order remains `pending`; the repeat clock survives alert-list refreshes, uses the existing notification queue/tab leader and never overlaps speech. It recovers when the condition disappears.
- The provider-agnostic rule covers PedeHub, iFood and 99Food only when their internal order is actually pending. The new focused tests cover all three paths plus the safe Portuguese voice phrase.
- Last-ticket KDS completion now queues a marketplace `ready` operation first and then persists the local canonical ready state when that operation is asynchronous. The board receives the normal `order.changed`; remote acceptance/failure remains auditable and can raise the existing marketplace divergence alerts.
- 99Food route/courier automation is intentionally not implemented: the verified native contract has no trusted courier-arrived, pickup or in-route event. Existing undocumented `deliveryStatus` data cannot safely change `Order.status` or create an urgent alert. The previous display mismatch is therefore a provider-capability limitation after the provider stops at `orderReady`; it must not be solved by inventing `out_for_delivery`.
- Stock audit found a real semantics gap: PedeHub/storefront and POS decrement idempotently through `OrderItem.productId` and recipes, but imported iFood/99Food items currently have no persisted external-product-to-canonical-product mapping. Name matching would corrupt stock, so marketplace stock decrement/restore and outbound provider availability remain blocked pending a mapped catalog integration. The existing local concurrency guard remains the proof for local oversell protection.

## 99Food logistics and marketplace stock finalization (2026-09-15)

- Branch: `feat/99food-logistics-marketplace-stock-finalization`, based on `acc777f7cb268ffcbe5ff74c128fda3d76388e8a`.
- Added the tenant/connection/provider-scoped `MarketplaceCatalogMapping` migration and the minimal integration UI. An operator can select an unmapped imported item, bind it to a canonical product, and see the updated mapping without reload. The ingestion path resolves only this mapping before invoking the existing theoretical stock engine; unmapped items raise a divergence and do not receive name-based stock movement.
- The official 99Food `deliveryStatus` contract is now processed in the pre-existing inbox pipeline. 120 stores courier facts; 130 drives a persisted/leader-tab audible courier-arrived alert; 140 maps provider-owned delivery to canonical `out_for_delivery`; 150 remains in route; 160 completes; 170 is delivery-only reconciliation and preserves the commercial order; 180 clears the current courier-arrived condition pending a later 130. IDs stay decimal strings through parsing and lookup.
- iFood uses the shared mapping infrastructure only when the exact imported item identity is operator-selected. No iFood name fallback or provider availability write endpoint is claimed.

## Integrações simples e associação automática de produtos (2026-09-19)

- Branch: `feat/integrations-simple-auto-catalog`, based on `origin/main-copy` / `63a9e210a8b31c86694e555e6c23155af627c10a`.
- Tenant integrations now begin with `Canais de venda`, separate 99Food/iFood cards and one primary action each. Provider-specific connection, multi-store management, product exceptions and activity/support are responsive overlays. Raw IDs, retry counts, inbox wording, billing and admin terminology are outside the default journey; support details remain behind the existing restricted settings surface.
- New orders may persist the existing catalog mapping automatically only for an exact, unique tenant product UUID/SKU: 99Food accepts `app_item_id` only and iFood accepts its merchant SKU only. Names, volatile IDs, duplicated codes, missing identities and items with options fail closed; those orders remain operable with no incorrect stock depletion and a divergence. Later association does not apply retroactive stock.
- No schema or migration, provider availability write, financial/billing rule, lifecycle/CAS, KDS, printing, realtime, deliveryStatus, remote database or deploy action changed. Focused API marketplace tests and web integration tests are recorded with the PR gate; authenticated desktop/mobile acceptance and required CI remain pending before promotion.

## Financeiro: valores seguros e jornada simplificada (2026-09-19)

- Branch: `fix/finance-safe-values-ux`, based on `origin/main-copy` / `e61e1f8758b5b1f544b1ed7f959ec2078b00b1a2`.
- Financeiro passa a ler um resumo próprio protegido por `finance.read`, sem depender de `reports.read`. A tela separa vendas concluídas, entradas registradas, repasses 99Food documentados, contas a pagar, saldo atual das contas e caixa operacional do PDV; nenhum desses valores é consolidado como lucro contábil. O saldo das contas é explicitamente atual e independente do período.
- Lançamentos pagos exigem conta financeira e data válida (com data atual como padrão editável). Criações manuais recebem chave de idempotência por operação; repetição da mesma chave retorna o lançamento existente, mas lançamentos iguais com chaves diferentes continuam permitidos. Um lançamento pago não pode ser reaberto, cancelado, ter valor/conta alterados ou apagar o efeito no saldo sem um estorno próprio.
- A migration aditiva cria a chave única opcional tenant/operação. Registros pagos históricos sem data não foram modificados: o resumo os quantifica e a tela orienta revisão individual.
- Repasses 99Food permanecem no fluxo já idempotente e com bloqueio de divergência. O painel mostra a síntese antes de detalhes técnicos colapsados. iFood não é apresentado como repasse financeiro confirmado.
- Ainda necessário antes de promoção: executar os gates completos e CI da PR, aplicar/validar a migration em ambiente seguro e fazer aceitação autenticada desktop/mobile, inclusive finance.read sem reports.read e uma consulta provider 99Food com WhiteList.

## C1 + C2 — Isolamento e hardening do Pizza Engine (2026-09-26)

- Branch isolada: `fix/pizza-engine-isolation`, criada de `main-copy` em `cde5a0b69a06e3dc5d30b72e2096c1a49d5d112c`; a PR #107 de soft-delete/audit log permaneceu separada e aberta.
- Storefront agora decide o fluxo de pizza exclusivamente por `category.templateType === 'pizza'`. Grupos genéricos de tamanho, `pricingAxis: primary`, `replace` e nomes como montagem não ativam mais a UI, simulação ou `pizzaComposition`.
- Pizza Engine continua usando o modelo existente, sem migration própria, e valida tenant, estado ativo do tamanho e grupo, sabores ativos/disponíveis da categoria pizza e o vínculo estrutural `PRIMARY` do grupo selecionado para todos os sabores. Item de tamanho de outro grupo ou tenant é rejeitado.
- Cobertura nova: regressão Açaí configurável com tamanho/primary/replace/montagem; checkout rejeita `pizzaComposition` em categoria normal; engine cobre pizza válida, categoria não-pizza, tamanho cross-tenant ou sem vínculo, sabor indisponível e frações inválidas.
- Fora de escopo preservado: `allowHalfHalf`, redesign de `ProductOptionItemPrice`, união discriminada completa do DTO, automação transacional de categoria/template, snapshots históricos, OrdersService e redesign de cadastro.

## Dokploy — correção da imagem da API (2026-09-26)

- O `docker-compose.prod.yml` usa `apps/api/Dockerfile`. O estágio final recebia `apps/api/node_modules`, cujos pacotes `@gestor/*` são links de workspace para `/app/packages`, mas não recebia essa árvore; o container poderia falhar ao resolver os módulos internos no startup.
- O builder agora usa `pnpm --filter @gestor/api... build` e o runner copia `/app/packages`. Isso mantém os artefatos das dependências internas e os alvos dos links presentes na imagem final.
- Validações locais: build das dependências da API concluído sem erro; `docker compose -f docker-compose.prod.yml config --no-interpolate --quiet` passou. O build da imagem e o startup do container permanecem pendentes pois o daemon Docker local estava indisponível; nenhum deploy, migration ou alteração remota foi executado.
- O log posterior do Dokploy expôs seis erros TypeScript em `PizzaEngineService`: o código tentava selecionar `deletedAt` em `OptionItem`/`OptionGroup` e `isActive` em `ProductOptionItemPrice`, campos ausentes no schema. As referências foram removidas, preservando as validações de tenant, item/grupo ativos, vínculo `primary` e sabores ativos/disponíveis. A suíte focal passou (6/6) e `pnpm --filter @gestor/api... build` voltou a concluir sem erro.
## Catálogo — Fase 3A/3B: arquivamento seguro e AuditLog (2026-09-26)

- Branch: `feat/catalog-soft-delete-audit-log`, derivada após a Fase 2 de overrides. A auditoria confirmou que OptionGroup/OptionItem usavam hard-delete; OptionItem → OptionGroup, ProductOptionGroupLink → OptionGroup e ProductOptionItemPrice → OptionItem têm `onDelete: Cascade`, portanto a remoção física apagava vínculos e overrides.
- A fase adota o padrão existente `deletedAt`, não cria `archivedAt`: `isActive` continua sendo indisponibilidade temporária e `deletedAt` remove o cadastro de novos usos e das leituras operacionais. Grupos/itens não possuem unique por nome, então manter um nome arquivado não bloqueia um novo cadastro.
- `DELETE` legado passou a arquivar por compatibilidade. Endpoints explícitos de archive/restore preservam links e overrides; restore limpa somente `deletedAt`. Nenhum hard-delete é exposto na UI comum.
- Storefront, detalhe de produto/POS, linkagem por produto e Checkout filtram/rejeitam grupos ou itens arquivados no servidor. Pedidos históricos usam `snapshotCatalogV2Json`/snapshots de OrderItem, sem FK viva para apresentar opções em KDS/impressão.
- `AuditLog` existente é tenant-scoped e agora registra criação, edição, arquivo/restauração de grupo/item e alterações de vínculo/override, com userId autenticado quando a chamada vem dos controllers. Não há PII de cliente nos detalhes.
- Validação: Prisma generate e teste focado `option-groups.service.spec.ts` 2/2 PASS; `check:no-any`, typecheck, lint e build completos PASS; `git diff --check` PASS. A suíte usava dois casts duplos apenas no mock do serviço, removidos sem alterar comportamento de produção. Permanecem pendentes migration em banco efêmero, testes autenticados de storefront/checkout e CI/Preview. Nenhum banco remoto, provider ou deploy foi executado.
## ProductOptionItemPrice migration gap (2026-09-27)

- A migration `20260927004807_product_option_item_price_availability` corrige somente o drift entre o schema Prisma e a tabela fisica: adiciona `product_option_item_prices.is_active` nullable e torna `price` nullable. O schema, servicos de catalogo/storefront e Pizza Engine nao foram alterados.
- Causa confirmada: o commit `9bda6ca9` introduziu os campos no schema sem migration; a migration inicial mantinha `price NOT NULL` e nao criava `is_active`. O erro do Dokploy em `GET /api/v1/public/storefront/:slug` confirma a ausencia de `is_active` no banco que servia a API.
- Validacao local: `prisma validate`, `pnpm db:generate`, `pnpm check:no-any`, typecheck, lint (17 warnings preexistentes no storefront), build completo, teste API de parser de opcoes (4/4) e storefront CategoryNavigation (2/2) passaram. A execucao da migration em PostgreSQL efemero ficou pendente porque o Docker Desktop local nao estava disponivel; nenhum banco remoto foi consultado ou alterado.
- Operacao posterior obrigatoria: apos merge, seguir o runbook Dokploy com backup verificavel, auditoria de destino e `api-migrate`; somente apos exit code zero reiniciar a API e validar o endpoint publico. Nao usar `prisma db push`.

## C2.5A-D - estabilidade do configurador e Option Groups (2026-09-27)

- Branch: `fix/product-configurator-option-groups-stability`, derivada de `fix/pizza-engine-isolation-main-copy` em `b326f68d`.
- O modal publico passa a resetar selecoes somente quando o produto muda e reconcilia grupos genericos sem perder itens validos durante render/refetch. A regra efetiva e compartilhada: `single` usa maximo 1, required usa minimo 1 e overrides do vinculo prevalecem.
- Checkout reaplica as mesmas invariantes antes de validar e gravar o snapshot. O middleware Prisma invalida cache do Storefront para `ProductOptionGroupLink`, `OptionItem` e `ProductOptionItemPrice`, alem dos modelos ja relevantes; nenhum TTL ou migration foi alterado.
- A biblioteca autenticada recebe `_count.optionGroupLinks` compativel com a UI e distingue itens ativos de arquivados. O endpoint de detalhe aceita `includeArchived=true` para contexto administrativo.
- Validacao local: `pnpm db:generate`, testes focados Storefront 5/5, API 10/10 e Web Tenant 1/1, `check:no-any` e lint dos pacotes alterados. Build Storefront concluiu; gates longos globais/API/tenant exigem conclusao confirmada antes de PR. Nenhum deploy, banco remoto, migration ou Preview foi executado.

## C2.5E - redesign do configurador publico (2026-09-27)

- Branch: `feat/product-configurator-ux-redesign`, iniciada de `main-copy` apos a integracao da C2.5A-D.
- O modal publico agora usa dialog semantico, titulo associado, Escape, foco inicial/restaurado, trap de Tab e scroll lock. O conteudo possui uma unica area vertical rolavel, imagem mais contida em mobile e footer compacto permanente.
- Grupos genericos permanecem na mesma logica C2.5A-D, mas apresentam radios para escolha unica e checkboxes para multiplas escolhas; a linha inteira e clicavel e o estado selecionado e visivel. Uma tentativa invalida mostra o erro no grupo, rola e move o foco ao primeiro grupo generico invalido.
- Nenhuma regra de preco, Checkout, Pizza Engine, schema, migration ou API foi alterada. A loja fechada continua permitindo configurar e bloqueia apenas a finalizacao.
- Validacao local: teste focado `ProductDetailsModal` 6/6 e `tsc -p apps/web-storefront/tsconfig.json --noEmit` passaram. Build Vite e homologacao visual/autenticada desktop/mobile permanecem pendentes nesta sessao. Nenhum commit, push, deploy ou acao remota foi executado.
- Revisao C2.5E: erros genericos permanecem apenas inline; Pizza identifica e focaliza tamanho, montagem, sabores ou preco em seu proprio bloco, tambem com feedback inline. Produtos genericos exibem preco-base no cabecalho, as linhas de opcao ocupam integralmente o card com alvo de toque de pelo menos 44px, e o estado de loja fechada explica que a configuracao continua disponivel enquanto a finalizacao aguarda a abertura. A suite focada cobre a prioridade do controle Pizza; o workspace nao possui `jsdom` nem Testing Library instalados, portanto a interacao DOM autenticada/visual segue como gate manual.
## Storefront C2.5E.2 — Option group density (2026-09-28)

- O refinamento visual do configurador publico preserva integralmente o contrato de option groups: `single` usa radio sem stepper, `multiple` usa checkbox sem stepper e `quantity` mostra stepper somente para item selecionado com `allowQuantity`. Nenhuma decisao depende do nome do grupo, inclusive “Escolha o Tamanho”.
- Os grupos genericos agora usam lista vertical compacta, estado selecionado discreto, preco alinhado e stepper em linha propria curta; imagem foi reduzida e footer, validacao inline, foco/scroll e Pizza Engine permanecem inalterados.
- Validacao local desta iteracao: teste focal do ProductDetailsModal 8/8, `check:no-any`, typecheck, lint, `git diff --check` e build oficial do Storefront passaram. Commit, push e Preview permanecem pendentes para homologacao visual.
# P1.1 — Canonical catalog pricing core (2026-10-01)

- Created the pure `@gestor/pricing` workspace package with integer-cent and basis-point types, a deterministic generic option resolver, and starting-price calculation.
- The package has no Prisma, NestJS, React, HTTP, schema, migration, or consumer dependency. Checkout, Storefront, POS, cart, Pizza, Combo, snapshots and cache remain unchanged.
- Contract enforced: `replace` is primary-only and quantity 1; fixed follows replacement; percentage uses the effective base with HALF_UP rounding; option overrides replace only effective values; `minSelect` counts distinct selected item IDs while `minQty`/`maxQty` constrain each item.
- The package test suite covers base/fixed/replace/percentage behavior, payload-order independence, quantity invariants, and required/optional starting-price configurations. Migration of consumers is deferred to P1.2.
# P1.2 — Checkout canonical catalog pricing (2026-10-01)

- `CheckoutValidatorService` now keeps server-side tenant, product, activity, required/min/max, duplicate, quantity and snapshot validation, then adapts only validated generic option data into `@gestor/pricing`.
- The adapter converts persisted reais to integer cents and percentages to basis points; `ProductOptionItemPrice` supplies the effective value without changing the persisted impact type. The Checkout remains the final authority because no client price enters the adapter.
- Pizza and Combo flows, POS, Storefront, cart, schema, migrations, snapshots, printer/KDS and cache remain unchanged. A compatibility adjustment in the pricing core permits a configured `maxSelect` above the current available item count.
- Validation: pricing suite 12/12; focused CheckoutValidator suite 12/12; package/API builds, `check:no-any`, global typecheck, lint and `git diff --check` passed. Consumer migration beyond Checkout is deferred to P1.3.
- CI integration follow-up: API `prebuild` and `pretest` build `@gestor/pricing` before isolated API jobs. The API's own TypeScript configs resolve the package source, including `tsconfig.build.json`, which replaces inherited paths. This prevents isolated CI jobs from depending on a prior root build artifact.

# P1.3 — Storefront canonical catalog pricing (2026-10-01)

- The public Storefront payload now includes individual option quantity limits. The Storefront adapts that effective public data, including link-level selection overrides and item availability/price overrides, to `@gestor/pricing`; it does not calculate generic option prices locally.
- Product cards and the modal use canonical starting-price and unit-price results. Invalid in-progress selections retain the base-price preview until their existing inline validation is satisfied; the Checkout remains the server-side pricing authority.
- Pizza Engine, Checkout, cart, POS, Combo, schema, migrations, snapshots, printing/KDS and cache remain unchanged. Consumer migration after this work is deferred to P1.4.

# P3.1 — Atomicidade de ProductOptionGroupLink (2026-10-02)

- `link`, atualização de vínculo/eixo e `unlink` agora executam em transação PostgreSQL serializável, com retry limitado para conflitos `P2034`. A validação de conflito `primary + replace`, a promoção administrativa `simple → configurable` e a escrita do vínculo fazem parte da mesma unidade de commit.
- O unlink remove, na mesma transação, os overrides de todos os itens do grupo — inclusive itens soft-deleted — antes de remover o vínculo. Audit log e invalidação de cache permanecem estritamente pós-commit.
- A cobertura unitária valida rollback lógico e ausência de efeitos pós-commit em falhas; a nova integração PostgreSQL entra no gate de concorrência da CI e prova que duas mutations simultâneas mantêm apenas um vínculo `primary` com `replace`.
- Não houve migration, alteração de pricing, Pizza, Combo, Storefront, Checkout, archive/restore ou outbox. A integração PostgreSQL não foi executada localmente por ausência de `DATABASE_URL`/`DIRECT_URL` efêmeros.

# P3.2 — Invariantes de replace, secondary e quantidade (2026-10-02)

- A autoria no backend agora rejeita item `replace` ativo em grupo vinculado ao eixo `secondary`. A projeção acontece antes de criar/editar item, ativar/editar grupo, criar vínculo e mover o eixo; a escrita só ocorre se o estado final for válido.
- Um item `replace` exige `allowQuantity=false`, `minQty=1` e `maxQty=1`, impedindo faixa que permita quantidade maior que um. As operações usam transações serializáveis; audit log e invalidação de cache continuam pós-commit.
- Cobertura unitária verifica rejeição sem persistência e edição válida fora de grupo vinculado. A prova PostgreSQL ampliada confirma que criar ou editar `replace` em grupo `secondary` preserva o item original e não insere o novo. Sem migration, alteração de `@gestor/pricing`, Pizza, Combo, override/reset, archive/restore ou outbox.

# P3.3 — Integridade de ProductOptionItemPrice (2026-10-02)

- `ProductOptionItemPrice` é tratado como override local apenas de `price`, `costPrice` e `isActive`; não há escrita de semântica global do `OptionItem`. A rota de reset remove o registro de override, sem copiar preço global nem editar o item mestre.
- Produto, item ativo não arquivado e vínculo item-grupo-produto são validados dentro da transação serializável antes de qualquer upsert/delete. Overrides iguais ao `priceImpactValue` global são removidos, para que mudanças globais futuras sejam herdadas novamente.
- Audit e invalidação de cache ocorrem somente após commit. Não houve migration, mudança no pricing canônico, Product.type, Pizza, Combo, archive/restore ou outbox.
## 99Food contract closure (2026-10-02)

- Financeiro 99Food usa token de aplicação separado via `v3/auth/authtoken/signIn`; o cache em memória respeita `expiresIn` e não grava nem substitui o token operacional por loja.
- Bill Data aceita o envelope oficial `errno` + `data.data`, os tipos 1/2/3/4/5/8/9 e preserva sinal. VAT, apelação, perda de refeição, CNPJ/CERC e demais fatos novos permanecem somente explicativos; Bill nunca posta saldo.
- Settlement passou a ser único por tenant/provider/conexão/weekPaymentId. A migration é aditiva para campos e substitui somente a constraint de identidade, cuja forma anterior já impedia colisões históricas.
- Order Details com status nativo 600 chega à transição canônica de conclusão; cash 99Food usa `shop_paid_money` para entrega da plataforma e `customer_need_paying_money` para entrega própria. `payConfirm` é explícito, protegido por elegibilidade/idempotência e não cria lançamento financeiro.
- ACK de webhook permanece deliberadamente inalterado (`204`), pois esta entrega não reabre seu contrato específico. Nenhuma chamada real à 99Food, banco remoto, deploy ou merge foi executado.

## 99Food authorization recovery and financial precondition (2026-10-03)

- Branch `fix/99food-auth-verification-recovery`, based on `origin/main-copy` / `6a0af7732d15eb963c61457f5af97951be4a5aeb`.
- The self-service verifier now requests the documented one-time shop-token `refresh -> get` only when the persisted operational token is absent or unusable. Concurrent requests remain coalesced by `Food99TokenService`; a valid persisted token is reused without a refresh. A non-transient unconfirmed authorization becomes `409 AUTHORIZATION_NOT_READY`, while a transient provider outage becomes `503 PROVIDER_UNAVAILABLE`; secrets and provider payloads are not returned.
- 99Food financial sync now rejects a non-`CONNECTED` shop before calling the Financial API, with `409 AUTHORIZATION_NOT_READY`. The reconciliation read model includes only the connection status needed by the Finance UI to disable Sync and link the manager to Canais de venda. Financial sign-in, parser, settlement posting, account selection, schema and migrations remain unchanged.
- Local provider/DB calls were not made. Focused API tests cover refresh selection, repeat verification, semantic errors and no financial-client call for a pending shop; the finance-panel contract test covers the disabled Sync path. Full gate/CI results must be recorded with the final branch commit.

## 99Food authorization lifecycle contract correction (2026-10-04)

- Branch `fix/99food-authorization-lifecycle`, based on `origin/main-copy` / `5e0a2a2b7d6965da2d8f24593b9f936ee10fc9f5`.
- The guided verifier keeps its `POST /api/v1/marketplaces/99food/self-service/verify` contract. A `GET` request is unsupported and is not added merely to hide a 404.
- Shop token verification now calls documented `get` first. `10101` is actionable absence and never triggers refresh; `10102` is the sole refresh path, which then returns a retry-after result so a second `get` cannot violate the 30-second window. Provider errors are semantic, sanitized and tenant-safe.
- The later provider contract supplies the authorized-shop and bind shapes. Discovery and binding are implemented with mocks only; no provider, remote database, deployment, schema or migration action occurred.

## 99Food production-app / bind readiness audit (2026-10-04)

- Continued PR #128 on `fix/99food-authorization-lifecycle`. The real base remains `5e0a2a2b7d6965da2d8f24593b9f936ee10fc9f5`; no new branch, schema, migration, provider call, remote database operation or deployment was used.
- Operational 99Food calls use the `openapi.didi-food.com` configuration path; Financial sign-in, Bill Detail and Bill Week use the distinct `openapi.99food.com` configuration path. Credential-key versioning selects encryption keys for stored `enc:v2` data only and cannot rewrite application credentials sent to 99Food.
- The official `shop/list` response list/page schema is still absent, so that endpoint remains unimplemented. The separate self-service `getAuthorizedShops` and `shopBind` contract is implemented. Provider production approval remains an external Developer Portal state.

## 99Food self-service bind closure (2026-10-04)

- `POST /marketplaces/99food/self-service/verify` remains the only verifier route; the tenant UI buttons are explicit non-submit buttons and focused browser-method tests assert POST for verification and manual reconnect.
- A `10101` now discovers authorized shops. One eligible unbound shop is revalidated and bound once; multiple shops return an explicit selection state; a selected ID is revalidated server-side before bind; a shop bound to another app identity is rejected. `shop_infos` is signed as `Array` and `success_list.auth_token` plus `token_expiration_time` are required before encrypted token persistence and `CONNECTED`.
- No schema or migration was added. The untracked local `apps/api/prisma/migrations/20261004213232_test/` was not modified or staged because it is outside this task. Provider, remote database and deploy validation remain pending.
- Live confirmation exposed numeric 64-bit `shop_id` values in the authorized-shop response. The client now preserves that decimal token before JSON parsing and maps an invalid discovery response to a sanitized provider error rather than an unhandled `500`. The HTTP-method test declares jsdom explicitly so the repository-wide node-default suite can execute it.
