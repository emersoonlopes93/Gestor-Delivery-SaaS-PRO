# AUDIT R5 — Preview administrativo e storefront público

## Atualizacao arquitetural - 2026-08-31

- `@gestor/storefront-preview` passou a ser a fonte neutra dos primitives de
  renderizacao compartilhados entre o preview administrativo e o storefront
  publico: shell/theme provider, navegacao de categorias, showcase, renderers de
  produto, tipos/conversor e fallback de imagem.
- `@gestor/storefront-ui` preserva compatibilidade por re-export e mantem apenas
  o empty state especifico que nao participa do preview.
- O web-tenant importa diretamente a camada neutra. A regra que proibe
  `web-tenant -> @gestor/storefront-ui` permanece inalterada, sem allowlist.
- Os assets e a implementacao continuam com uma unica fonte de verdade; nao ha
  ciclo de packages nem alteracao visual ou funcional intencional.

Data: 2026-08-01
Base: `7b9d89c6a0b7f79f79c2a168080a85fec4d44657`

## Inventário

- Public entry: `apps/web-storefront/src/App.tsx`, rota `/:tenantSlug`, página `StorefrontPage` dentro de `StorefrontLayout`.
- Preview entry: `apps/web-tenant/src/features/settings/StorefrontCustomizationPage.tsx`.
- Public data source: `GET /public/storefront/:slug?fulfillmentType=delivery|pickup`, resolvido por `StorefrontService.getStorefrontPayload`.
- Preview data source: `GET /tenant/storefront-customization`, `/catalog/categories`, `/catalog/products` e `/tenant/me`, adaptados no navegador.
- Public payload type: `StorefrontPayload` de `@gestor/types`.
- Preview payload type: combinação local de `ProductCategory`, `Product`, `Tenant` e `StorefrontCustomizationPayload`.
- Public renderer root: `StorefrontShell` + `StorefrontPage`.
- Preview renderer root: mock de telefone e renderer local em `StorefrontCustomizationPage`.
- Shared ProductRenderer: público sim; preview não.
- Shared CategoryNavigation: público sim; preview não.
- Shared layout resolver: API pública e endpoint de settings normalizam com `normalizeStorefrontLayout`; o preview reinterpreta partes do layout localmente.
- Draft/published semantics: não existe versão draft/published persistida nem autosave. O estado ainda não salvo vive apenas no navegador; `PATCH /tenant/storefront-customization` publica a configuração salva. O preview não deve salvar automaticamente.
- Theme source parity: ambos partem de `storefrontThemeJson`, porém o preview recompõe tokens CSS paralelos em vez de usar `StorefrontThemeProvider`.
- Availability parity: público usa `AvailabilityService.decideMany`; preview usa flags brutas e filtro local incompleto.
- Fulfillment parity: público distingue delivery/pickup no canal e na cache; preview não oferece simulação de fulfillment.
- Showcase MANUAL parity: parcial; preserva IDs configurados, mas filtra com regra local diferente e usa renderer diferente.
- Showcase AUTOMATIC parity: ausente no preview.
- Showcase HYBRID parity: ausente para a parcela automática no preview.
- Ranking source: servidor, `BusinessIntelligenceService.getStorefrontBestSellers`, janela de 30 dias, pedidos concluídos, cache de 15 minutos; não deve ser reproduzido no navegador.
- Cache parity: público usa `storefront:<slug>:<fulfillmentType>` e invalida delivery/pickup ao salvar settings; writes tenant-scoped de produto/categoria/publicação também disparam `storefront.invalidate` pelo middleware canônico do Prisma. Ranking usa cache em memória de 15 minutos. Preview não possui cache próprio. Um preview de draft deve resolver sem gravar nem contaminar a cache pública.

## Matriz de contrato

