import { OrdersController } from './orders.controller';

describe('OrdersController status compatibility', () => {
  it('keeps GET status read-only and tenant-scoped for older operational clients', async () => {
    const ordersService = { getOrderDetail: jest.fn().mockResolvedValue({ id: 'order-1', status: 'pending' }) };
    const controller = new OrdersController(ordersService as never);
    const request = { user: { tenantId: 'tenant-1' } } as never;

    await expect(controller.getOrderStatus(request, 'order-1')).resolves.toEqual({ id: 'order-1', status: 'pending' });
    expect(ordersService.getOrderDetail).toHaveBeenCalledWith('order-1', 'tenant-1');
  });
});
