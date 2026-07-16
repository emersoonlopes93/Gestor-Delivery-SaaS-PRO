import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import type { Request as ExpressRequest } from 'express';
import type { TenantJwtPayload } from '@gestor/types';
import { Prisma } from '@prisma/client';
import { TenantAuthGuard } from '../../auth/guards/tenant-auth.guard';
import { PermissionsGuard } from '../../rbac/guards/permissions.guard';
import { RequirePermissions } from '../../common/decorators';
import { RequiresFeature } from '../../common/decorators/requires-feature.decorator';
import { MarketplaceProviderRegistryService } from '../services/marketplace-provider-registry.service';
import { MarketplaceConnectionService } from '../services/marketplace-connection.service';
import { MarketplaceEventInboxService } from '../services/marketplace-event-inbox.service';
import { MarketplaceOrderIngestionService } from '../services/marketplace-order-ingestion.service';
import { PrismaService } from '../../database/prisma.service';
import { MarketplaceStatusSyncService } from '../services/marketplace-status-sync.service';

type TenantRequest = ExpressRequest & { user: TenantJwtPayload };

@Controller('marketplaces')
@UseGuards(TenantAuthGuard, PermissionsGuard)
@RequiresFeature('ifood_marketplace')
export class MarketplaceTenantController {
  constructor(
    private readonly providerRegistry: MarketplaceProviderRegistryService,
    private readonly connectionService: MarketplaceConnectionService,
    private readonly inboxService: MarketplaceEventInboxService,
    private readonly ingestionService: MarketplaceOrderIngestionService,
    private readonly prisma: PrismaService,
    private readonly statusSyncService: MarketplaceStatusSyncService,
  ) {}

  @Get('connections')
  @RequirePermissions('settings.manage')
  async listConnections(@Req() req: TenantRequest) {
    const rows = await this.connectionService.listTenantConnections(req.user.tenantId);
    return rows.map((row) => this.connectionService.maskConnection(row));
  }

  @Get(':provider/status')
  @RequirePermissions('settings.manage')
  async getProviderStatus(@Req() req: TenantRequest, @Param('provider') providerParam: string) {
    const provider = this.providerRegistry.parseProvider(providerParam);
    const connection = await this.connectionService.getTenantConnectionStatus(req.user.tenantId, provider);
    return connection ? this.connectionService.maskConnection(connection) : null;
  }

  @Post(':provider/connect/manual')
  @RequirePermissions('settings.manage')
  async connectManual(
    @Req() req: TenantRequest,
    @Param('provider') providerParam: string,
    @Body() body: {
      externalMerchantId?: string;
      externalStoreId?: string;
      displayName?: string;
      authType?: string;
      accessToken?: string;
      refreshToken?: string;
      tokenExpiresAt?: string;
      settingsJson?: Record<string, unknown>;
    },
  ) {
    const provider = this.providerRegistry.parseProvider(providerParam);
    const connection = await this.connectionService.connectManual(req.user.tenantId, provider, {
      ...body,
      settingsJson: (body.settingsJson ?? undefined) as Prisma.InputJsonValue | undefined,
    });
    return this.connectionService.maskConnection(connection);
  }

  @Post(':provider/disconnect')
  @RequirePermissions('settings.manage')
  async disconnect(@Req() req: TenantRequest, @Param('provider') providerParam: string) {
    const provider = this.providerRegistry.parseProvider(providerParam);
    const connection = await this.connectionService.disconnect(req.user.tenantId, provider);
    return this.connectionService.maskConnection(connection);
  }

  @Get('orders')
  @RequirePermissions('orders.read')
  async listMarketplaceOrders(@Req() req: TenantRequest) {
    return this.prisma.marketplaceOrder.findMany({
      where: { tenantId: req.user.tenantId },
      orderBy: [{ createdAt: 'desc' }],
      take: 100,
    });
  }

  @Get('events')
  @RequirePermissions('settings.manage')
  async listMarketplaceEvents(
    @Req() req: TenantRequest,
    @Query('eventId') eventId?: string,
    @Query('externalOrderId') externalOrderId?: string,
    @Query('status') status?: string,
  ) {
    return this.prisma.marketplaceEventInbox.findMany({
      where: {
        tenantId: req.user.tenantId,
        ...(eventId?.trim() ? { eventId: eventId.trim() } : {}),
        ...(externalOrderId?.trim() ? { externalOrderId: externalOrderId.trim() } : {}),
        ...(status?.trim() ? { status: status.trim() as never } : {}),
      },
      orderBy: [{ receivedAt: 'desc' }],
      take: 100,
    });
  }

  @Get('operations')
  @RequirePermissions('settings.manage')
  async listMarketplaceOperations(@Req() req: TenantRequest) {
    return this.prisma.marketplaceOperation.findMany({
      where: { tenantId: req.user.tenantId },
      orderBy: [{ createdAt: 'desc' }],
      take: 100,
    });
  }

  @Post('events/:eventInboxId/reprocess')
  @RequirePermissions('settings.manage')
  async reprocessEvent(@Req() req: TenantRequest, @Param('eventInboxId') eventInboxId: string) {
    return this.inboxService.reprocessEventInbox(eventInboxId, req.user.tenantId);
  }

  @Post('orders/:marketplaceOrderId/reprocess')
  @RequirePermissions('settings.manage')
  async reprocessOrder(@Req() req: TenantRequest, @Param('marketplaceOrderId') marketplaceOrderId: string) {
    return this.ingestionService.reprocessMarketplaceOrder(marketplaceOrderId, req.user.tenantId);
  }

  @Get('orders/:marketplaceOrderId/cancellation-reasons')
  @RequirePermissions('orders.cancel')
  async getCancellationReasons(
    @Req() req: TenantRequest,
    @Param('marketplaceOrderId') marketplaceOrderId: string,
  ) {
    return this.statusSyncService.getCancellationReasons(req.user.tenantId, marketplaceOrderId);
  }
}
