import { resolveEffectiveSelectionRules, type CartSelectedOptionGroup, type StorefrontProductPayload } from '@gestor/types';

type GenericOptionLink = NonNullable<StorefrontProductPayload['optionGroupLinks']>[number];

export type PizzaValidationTarget = 'pizza-size' | 'pizza-mounting' | 'pizza-flavors' | 'pizza-price';

export function getPizzaValidation(
  input: {
    hasMountingGroup: boolean;
    selectedSizeId: string;
    selectedMountingItemId: string;
    selectedFlavorCount: number;
    flavorSelectionLimit: number;
    isPreviewLoading: boolean;
    previewError: string | null;
  },
): { message: string; target: PizzaValidationTarget } | null {
  if (!input.selectedSizeId) return { message: 'Selecione um tamanho.', target: 'pizza-size' };
  if (input.hasMountingGroup && !input.selectedMountingItemId) {
    return { message: 'Selecione a montagem da pizza.', target: 'pizza-mounting' };
  }
  if (input.selectedFlavorCount === 0) return { message: 'Selecione pelo menos 1 sabor.', target: 'pizza-flavors' };
  if (input.selectedFlavorCount > input.flavorSelectionLimit) {
    return {
      message: `Selecione no máximo ${input.flavorSelectionLimit} sabor${input.flavorSelectionLimit > 1 ? 'es' : ''}.`,
      target: 'pizza-flavors',
    };
  }
  if (input.isPreviewLoading) return { message: 'Aguarde a simulação do preço.', target: 'pizza-price' };
  if (input.previewError) return { message: input.previewError, target: 'pizza-price' };
  return null;
}

export function getGenericOptionGroupError(
  link: GenericOptionLink,
  selections: CartSelectedOptionGroup[],
): string | null {
  const group = link.optionGroup;
  const count = selections.find((selection) => selection.optionGroupId === group.id)?.items.length ?? 0;
  const { effectiveMinSelect: min, effectiveMaxSelect: max } = resolveEffectiveSelectionRules({
    selectionType: group.selectionType,
    isRequired: group.isRequired,
    minSelect: group.minSelect,
    maxSelect: group.maxSelect,
    overrideIsRequired: link.overrideIsRequired,
    overrideMinSelect: link.overrideMinSelect,
    overrideMaxSelect: link.overrideMaxSelect,
  });
  const name = link.overrideName || group.name;

  if (count < min) return `Selecione pelo menos ${min} em "${name}"`;
  if (count > max) return `Selecione no máximo ${max} em "${name}"`;
  return null;
}
