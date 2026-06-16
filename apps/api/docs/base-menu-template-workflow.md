# Base Menu Template Workflow

Complementos/opcionais de produtos base usam `BaseMenuProduct.metadataJson.optionGroups` e sao importados para `OptionGroup`, `OptionItem` e `ProductOptionGroupLink` reais do tenant. O fluxo completo da P7.2 esta em [base-menu-options-import-workflow.md](./base-menu-options-import-workflow.md).

## Fonte oficial

Os Cardapios Base passam a ter o banco de dados como fonte oficial.

`apps/api/src/catalog/menu-import/menu-templates.data.ts` permanece apenas como insumo de bootstrap/seed para popular os modelos `BaseMenu*`. O runtime do endpoint tenant de Importar Cardapio Base deve ler templates publicados do banco.

## Bootstrap

Execute:

```bash
pnpm -C apps/api base-menu:seed
```

O comando le os templates oficiais do bootstrap e cria registros apenas quando o template ainda nao existe:

- `BaseMenuTemplate`
- `BaseMenuTemplateVersion`
- `BaseMenuCategory`
- `BaseMenuProduct`

O seed e idempotente e preservador: rodar novamente nao duplica templates e nao sobrescreve templates, versoes, categorias ou produtos ja existentes no banco.

## Versionamento

Cada template possui uma versao publicada estavel em `BaseMenuTemplateVersion`.

Nesta fase, o bootstrap cria a versao `1` como `published` para os templates oficiais atuais. O campo `currentPublishedVersionId` aponta para a versao publicada vigente.

Versoes publicadas devem ser tratadas como snapshots usados por importacoes de tenants.

## Importacao pelo tenant

O tenant continua usando os endpoints existentes:

```text
GET  /catalog/menu-import/templates
GET  /catalog/menu-import/recommended
GET  /catalog/menu-import/templates/:id
POST /catalog/menu-import/execute
```

O frontend continua enviando `templateId` com o slug atual, como `pizzaria`, `acai` ou `padaria-cafeteria`.

A importacao:

- resolve apenas templates `published`;
- usa a versao publicada atual;
- cria categorias e produtos reais do tenant como copia independente;
- nao sobrescreve categorias/produtos existentes;
- registra `BaseMenuImportLog` com template, versao, contadores e erros.

Alteracoes futuras no template base nao alteram cardapios ja importados. Para atualizar um tenant, sera necessario um fluxo explicito futuro.

## Imagens

Produtos base preservam:

- `mediaLookupKey`
- `searchTagsJson`
- metadata com `mediaCategory` e `mediaPrompt`

Durante a importacao, o matching de imagem continua usando:

1. `system_gallery` publicada;
2. tags do produto;
3. categoria;
4. fallback para `tenant_library`, mantendo a regra existente.

Assets globais em `draft` ou `archived` nao sao usados.

## Manifesto de imagens

Os scripts de manifesto passam a consultar templates publicados no banco:

```bash
pnpm -C apps/api media:export-base-prompts
pnpm -C apps/api media:validate-base-manifest
pnpm -C apps/api media:import-generated-base
```

Antes de exportar ou validar manifesto, rode o bootstrap:

```bash
pnpm -C apps/api base-menu:seed
```

`media:import-generated-base` continua importando imagens para o Banco Global de Imagens a partir do manifesto.

## Seed/bootstrap seguro

O banco e a fonte oficial dos Cardapios Base. Por isso, `base-menu:seed` e um bootstrap seguro, nao um sync destrutivo.

Comportamento atual:

- se o template nao existe, o seed cria template, v1 published, categorias, produtos e seta `currentPublishedVersionId`;
- se o template ja existe, o seed pula o template inteiro;
- o seed nao sobrescreve versoes `published`;
- o seed nao sobrescreve versoes `draft`;
- o seed nao altera `currentPublishedVersionId`;
- o seed nao altera categorias/produtos editados no SaaS Admin;
- o seed registra warnings quando detecta divergencia entre `menu-templates.data.ts` e o banco.

Exemplo de saida esperada quando o banco ja possui templates:

```text
Template acai ja existe. Pulando bootstrap para evitar sobrescrever fonte oficial do banco.
WARNING: template acai difere do bootstrap em 2 produtos. Nenhuma alteracao aplicada.
0 templates criados | 6 templates preservados | 0 versoes sobrescritas | 0 produtos sobrescritos
```

Quando houver divergencia, use o editor SaaS Admin para ajustar a versao oficial. Um fluxo futuro de `sync/force` deve ser explicito, auditavel e nunca executado em producao sem backup.

## Editor SaaS Admin

O banco continua sendo a fonte oficial dos Cardapios Base em runtime. O arquivo `menu-templates.data.ts` segue apenas como bootstrap/seed.

O editor do SaaS Admin trabalha sempre sobre uma versao `draft`:

1. O admin cria uma nova versao draft a partir da `currentPublishedVersion`.
2. Categorias e produtos sao copiados para a nova versao, preservando slugs, ordem, lookup de midia, tags e metadados.
3. O admin edita dados seguros do template, categorias e produtos apenas no draft.
4. A publicacao valida estrutura e diagnostica imagens.
5. Ao publicar, o draft vira `published` e `BaseMenuTemplate.currentPublishedVersionId` passa a apontar para ele.
6. A versao publicada anterior fica como historico, sem ser deletada.

