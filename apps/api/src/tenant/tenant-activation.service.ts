import { Injectable } from '@nestjs/common';
import { OrderStatus } from '@prisma/client';
import type { TenantActivationStatus } from '@gestor/types';
import { AvailabilityService } from '../catalog/publication/availability.service';
import { PrismaService } from '../database/prisma.service';

const STOREFRONT_SOURCES = ['direct_online', 'storefront'];
const RECEIVED_ORDER_STATUSES = [
  OrderStatus.pending,
  OrderStatus.confirmed,
  OrderStatus.preparing,
  OrderStatus.ready_for_pickup,
  OrderStatus.ready_for_delivery,
  OrderStatus.out_for_delivery,
  OrderStatus.completed,
];

@Injectable()
export class TenantActivationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly availabilityService: AvailabilityService,
  ) {}

  async getStatus(tenantId: string): Promise<TenantActivationStatus> {
    const [tenant, productRows, firstStorefrontOrder, firstCompletedStorefrontOrder] = await Promise.all([
      this.prisma.tenant.findUnique({
        where: { id: tenantId },
        select: {
          slug: true,
          status: true,
          onboarding: { select: { completedAt: true } },
        },
      }),
      this.prisma.product.findMany({
        where: {
          tenantId,
          deletedAt: null,
          isActive: true,
          isAvailable: true,
          sellableOnline: true,
        },
        select: { id: true },
      }),
      this.prisma.order.findFirst({
        where: {
          tenantId,
          sourceChannel: { in: STOREFRONT_SOURCES },
          status: { in: RECEIVED_ORDER_STATUSES },
        },
        select: { createdAt: true, status: true },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.order.findFirst({
        where: {
          tenantId,
          sourceChannel: { in: STOREFRONT_SOURCES },
          status: OrderStatus.completed,
        },
        select: { createdAt: true },
        orderBy: { createdAt: 'asc' },
      }),
    ]);

    const storeStatus = await this.availabilityService.getStoreStatus(tenantId);
    const sellableDecisions = await this.availabilityService.decideMany({
      tenantId,
      productIds: productRows.map((product) => product.id),
      channel: 'storefront_pickup',
      ignoreStoreClosed: true,
    });
    const sellableProductCount = [...sellableDecisions.values()].filter((decision) => decision.canSell).length;
    const onboardingCompleted = Boolean(tenant?.onboarding?.completedAt);
    const tenantOperational = tenant?.status === 'active';
    const operationallyReady = Boolean(
      onboardingCompleted && tenantOperational && storeStatus.reason !== 'CONFIG_PENDING' && sellableProductCount > 0,
    );

    const reasons: string[] = [];
    if (!onboardingCompleted) reasons.push('ONBOARDING_INCOMPLETE');
    if (!tenantOperational) reasons.push('TENANT_INACTIVE');
    if (storeStatus.reason === 'CONFIG_PENDING') {
      reasons.push(...(storeStatus.missingRequirements ?? ['STORE_CONFIGURATION_PENDING']));
    }
    if (sellableProductCount === 0) reasons.push('NO_SELLABLE_PRODUCTS');
    if (storeStatus.reason === 'PAUSED') reasons.push('STORE_PAUSED');
    if (storeStatus.reason === 'CLOSED') reasons.push('OUTSIDE_HOURS');

    return {
      onboardingCompleted,
      operationallyReady,
      acceptingOrdersNow: operationallyReady && storeStatus.isOpen,
      storefrontAccessible: Boolean(tenantOperational && tenant?.slug && sellableProductCount > 0),
      storefrontSlug: tenant?.slug ?? null,
      sellableProductCount,
      reasons,
      storeStatus,
      firstStorefrontOrder: firstStorefrontOrder
        ? { receivedAt: firstStorefrontOrder.createdAt.toISOString(), status: firstStorefrontOrder.status }
        : null,
      firstCompletedStorefrontOrder: firstCompletedStorefrontOrder
        ? { orderCreatedAt: firstCompletedStorefrontOrder.createdAt.toISOString() }
        : null,
    };
  }
}
