import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { CreateDriverSettlementDTO, DriverSettlementListQueryDTO } from '@gestor/types';
import { TenantAuthGuard } from '../auth/guards/tenant-auth.guard';
import { DriverAuthGuard } from '../auth/guards/driver-auth.guard';
import { RequirePermissions } from '../common/decorators';
import { AuthenticatedRequest } from '../common/interfaces/request.interface';
import { PermissionsGuard } from '../rbac/guards/permissions.guard';
import { DriverSettlementsService } from './driver-settlements.service';

@Controller('delivery/settlements')
@UseGuards(TenantAuthGuard, PermissionsGuard)
export class DriverSettlementsController {
  constructor(private readonly settlements: DriverSettlementsService) {}

  @Get('drivers/:driverId/summary')
  @RequirePermissions('finance.read')
  summary(@Req() req: AuthenticatedRequest, @Param('driverId') driverId: string) {
    return this.settlements.summary(req.user.tenantId, driverId);
  }

  @Get('drivers/:driverId/shifts')
  @RequirePermissions('finance.read')
  shifts(@Req() req: AuthenticatedRequest, @Param('driverId') driverId: string, @Query() query: DriverSettlementListQueryDTO) {
    return this.settlements.listShifts(req.user.tenantId, driverId, query.status, query.from, query.to);
  }

  @Get('drivers/:driverId/history')
  @RequirePermissions('finance.read')
  history(@Req() req: AuthenticatedRequest, @Param('driverId') driverId: string) {
    return this.settlements.history(req.user.tenantId, driverId);
  }

  @Get(':id')
  @RequirePermissions('finance.read')
  detail(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.settlements.detail(req.user.tenantId, id);
  }

  @Post()
  @RequirePermissions('finance.manage')
  create(@Req() req: AuthenticatedRequest, @Body() dto: CreateDriverSettlementDTO) {
    return this.settlements.create(req.user.tenantId, req.user.id, dto);
  }
}

@Controller('delivery/driver/settlements')
@UseGuards(DriverAuthGuard)
export class DriverSettlementHistoryController {
  constructor(private readonly settlements: DriverSettlementsService) {}

  @Get('summary')
  summary(@Req() req: AuthenticatedRequest) {
    return this.settlements.summary(req.user.tenantId, req.user.id);
  }

  @Get('history')
  history(@Req() req: AuthenticatedRequest) {
    return this.settlements.history(req.user.tenantId, req.user.id);
  }

  @Get(':id')
  detail(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.settlements.detail(req.user.tenantId, id, req.user.id);
  }
}
