import { describe, expect, it } from 'vitest';
import type { StorefrontProductPayload } from '@gestor/types';
import { shouldUsePizzaFlow } from '../lib/pizza-flow';

const genericSizeAndAssemblyOptions = [
  {
    id: 'size-link',
    optionGroupId: 'size-group',
    order: 0,
    pricingAxis: 'primary',
    optionGroup: {
      id: 'size-group',
      name: 'Escolha o tamanho',
      selectionType: 'single',
      isRequired: true,
      minSelect: 1,
      maxSelect: 1,
      isActive: true,
      items: [{
        id: 'size-500',
        name: '500 ml',
        isActive: true,
        allowQuantity: false,
        priceImpactType: 'replace',
        priceImpactValue: 20,
      }],
    },
  },
  {
    id: 'assembly-link',
    optionGroupId: 'assembly-group',
    order: 1,
    optionGroup: {
      id: 'assembly-group',
      name: 'Montagem',
      selectionType: 'single',
      isRequired: false,
      minSelect: 0,
      maxSelect: 1,
      isActive: true,
      items: [],
    },
  },
] satisfies StorefrontProductPayload['optionGroupLinks'];

describe('ProductDetailsModal pizza flow', () => {
  it('keeps a configurable acai product in the generic flow despite size, primary, replace, and assembly metadata', () => {
    expect(shouldUsePizzaFlow({ templateType: 'none' }, genericSizeAndAssemblyOptions)).toBe(false);
  });

  it('uses the pizza flow only for a pizza category', () => {
    expect(shouldUsePizzaFlow({ templateType: 'pizza' })).toBe(true);
  });
});
