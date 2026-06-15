# Base Menu Template Workflow

## Fonte oficial

Os Cardapios Base passam a ter o banco de dados como fonte oficial.

`apps/api/src/catalog/menu-import/menu-templates.data.ts` permanece apenas como insumo de bootstrap/seed para popular os modelos `BaseMenu*`. O runtime do endpoint tenant de Importar Cardapio Base deve ler templates publicados do banco.

## Bootstrap

Execute:

```bash
pnpm -C apps/api base-menu:seed
```

O comando le os templates atuais, cria ou atualiza:

- `BaseMenuTemplate`
- `BaseMenuTemplateVersion`
- `BaseMenuCategory`
- `BaseMenuProduct`

O seed e idempotente: rodar novamente nao duplica templates, versoes, categorias ou produtos existentes com os mesmos slugs.

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

## SaaS Admin

Nesta fase existe apenas API admin de leitura para preparar P2:

```text
GET /admin/base-menus
GET /admin/base-menus/:id
GET /admin/base-menus/:id/versions
```

Permissao:

```text
saas.base_menu.read
```

Ainda nao foi implementado:

- editor visual;
- CRUD administrativo completo;
- publicacao manual avancada;
- opcionais/complementos avancados;
- sincronizacao automatica para tenants.
