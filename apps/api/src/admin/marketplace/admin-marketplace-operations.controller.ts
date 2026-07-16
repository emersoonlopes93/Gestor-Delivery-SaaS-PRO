import { BadRequestException, Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import {
  MarketplaceDivergenceStatus,
  MarketplaceDivergenceType,
  MarketplaceOperationStatus,
  MarketplaceOperationType,
} from '@prisma/client';
import { CurrentUser, RequireAdminPermissions } from '../../common/decorators';
import { MarketplaceAdminOperationsService } from '../../marketplace/services/marketplace-admin-operations.service';
import { MarketplaceReconciliationService } from '../../marketplace/services/marketplace-reconciliation.service';
import { AdminAuthGuard } from '../auth/admin-auth.guard';
import { AdminPermissionsGuard } from '../rbac/admin-permissions.guard';

@Controller('admin/marketplace')
@UseGuards(AdminAuthGuard, AdminPermissionsGuard)
export class AdminMarketplaceOperationsController {
  constructor(
    private readonly operations: MarketplaceAdminOperationsService,
    private readonly reconciliation: MarketplaceReconciliationService,
  ) {}

  @Get('operations')
  @RequireAdminPermissions('saas.marketplace.read')
  listOperations(
    @Query('tenantId') tenantId: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('status') status?: string,
    @Query('operation') operation?: string,
  ) {
    return this.operations.listOperations({
      ...this.page(tenantId, page, pageSize),
      status: this.enumValue(status, Object.values(MarketplaceOperationStatus)),
      operation: this.enumValue(operation, Object.values(MarketplaceOperationType)),
    });
  }

  @Get('failures')
  @RequireAdminPermissions('saas.marketplace.read')
  listFailures(
    @Query('tenantId') tenantId: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.operations.listFailures(this.page(tenantId, page, pageSize));
  }

  @Get('divergences')
  @RequireAdminPermissions('saas.marketplace.read')
  listDivergences(
    @Query('tenantId') tenantId: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('status') status?: string,
    @Query('type') type?: string,
  ) {
    return this.operations.listDivergences({
      ...this.page(tenantId, page, pageSize),
      status: this.enumValue(status, Object.values(MarketplaceDivergenceStatus)),
      type: this.enumValue(type, Object.values(MarketplaceDivergenceType)),
    });
  }

  @Get('operations/:operationId')
  @RequireAdminPermissions('saas.marketplace.read')
  getOperation(@Query('tenantId') tenantId: string, @Param('operationId') operationId: string) {
    return this.operations.getOperation(this.requiredTenantId(tenantId), operationId);
  }

  @Get('operations/:operationId/history')
  @RequireAdminPermissions('saas.marketplace.read')
  getOperationHistory(@Query('tenantId') tenantId: string, @Param('operationId') operationId: string) {
    return this.operations.getOperationHistory(this.requiredTenantId(tenantId), operationId);
  }

  @Get('metrics')
  @RequireAdminPermissions('saas.marketplace.read')
  getMetrics(@Query('tenantId') tenantId: string) {
    return this.operations.getMetrics(this.requiredTenantId(tenantId));
  }

  @Post('operations/:operationId/retry')
  @RequireAdminPermissions('saas.marketplace.manage')
  @Throttle({ default: { limit: 5, ttl: 60 } })
  retryOperation(
    @Query('tenantId') tenantId: string,
    @Param('operationId') operationId: string,
    @CurrentUser('sub') adminId: string,
    @Req() req: Request,
  ) {
    return this.reconciliation.retryOperation({
      tenantId: this.requiredTenantId(tenantId),
      operationId,
      adminId,
      ip: req.ip,
    });
  }

  @Post('divergences/:divergenceId/acknowledge')
  @RequireAdminPermissions('saas.marketplace.manage')
  acknowledgeDivergence(
    @Query('tenantId') tenantId: string,
    @Param('divergenceId') divergenceId: string,
    @Body() body: { note?: string },
    @CurrentUser('sub') adminId: string,
    @Req() req: Request,
  ) {
    return this.operations.acknowledgeDivergence({
      tenantId: this.requiredTenantId(tenantId),
      divergenceId,
      adminId,
      note: body.note,
      ip: req.ip,
    });
  }

  @Post('connections/:connectionId/rotate-credentials')
  @RequireAdminPermissions('saas.marketplace.manage')
  @Throttle({ default: { limit: 3, ttl: 60 } })
  rotateCredentials(
    @Query('tenantId') tenantId: string,
    @Param('connectionId') connectionId: string,
    @CurrentUser('sub') adminId: string,
    @Req() req: Request,
  ) {
    return this.operations.rotateConnectionCredentials({
      tenantId: this.requiredTenantId(tenantId),
      connectionId,
      adminId,
      ip: req.ip,
    });
  }

  private page(tenantId: string, page?: string, pageSize?: string) {
    return {
      tenantId: this.requiredTenantId(tenantId),
      page: this.positiveInteger(page, 1, 1, 100_000),
      pageSize: this.positiveInteger(pageSize, 25, 1, 100),
    };
  }

  private requiredTenantId(value: string): string {
    const normalized = value?.trim();
    if (!normalized) throw new BadRequestException('tenantId is required.');
    return normalized;
  }

  private positiveInteger(value: string | undefined, fallback: number, min: number, max: number): number {
    if (!value) return fallback;
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < min || parsed > max) throw new BadRequestException('Invalid pagination value.');
    return parsed;
  }

  private enumValue<T extends string>(value: string | undefined, values: readonly T[]): T | undefined {
    if (!value) return undefined;
    if (!values.includes(value as T)) throw new BadRequestException('Invalid filter value.');
    return value as T;
  }
}
