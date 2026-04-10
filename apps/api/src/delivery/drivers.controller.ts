import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TenantGuard } from '../auth/guards/tenant.guard';
import { PermissionGate } from '../rbac/decorators/permission-gate.decorator';
import { CurrentTenant } from '../common/decorators/current-tenant.decorator';
import { CreateDriverDTO, UpdateDriverDTO } from '@gestor/types';
import { DriversService } from './drivers.service';

@Controller('delivery/drivers')
@UseGuards(JwtAuthGuard, TenantGuard)
export class DriversController {
  constructor(private readonly driversService: DriversService) {}

  @Get()
  @PermissionGate('delivery.read', 'delivery.manage_drivers', 'delivery.dispatch')
  async list(@CurrentTenant('id') tenantId: string) {
    return this.driversService.listDrivers(tenantId);
  }

  @Get(':id')
  @PermissionGate('delivery.read', 'delivery.manage_drivers', 'delivery.dispatch')
  async get(
    @CurrentTenant('id') tenantId: string,
    @Param('id') id: string,
  ) {
    return this.driversService.getDriver(tenantId, id);
  }

  @Post()
  @PermissionGate('delivery.manage_drivers')
  async create(
    @CurrentTenant('id') tenantId: string,
    @Body() data: CreateDriverDTO,
  ) {
    return this.driversService.createDriver(tenantId, data);
  }

  @Patch(':id')
  @PermissionGate('delivery.manage_drivers', 'delivery.dispatch')
  async update(
    @CurrentTenant('id') tenantId: string,
    @Param('id') id: string,
    @Body() data: UpdateDriverDTO,
  ) {
    return this.driversService.updateDriver(tenantId, id, data);
  }

  @Delete(':id')
  @PermissionGate('delivery.manage_drivers')
  async remove(
    @CurrentTenant('id') tenantId: string,
    @Param('id') id: string,
  ) {
    await this.driversService.deleteDriver(tenantId, id);
    return { success: true };
  }
}
