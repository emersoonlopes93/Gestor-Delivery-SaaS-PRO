import type { StorefrontCategoryPayload, StorefrontProductPayload } from '@gestor/types';
import { isPizzaCategory } from '@gestor/utils';

/** Pizza is a category capability, never an inference from generic options. */
export function shouldUsePizzaFlow(
  category?: Pick<StorefrontCategoryPayload, 'templateType'> | null,
  _optionGroupLinks?: StorefrontProductPayload['optionGroupLinks'],
): boolean {
  return isPizzaCategory(category);
}
