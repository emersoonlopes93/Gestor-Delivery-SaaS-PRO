# Fluxo seguro de imagens do Cardapio Base

Este fluxo prepara imagens comerciais genericas para o Banco Global sem consumir API, tokens ou creditos de IA no backend.

## 1. Exportar manifesto e prompts sem custo

```bash
pnpm -C apps/api media:export-base-prompts
```

Saidas padrao:

- `apps/api/generated/base-menu-image-manifest.json`
- `apps/api/generated/base-menu-image-prompts.md`

O export apenas le os templates do Cardapio Base e grava arquivos locais. Ele nao chama OpenAI, DALL-E, Replicate, Stability ou qualquer provider externo.

## 2. Gerar imagens fora do backend

Use a ferramenta de IA ou processo manual de sua preferencia. Para cada item do manifesto:

- use o prompt sugerido
- respeite o negative prompt
- salve a imagem com o nome exato de `fileName`
- revise qualidade, enquadramento e ausencia de texto, logo, marca, pessoas e embalagens identificaveis

Coloque os arquivos em uma pasta, por exemplo:

```text
apps/api/generated-images/
```

## 3. Importar imagens prontas

Dry-run seguro:

```bash
pnpm -C apps/api media:import-generated-base -- --manifest=generated/base-menu-image-manifest.json --dir=generated-images --dry-run
```

Import real como draft:

```bash
pnpm -C apps/api media:import-generated-base -- --manifest=generated/base-menu-image-manifest.json --dir=generated-images
```

Flags uteis:

- `--status=draft` ou `--status=published`
- `--limit=10`
- `--force`
- `--dry-run`

Por padrao, as imagens entram como `scope='system_gallery'`, `tenantId=null`, `isSystem=true` e `publicationStatus='draft'`.

## 4. Revisar no SaaS Admin

As imagens importadas como draft devem ser revisadas no Banco Global. Publique somente as aprovadas.

## 5. Importar Cardapio Base

Depois de publicadas, o fluxo de Importar Cardapio Base continua usando o matching automatico existente por `mediaLookupKey`, `tagsJson`, categoria e biblioteca global.

## Protecao contra custo acidental

O comando antigo fica bloqueado por padrao:

```bash
pnpm -C apps/api media:generate-base
```

Ele nao gera imagens sem uma flag explicita. Use:

- `--export-manifest` para export seguro
- `--dry-run` para simular
- `--execute-ai-generation` para permitir geracao real, sabendo que pode consumir creditos de API
