import { BadRequestException, Body, Controller, Delete, ForbiddenException, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import type { Request as ExpressRequest } from 'express';
import type { TenantJwtPayload } from '@gestor/types';
import { MarketplaceCatalogMappingStatus, MarketplaceEventStatus, MarketplaceProvider, Prisma } from '@prisma/client';
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
import { FeatureControlService } from '../../feature-control/feature-control.service';
import { MarketplaceCatalogMappingService } from '../services/marketplace-catalog-mapping.service';
import { Food99CashConfirmationService } from '../services/food99-cash-confirmation.service';
import { Food99SelfServiceConnectionService } from '../services/food99-self-service-connection.service';
import { randomUUID } from 'crypto';

type TenantRequest = ExpressRequest & { user: TenantJwtPayload };

@Controller('marketplaces')
@UseGuards(TenantAuthGuard, PermissionsGuard)
@RequiresFeature('marketplace_orders')
export class MarketplaceTenantController {
  constructor(
    private readonly providerRegistry: MarketplaceProviderRegistryService,
    private readonly connectionService: MarketplaceConnectionService,
    private readonly inboxService: MarketplaceEventInboxService,
    private readonly ingestionService: MarketplaceOrderIngestionService,
    private readonly prisma: PrismaService,
    private readonly statusSyncService: MarketplaceStatusSyncService,
    private readonly featureControl: FeatureControlService,
    private readonly catalogMappings: MarketplaceCatalogMappingService,
    private readonly cashConfirmation: Food99CashConfirmationService,
    private readonly food99SelfService: Food99SelfServiceConnectionService,
  ) {}

  @Get('catalog-mappings')
  @RequirePermissions('settings.manage')
  async listCatalogMappings(@Req() req: TenantRequest, @Query('connectionId') connectionId?: string) {
    return this.catalogMappings.list(req.user.tenantId, connectionId?.trim() || undefined);
  }

  @Get('catalog-mapping-candidates')
  @RequirePermissions('settings.manage')
  async listCatalogMappingCandidates(@Req() req: TenantRequest) {
    return this.catalogMappings.listUnmappedItems(req.user.tenantId);
  }

  @Post('catalog-mappings')
  @RequirePermissions('settings.manage')
  async upsertCatalogMapping(
    @Req() req: TenantRequest,
    @Body() body: { connectionId?: string; externalItemId?: string; externalItemName?: string; externalReferenceId?: string; productId?: string; status?: MarketplaceCatalogMappingStatus },
  ) {
    if (!body.connectionId || !body.externalItemId || !body.productId) throw new BadRequestException('connectionId, externalItemId and productId are required.');
    return this.catalogMappings.upsert(req.user.tenantId, {
      connectionId: body.connectionId,
      externalItemId: body.externalItemId,
      externalItemName: body.externalItemName,
      externalReferenceId: body.externalReferenceId,
      productId: body.productId,
      status: body.status,
    });
  }

  @Post('99food/self-service/authorization')
  @RequirePermissions('settings.manage')
  async startFood99SelfServiceAuthorization(@Req() req: TenantRequest, @Body() body: { connectionId?: string; createNew?: boolean }) {
    const started = await this.food99SelfService.start(req.user.tenantId, body.connectionId?.trim() || undefined, body.createNew === true);
    return {
      authorizationUrl: started.authorizationUrl,
      connection: this.connectionService.maskConnection(started.connection),
    };
  }

  @Post('99food/self-service/verify')
  @RequirePermissions('settings.manage')
  async verifyFood99SelfServiceAuthorization(@Req() req: TenantRequest, @Body() body: { connectionId?: string }) {
    const connectionId = body.connectionId?.trim();
    if (!connectionId) throw new BadRequestException('99Food connection is required to verify authorization.');
    const result = await this.food99SelfService.verify(req.user.tenantId, connectionId);
    return {
      ...result,
      connection: this.connectionService.maskConnection(result.connection),
    };
  }

  @Post('99food/self-service/bind')
  @RequirePermissions('settings.manage')
  async bindFood99SelfServiceAuthorization(@Req() req: TenantRequest, @Body() body: { connectionId?: string; shopId?: string }) {
    const connectionId = body.connectionId?.trim();
    const shopId = body.shopId?.trim();
    if (!connectionId || !shopId) throw new BadRequestException('99Food connection and shop are required to complete authorization.');
    const result = await this.food99SelfService.bind(req.user.tenantId, connectionId, shopId);
    return {
      ...result,
      connection: this.connectionService.maskConnection(result.connection),
    };
  }

  @Get('connections')
  @RequirePermissions('settings.manage')
  async listConnections(@Req() req: TenantRequest) {
    const rows = await this.connectionService.listTenantConnections(req.user.tenantId);
    const canManageIfood = await this.canManageIfood(req.user.tenantId);
    return rows
      .filter((row) => canManageIfood || row.provider !== MarketplaceProvider.IFOOD)
      .map((row) => this.connectionService.maskConnection(row));
  }

  @Get('connections/:connectionId')
  @RequirePermissions('settings.manage')
  async getConnection(@Req() req: TenantRequest, @Param('connectionId') connectionId: string) {
    const connection = await this.connectionService.getTenantConnection(req.user.tenantId, connectionId);
    await this.assertProviderAccess(req.user.tenantId, connection.provider);
    return this.connectionService.maskConnection(connection);
  }

  @Patch('connections/:connectionId')
  @RequirePermissions('settings.manage')
  async updateConnection(
    @Req() req: TenantRequest,
    @Param('connectionId') connectionId: string,
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
    const existing = await this.connectionService.getTenantConnection(req.user.tenantId, connectionId);
    await this.assertProviderAccess(req.user.tenantId, existing.provider);
    const connection = await this.connectionService.updateManual(req.user.tenantId, connectionId, {
      ...body,
      settingsJson: (body.settingsJson ?? undefined) as Prisma.InputJsonValue | undefined,
    });
    return this.connectionService.maskConnection(connection);
  }

  @Post('connections/:connectionId/connect/manual')
  @RequirePermissions('settings.manage')
  async reconnectConnection(
    @Req() req: TenantRequest,
    @Param('connectionId') connectionId: string,
    @Body() body: {
      accessToken?: string;
      refreshToken?: string;
      tokenExpiresAt?: string;
    },
  ) {
    const existing = await this.connectionService.getTenantConnection(req.user.tenantId, connectionId);
    await this.assertProviderAccess(req.user.tenantId, existing.provider);
    if (existing.provider === MarketplaceProvider.FOOD_99
      && !body.accessToken?.trim()
      && !body.refreshToken?.trim()
      && !body.tokenExpiresAt?.trim()) {
      throw new BadRequestException('99Food manual reconnection requires an explicit support payload. Use the authorization flow for self-service connections.');
    }
    const connection = await this.connectionService.updateManual(req.user.tenantId, connectionId, body);
    if (existing.provider === MarketplaceProvider.FOOD_99) {
      const verified = await this.food99SelfService.verifyExistingToken(req.user.tenantId, connection.id);
      return this.connectionService.maskConnection(verified);
    }
    return this.connectionService.maskConnection(connection);
  }

  @Post('connections/:connectionId/reconnect')
  @RequirePermissions('settings.manage')
  async reconnectHistoricalFood99Connection(@Req() req: TenantRequest, @Param('connectionId') connectionId: string) {
    const connection = await this.food99SelfService.reconnectHistorical(req.user.tenantId, connectionId);
    return this.connectionService.maskConnection(connection);
  }

  @Post('connections/:connectionId/disconnect')
  @RequirePermissions('settings.manage')
  async disconnectConnection(@Req() req: TenantRequest, @Param('connectionId') connectionId: string) {
    const existing = await this.connectionService.getTenantConnection(req.user.tenantId, connectionId);
    await this.assertProviderAccess(req.user.tenantId, existing.provider);
    const connection = await this.connectionService.disconnectById(req.user.tenantId, connectionId);
    return this.connectionService.maskConnection(connection);
  }

  @Delete('connections/:connectionId')
  @RequirePermissions('settings.manage')
  async removeConnection(@Req() req: TenantRequest, @Param('connectionId') connectionId: string) {
    const existing = await this.connectionService.getTenantConnection(req.user.tenantId, connectionId);
    await this.assertProviderAccess(req.user.tenantId, existing.provider);
    if (existing.provider === MarketplaceProvider.FOOD_99) {
      await this.connectionService.removeUnboundPendingFood99SelfService(req.user.tenantId, connectionId);
      return { removed: true };
    }
    const connection = await this.connectionService.disconnectById(req.user.tenantId, connectionId);
    return this.connectionService.maskConnection(connection);
  }

  @Get(':provider/status')
  @RequirePermissions('settings.manage')
  async getProviderStatus(@Req() req: TenantRequest, @Param('provider') providerParam: string) {
    const provider = this.providerRegistry.parseProvider(providerParam);
    await this.assertProviderAccess(req.user.tenantId, provider);
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
    await this.assertProviderAccess(req.user.tenantId, provider);
    const connection = await this.connectionService.connectManual(req.user.tenantId, provider, {
      ...body,
      settingsJson: (body.settingsJson ?? undefined) as Prisma.InputJsonValue | undefined,
    });
    if (provider === MarketplaceProvider.FOOD_99) {
      const verified = await this.food99SelfService.verifyExistingToken(req.user.tenantId, connection.id);
      return this.connectionService.maskConnection(verified);
    }
    return this.connectionService.maskConnection(connection);
  }

  @Post(':provider/disconnect')
  @RequirePermissions('settings.manage')
  async disconnect(@Req() req: TenantRequest, @Param('provider') providerParam: string) {
    const provider = this.providerRegistry.parseProvider(providerParam);
    await this.assertProviderAccess(req.user.tenantId, provider);
    const connection = await this.connectionService.disconnect(req.user.tenantId, provider);
    return this.connectionService.maskConnection(connection);
  }

  @Get('orders')
  @RequirePermissions('orders.read')
  async listMarketplaceOrders(@Req() req: TenantRequest) {
    const canManageIfood = await this.canManageIfood(req.user.tenantId);
    return this.prisma.marketplaceOrder.findMany({
      where: { tenantId: req.user.tenantId, ...(canManageIfood ? {} : { provider: { not: MarketplaceProvider.IFOOD } }) },
      orderBy: [{ createdAt: 'desc' }],
      take: 100,
      select: {
        id: true,
        connectionId: true,
        provider: true,
        externalOrderId: true,
        externalDisplayId: true,
        internalOrderId: true,
        statusExternal: true,
        statusInternal: true,
        externalCreatedAt: true,
        preparationStartAt: true,
        confirmationDeadlineAt: true,
        lastExternalEventAt: true,
        lastSyncedAt: true,
        createdAt: true,
        updatedAt: true,
      },
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
    const canManageIfood = await this.canManageIfood(req.user.tenantId);
    const normalizedStatus = status?.trim();
    if (normalizedStatus && !Object.values(MarketplaceEventStatus).includes(normalizedStatus as MarketplaceEventStatus)) {
      throw new BadRequestException('Invalid marketplace event status.');
    }
    return this.prisma.marketplaceEventInbox.findMany({
      where: {
        tenantId: req.user.tenantId,
        ...(eventId?.trim() ? { eventId: eventId.trim() } : {}),
        ...(externalOrderId?.trim() ? { externalOrderId: externalOrderId.trim() } : {}),
        ...(normalizedStatus ? { status: normalizedStatus as MarketplaceEventStatus } : {}),
        ...(canManageIfood ? {} : { provider: { not: MarketplaceProvider.IFOOD } }),
      },
      orderBy: [{ receivedAt: 'desc' }],
      take: 100,
      select: {
        id: true,
        connectionId: true,
        provider: true,
        eventId: true,
        externalMerchantId: true,
        externalStoreId: true,
        externalOrderId: true,
        topic: true,
        eventCreatedAt: true,
        correlationId: true,
        status: true,
        attempts: true,
        duplicateCount: true,
        lastError: true,
        receivedAt: true,
        processedAt: true,
      },
    });
  }

  @Get('operations')
  @RequirePermissions('settings.manage')
  async listMarketplaceOperations(@Req() req: TenantRequest) {
    return this.prisma.marketplaceOperation.findMany({
      where: { tenantId: req.user.tenantId },
      orderBy: [{ createdAt: 'desc' }],
      take: 100,
      select: {
        id: true,
        marketplaceOrderId: true,
        externalOrderId: true,
        operation: true,
        status: true,
        correlationId: true,
        attempts: true,
        enqueuedAt: true,
        firstAttemptAt: true,
        lastAttemptAt: true,
        acceptedAt: true,
        completedAt: true,
        deadlineAt: true,
        queueDelayMs: true,
        httpStatus: true,
        providerCode: true,
        lastError: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  @Post('events/:eventInboxId/reprocess')
  @RequirePermissions('settings.manage')
  async reprocessEvent(@Req() req: TenantRequest, @Param('eventInboxId') eventInboxId: string) {
    const event = await this.prisma.marketplaceEventInbox.findFirst({
      where: { id: eventInboxId, tenantId: req.user.tenantId },
      select: { provider: true },
    });
    if (event) await this.assertProviderAccess(req.user.tenantId, event.provider);
    return this.inboxService.reprocessEventInbox(eventInboxId, req.user.tenantId);
  }

  @Post('orders/:marketplaceOrderId/reprocess')
  @RequirePermissions('settings.manage')
  async reprocessOrder(@Req() req: TenantRequest, @Param('marketplaceOrderId') marketplaceOrderId: string) {
    const order = await this.prisma.marketplaceOrder.findFirst({
      where: { id: marketplaceOrderId, tenantId: req.user.tenantId },
      select: { provider: true },
    });
    if (order) await this.assertProviderAccess(req.user.tenantId, order.provider);
    return this.ingestionService.reprocessMarketplaceOrder(marketplaceOrderId, req.user.tenantId);
  }

  @Post('orders/:marketplaceOrderId/pay-confirm')
  @RequirePermissions('orders.update_status')
  async confirmFood99CashPayment(
    @Req() req: TenantRequest,
    @Param('marketplaceOrderId') marketplaceOrderId: string,
  ) {
    return this.cashConfirmation.confirm(req.user.tenantId, marketplaceOrderId);
  }

  @Get('orders/:marketplaceOrderId/cancellation-reasons')
  @RequirePermissions('orders.cancel')
  async getCancellationReasons(
    @Req() req: TenantRequest,
    @Param('marketplaceOrderId') marketplaceOrderId: string,
  ) {
    return this.statusSyncService.getCancellationReasons(req.user.tenantId, marketplaceOrderId);
  }

  @Post('orders/:marketplaceOrderId/cancellation/accept')
  @RequirePermissions('orders.cancel')
  async acceptFood99Cancellation(
    @Req() req: TenantRequest,
    @Param('marketplaceOrderId') marketplaceOrderId: string,
  ) {
    const order = await this.prisma.marketplaceOrder.findFirst({
      where: { id: marketplaceOrderId, tenantId: req.user.tenantId },
      include: { connection: true },
    });
    if (!order) throw new BadRequestException('Marketplace order not found.');
    const adapter = this.providerRegistry.get(order.provider);
    if (!adapter.acceptCancellation) throw new BadRequestException('Cancellation acceptance is unavailable for this provider.');
    const correlationId = randomUUID();
    const result = await adapter.acceptCancellation({
      connection: order.connection,
      externalOrderId: order.externalOrderId,
      correlationId,
    });
    await this.prisma.auditLog.create({
      data: {
        tenantId: req.user.tenantId,
        userId: req.user.sub,
        userType: 'tenant_user',
        action: 'marketplace.cancellation.accept',
        resource: order.id,
        details: { provider: order.provider, externalOrderId: order.externalOrderId, correlationId },
      },
    });
    return result;
  }

  @Post('orders/:marketplaceOrderId/cancellation/deny')
  @RequirePermissions('orders.cancel')
  async denyFood99Cancellation(
    @Req() req: TenantRequest,
    @Param('marketplaceOrderId') marketplaceOrderId: string,
    @Body() body: { reason?: string },
  ) {
    const reason = body.reason?.trim();
    if (!reason) throw new BadRequestException('Cancellation denial reason and code are required.');
    const order = await this.prisma.marketplaceOrder.findFirst({
      where: { id: marketplaceOrderId, tenantId: req.user.tenantId },
      include: { connection: true },
    });
    if (!order) throw new BadRequestException('Marketplace order not found.');
    const adapter = this.providerRegistry.get(order.provider);
    if (!adapter.denyCancellation) throw new BadRequestException('Cancellation denial is unavailable for this provider.');
    const correlationId = randomUUID();
    const result = await adapter.denyCancellation({
      connection: order.connection,
      externalOrderId: order.externalOrderId,
      reason,
      correlationId,
    });
    await this.prisma.auditLog.create({
      data: {
        tenantId: req.user.tenantId,
        userId: req.user.sub,
        userType: 'tenant_user',
        action: 'marketplace.cancellation.deny',
        resource: order.id,
        details: { provider: order.provider, externalOrderId: order.externalOrderId, correlationId },
      },
    });
    return result;
  }

  private async canManageIfood(tenantId: string): Promise<boolean> {
    const capability = await this.featureControl.resolveTenantFeature({ tenantId, featureKey: 'ifood_marketplace' });
    return capability.enabled;
  }

  private async assertProviderAccess(tenantId: string, provider: MarketplaceProvider): Promise<void> {
    if (provider === MarketplaceProvider.IFOOD && !(await this.canManageIfood(tenantId))) {
      throw new ForbiddenException('iFood marketplace feature is disabled for this tenant.');
    }
  }
}
