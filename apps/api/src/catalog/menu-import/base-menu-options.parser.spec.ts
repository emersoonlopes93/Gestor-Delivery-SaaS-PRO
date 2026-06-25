import { OptionSelectionType, PriceImpactType, PricingAxis } from '@prisma/client';
import { parseBaseMenuProductOptionGroups } from './base-menu-options.parser';

describe('parseBaseMenuProductOptionGroups', () => {
  it('returns an empty array when metadata has no option groups', () => {
    expect(parseBaseMenuProductOptionGroups(null)).toEqual([]);
    expect(parseBaseMenuProductOptionGroups({ mediaCategory: 'Acai' })).toEqual([]);
  });

  it('normalizes slugs and applies safe defaults', () => {
    const result = parseBaseMenuProductOptionGroups({
      optionGroups: [
        {
          name: 'Coberturas',
          maxSelect: 5,
          items: [
            {
              name: 'Leite em po',
              priceImpactValue: 2.5,
            },
          ],
        },
      ],
    });

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      slug: 'coberturas',
      selectionType: OptionSelectionType.multiple,
      pricingAxis: PricingAxis.secondary,
      isRequired: false,
      minSelect: 0,
      maxSelect: 5,
      isActive: true,
    });
    expect(result[0].items[0]).toMatchObject({
      slug: 'leite-em-po',
      priceImpactType: PriceImpactType.fixed,
      allowQuantity: false,
      isActive: true,
    });
    expect(result[0].items[0].priceImpactValue.toNumber()).toBe(2.5);
  });

  it('rejects invalid min and max selection rules', () => {
    expect(() => parseBaseMenuProductOptionGroups({
      optionGroups: [
        {
          name: 'Frutas',
          selectionType: 'multiple',
          isRequired: true,
          minSelect: 2,
          maxSelect: 1,
          items: [{ name: 'Banana', priceImpactValue: 1.5 }],
        },
      ],
    })).toThrow('maxSelect nao pode ser menor');
  });

  it('rejects invalid quantity rules', () => {
    expect(() => parseBaseMenuProductOptionGroups({
      optionGroups: [
        {
          name: 'Adicionais',
          maxSelect: 2,
          items: [
            {
              name: 'Nutella',
              priceImpactType: 'fixed',
              priceImpactValue: 5,
              allowQuantity: true,
              minQty: 3,
              maxQty: 1,
            },
          ],
        },
      ],
    })).toThrow('minQty nao pode ser maior');
  });
});
