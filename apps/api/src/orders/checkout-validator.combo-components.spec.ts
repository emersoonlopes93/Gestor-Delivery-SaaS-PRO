import { BadRequestException } from '@nestjs/common';
import { CheckoutValidatorService } from './checkout-validator.service';

type SlotValidator = {
  validateComboSlots(
    tenantId: string,
    selected: Array<{ comboSlotId: string; items: Array<{ productId: string; qty?: number }> }>,
    slots: unknown[],
    comboName: string,
  ): Promise<unknown>;
};

const slot = {
  id: 'slot-1',
  name: 'Escolha um produto',
  isRequired: true,
  minSelect: 1,
  maxSelect: 1,
  allowedItems: [{
    productId: 'component-1',
    additionalPrice: 0,
    product: { id: 'component-1', name: 'Produto simples', isActive: true, deletedAt: null },
  }],
};

describe('CheckoutValidatorService combo component eligibility', () => {
  function subject(assertEligibleProductIds: jest.Mock) {
    const service: CheckoutValidatorService = Reflect.construct(CheckoutValidatorService, [
      {}, {}, {}, {}, {}, {}, {}, {}, { assertEligibleProductIds },
    ]);
    return {
      validate: Reflect.get(service, 'validateComboSlots') as SlotValidator['validateComboSlots'],
      service,
    };
  }

  it('revalidates the selected slot product before a combo line can be persisted', async () => {
    const assertEligibleProductIds = jest.fn().mockRejectedValue(new BadRequestException({
      code: 'COMBO_COMPONENT_CONFIGURATION_UNSUPPORTED',
    }));
    const { service, validate } = subject(assertEligibleProductIds);

    await expect(validate.call(service, 'tenant-a', [{
      comboSlotId: 'slot-1', items: [{ productId: 'component-1', qty: 1 }],
    }], [slot], 'Combo')).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'COMBO_COMPONENT_CONFIGURATION_UNSUPPORTED' }),
    });
    expect(assertEligibleProductIds).toHaveBeenCalledWith('tenant-a', ['component-1']);
  });

  it('keeps a true direct product eligible for the simplified combo snapshot', async () => {
    const assertEligibleProductIds = jest.fn().mockResolvedValue(undefined);
    const { service, validate } = subject(assertEligibleProductIds);

    await expect(validate.call(service, 'tenant-a', [{
      comboSlotId: 'slot-1', items: [{ productId: 'component-1', qty: 1 }],
    }], [slot], 'Combo')).resolves.toEqual([expect.objectContaining({
      productId: 'component-1', qty: 1,
    })]);
  });
});
