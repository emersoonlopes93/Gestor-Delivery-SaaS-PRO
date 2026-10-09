# ADR — Fundação de Marketing Analytics do cardápio

- Status: aceito para implementação incremental
- Data: 2026-07-28
- Versão: 1.0.0
- Escopo desta decisão: arquitetura, contrato e políticas técnicas
- Relacionados: [auditoria do cardápio](../audits/marketing-analytics-cardapio-audit.md), [contrato TypeScript v1](../../packages/types/src/marketing-analytics.ts)

## Status

Esta ADR define a fundação canônica. A PR 0A não implementa ingestão, persistência, instrumentação, agregação, dashboard nem adapters de providers.

## Contexto

O analytics existente é transacional, autenticado e derivado principalmente de `Order`, `OrderItem`, `OrderTimeline`, billing e campanhas. Ele não mede de forma first-party a navegação anônima do cardápio, o funil web ou atribuição UTM.

Order, OrderTimeline e billing continuam autoritativos para estado do pedido e receita. Eventos comportamentais descrevem interação; não substituem eventos de domínio nem autorizam mutações.

## Problema

Sem uma taxonomia e políticas comuns, cada consumidor poderia escolher nomes, marcos de conversão, consentimento, PII e deduplicação diferentes. Isso produziria dashboards dependentes de providers, dupla contagem browser/server e risco de isolamento entre tenants.

## Objetivos

- definir uma taxonomia first-party versionada;
- manter eventos comportamentais, de domínio e de entrega para provider separados;
- estabelecer consentimento default deny e uma allowlist sem PII;
- formalizar métricas, atribuição, retenção, escala e ameaças;
- permitir que implementações futuras sejam tenant-safe, idempotentes e testáveis;
- fazer do analytics first-party a fonte do dashboard do tenant.

## Não objetivos

Esta decisão não cria endpoint, dispatcher, tabela, migration, worker, dashboard, consent UI, GA4, Meta Pixel, Google Ads, CAPI ou configuração de provider. Não define parecer jurídico nem acessa banco ou serviço remoto.

## Decisões

1. Analytics first-party será a fonte do dashboard do tenant. GA4, Meta e Google Ads serão destinos opcionais.
2. O dashboard interno não dependerá da disponibilidade ou semântica de provider externo.
3. `Order`, `OrderTimeline` e billing permanecem autoritativos. Valores enviados pelo browser nunca serão fonte de receita realizada.
4. Evento comportamental, evento de domínio e entrega para provider são conceitos distintos:

   | Camada | Exemplo | Papel |
   |---|---|---|
   | domínio | `order.completed` | fato interno autoritativo; nome existente não será alterado |
   | analytics normalizado | `order_completed` | fato analítico first-party, emitido no servidor |
   | provider | `purchase` | tradução futura do fato aprovado para um destino |

5. Tenant nunca poderá inserir JavaScript ou HTML livre. IDs de integração serão tipados, validados e armazenados em configuração própria.
6. Nenhum segredo de provider será exposto ao storefront. Somente identificadores explicitamente públicos poderão chegar ao browser.
7. O fluxo futuro será:

   ```text
   Storefront
   → dispatcher first-party
   → endpoint público por slug
   → validação e deduplicação
   → persistência bruta
   → agregação assíncrona
   → API autenticada por tenant
   → dashboard
   → adapters opcionais para providers
   ```

8. A implementação futura rejeitará propriedades desconhecidas e resolverá `tenantId` pelo slug no servidor.

## Alternativas rejeitadas

| Alternativa | Motivo |
|---|---|
| usar GA4 como fonte canônica | cria dependência externa, dificulta isolamento e submete o produto à semântica do provider |
| medir somente pedidos | não observa interesse, abandono ou qualidade do funil |
| enviar `tenantId` pelo browser | permite falsificação do escopo de ingestão |
| aceitar `metadata` ou payload livre | amplia PII, cardinalidade, custo e superfície de ataque |
| aceitar script/HTML por tenant | cria risco de XSS, exfiltração e quebra de governança |
| tratar browser como fonte de receita | valores podem ser adulterados |
| disparar `purchase` ao renderizar página | refresh e navegação duplicam conversões |
| unificar evento de domínio e provider | acopla regras internas a nomes e disponibilidade externos |

