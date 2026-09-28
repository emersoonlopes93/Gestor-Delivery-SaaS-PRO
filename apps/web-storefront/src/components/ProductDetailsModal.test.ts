import { describe, expect, it } from 'vitest';
import { resolveEffectiveSelectionRules, type CartSelectedOptionGroup, type StorefrontProductPayload } from '@gestor/types';
import { shouldUsePizzaFlow } from '../lib/pizza-flow';
import { reconcileGenericSelections } from './product-details-selection';
import { getGenericOptionGroupError, getPizzaValidation } from './product-details-validation';

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

describe('ProductDetailsModal generic option state', () => {
  it('keeps the selected acai size when generic links are reconciled after a render', () => {
    const selected: CartSelectedOptionGroup[] = [{
      optionGroupId: 'size-group',
      name: 'Escolha o tamanho',
      items: [{ optionItemId: 'size-500', name: '500 ml', priceImpactType: 'replace', priceImpactValue: 20, qty: 1 }],
    }];

    expect(reconcileGenericSelections(genericSizeAndAssemblyOptions, selected)[0]?.items).toEqual(selected[0]?.items);
  });

  it('keeps multiple selected complements after a render', () => {
    const links = [{
      ...genericSizeAndAssemblyOptions[0],
      optionGroup: {
        ...genericSizeAndAssemblyOptions[0].optionGroup,
        id: 'complements',
        name: 'Complementos',
        selectionType: 'multiple' as const,
        minSelect: 1,
        maxSelect: 3,
        items: [
          { id: 'granola', name: 'Granola', isActive: true, allowQuantity: false, priceImpactType: 'fixed' as const, priceImpactValue: 2 },
          { id: 'pacoca', name: 'Paçoca', isActive: true, allowQuantity: false, priceImpactType: 'fixed' as const, priceImpactValue: 2 },
        ],
      },
    }];
    const selected: CartSelectedOptionGroup[] = [{
      optionGroupId: 'complements',
      name: 'Complementos',
      items: [
        { optionItemId: 'granola', name: 'Granola', priceImpactType: 'fixed', priceImpactValue: 2, qty: 1 },
        { optionItemId: 'pacoca', name: 'Paçoca', priceImpactType: 'fixed', priceImpactValue: 2, qty: 1 },
      ],
    }];

    expect(reconcileGenericSelections(links, selected)[0]?.items).toHaveLength(2);
  });

  it('normalizes legacy single and required selection rules before rendering', () => {
    expect(resolveEffectiveSelectionRules({ selectionType: 'single', isRequired: false, minSelect: 0, maxSelect: 10 }))
      .toMatchObject({ effectiveMinSelect: 0, effectiveMaxSelect: 1 });
    expect(resolveEffectiveSelectionRules({ selectionType: 'multiple', isRequired: true, minSelect: 0, maxSelect: 3 }))
      .toMatchObject({ effectiveMinSelect: 1, effectiveMaxSelect: 3 });
    expect(resolveEffectiveSelectionRules({
      selectionType: 'multiple',
      isRequired: false,
      minSelect: 0,
      maxSelect: 3,
      overrideIsRequired: true,
      overrideMinSelect: 1,
      })).toMatchObject({ effectiveIsRequired: true, effectiveMinSelect: 1, effectiveMaxSelect: 3 });
  });

  it('reports the exact generic group that needs attention before adding to cart', () => {
    expect(getGenericOptionGroupError(genericSizeAndAssemblyOptions[0], [])).toContain('Escolha o tamanho');
    expect(getGenericOptionGroupError(genericSizeAndAssemblyOptions[0], [{
      optionGroupId: 'size-group',
      name: 'Escolha o tamanho',
      items: [{ optionItemId: 'size-500', name: '500 ml', priceImpactType: 'replace', priceImpactValue: 20, qty: 1 }],
    }])).toBeNull();
  });

  it('targets the first invalid pizza control for inline feedback and focus', () => {
    expect(getPizzaValidation({
      hasMountingGroup: true,
      selectedSizeId: '',
      selectedMountingItemId: '',
      selectedFlavorCount: 0,
      flavorSelectionLimit: 2,
      isPreviewLoading: false,
      previewError: null,
    })).toMatchObject({ target: 'pizza-size' });

    expect(getPizzaValidation({
      hasMountingGroup: true,
      selectedSizeId: 'large',
      selectedMountingItemId: 'whole',
      selectedFlavorCount: 0,
      flavorSelectionLimit: 2,
      isPreviewLoading: false,
      previewError: null,
    })).toMatchObject({ target: 'pizza-flavors' });
  });
});
