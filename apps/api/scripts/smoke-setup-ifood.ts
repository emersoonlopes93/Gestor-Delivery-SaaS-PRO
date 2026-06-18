import 'reflect-metadata';
import { PrismaClient, TenantStatus, MarketplaceProvider, DriverStatus } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { TENANT_PERMISSIONS, TENANT_ROLE_PERMISSIONS } from '@gestor/core';
import { TenantDefaultRole } from '@gestor/core';

const prisma = new PrismaClient();
const DEFAULT_SMOKE_TENANT_SLUG = 'smoke-ifood';

type SmokeSetupReport = {
  tenantSlug: string;
  tenantId?: string;
  userId?: string;
  driverId?: string;
  logs: string[];
};

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required env ${name}.`);
  return value;
}

function isProduction(): boolean {
  return process.env.NODE_ENV === 'production';
}

function assertSmokeSlug(slug: string): void {
  if (!slug.startsWith('smoke-')) {
    throw new Error('Refusing smoke setup: tenant slug must start with "smoke-".');
  }
}

function ensureResetAllowed(): void {
  if ((process.env.ALLOW_SMOKE_RESET ?? 'false').toLowerCase() !== 'true') {
    throw new Error('Refusing smoke setup: set ALLOW_SMOKE_RESET=true to allow tenant cleanup.');
  }
  if (isProduction()) {
    throw new Error('Refusing smoke setup in production.');
  }
}

function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, '');
}

async function seedTenantPermissions(): Promise<void> {
  for (const [slug, description] of Object.entries(TENANT_PERMISSIONS)) {
    const [module, action] = slug.split('.');
    await prisma.tenantPermission.upsert({
      where: { slug },
      update: { description },
      create: { module, action, slug, description },
    });
  }
}

async function seedTenantRoles(tenantId: string): Promise<void> {
  await seedTenantPermissions();
  const roleEntries = Object.values(TenantDefaultRole);
  for (const roleSlug of roleEntries) {
    const roleName = roleSlug.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase());
    const role = await prisma.tenantRole.upsert({
      where: { tenantId_slug: { tenantId, slug: roleSlug } },
      update: { name: roleName },
      create: {
        tenantId,
        name: roleName,
        slug: roleSlug,
        description: `Default ${roleName} role`,
        isSystem: true,
      },
    });

    const permSlugs = TENANT_ROLE_PERMISSIONS[roleSlug] || [];
    for (const permSlug of permSlugs) {
      const permission = await prisma.tenantPermission.findUnique({ where: { slug: permSlug } });
      if (!permission) continue;
      await prisma.tenantRolePermission.upsert({
        where: {
          roleId_permissionId: {
            roleId: role.id,
            permissionId: permission.id,
          },
        },
        update: {},
        create: {
          roleId: role.id,
          permissionId: permission.id,
        },
      });
    }
  }
}

async function cleanupSmokeTenant(tenantId: string): Promise<string[]> {
  const logs: string[] = [];
  const orderRows = await prisma.order.findMany({
    where: {
      tenantId,
      OR: [
        { sourceChannel: 'marketplace_ifood' },
        { sourceChannel: 'storefront' },
      ],
    },
    select: { id: true, orderNumber: true, sourceChannel: true },
  });

  if (orderRows.length > 0) {
    await prisma.order.deleteMany({
      where: {
        tenantId,
        OR: [
          { sourceChannel: 'marketplace_ifood' },
          { sourceChannel: 'storefront' },
        ],
      },
    });
    logs.push(`removed ${orderRows.length} smoke orders`);
  }

  const connectionCount = await prisma.marketplaceConnection.count({ where: { tenantId, provider: MarketplaceProvider.IFOOD } });
  if (connectionCount > 0) {
    await prisma.marketplaceConnection.deleteMany({ where: { tenantId, provider: MarketplaceProvider.IFOOD } });
    logs.push(`removed ${connectionCount} iFood connections`);
  }

  const inboxCount = await prisma.marketplaceEventInbox.count({ where: { tenantId, provider: MarketplaceProvider.IFOOD } });
  if (inboxCount > 0) {
    await prisma.marketplaceEventInbox.deleteMany({ where: { tenantId, provider: MarketplaceProvider.IFOOD } });
    logs.push(`removed ${inboxCount} iFood inbox rows`);
  }

  const marketplaceOrderCount = await prisma.marketplaceOrder.count({ where: { tenantId, provider: MarketplaceProvider.IFOOD } });
  if (marketplaceOrderCount > 0) {
    await prisma.marketplaceOrder.deleteMany({ where: { tenantId, provider: MarketplaceProvider.IFOOD } });
    logs.push(`removed ${marketplaceOrderCount} iFood marketplace orders`);
  }

  return logs;
}

async function ensureSmokeTenant(slug: string): Promise<{ tenantId: string; tenantName: string }> {
  const tenantName = 'Smoke iFood';
  const tenant = await prisma.tenant.upsert({
    where: { slug },
    update: {
      name: tenantName,
      status: TenantStatus.active,
    },
    create: {
      name: tenantName,
      slug,
      status: TenantStatus.active,
    },
  });
  return { tenantId: tenant.id, tenantName: tenant.name };
}

async function ensureSmokeUser(tenantId: string): Promise<{ userId: string }> {
  const email = 'smoke@smoke-ifood.local';
  const rawPassword = 'smoke123';
  const passwordHash = await bcrypt.hash(rawPassword, 12);

  const user = await prisma.tenantUser.upsert({
    where: { tenantId_email: { tenantId, email } },
    update: {
      name: 'Smoke Tenant',
      passwordHash,
      isActive: true,
    },
    create: {
      tenantId,
      email,
      name: 'Smoke Tenant',
      passwordHash,
      isActive: true,
    },
  });

  const ownerRole = await prisma.tenantRole.findUnique({
    where: { tenantId_slug: { tenantId, slug: TenantDefaultRole.TENANT_OWNER } },
  });
  if (ownerRole) {
    await prisma.tenantUserRole.upsert({
      where: { userId_roleId: { userId: user.id, roleId: ownerRole.id } },
      update: {},
      create: { userId: user.id, roleId: ownerRole.id },
    });
  }

  return { userId: user.id };
}

async function ensureBillingDefaults(): Promise<void> {
  await prisma.billingSettings.upsert({
    where: { id: 'global' },
    update: {
      countStorefrontOrders: true,
      countDirectOnlineOrders: true,
      countPosOrders: true,
      countWhatsappAiOrders: true,
      countManualOrders: false,
      countMarketplaceIfoodOrders: false,
      countMarketplaceRappiOrders: false,
      countMarketplaceUbereatsOrders: false,
      countMarketplace99foodOrders: false,
      countMarketplaceKettaOrders: false,
      countMarketplaceZeDeliveryOrders: false,
      countConfirmedOrders: true,
      countCompletedOrders: true,
      excludeCancelledOrders: true,
      discountReducesRevenue: true,
      includeDeliveryFeeByDefault: false,
      includeServiceFeeByDefault: false,
    },
    create: {
      id: 'global',
      countStorefrontOrders: true,
      countDirectOnlineOrders: true,
      countPosOrders: true,
      countWhatsappAiOrders: true,
      countManualOrders: false,
      countMarketplaceIfoodOrders: false,
      countMarketplaceRappiOrders: false,
      countMarketplaceUbereatsOrders: false,
      countMarketplace99foodOrders: false,
      countMarketplaceKettaOrders: false,
      countMarketplaceZeDeliveryOrders: false,
      countConfirmedOrders: true,
      countCompletedOrders: true,
      excludeCancelledOrders: true,
      discountReducesRevenue: true,
      includeDeliveryFeeByDefault: false,
      includeServiceFeeByDefault: false,
    },
  });
}

async function ensureSmokeDriver(tenantId: string): Promise<{ driverId: string }> {
  const phone = normalizePhone('5511999988776');
  const existing = await prisma.deliveryDriver.findFirst({
    where: {
      tenantId,
      OR: [
        { phone },
        { name: { contains: 'Smoke Driver' } },
        { notes: { contains: 'smokeTest=true' } },
      ],
    },
  });

  const rawPin = '123456';
  const pinHash = await bcrypt.hash(rawPin, 10);

  if (existing) {
    const driver = await prisma.deliveryDriver.update({
      where: { id: existing.id },
      data: {
        name: 'Smoke Driver',
        phone,
        pin: pinHash,
        isActive: true,
        status: DriverStatus.available,
        vehicleType: 'motorcycle',
        notes: 'smokeTest=true',
      },
    });
    return { driverId: driver.id };
  }

  const driver = await prisma.deliveryDriver.create({
    data: {
      tenantId,
      name: 'Smoke Driver',
      phone,
      pin: pinHash,
      isActive: true,
      status: DriverStatus.available,
      vehicleType: 'motorcycle',
      notes: 'smokeTest=true',
    },
  });

  return { driverId: driver.id };
}

async function main() {
  ensureResetAllowed();

  const tenantSlug = process.env.SMOKE_TENANT_SLUG?.trim() || DEFAULT_SMOKE_TENANT_SLUG;
  assertSmokeSlug(tenantSlug);

  const report: SmokeSetupReport = {
    tenantSlug,
    logs: [],
  };

  const { tenantId } = await ensureSmokeTenant(tenantSlug);
  report.tenantId = tenantId;
  report.logs.push(`tenant ensured: ${tenantSlug}`);

  const tenantCleanupLogs = await cleanupSmokeTenant(tenantId);
  report.logs.push(...tenantCleanupLogs);

  await seedTenantRoles(tenantId);
  report.logs.push('tenant roles and permissions ensured');

  const { userId } = await ensureSmokeUser(tenantId);
  report.userId = userId;
  report.logs.push('smoke user ensured');

  await ensureBillingDefaults();
  report.logs.push('billing settings ensured');

  const { driverId } = await ensureSmokeDriver(tenantId);
  report.driverId = driverId;
  report.logs.push('smoke driver ensured');

  console.log('SMOKE_IFOOD_SETUP_GO', JSON.stringify(report, null, 2));
}

main().catch(async (error) => {
  console.error('SMOKE_IFOOD_SETUP_NO_GO');
  console.error(error instanceof Error ? error.message : error);
  await prisma.$disconnect();
  process.exit(1);
}).finally(async () => {
  await prisma.$disconnect();
});
