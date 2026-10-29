import 'reflect-metadata';
import { PrismaClient } from '@prisma/client';
import { AvailabilityService } from '../catalog/publication/availability.service';
import { TenantActivationService } from './tenant-activation.service';

const allowedHosts = new Set(['localhost', '127.0.0.1', '::1', 'ephemeral-postgres']);

function assertEphemeralDatabaseUrls(): void {
  if (process.env.NODE_ENV !== 'test') {
    throw new Error('Commercial V4 integration test requires NODE_ENV=test.');
  }
  const databaseUrl = process.env.DATABASE_URL;
  const directUrl = process.env.DIRECT_URL;
  if (!databaseUrl || !directUrl) throw new Error('DATABASE_URL and DIRECT_URL are required.');
  const database = new URL(databaseUrl);
  const direct = new URL(directUrl);
  if (!allowedHosts.has(database.hostname) || database.host !== direct.host || database.pathname !== direct.pathname) {
    throw new Error('Commercial V4 integration test refused a non-ephemeral PostgreSQL database.');
  }
}

describe('Commercial V4 activation with ephemeral PostgreSQL', () => {
  const prisma = new PrismaClient();
  const availability = new AvailabilityService(prisma as never);
  const activation = new TenantActivationService(prisma as never, availability);
  const tenantIds: string[] = [];
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;

  beforeAll(async () => { assertEphemeralDatabaseUrls(); await prisma.$connect(); });
  afterAll(async () => { await prisma.tenant.deleteMany({ where: { id: { in: tenantIds } } }); await prisma.$disconnect(); });

  async function fixture(label: string) {
    const tenant = await prisma.tenant.create({ data: { name: label, slug: `commercial-v4-${label}-${suffix}` } });
    tenantIds.push(tenant.id);
    await prisma.tenantSettings.create({ data: { tenantId: tenant.id, street: 'Rua A', number: '1', neighborhood: 'Centro', zipCode: '01001000', pickupEnabled: true, paymentMethods: ['cash'] } });
    await prisma.tenantOperatingHours.create({ data: { tenantId: tenant.id, dayOfWeek: new Date().getDay(), isOpen: true, openTime: '00:00', closeTime: '23:59' } });
    const category = await prisma.productCategory.create({ data: { tenantId: tenant.id, name: 'Categoria', slug: `cat-${suffix}-${label}` } });
    const product = await prisma.product.create({ data: { tenantId: tenant.id, categoryId: category.id, name: 'Produto', slug: `prod-${suffix}-${label}`, basePrice: 10 } });
    await prisma.tenantOnboarding.create({ data: { tenantId: tenant.id, completedAt: new Date() } });
    return { tenant, product };
  }

  it('keeps pickup with cash operational without a delivery coverage or Pix key', async () => {
    const { tenant, product } = await fixture('pickup');
    const status = await availability.getStoreStatus(tenant.id);
    const decision = await availability.decide({ tenantId: tenant.id, productId: product.id, channel: 'storefront_pickup' });
    const projection = await activation.getStatus(tenant.id);
    expect(status.reason).toBe('OPEN');
    expect(decision.canSell).toBe(true);
    expect(projection.operationallyReady).toBe(true);
    expect(projection.firstStorefrontOrder).toBeNull();
  });

  it('derives the first storefront order from a persisted tenant-scoped order only', async () => {
    const first = await fixture('first');
    const second = await fixture('other');
    await prisma.order.create({ data: { tenantId: first.tenant.id, orderNumber: `V4-${suffix}`, fulfillmentType: 'pickup', customerName: 'Test', customerPhone: '11999999999', itemsSubtotal: 10, total: 10, idempotencyKey: `v4-${suffix}`, publicTrackingToken: `v4-token-${suffix}`, sourceChannel: 'direct_online' } });
    const [a, b] = await Promise.all([activation.getStatus(first.tenant.id), activation.getStatus(second.tenant.id)]);
    expect(a.firstStorefrontOrder?.status).toBe('pending');
    expect(a.firstCompletedStorefrontOrder).toBeNull();
    expect(b.firstStorefrontOrder).toBeNull();
  });
});
