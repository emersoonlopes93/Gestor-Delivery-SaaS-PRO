import { DeliveryRunsController } from './delivery-runs.controller';

describe('DeliveryRunsController tenant contract', () => {
  const service = {
    getBuilderData: jest.fn(),
    listActiveRuns: jest.fn(),
    getRunForTenantOrder: jest.fn(),
    getLocationHistory: jest.fn(),
    getSettings: jest.fn(),
    updateSettings: jest.fn(),
    getDriverWorkState: jest.fn(),
    startShiftForTenant: jest.fn(),
    endShiftForTenant: jest.fn(),
    createAssignedRun: jest.fn(),
    reorderTenantStops: jest.fn(),
    overrideKdsLock: jest.fn(),
  };
  const gateway = {
    emitDriverRouteEvent: jest.fn(),
    emitDriverDeliveryEvent: jest.fn(),
  };
  const pushService = { enqueueDriverNotification: jest.fn() };
  const earningsService = {};
  const smartDispatchService = { suggestion: jest.fn(), accept: jest.fn() };
  const controller = new DeliveryRunsController(
    service as never,
    gateway as never,
    pushService as never,
    earningsService as never,
    smartDispatchService as never,
  );
  const request = { user: { tenantId: 'tenant-a', id: 'user-a' } };

  beforeEach(() => jest.clearAllMocks());

  it('derives tenant and actor from the authenticated request when creating a route', async () => {
    service.createAssignedRun.mockResolvedValue({
      id: 'run-a',
      driverId: 'driver-a',
      stops: [{ id: 'stop-a', orderId: 'order-a', orderNumber: '101' }],
    });
    await controller.create(request as never, { driverId: 'driver-a', orderIds: ['order-a', 'order-b'] });
    expect(service.createAssignedRun).toHaveBeenCalledWith(
      'tenant-a', 'driver-a', ['order-a', 'order-b'], 'user-a',
    );
    expect(gateway.emitDriverRouteEvent).toHaveBeenCalledWith(
      'tenant-a',
      'driver-a',
      expect.objectContaining({ type: 'delivery.run_assigned', runId: 'run-a' }),
    );
    expect(pushService.enqueueDriverNotification).toHaveBeenCalledWith(
      'tenant-a',
      'driver-a',
      expect.objectContaining({ title: 'Nova rota atribuída' }),
    );
  });

  it('never accepts tenant or actor from the reorder payload', async () => {
    service.reorderTenantStops.mockResolvedValue({ id: 'run-a', driverId: 'driver-a' });
    await controller.reorder(request as never, 'run-a', {
      expectedVersion: 4,
      stopIds: ['stop-b', 'stop-c'],
    });
    expect(service.reorderTenantStops).toHaveBeenCalledWith(
      'tenant-a', 'run-a', ['stop-b', 'stop-c'], 4, 'user-a',
    );
    expect(gateway.emitDriverRouteEvent).toHaveBeenCalledWith(
      'tenant-a',
      'driver-a',
      expect.objectContaining({ type: 'delivery.run_updated', change: 'reordered' }),
    );
  });

  it('audits acceptance-setting changes with the authenticated actor', async () => {
    service.updateSettings.mockResolvedValue({ requiresAcceptance: false });
    await controller.updateSettings(request as never, { requiresAcceptance: false });
    expect(service.updateSettings).toHaveBeenCalledWith('tenant-a', false, 'user-a');
  });

  it('derives the history tenant from the authenticated tenant request', async () => {
    await controller.getLocationHistory(request as never, 'run-a');
    expect(service.getLocationHistory).toHaveBeenCalledWith('tenant-a', 'run-a');
  });

  it('lets only the authenticated tenant operate a driver financial shift', async () => {
    await controller.getDriverWorkState(request as never, 'driver-a');
    await controller.startDriverShift(request as never, 'driver-a');
    await controller.endDriverShift(request as never, 'driver-a');
    expect(service.getDriverWorkState).toHaveBeenCalledWith('tenant-a', 'driver-a');
    expect(service.startShiftForTenant).toHaveBeenCalledWith('tenant-a', 'driver-a');
    expect(service.endShiftForTenant).toHaveBeenCalledWith('tenant-a', 'driver-a');
  });

  it('derives tenant scope when resolving the route for an order', async () => {
    await controller.getRunForOrder(request as never, 'order-a');
    expect(service.getRunForTenantOrder).toHaveBeenCalledWith('tenant-a', 'order-a');
  });

  it('derives tenant and actor for a KDS override and notifies only the route driver', async () => {
    service.overrideKdsLock.mockResolvedValue({ id: 'run-a', driverId: 'driver-a' });
    await controller.overrideKdsLock(request as never, 'run-a', { reason: 'Liberação confirmada' });
    expect(service.overrideKdsLock).toHaveBeenCalledWith('tenant-a', 'run-a', 'user-a', 'Liberação confirmada');
    expect(gateway.emitDriverRouteEvent).toHaveBeenCalledWith('tenant-a', 'driver-a', expect.objectContaining({ runId: 'run-a', change: 'updated' }));
  });
});
