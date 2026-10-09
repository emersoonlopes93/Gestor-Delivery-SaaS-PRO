import { MarketplaceOperationStatus, MarketplaceProvider } from '@prisma/client';
import { Food99CashConfirmationService } from './food99-cash-confirmation.service';

describe('Food99CashConfirmationService', () => {
  function setup(input?: { payType?: number; deliveryType?: number; status?: string }) {
    const prisma = {
      marketplaceOrder: { findFirst: jest.fn().mockResolvedValue({ id: 'marketplace-order-1', tenantId: 'tenant-1', connectionId: 'connection-1', provider: MarketplaceProvider.FOOD_99, externalOrderId: '5764687916991317793', statusExternal: input?.status ?? '200', rawPayload: { pay_type: input?.payType ?? 2, delivery_type: input?.deliveryType ?? 1 }, connection: { id: 'connection-1' } }) },
      marketplaceOperation: { create: jest.fn().mockResolvedValue({ id: 'operation-1', status: MarketplaceOperationStatus.PROCESSING, correlationId: 'correlation-1' }), update: jest.fn(), updateMany: jest.fn(), findFirst: jest.fn() },
    };
    const client = { confirmCashPayment: jest.fn().mockResolvedValue({ accepted: true, httpStatus: 200 }) };
    return { service: new Food99CashConfirmationService(prisma as never, client as never), prisma, client };
  }

  it('confirms only platform-delivery cash accepted by 99Food, without financial writes', async () => {
    const { service, prisma, client } = setup();
    await expect(service.confirm('tenant-1', 'marketplace-order-1')).resolves.toEqual({ accepted: true, duplicate: false });
    expect(client.confirmCashPayment).toHaveBeenCalledWith(expect.anything(), '5764687916991317793', 'correlation-1');
    expect(prisma.marketplaceOperation.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ idempotencyKey: 'food99:pay-confirm:marketplace-order-1' }) }));
  });

  it.each([{ payType: 1 }, { deliveryType: 2 }, { status: '400' }])('rejects an ineligible cash confirmation', async (input) => {
    const { service, client } = setup(input);
    await expect(service.confirm('tenant-1', 'marketplace-order-1')).rejects.toThrow();
    expect(client.confirmCashPayment).not.toHaveBeenCalled();
  });

  it('treats a repeated successful confirmation as idempotent', async () => {
    const { service, prisma, client } = setup();
    prisma.marketplaceOperation.create.mockRejectedValue({ code: 'P2002' });
    prisma.marketplaceOperation.findFirst.mockResolvedValue({ status: MarketplaceOperationStatus.SUCCEEDED });

    await expect(service.confirm('tenant-1', 'marketplace-order-1'))
      .resolves.toEqual({ accepted: true, duplicate: true });
    expect(client.confirmCashPayment).not.toHaveBeenCalled();
  });
});
