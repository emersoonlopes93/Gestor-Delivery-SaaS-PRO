import { DriverSettlementMethod } from '@gestor/types';
import { DriverSettlementHistoryController, DriverSettlementsController } from './driver-settlements.controller';

describe('Driver settlement controllers', () => {
  const service = {
    summary: jest.fn(), listShifts: jest.fn(), history: jest.fn(), detail: jest.fn(), create: jest.fn(),
  };
  const tenantController = new DriverSettlementsController(service as never);
  const driverController = new DriverSettlementHistoryController(service as never);
  const tenantRequest = { user: { tenantId: 'tenant-a', id: 'manager-a' } };
  const driverRequest = { user: { tenantId: 'tenant-a', id: 'driver-a' } };

  beforeEach(() => jest.clearAllMocks());

  it('derives tenant and actor from the tenant JWT when creating', async () => {
    const dto = { driverId: 'driver-a', shiftIds: ['shift-a'], paymentMethod: DriverSettlementMethod.PIX,
      idempotencyKey: 'payment-a' };
    await tenantController.create(tenantRequest as never, dto);
    expect(service.create).toHaveBeenCalledWith('tenant-a', 'manager-a', dto);
  });

  it('derives driver identity from the driver JWT for every read', async () => {
    await driverController.summary(driverRequest as never);
    await driverController.history(driverRequest as never);
    await driverController.detail(driverRequest as never, 'settlement-a');
    expect(service.summary).toHaveBeenCalledWith('tenant-a', 'driver-a');
    expect(service.history).toHaveBeenCalledWith('tenant-a', 'driver-a');
    expect(service.detail).toHaveBeenCalledWith('tenant-a', 'settlement-a', 'driver-a');
  });
});
