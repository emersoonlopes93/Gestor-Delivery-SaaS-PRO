import { DeliveryRunsController } from './delivery-runs.controller';

describe('DeliveryRunsController tenant contract', () => {
  const service = {
    getBuilderData: jest.fn(),
    listActiveRuns: jest.fn(),
    getSettings: jest.fn(),
    updateSettings: jest.fn(),
    createAssignedRun: jest.fn(),
    reorderTenantStops: jest.fn(),
  };
  const controller = new DeliveryRunsController(service as never);
  const request = { user: { tenantId: 'tenant-a', id: 'user-a' } };

  beforeEach(() => jest.clearAllMocks());

  it('derives tenant and actor from the authenticated request when creating a route', async () => {
    service.createAssignedRun.mockResolvedValue({ id: 'run-a' });
    await controller.create(request as never, { driverId: 'driver-a', orderIds: ['order-a', 'order-b'] });
    expect(service.createAssignedRun).toHaveBeenCalledWith(
      'tenant-a', 'driver-a', ['order-a', 'order-b'], 'user-a',
    );
  });

  it('never accepts tenant or actor from the reorder payload', async () => {
    service.reorderTenantStops.mockResolvedValue({ id: 'run-a' });
    await controller.reorder(request as never, 'run-a', {
      expectedVersion: 4,
      stopIds: ['stop-b', 'stop-c'],
    });
    expect(service.reorderTenantStops).toHaveBeenCalledWith(
      'tenant-a', 'run-a', ['stop-b', 'stop-c'], 4, 'user-a',
    );
  });

  it('audits acceptance-setting changes with the authenticated actor', async () => {
    service.updateSettings.mockResolvedValue({ requiresAcceptance: false });
    await controller.updateSettings(request as never, { requiresAcceptance: false });
    expect(service.updateSettings).toHaveBeenCalledWith('tenant-a', false, 'user-a');
  });
});