| Item | Classificação antes da R5 | Evidência resumida |
| --- | --- | --- |
| tenant identity, store name, logo | BUG — DIFFERENT SOURCE | público usa payload canônico; preview combina `/tenant/me` |
| cover/banner | BUG — DIFFERENT RENDERER | tokens e composição paralelos |
| theme tokens, fonts, radius | BUG — DIFFERENT TRANSFORM | variáveis `--preview-*` reimplementadas |
| spacing, card style, image ratio | BUG — DIFFERENT RENDERER | cards locais por layout |
| category layout | BUG — DIFFERENT RENDERER | navegação local ignora `CategoryNavigation` |
| category order/visibility | BUG — DIFFERENT SOURCE | catálogo administrativo bruto versus query pública ativa |
| product order/visibility | BUG — DIFFERENT SOURCE | filtro local não cobre publicação e regras por canal |
| price, compareAtPrice, badges, images | BUG — DIFFERENT TRANSFORM | adapter local usa subconjunto do produto administrativo |
| availability | BUG — DIFFERENT SOURCE | flags locais versus `AvailabilityService.decideMany` |
| delivery/pickup | BUG — DIFFERENT SOURCE | preview não informa canal |
| store status | INTENTIONAL PREVIEW DIFFERENCE | chrome administrativo pode indicar que é simulação; disponibilidade do produto continua canônica |
| smart showcase manual | BUG — DIFFERENT TRANSFORM | eligibility local |
| smart showcase automatic/hybrid | BUG — DIFFERENT SOURCE | ranking real não chega ao preview |
| maxItems, title, deduplication | BUG — DIFFERENT TRANSFORM | somente seleção manual local |
| horizontal categories | BUG — DIFFERENT RENDERER | tabs locais |
| search/filter | INTENTIONAL PREVIEW DIFFERENCE | controles do consumidor não são necessários no editor |
| empty states | INTENTIONAL PREVIEW DIFFERENCE | preview precisa orientação administrativa |
| phone/desktop chrome | INTENTIONAL PREVIEW DIFFERENCE | moldura e controles pertencem apenas ao editor |

## R2.5 e disponibilidade

O resolver canônico `resolveStorefrontShowcase` já cobre `manual`, `automatic` com `best_selling` ou `promotions`, `hybrid`, limite, ordem manual, deduplicação, elegibilidade e fallback vazio. O público fornece a ele somente produtos provenientes das categorias ativas e já avaliados pelo canal através de `AvailabilityService.decideMany`. O preview atual mostra somente os IDs manuais e calcula elegibilidade localmente. Não há justificativa para um segundo ranking ou uma segunda regra de disponibilidade.

## Renderer e duplicação

- Public e preview usam ProductRenderer compartilhado? **Não antes da R5.**
- Usam CategoryNavigation compartilhado? **Não antes da R5.**
- Usam o mesmo layout resolver? **Somente na normalização da configuração salva; não na composição visual.**
- Usam o mesmo showcase resolver? **Não.**
- Há transforms duplicados? **Sim: produto, tema, categorias e showcase.**
- Há mocks reimplementando regra de negócio? **Sim: catálogo demo, eligibility e cards.**

## Decisão

- Confirmed bugs: fontes, transforms e renderers divergentes; ausência de fulfillment e ranking AUTOMATIC/HYBRID no preview.
- Duplication risks: manter qualquer filtro/ranking/card adicional no browser recriaria a divergência.
- Migration required: **NO**.
- API contract change: **YES, additive** — endpoint autenticado e tenant-scoped para obter o mesmo `StorefrontPayload` com overrides de draft e fulfillment explícito.
- New dependency required: **NO**.
- Recommended minimal architecture: extrair do serviço público um resolver interno de payload por tenant/config, manter a rota pública cacheada, expor uma rota autenticada de preview sem cache e sem persistência, e usar `StorefrontThemeProvider`, `ProductRenderer`, `CategoryNavigation` e um `SmartShowcase` compartilhado nos dois clientes.
- Implementation allowed: **YES**.
