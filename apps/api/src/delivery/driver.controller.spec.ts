import { DriverOperationsController } from './driver.controller';

describe('DriverOperationsController canonical route contract', () => {
  const driversService = {
    ingestDriverLocations: jest.fn(),
    updateOperationalStatus: jest.fn(),
  };
  const runsService = {
    getDriverWorkState: jest.fn(),
    getActiveRunForDriver: jest.fn(),
    startShiftForDriver: jest.fn(),
    endShiftForDriver: jest.fn(),
    acceptRun: jest.fn(),
    rejectRun: jest.fn(),
    startRun: jest.fn(),
    markStopArrived: jest.fn(),
    completeStop: jest.fn(),
    markFailedAttempt: jest.fn(),
    confirmReturnedToStore: jest.fn(),
    completeRun: jest.fn(),
  };
  const gateway = { emitDriverRouteEvent: jest.fn() };
  const earningsService = {};
  const controller = new DriverOperationsController(
    driversService as never,
    runsService as never,
    gateway as never,
    earningsService as never,
  );
  const request = { user: { tenantId: 'tenant-a', id: 'driver-a' } };

  beforeEach(() => {
    jest.clearAllMocks();
    runsService.getActiveRunForDriver.mockResolvedValue({
      id: 'run-a',
      driverId: 'driver-a',
      stops: [],
    });
  });

  it('derives shift identity only from the authenticated driver session', async () => {
    await controller.startShift(request as never);
    await controller.endShift(request as never);
    expect(runsService.startShiftForDriver).toHaveBeenCalledWith('tenant-a', 'driver-a');
    expect(runsService.endShiftForDriver).toHaveBeenCalledWith('tenant-a', 'driver-a');
  });

  it('derives location identity only from the authenticated driver session', async () => {
    const point = {
      eventKey: 'point-a', recordedAt: '2026-08-12T12:00:00.000Z',
      lat: -23.5, lng: -46.6, source: 'foreground',
    } as const;
    await controller.updateMyLocation(request as never, point);
    await controller.updateMyLocationBatch(request as never, { points: [point] });
    expect(driversService.ingestDriverLocations).toHaveBeenNthCalledWith(
      1, 'tenant-a', 'driver-a', [point],
    );
    expect(driversService.ingestDriverLocations).toHaveBeenNthCalledWith(
      2, 'tenant-a', 'driver-a', [point],
    );
  });

  it('cannot operate a run as a driver supplied by the request body', async () => {
    await controller.acceptRun(request as never, 'run-a');
    await controller.startRun(request as never, 'run-a');
    expect(runsService.acceptRun).toHaveBeenCalledWith('tenant-a', 'run-a', 'driver-a');
    expect(runsService.startRun).toHaveBeenCalledWith('tenant-a', 'run-a', 'driver-a');
  });

  it('uses the canonical stop lifecycle and emits only to the authenticated driver', async () => {
    await controller.markArrived(request as never, 'run-a', 'stop-a');
    await controller.completeStop(request as never, 'run-a', 'stop-a');
    await controller.markFailed(request as never, 'run-a', 'stop-a', {
      reason: 'Cliente não respondeu',
    });
    await controller.confirmReturn(request as never, 'run-a', 'stop-a');

    expect(runsService.markStopArrived).toHaveBeenCalledWith(
      'tenant-a', 'run-a', 'stop-a', 'driver-a',
    );
    expect(runsService.completeStop).toHaveBeenCalledWith(
      'tenant-a', 'run-a', 'stop-a', 'driver-a',
    );
    expect(runsService.markFailedAttempt).toHaveBeenCalledWith(
      'tenant-a', 'run-a', 'stop-a', 'driver-a', 'Cliente não respondeu',
    );
    expect(runsService.confirmReturnedToStore).toHaveBeenCalledWith(
      'tenant-a', 'run-a', 'stop-a', 'driver-a',
    );
    expect(gateway.emitDriverRouteEvent).toHaveBeenCalledWith(
      'tenant-a',
      'driver-a',
      expect.objectContaining({ runId: 'run-a', stopId: 'stop-a' }),
    );
  });

  it('deprecates the misleading plural endpoint while returning the canonical run', async () => {
    const response = { setHeader: jest.fn() };
    await expect(controller.getDeprecatedActiveRun(request as never, response as never))
      .resolves.toEqual(expect.objectContaining({ id: 'run-a' }));
    expect(response.setHeader).toHaveBeenCalledWith('Deprecation', 'true');
    expect(response.setHeader).toHaveBeenCalledWith(
      'Link',
      '</delivery/driver/active-run>; rel="successor-version"',
    );
  });
});
