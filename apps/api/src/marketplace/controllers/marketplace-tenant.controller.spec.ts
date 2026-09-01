import { ConflictException, NotFoundException } from '@nestjs/common';
import { MarketplaceTenantController } from './marketplace-tenant.controller';

describe('MarketplaceTenantController connection tenancy', () => {
  const makeController = () => {
    const connectionService = {
      listTenantConnections: jest.fn(),
      getTenantConnection: jest.fn(),
      updateManual: jest.fn(),
      disconnectById: jest.fn(),
      connectManual: jest.fn(),
      maskConnection: jest.fn((value: unknown) => value),
    };
    const controller = new MarketplaceTenantController(
      { parseProvider: jest.fn().mockReturnValue('IFOOD') } as never,
      connectionService as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    const request = { user: { tenantId: 'tenant-1' } } as never;
    return { controller, connectionService, request };
  };

  it('lists only connections from the authenticated tenant', async () => {
    const { controller, connectionService, request } = makeController();
    connectionService.listTenantConnections.mockResolvedValue([
      { id: 'connection-a', tenantId: 'tenant-1' },
      { id: 'connection-b', tenantId: 'tenant-1' },
    ]);

    await expect(controller.listConnections(request)).resolves.toHaveLength(2);
    expect(connectionService.listTenantConnections).toHaveBeenCalledWith('tenant-1');
  });

  it.each([
    ['get', (controller: MarketplaceTenantController, request: never) => controller.getConnection(request, 'foreign-connection')],
    ['update', (controller: MarketplaceTenantController, request: never) => controller.updateConnection(request, 'foreign-connection', { displayName: 'X' })],
    ['delete', (controller: MarketplaceTenantController, request: never) => controller.removeConnection(request, 'foreign-connection')],
  ])('propagates tenant-scoped not-found for cross-tenant %s', async (_operation, invoke) => {
    const { controller, connectionService, request } = makeController();
    connectionService.getTenantConnection.mockRejectedValue(new NotFoundException('Marketplace connection not found.'));
    connectionService.updateManual.mockRejectedValue(new NotFoundException('Marketplace connection not found.'));
    connectionService.disconnectById.mockRejectedValue(new NotFoundException('Marketplace connection not found.'));

    await expect(invoke(controller, request)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('returns conflict when a create reuses a merchant from another tenant', async () => {
    const { controller, connectionService, request } = makeController();
    connectionService.connectManual.mockRejectedValue(new ConflictException('Marketplace merchant or store is already connected.'));

    await expect(controller.connectManual(request, 'ifood', {
      externalMerchantId: 'merchant-a',
    })).rejects.toBeInstanceOf(ConflictException);
  });
});
