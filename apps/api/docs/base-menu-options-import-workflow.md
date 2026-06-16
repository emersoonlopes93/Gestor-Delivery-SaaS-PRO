# Base Menu Options Import Workflow

P7.2 integra complementos dos Cardapios Base usando somente os models existentes:

- `OptionGroup`
- `OptionItem`
- `ProductOptionGroupLink`
- `ProductOptionItemPrice`, apenas para futuro override por produto quando necessario

Nao ha novos models nem migration nesta fase.

## metadataJson.optionGroups

Os opcionais ficam em `BaseMenuProduct.metadataJson.optionGroups`, com schema versionado pelo campo opcional `optionGroupsSchemaVersion`.

```json
{
  "optionGroupsSchemaVersion": 1,
  "optionGroups": [
    {
      "slug": "coberturas",
      "name": "Coberturas",
      "description": "Escolha suas coberturas",
      "selectionType": "multiple",
      "isRequired": false,
      "minSelect": 0,
      "maxSelect": 5,
      "order": 1,
      "pricingAxis": "secondary",
      "items": [
        {
          "slug": "leite-em-po",
          "name": "Leite em po",
          "priceImpactType": "fixed",
          "priceImpactValue": 2.5,
          "allowQuantity": true,
          "minQty": 1,
          "maxQty": 3,
          "order": 1
        }
      ]
    }
  ]
}
```

Valores validos:

- `selectionType`: `single`, `multiple`, `quantity`
- `pricingAxis`: `primary`, `secondary`
- `priceImpactType`: `none`, `fixed`, `replace`, `percentage`

Defaults seguros:

- produto sem `optionGroups` importa normalmente;
- `selectionType` default `multiple`;
- `pricingAxis` default `secondary`;
- `isRequired` default `false`;
- `minSelect` default `0`, ou `1` quando `isRequired=true`;
- `priceImpactType` default `none`;
- `allowQuantity` default `false`.

## Parser e Validacao

O parser fica em `apps/api/src/catalog/menu-import/base-menu-options.parser.ts`.

Ele valida array de grupos, nomes, slugs normalizados, min/max, required, itens, tipos de preco, valor Decimal compativel, quantidade minima/maxima e ordem. Metadata invalido falha a importacao do produto com erro claro; metadata ausente retorna lista vazia.

## Importador

`MenuImportService` carrega `BaseMenuProduct.metadataJson` da versao published do banco e, para cada produto criado no tenant:

1. le `metadataJson.optionGroups`;
2. cria ou reutiliza `OptionGroup` do mesmo tenant por nome normalizado;
3. cria ou reutiliza `OptionItem` dentro do grupo por nome normalizado;
4. cria `ProductOptionGroupLink` com `pricingAxis` e overrides simples;
5. ignora vinculo ja existente.

Como o schema atual de `OptionGroup` e `OptionItem` nao tem coluna `slug`, o slug do metadata e um identificador de curadoria/normalizacao, nao uma segunda fonte de verdade persistida.

## Idempotencia

- `tenantId` e sempre aplicado nas buscas/criacoes.
- grupos de outro tenant nunca entram na busca;
- itens sao buscados somente dentro do grupo do tenant;
- `ProductOptionGroupLink` usa a unique existente `[productId, optionGroupId]`;
- com `skipExisting=true`, produto existente e pulado e seus opcionais nao sao recriados.

## Metricas

`BaseMenuImportLog.metadataJson` registra:

- `optionGroupsCreated`
- `optionGroupsReused`
- `optionItemsCreated`
- `optionItemsReused`
- `productOptionLinksCreated`
- `productOptionLinksSkipped`
- `optionImportWarnings`
- `optionImportErrors`

## Curadoria Oficial

Os templates priorizados sao:

- `acai`: frutas, coberturas e adicionais para os produtos principais de acai;
- `hamburgueria`: ponto da carne, adicionais e remover ingredientes para hamburgueres e combos principais.

Aplicacao segura:

```bash
pnpm -C apps/api base-menu:apply-options-curation -- --template=acai --dry-run
pnpm -C apps/api base-menu:apply-options-curation -- --template=acai --publish
pnpm -C apps/api base-menu:apply-options-curation -- --template=hamburgueria --dry-run
pnpm -C apps/api base-menu:apply-options-curation -- --template=hamburgueria --publish
```

Se ja existir draft aberto, use `--use-existing-draft` de forma explicita.

## Teste Manual

1. aplicar/publicar curadoria de `acai` ou `hamburgueria`;
2. importar o template em tenant de teste;
3. abrir `OptionGroupsPage` e conferir grupos/itens;
4. abrir o produto no painel tenant e conferir personalizacao;
5. abrir storefront, selecionar opcionais, validar min/max e carrinho;
6. finalizar pedido teste e conferir snapshot em pedido/KDS;
7. reimportar com `skipExisting=true` e confirmar que nao duplica.

## Limitacoes

- sem meio a meio;
- sem combos avancados;
- sem estoque por adicional;
- sem regras condicionais complexas;
- sem UI paralela de catalogo ou checkout.
