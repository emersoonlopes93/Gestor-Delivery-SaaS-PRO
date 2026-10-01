import type { CreateOrderItemDTO, CreateOrderItemSelectionGroupDTO } from '@gestor/types';
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

const percentageExtraLink = {
  id: 'percentage-link',
  pricingAxis: 'secondary',
  overrideName: null,
  overrideIsRequired: null,
  overrideMinSelect: null,
  overrideMaxSelect: null,
  optionGroup: {
    id: 'percentage',
    name: 'Cobertura',
    isActive: true,
    deletedAt: null,
    selectionType: 'multiple',
    isRequired: false,
    minSelect: 0,
    maxSelect: 1,
    items: [{
      id: 'percentage-item',
      name: 'Calda especial',
      deletedAt: null,
      isActive: true,
      allowQuantity: false,
      minQty: null,
      maxQty: null,
      priceImpactType: 'percentage',
      priceImpactValue: 10,
    }],
  },
};

const quantityExtraLink = {
  id: 'quantity-link',
  pricingAxis: 'secondary',
  overrideName: null,
  overrideIsRequired: null,
  overrideMinSelect: null,
  overrideMaxSelect: null,
  optionGroup: {
    id: 'quantity',
    name: 'Complemento por quantidade',
    isActive: true,
    deletedAt: null,
    selectionType: 'quantity',
    isRequired: false,
    minSelect: 0,
    maxSelect: 1,
    items: [{
      id: 'quantity-item',
      name: 'Granola',
      deletedAt: null,
      isActive: true,
      allowQuantity: true,
      minQty: 1,
      maxQty: 2,
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
  const calculate = Reflect.get(service, 'validateAndPriceOptionSelections').bind(service) as OptionPriceCalculator;

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

  it('uses the product override as the effective fixed value without changing its impact type', () => {
    const result = calculate(
      [selection('extra', 'granola')],
      [fixedExtraLink],
      'Açaí',
      12,
      [{ optionItemId: 'granola', price: 3, isActive: true }],
    ) as PriceResult & { selectionsSnapshot: Array<{ items: Array<{ priceImpactType: string; appliedAmount: number }> }> };

    expect(result).toMatchObject({ effectiveBasePrice: 12, extrasTotal: 3, unitPrice: 15 });
    expect(result.selectionsSnapshot[0]?.items[0]).toMatchObject({ priceImpactType: 'fixed', appliedAmount: 3 });
  });

  it('applies percentage after replace regardless of selection order', () => {
    const replaceThenPercentage = calculate([
      selection('size', 'large'),
      selection('percentage', 'percentage-item'),
    ], [primaryReplaceLink, percentageExtraLink], 'AÃ§ai', 12);
    const percentageThenReplace = calculate([
      selection('percentage', 'percentage-item'),
      selection('size', 'large'),
    ], [primaryReplaceLink, percentageExtraLink], 'AÃ§ai', 12);

    expect(replaceThenPercentage.unitPrice).toBe(16.5);
    expect(percentageThenReplace.unitPrice).toBe(16.5);
  });

  it('rejects duplicate groups and items before pricing', () => {
    expect(() => calculate([
      selection('size', 'large'),
      selection('size', 'large'),
    ], [primaryReplaceLink], 'AÃ§ai', 12)).toThrow('Grupo de opções duplicado');

    expect(() => calculate([{
      optionGroupId: 'size',
      items: [
        { optionItemId: 'large', qty: 1 },
        { optionItemId: 'large', qty: 1 },
      ],
    }], [primaryReplaceLink], 'AÃ§ai', 12)).toThrow('Opção duplicada');
  });

  it.each([1.5, -1, Number.POSITIVE_INFINITY])('rejects invalid option quantity %s', (qty) => {
    expect(() => calculate([{
      optionGroupId: 'quantity',
      items: [{ optionItemId: 'quantity-item', qty }],
    }], [quantityExtraLink], 'AÃ§ai', 12)).toThrow('Quantidade de opção');
  });

  it('rejects a quantity beyond the item maximum', () => {
    expect(() => calculate([{
      optionGroupId: 'quantity',
      items: [{ optionItemId: 'quantity-item', qty: 3 }],
    }], [quantityExtraLink], 'AÃ§ai', 12)).toThrow('Quantidade inválida');
  });

  it('rejects quantity above one outside a quantity group even when the item allows quantity', () => {
    const invalidMultipleQuantityLink = {
      ...fixedExtraLink,
      optionGroup: {
        ...fixedExtraLink.optionGroup,
        items: [{ ...fixedExtraLink.optionGroup.items[0], allowQuantity: true }],
      },
    };
    expect(() => calculate([{
      optionGroupId: 'extra',
      items: [{ optionItemId: 'granola', qty: 2 }],
    }], [invalidMultipleQuantityLink], 'Açaí', 12)).toThrow('Multiple group extra only accepts quantity 1');
  });

  it('validates required groups even when selections are empty', async () => {
    const requiredLink = {
      ...primaryReplaceLink,
      optionGroup: { ...primaryReplaceLink.optionGroup, isRequired: true, minSelect: 1 },
    };
    const prisma = {
      product: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'product-a',
          name: 'AÃ§ai',
          basePrice: 12,
          isActive: true,
          isAvailable: true,
          sellableOnline: true,
          category: null,
          optionItemPrices: [],
          optionGroupLinks: [requiredLink],
        }),
      },
    };
    const validator: CheckoutValidatorService = Reflect.construct(CheckoutValidatorService, [prisma, {}, {}, {}, {}, {}, {}, {}]);
    const validateProductLine = Reflect.get(validator, 'validateProductLine').bind(validator) as (
      tenantId: string,
      item: CreateOrderItemDTO,
      checkSellableOnline: boolean,
      channel: 'pos',
    ) => Promise<unknown>;

    await expect(validateProductLine('tenant-a', {
      lineType: 'product',
      productId: 'product-a',
      quantity: 1,
      selections: [],
    }, false, 'pos')).rejects.toThrow('Selecione pelo menos 1 opções');
  });
});