## Consequências

O contrato é mais explícito e exige mapeamento por evento, mas reduz ambiguidade e cardinalidade. Mudanças incompatíveis exigirão nova versão. A infraestrutura futura terá custo de ingestão e agregação, compensado por independência de provider e métricas auditáveis.

## Multi-tenancy

- O envelope público v1 não contém `tenantId`.
- O servidor futuro resolverá o tenant pelo slug/host canônico e adicionará `tenantId` e `receivedAt`.
- Nenhum identificador enviado pelo visitante decide o tenant.
- Produto, categoria, carrinho e pedido serão validados dentro do tenant resolvido.
- A chave de deduplicação será única por `(tenantId, eventId)`.
- `sessionId`, `visitorId`, first touch e last touch nunca atravessarão tenant.
- Jobs futuros carregarão `tenantId` explicitamente e consultas operacionais terão filtro tenant-scoped.

## Privacidade

### Allowlist de dados

Permitidos:

- IDs opacos: `eventId`, `sessionId`, `visitorId`, `productId`, `categoryId`, `cartId`, `cartLineId`, `orderId`;
- quantidades, contagens, valores não autoritativos e `currency`;
- UTMs limitadas;
- `referrerHost` normalizado;
- `path` e `landingPath` sem query.

Proibidos:

- nome, email, telefone, CPF/CNPJ, endereço, coordenadas;
- observações, busca textual ou mensagens livres;
- dados de pagamento, token, cookie, `Authorization`;
- IP ou user-agent no payload público;
- URL completa com query, fingerprint, HTML ou JavaScript;
- segredo ou credencial de provider.

IP e user-agent, caso necessários para antiabuso, serão obtidos server-side, separados do evento analítico e sujeitos a retenção menor.

## Consentimento

A política técnica é default deny:

| Categoria | Padrão | Uso |
|---|---|---|
| necessary | ativo | carrinho, checkout, autenticação e preferências essenciais |
| analytics | inativo | persistência de telemetria comportamental |
| marketing | inativo | emissão para providers |

Sem consentimento analytics não haverá `visitorId` persistente nem telemetria comportamental persistida. Eventos de domínio do pedido continuam porque representam a operação solicitada pelo cliente.

A revogação interrompe novas emissões. Uma mudança na versão da política exige tratamento explícito; não converte consentimento antigo silenciosamente. O snapshot `{ analytics, marketing, version }` acompanha cada evento aceito. Esta é uma política técnica, não um parecer jurídico.

### Implementação da fundação local (PR 0B)

A fundação mínima do storefront persiste `StorefrontConsentRecordV1` somente no browser, em chave first-party separada por `StorefrontPayload.tenant.id`. `necessary` é sempre ativo; `analytics` e `marketing` começam inativos. Registro inválido, versão de política incompatível ou falha de storage volta ao default deny sem impedir compra ou navegação.

Não há persistência server-side nesta fase porque ainda não existe ingestão, provider ou finalidade operacional aprovada para um registro anônimo no backend. O consent manager expõe gates para implementações futuras e converte explicitamente sua decisão para `AnalyticsConsentSnapshotV1`. A arquitetura detalhada e a classificação dos storages existentes estão no [contrato de consentimento do storefront](../contracts/storefront-consent.md).

## Contrato de eventos

O contrato público está em `packages/types/src/marketing-analytics.ts`, usa `schemaVersion: 1`, união discriminada por `eventName` e schemas estritos.

### Identificadores e tempo

- `eventId`: UUID ou ULID; único por tenant após enriquecimento; chave de deduplicação.
- `sessionId`: aleatório, opaco, tenant-scoped, em `sessionStorage`, com rotação após 30 minutos de inatividade.
- `visitorId`: aleatório, opaco, tenant-scoped, sem fingerprint; persistente somente conforme consentimento.
- `occurredAt`: ISO 8601; o servidor futuro validará uma janela aceitável.
- `receivedAt`: gerado somente pelo servidor futuro.

