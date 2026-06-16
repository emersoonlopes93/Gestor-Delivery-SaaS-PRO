import { Prisma } from '@prisma/client';
import { normalizeBaseMenuOptionSlug, parseBaseMenuProductOptionGroups } from './base-menu-options.parser';

export type BaseMenuOptionsTemplateSlug = 'acai' | 'hamburgueria';

export type BaseMenuOptionsCurationProduct = {
  productSlug: string;
  optionGroups: Prisma.InputJsonArray;
};

export type BaseMenuOptionsCuration = {
  templateSlug: BaseMenuOptionsTemplateSlug;
  products: BaseMenuOptionsCurationProduct[];
};

const acaiGroups: Prisma.InputJsonArray = [
  {
    slug: 'frutas',
    name: 'Frutas',
    selectionType: 'multiple',
    isRequired: false,
    minSelect: 0,
    maxSelect: 3,
    order: 1,
    pricingAxis: 'secondary',
    items: [
      optionItem('banana', 'Banana', 1.5, 1),
      optionItem('morango', 'Morango', 2.5, 2),
      optionItem('kiwi', 'Kiwi', 3, 3),
      optionItem('manga', 'Manga', 2, 4),
    ],
  },
  {
    slug: 'coberturas',
    name: 'Coberturas',
    selectionType: 'multiple',
    isRequired: false,
    minSelect: 0,
    maxSelect: 5,
    order: 2,
    pricingAxis: 'secondary',
    items: [
      optionItem('leite-em-po', 'Leite em po', 2, 1, true, 1, 3),
      optionItem('granola', 'Granola', 1.5, 2, true, 1, 3),
      optionItem('pacoca', 'Pacoca', 2, 3, true, 1, 3),
      optionItem('leite-condensado', 'Leite condensado', 2.5, 4, true, 1, 3),
      optionItem('calda-de-chocolate', 'Calda de chocolate', 2.5, 5, true, 1, 3),
    ],
  },
  {
    slug: 'adicionais',
    name: 'Adicionais',
    selectionType: 'multiple',
    isRequired: false,
    minSelect: 0,
    maxSelect: 4,
    order: 3,
    pricingAxis: 'secondary',
    items: [
      optionItem('nutella', 'Nutella', 5.5, 1),
      optionItem('creme-de-ninho', 'Creme de Ninho', 5, 2),
      optionItem('ovomaltine', 'Ovomaltine', 4.5, 3),
      optionItem('castanha', 'Castanha', 4, 4),
    ],
  },
];

const burgerGroups: Prisma.InputJsonArray = [
  {
    slug: 'ponto-da-carne',
    name: 'Ponto da carne',
    selectionType: 'single',
    isRequired: false,
    minSelect: 0,
    maxSelect: 1,
    order: 1,
    pricingAxis: 'secondary',
    items: [
      optionItem('ao-ponto', 'Ao ponto', 0, 1),
      optionItem('bem-passado', 'Bem passado', 0, 2),
      optionItem('mal-passado', 'Mal passado', 0, 3),
    ],
  },
  {
    slug: 'adicionais',
    name: 'Adicionais',
    selectionType: 'multiple',
    isRequired: false,
    minSelect: 0,
    maxSelect: 5,
    order: 2,
    pricingAxis: 'secondary',
    items: [
      optionItem('queijo-extra', 'Queijo extra', 3, 1),
      optionItem('bacon-extra', 'Bacon extra', 5, 2),
      optionItem('ovo', 'Ovo', 3, 3),
      optionItem('hamburguer-extra', 'Hamburguer extra', 9, 4),
      optionItem('cheddar', 'Cheddar', 4, 5),
      optionItem('cebola-caramelizada', 'Cebola caramelizada', 3.5, 6),
    ],
  },
  {
    slug: 'remover-ingredientes',
    name: 'Remover ingredientes',
    selectionType: 'multiple',
    isRequired: false,
    minSelect: 0,
    maxSelect: 5,
    order: 3,
    pricingAxis: 'secondary',
    items: [
      optionItem('sem-cebola', 'Sem cebola', 0, 1),
      optionItem('sem-tomate', 'Sem tomate', 0, 2),
      optionItem('sem-alface', 'Sem alface', 0, 3),
      optionItem('sem-molho', 'Sem molho', 0, 4),
    ],
  },
];

export function getBaseMenuOptionsCuration(templateSlug: string): BaseMenuOptionsCuration | null {
  if (templateSlug === 'acai') {
    return {
      templateSlug,
      products: [
        product('Acai 300ml', acaiGroups),
        product('Acai 500ml', acaiGroups),
        product('Acai 700ml', acaiGroups),
        product('Acai com Banana e Granola', acaiGroups),
        product('Acai com Leite Ninho', acaiGroups),
        product('Acai com Morango', acaiGroups),
        product('Acai com Pacoca', acaiGroups),
        product('Acai Completo', acaiGroups),
      ],
    };
  }

  if (templateSlug === 'hamburgueria') {
    return {
      templateSlug,
      products: [
        product('X-Burger', burgerGroups),
        product('X-Salada', burgerGroups),
        product('X-Bacon', burgerGroups),
        product('X-Tudo', burgerGroups),
        product('Combo Individual', burgerGroups),
        product('Combo Duplo', burgerGroups),
      ],
    };
  }

  return null;
}

export function validateBaseMenuOptionsCuration(curation: BaseMenuOptionsCuration): void {
  for (const item of curation.products) {
    parseBaseMenuProductOptionGroups({ optionGroups: item.optionGroups });
  }
}

function product(name: string, optionGroups: Prisma.InputJsonArray): BaseMenuOptionsCurationProduct {
  return {
    productSlug: normalizeBaseMenuOptionSlug(name),
    optionGroups,
  };
}

function optionItem(
  slug: string,
  name: string,
  priceImpactValue: number,
  order: number,
  allowQuantity = false,
  minQty: number | null = null,
  maxQty: number | null = null,
): Prisma.InputJsonObject {
  return {
    slug,
    name,
    priceImpactType: priceImpactValue === 0 ? 'none' : 'fixed',
    priceImpactValue,
    allowQuantity,
    minQty,
    maxQty,
    order,
  };
}
