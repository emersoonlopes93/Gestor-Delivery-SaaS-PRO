import { NotFoundException } from '@nestjs/common';
import { CustomerService } from './customer.service';

describe('CustomerService operational profile', () => {
  const makeDb = () => ({
    customer: { findUnique: jest.fn() },
  });

  it('returns tenant-scoped metrics, addresses and order history', async () => {
    const db = makeDb();
    db.customer.findUnique.mockResolvedValue({
      id: 'customer-1',
      tenantId: 'tenant-a',
      name: 'Cliente',
      totalOrders: 2,
      totalSpent: '50.00',
      cashbackBalance: '5.00',
      lastOrderDate: new Date('2026-07-20T12:00:00.000Z'),
      addresses: [{ id: 'address-1', tenantId: 'tenant-a', customerId: 'customer-1' }],
      orders: [{
        id: 'order-1',
        tenantId: 'tenant-a',
        customerId: 'customer-1',
        orderNumber: '#0001',
        status: 'completed',
        fulfillmentType: 'delivery',
        total: '20.00',
        createdAt: new Date('2026-07-20T12:00:00.000Z'),
      }],
    });

    const result = await new CustomerService(db as never).getCustomer('tenant-a', 'customer-1');

    expect(db.customer.findUnique).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'customer-1', tenantId: 'tenant-a' },
      include: expect.objectContaining({
        addresses: expect.objectContaining({ where: { tenantId: 'tenant-a' } }),
        orders: expect.objectContaining({ where: { tenantId: 'tenant-a' }, take: 10 }),
      }),
    }));
    expect(result).toEqual(expect.objectContaining({
      totalOrders: 2,
      totalSpent: 50,
      lastOrderDate: new Date('2026-07-20T12:00:00.000Z'),
      addresses: [expect.objectContaining({ customerId: 'customer-1', tenantId: 'tenant-a' })],
      orders: [expect.objectContaining({ id: 'order-1', total: 20 })],
    }));
    expect(result.totalSpent / result.totalOrders).toBe(25);
  });

  it('returns 404 for a customer not visible to the tenant', async () => {
    const db = makeDb();
    db.customer.findUnique.mockResolvedValue(null);

    await expect(
      new CustomerService(db as never).getCustomer('tenant-a', 'foreign-customer'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(db.customer.findUnique).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'foreign-customer', tenantId: 'tenant-a' },
    }));
  });
});