### Eventos comportamentais v1

`menu_viewed`, `category_viewed`, `product_viewed`, `product_selected`, `add_to_cart`, `remove_from_cart`, `cart_viewed`, `checkout_started`, `checkout_step_completed`, `order_submitted`, `search_performed`, `coupon_applied`, `social_link_clicked`, `whatsapp_clicked`.

`search_performed` não transporta texto de busca; pode levar somente contagem de resultados. `coupon_applied` não transporta código livre.

### Eventos analíticos autoritativos v1

`order_confirmed`, `order_completed` e `order_cancelled` exigem `source: "server"` e `orderId`.

### Semântica de conversão interna

- `order_submitted`: criação do pedido aceita pelo backend; browser permitido, valor não autoritativo.
- `order_confirmed`: aceitação operacional.
- `order_completed`: venda operacional concluída.
- `order_cancelled`: cancelamento autoritativo.

### Providers futuros

- GA4 `begin_checkout` ← `checkout_started`;
- GA4 `purchase` ← marco aprovado na PR do GA4;
- Meta `InitiateCheckout` ← `checkout_started`;
- Meta `Purchase` ← marco aprovado na PR da Meta;
- Google Ads ← conversão única por `transaction_id`.

`purchase` nunca dispara por renderização. Usará `transaction_id/orderId` e será idempotente. Quando CAPI existir, browser e server compartilharão `eventId`. O marco final de cada provider será deliberado na PR correspondente. Para Google Ads, prefere-se importação do GA4 salvo necessidade comprovada.

## Métricas

Todas as razões devem declarar período, timezone, filtros, numerador, denominador e política de divisão por zero. Sessões são tenant-scoped.

| Métrica | Fórmula canônica |
|---|---|
| visitas | sessões distintas com `menu_viewed` |
| visitantes estimados | `visitorId` distintos com consentimento |
| conversão do cardápio | sessões com `order_submitted` ÷ sessões com `menu_viewed` |
| taxa de visualização | sessões com `product_viewed` ÷ sessões com `menu_viewed` |
| taxa de adição | sessões com `add_to_cart` ÷ sessões com `product_viewed` |
| abandono de carrinho | sessões com `add_to_cart` e sem `order_submitted` na mesma janela |
| abandono de checkout | sessões com `checkout_started` e sem `order_submitted` na mesma janela |
| aceitação | pedidos confirmados ÷ pedidos submetidos |
| conclusão | pedidos concluídos ÷ pedidos submetidos |
| receita potencial | pedidos submetidos/confirmados, sempre rotulada como potencial |
| receita realizada | pedidos concluídos, usando domínio/billing |
| interesse do produto | sessões com `product_viewed` do produto ÷ sessões com `menu_viewed` |
| adição do produto | sessões com `add_to_cart` do produto ÷ sessões com `product_viewed` do produto |
| conversão do produto | pedidos distintos contendo o produto ÷ sessões com `product_viewed` do produto |

Não se estima visitante por IP ou fingerprint. Combos, adicionais, produtos removidos e renomeados exigem regras de dimensão histórica antes da agregação.

## Atribuição

- first touch: primeira origem conhecida da sessão/visitante consentido; não é sobrescrita a cada navegação;
- last touch: última origem elegível antes de `order_submitted`; atualiza somente por regra explícita;
- direct: ausência de UTM e de referrer externo válido.

A atribuição é tenant-scoped. `referrerHost` contém somente host normalizado, `landingPath` não contém query e UTMs têm limite de tamanho. A origem nunca cruza tenant.

## Retenção

Proposta técnica inicial:

| Classe | Prazo proposto |
|---|---|
| eventos brutos | 90 dias |
| agregados | 24 meses |
| sinais de antiabuso | prazo menor a definir |
| registros de consentimento | conforme obrigação a definir |

Os prazos jurídicos estão **NÃO CONFIRMADOS**. O dashboard consultará agregados; não fará scans indefinidos sobre eventos brutos.

