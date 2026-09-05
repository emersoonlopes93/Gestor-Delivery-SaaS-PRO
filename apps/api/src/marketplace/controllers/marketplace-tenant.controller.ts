import { BadRequestException, Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import type { Request as ExpressRequest } from 'express';
import type { TenantJwtPayload } from '@gestor/types';
import { MarketplaceEventStatus, Prisma } from '@prisma/client';
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
import { Food99HttpClientService } from '../services/food99-http-client.service';
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
    private readonly food99Client: Food99HttpClientService,
  ) {}

  @Post('99food/authorization-url')
  @RequirePermissions('settings.manage')
  async getFood99AuthorizationUrl(@Body() body: { appShopId?: string }) {
    const appShopId = body.appShopId?.trim();
    if (!appShopId) throw new BadRequestException('99Food app shop ID is required.');
    return { url: await this.food99Client.getAuthorizationUrl(randomUUID(), appShopId) };
  }

  @Get('connections')
  @RequirePermissions('settings.manage')
  async listConnections(@Req() req: TenantRequest) {
    const rows = await this.connectionService.listTenantConnections(req.user.tenantId);
    return rows.map((row) => this.connectionService.maskConnection(row));
  }

  @Get('connections/:connectionId')
  @RequirePermissions('settings.manage')
  async getConnection(@Req() req: TenantRequest, @Param('connectionId') connectionId: string) {
    const connection = await this.connectionService.getTenantConnection(req.user.tenantId, connectionId);
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
    const connection = await this.connectionService.updateManual(req.user.tenantId, connectionId, body);
    return this.connectionService.maskConnection(connection);
  }

  @Post('connections/:connectionId/disconnect')
  @RequirePermissions('settings.manage')
  async disconnectConnection(@Req() req: TenantRequest, @Param('connectionId') connectionId: string) {
    const connection = await this.connectionService.disconnectById(req.user.tenantId, connectionId);
    return this.connectionService.maskConnection(connection);
  }

  @Delete('connections/:connectionId')
  @RequirePermissions('settings.manage')
  async removeConnection(@Req() req: TenantRequest, @Param('connectionId') connectionId: string) {
    const connection = await this.connectionService.disconnectById(req.user.tenantId, connectionId);
    return this.connectionService.maskConnection(connection);
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
}
