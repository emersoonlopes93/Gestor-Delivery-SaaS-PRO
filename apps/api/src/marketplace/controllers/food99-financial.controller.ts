import { randomUUID } from 'crypto';
import { Body, Controller, Get, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import type {
  Food99FinancialSyncDTO,
  Food99FinancialSyncResultDTO,
  Food99ReconciliationDTO,
  Food99SettlementAccountDTO,
  Food99SettlementDTO,
} from '@gestor/types';
import { TenantAuthGuard } from '../../auth/guards/tenant-auth.guard';
import { CurrentTenant, RequirePermissions } from '../../common/decorators';
import { RequiresFeature } from '../../common/decorators/requires-feature.decorator';
import { PermissionsGuard } from '../../rbac/guards/permissions.guard';
import { Food99FinancialReconciliationService } from '../services/food99-financial-reconciliation.service';

@Controller('finance/marketplaces/99food')
@UseGuards(TenantAuthGuard, PermissionsGuard)
@RequiresFeature('finance')
export class Food99FinancialController {
  constructor(private readonly service: Food99FinancialReconciliationService) {}

  @Get('reconciliation')
  @RequirePermissions('finance.read')
  findReconciliation(
    @CurrentTenant() tenantId: string,
    @Query('connectionId') connectionId?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ): Promise<Food99ReconciliationDTO> {
    return this.service.findReconciliation(tenantId, { connectionId, startDate, endDate });
  }

  @Post('sync')
  @RequirePermissions('finance.manage')
  sync(
    @CurrentTenant() tenantId: string,
    @Body() dto: Food99FinancialSyncDTO,
  ): Promise<Food99FinancialSyncResultDTO> {
    return this.service.sync(tenantId, dto, randomUUID());
  }

  @Put('connections/:connectionId/settlement-account')
  @RequirePermissions('finance.manage')
  configureSettlementAccount(
    @CurrentTenant() tenantId: string,
    @Param('connectionId') connectionId: string,
    @Body() dto: Food99SettlementAccountDTO,
  ): Promise<{ connectionId: string; settlementFinancialAccountId: string | null }> {
    return this.service.configureSettlementAccount(tenantId, connectionId, dto.accountId);
  }

  @Post('settlements/:settlementId/post')
  @RequirePermissions('finance.manage')
  postSettlement(
    @CurrentTenant() tenantId: string,
    @Param('settlementId') settlementId: string,
  ): Promise<Food99SettlementDTO> {
    return this.service.postSettlement(tenantId, settlementId);
  }
}