## Escala

| Cenário | Estratégia candidata |
|---|---|
| baixo volume | batch pequeno e agregado periódico |
| médio volume | BullMQ e agregados |
| alto volume | particionamento, rollups e possível storage analítico |

Uma evolução depende de evidência: `EXPLAIN ANALYZE`, p95, taxa de ingestão, eficiência dos índices e volume por tenant. Não se adota storage externo apenas por expectativa.

## Threat model

| Ameaça | Vetor | Impacto | Probabilidade | Mitigação futura | Teste futuro | Risco residual |
|---|---|---|---|---|---|---|
| `tenantId` falsificado | campo ou header do browser | cross-tenant | alta sem controle | tenant por slug no servidor; campo proibido | payload com tenant divergente é rejeitado | slug/host mal configurado |
| `productId/orderId` cross-tenant | ID válido de outro tenant | vazamento/corrupção | média | validação tenant-scoped | IDs estrangeiros retornam rejeição uniforme | enumeração temporal |
| replay | reenvio do mesmo evento | dupla contagem | alta | unique `(tenantId,eventId)` | repetir evento mantém uma ocorrência | replay com novo ID |
| batch flood | muitas requisições/eventos | indisponibilidade/custo | alta | batch pequeno, rate limit, quotas | burst excedente recebe limite | bot distribuído |
| payload oversized | corpo/campos grandes | memória/CPU | média | body limit e limites por campo | corpo acima do limite é rejeitado | compressão abusiva |
| `occurredAt` inválido | futuro/passado arbitrário | agregados incorretos | média | janela e `receivedAt` server-side | datas fora da janela falham | relógio do cliente |
| PII em UTM/referrer | texto codificado | incidente de privacidade | média | tamanho, allowlist, normalização e detecção | email/query em atribuição falha | PII não reconhecida |
| bots | navegação automatizada | métricas infladas | alta | rate, heurística server-side separada e visão filtrada | collector fake/bot conhecido | falsos positivos |
| duplicação browser/server | dois produtores | dupla conversão | alta | semântica de origem, eventId correlato e dedup | mesmo fato em duas origens conta uma vez | correlação ausente |
| duplicação Pixel/CAPI | emissão paralela | gasto/ROAS incorreto | alta | `event_id` compartilhado | fake collectors validam dedup | provider fora de janela |
| consentimento ignorado | dispatcher/provider sem gate | violação de política | média | consent gate central e default deny | revogação bloqueia novas emissões | race durante revogação |
| script arbitrário | configuração livre do tenant | XSS/exfiltração | média | proibir HTML/JS; IDs tipados | config com script é rejeitada | falha em adapter |
| segredo exposto | bootstrap/log/payload | comprometimento | baixa/média | segredo server-side, redaction e allowlist | snapshot público não contém segredo | erro operacional |
| scan analítico excessivo | dashboard sobre bruto | latência/DoS | alta com crescimento | agregados, índices e limites de período | plano/p95 dentro do orçamento | tenant extremo |
| retenção indefinida | ausência de expurgo | custo/privacidade | média | políticas e jobs observáveis | fixture expirada é removida | job parado |
| spoof de sessão/visitante | IDs escolhidos pelo cliente | atribuição poluída | alta | formato, rotação, rate e não autoritatividade | IDs inválidos/longos falham | IDs válidos fabricados |
| callback falso | endpoint/provider simulado | conversão forjada | média | autenticação/assinatura, idempotência e allowlist | assinatura inválida não produz evento | segredo comprometido |

As implementações futuras também terão DTO discriminado estrito, rejeição de campos extras, observabilidade e collectors fake nos testes.

## Testes

O contrato v1 cobre:

- nomes sem duplicatas e `schemaVersion` igual a 1;
- separação browser/server;
- ausência de `tenantId` e campos proibidos;
- IDs obrigatórios por categoria de evento;
- quantidade positiva, `currency: "BRL"` e consentimento obrigatório;
- schemas estritos e export público compilável.