Endpoints de leitura:

```text
GET /admin/base-menus
GET /admin/base-menus/:id
GET /admin/base-menus/:id/versions
GET /admin/base-menus/:id/import-logs
GET /admin/base-menus/:id/draft
GET /admin/base-menus/:id/draft/validation
```

Endpoints de gestao:

```text
POST   /admin/base-menus
POST   /admin/base-menus/:id/duplicate
POST   /admin/base-menus/:id/archive
POST   /admin/base-menus/:id/restore
PATCH  /admin/base-menus/:id
POST   /admin/base-menus/:id/draft-version
POST   /admin/base-menus/:id/publish-draft
POST   /admin/base-menus/:id/versions/:versionId/categories
PATCH  /admin/base-menus/:id/versions/:versionId/categories/:categoryId
DELETE /admin/base-menus/:id/versions/:versionId/categories/:categoryId
POST   /admin/base-menus/:id/versions/:versionId/categories/:categoryId/products
PATCH  /admin/base-menus/:id/versions/:versionId/products/:productId
DELETE /admin/base-menus/:id/versions/:versionId/products/:productId
```

Permissoes:

```text
saas.base_menu.read
saas.base_menu.manage
```

O tenant continua enxergando apenas templates `published` pelo importador. Antes de publicar um draft, novos tenants seguem importando a versao publicada anterior. Depois da publicacao, novos imports usam a nova versao. Cardapios ja importados continuam como copias independentes e nao sao sobrescritos automaticamente.

O diagnostico de imagens no editor reutiliza a Galeria Base e o matching auditavel:

- `linked_exact`
- `linked_tag`
- `linked_fallback`
- `missing_lookup`
- `no_published_asset`
- `draft_only`

Produtos sem imagem publicada geram warning, mas nao bloqueiam publicacao. Erros estruturais bloqueiam publicacao: ausencia de categorias/produtos, nome ausente, preco invalido, slug invalido ou duplicado.

As acoes administrativas registram audit log com usuario admin quando disponivel, template, versao, entidade, antes/depois quando razoavel e metadata da acao.

Fora do escopo desta fase:

- opcionais/complementos avancados;
- exclusao definitiva de template (apenas arquivamento é suportado);
- comparacao visual entre versoes;
- rollback automatico para versão anterior;
- importacao para tenant pelo SaaS Admin;
- geracao de imagens por IA;
- sincronizacao automatica para tenants.

## Testes de versionamento

As specs automatizadas cobrem os fluxos minimos de hardening:

- criar draft a partir da versao published;
- impedir segundo draft acidental;
- editar produto somente no draft;
- bloquear edicao de versao published;
- publicar draft e atualizar `currentPublishedVersionId`;
- arquivar a versao publicada anterior;
- criar novo template como rascunho;
- duplicar template existente copiando seus produtos para um novo rascunho;
- arquivar e restaurar templates;
- validar RBAC de `saas.base_menu.read` e `saas.base_menu.manage`;
- criar bootstrap em banco vazio;
- preservar customizacoes administrativas quando o seed roda depois de uma v2 publicada.

No frontend do SaaS Admin, a cobertura minima valida RBAC visual, aba de versoes, bloqueio de publicacao por erro, publicacao com warnings apos confirmacao forte e descarte de draft apos confirmacao forte.

Fluxos com tenant real devem ser validados em ambiente controlado usando tenant teste: tenant novo importa a versao publicada atual; tenant antigo permanece com a copia independente ja importada; `BaseMenuImportLog.versionId` aponta para a versao usada no import.

## Seguranca operacional do editor

O editor do SaaS Admin usa confirmacoes fortes para acoes de maior impacto:

- publicar draft exige revisar resumo de impacto e digitar `PUBLICAR`;
- descartar draft exige revisar aviso de perda de alteracoes e digitar `DESCARTAR`;
- a publicacao fica bloqueada quando ha erros estruturais;
- warnings nao bloqueiam publicacao, mas aparecem no painel de validacao e no modal.

Erros bloqueantes incluem template sem categorias/produtos, categoria invalida, produto sem nome, preco invalido e slug invalido ou duplicado.

Warnings incluem produtos sem imagem publicada, imagem apenas fallback, imagem apenas draft/arquivada, ausencia de `mediaLookupKey`, ausencia de tags, descricao vazia e preco sugerido zero.

Descartar draft arquiva a versao `draft`; nao apaga a versao publicada atual, nao altera `currentPublishedVersionId`, nao altera tenants e registra audit log `base_menu.draft.discard`.

Publicacao com warnings registra os warnings no metadata do audit log `base_menu.draft.publish`. Tentativa de publicacao bloqueada por erro registra `base_menu.draft.publish_blocked`.

Versoes antigas permanecem como historico. Restaurar versao antiga, rollback automatico e sync para tenants ficam fora do escopo desta fase.

A Galeria Base continua sendo o lugar de gestao de imagens. O editor apenas diagnostica cobertura; ele nao faz upload, substituicao ou geracao de imagem.

Tenants novos passam a importar a nova versao somente apos publicacao. Tenants que ja importaram versoes antigas nao sao alterados automaticamente, e cardapios reais de lojas nao sao editados por este fluxo.
