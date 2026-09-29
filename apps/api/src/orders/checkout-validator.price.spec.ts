import type { CreateOrderItemSelectionGroupDTO } from '@gestor/types';
import { CheckoutValidatorService } from './checkout-validator.service';

type PriceResult = {
  effectiveBasePrice: number;
  extrasTotal: number;
  unitPrice: number;
};

type OptionPriceCalculator = (
  selections: CreateOrderItemSelectionGroupDTO[],
  optionGroupLinks: unknown[],
  productName: string,
  basePrice: number,
  optionItemPrices?: unknown[],
) => PriceResult;

const primaryReplaceLink = {
  id: 'size-link',
  pricingAxis: 'primary',
  overrideName: null,
  overrideIsRequired: null,
  overrideMinSelect: null,
  overrideMaxSelect: null,
  optionGroup: {
    id: 'size',
    name: 'Tamanho',
    isActive: true,
    deletedAt: null,
    selectionType: 'single',
    isRequired: false,
    minSelect: 0,
    maxSelect: 1,
    items: [{
      id: 'large',
      name: 'Grande',
      deletedAt: null,
      isActive: true,
      allowQuantity: false,
      priceImpactType: 'replace',
      priceImpactValue: 15,
    }],
  },
};

const fixedExtraLink = {
  id: 'extra-link',
  pricingAxis: 'secondary',
  overrideName: null,
  overrideIsRequired: null,
  overrideMinSelect: null,
  overrideMaxSelect: null,
  optionGroup: {
    id: 'extra',
    name: 'Complementos',
    isActive: true,
    deletedAt: null,
    selectionType: 'multiple',
    isRequired: false,
    minSelect: 0,
    maxSelect: 2,
    items: [{
      id: 'granola',
      name: 'Granola',
      deletedAt: null,
      isActive: true,
      allowQuantity: false,
      priceImpactType: 'fixed',
      priceImpactValue: 2,
    }],
  },
};

function selection(optionGroupId: string, optionItemId: string): CreateOrderItemSelectionGroupDTO {
  return { optionGroupId, items: [{ optionItemId, qty: 1 }] };
}

describe('CheckoutValidatorService option pricing', () => {
  const service = Reflect.construct(CheckoutValidatorService, [{}, {}, {}, {}, {}, {}, {}, {}]);
  const calculate = Reflect.get(service, 'validateAndPriceOptionSelections') as OptionPriceCalculator;

  it('uses the selected primary replace price instead of the product base price', () => {
    expect(calculate([selection('size', 'large')], [primaryReplaceLink], 'Açai', 12)).toMatchObject({
      effectiveBasePrice: 15,
      extrasTotal: 3,
      unitPrice: 15,
    });
  });

  it('adds fixed extras after applying the selected primary replace price', () => {
    expect(calculate([
      selection('size', 'large'),
      selection('extra', 'granola'),
    ], [primaryReplaceLink, fixedExtraLink], 'Açai', 12)).toMatchObject({
      effectiveBasePrice: 15,
      extrasTotal: 5,
      unitPrice: 17,
    });
  });

  it('keeps the regular base price when only a fixed extra is selected', () => {
    expect(calculate([selection('extra', 'granola')], [fixedExtraLink], 'Açai', 12)).toMatchObject({
      effectiveBasePrice: 12,
      extrasTotal: 2,
      unitPrice: 14,
    });
  });
});