PRs futuras acrescentarão testes tenant-scoped, replay, rate/body limit, consent gate, retenção, agregação determinística, collectors fake e idempotência de provider.

## Plano incremental

| PR | Objetivo | Migration | Arquivos prováveis | Dependências | Riscos | Testes | Aceite | Rollback |
|---|---|---|---|---|---|---|---|---|
| 0A | fundação, ADR e contrato | não | `docs/`, `packages/types`, teste de contrato | nenhuma nova | ambiguidade semântica | schemas/invariantes/build | políticas e contrato aprovados | reverter docs/exports |
| 0B | consentimento mínimo | talvez, se registro server-side | storefront, types | 0A | emissão antes do opt-in | default deny, grant/revoke/version | nenhuma emissão indevida | desativar dispatcher |
| 1A | `AnalyticsEvent` e endpoint | sim | Prisma, analytics API | 0A/0B | cross-tenant, flood, replay | integração Postgres, rate, tamanho, dedup | tenant resolvido e ingestão idempotente | desligar endpoint; preservar tabela |
| 1B | dispatcher e storefront | não | `web-storefront/lib/analytics`, pontos do funil | 0B/1A | emissão duplicada | unitários e E2E por ação | uma emissão consentida por ação | feature flag off |
| 1C | eventos autoritativos | talvez não | orders, analytics consumer | 1A | dupla conversão/status | idempotência por pedido/status | fatos de servidor correlacionados | desligar consumer |
| 2A | agregação | sim | Prisma, analytics worker, BullMQ | 1A/1C | contagem incorreta/replay | recomputação determinística | agregado reconcilia com fonte | pausar worker; recomputar |
| 2B | APIs analíticas | não | analytics API/types | 2A | scan/cross-tenant | query, RBAC, p95 | fórmulas e isolamento verificados | ocultar endpoints |
| 2C | interface Desempenho | não | web-tenant analytics | 2B | interpretação enganosa | estados vazios, período, visual/E2E | rótulos e fórmulas visíveis | feature flag off |
| 3A | UTMs e atribuição | talvez não | storefront, analytics types/worker | 1B/2A | PII e sobrescrita | first/last/direct e limites | atribuição tenant-scoped | parar captura e recomputar |
| 3B | links sociais | sim se modelo próprio | settings/types/storefront | 1B | URL/script inseguro | allowlist HTTPS e clique | links tipados, sem script | ocultar configuração |
| 4 | consent center | sim | storefront/API/tenant UI | 0B | revogação incompleta | grant/revoke/audit/version | estado auditável e aplicado | default deny global |
| 5 | GA4 | sim se integração persistida | adapter/config/storefront | 4/2A | PII/duplicação | collector fake e DebugView não produtivo | provider opcional e consentido | desligar adapter |
| 6 | Meta Pixel | sim se integração persistida | adapter/config/storefront | 4/2A | Pixel/CAPI duplicado | collector fake e `event_id` | nenhuma dupla compra | desligar adapter |
| 7 | Google Ads | sim se configuração direta | adapter/config | 5/4 | conversão duplicada | fake, `transaction_id`, valor/moeda | uma conversão por pedido | remover vínculo/adapter |
| 8 | CAPI, se justificado | talvez | worker/provider adapter | 6/1C | retries e reconciliação | fake provider, retry, dedup | evidência de ganho e operação segura | kill switch; manter browser |

Cada PR deve preservar contratos de tenant, registrar exit codes e parar antes de provider real/deploy quando isso não estiver explicitamente autorizado.

## Decisões futuras

- obrigação jurídica e prazos finais de retenção;
- marco exato de `purchase` por provider;
- consentimento necessário para analytics first-party estritamente agregado;
- dimensão histórica de combos, adicionais e produtos removidos/renomeados;
- regras de bot e apresentação de bruto versus filtrado;
- propriedade GA4 por tenant ou central com dimensão controlada;
- importação GA4 versus tag direta no Google Ads;
- limiar medido para particionamento ou storage analítico;
- necessidade e benefício comprovado de CAPI.
