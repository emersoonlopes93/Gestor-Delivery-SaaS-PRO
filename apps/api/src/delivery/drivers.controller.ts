import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards, Request } from '@nestjs/common';
import { TenantAuthGuard } from '../auth/guards/tenant-auth.guard';
import { PermissionsGuard } from '../rbac/guards/permissions.guard';
import { RequirePermissions } from '../common/decorators';
import { CreateDriverDTO, UpdateDriverDTO } from '@gestor/types';
import { DriversService } from './drivers.service';
import { UpdateDriverLocationDTO } from './dto/update-driver-location.dto';
import { AuthenticatedRequest } from '../common/interfaces/request.interface';

@Controller('delivery/drivers')
@UseGuards(TenantAuthGuard, PermissionsGuard)
export class DriversController {
  constructor(private readonly driversService: DriversService) {}

  @Get()
  @RequirePermissions('delivery.read', 'delivery.manage_drivers', 'delivery.dispatch')
  async list(@Request() req: AuthenticatedRequest) {
    return this.driversService.listDrivers(req.user.tenantId);
  }

  @Get(':id')
  @RequirePermissions('delivery.read', 'delivery.manage_drivers', 'delivery.dispatch')
  async get(
    @Request() req: AuthenticatedRequest,
    @Param('id') id: string,
  ) {
    return this.driversService.getDriver(req.user.tenantId, id);
  }

  @Post()
  @RequirePermissions('delivery.manage_drivers')
  async create(
    @Request() req: AuthenticatedRequest,
    @Body() data: CreateDriverDTO,
  ) {
    return this.driversService.createDriver(req.user.tenantId, data);
  }

  @Patch(':id')
  @RequirePermissions('delivery.manage_drivers', 'delivery.dispatch')
  async update(
    @Request() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() data: UpdateDriverDTO,
  ) {
    return this.driversService.updateDriver(req.user.tenantId, id, data);
  }

  @Post(':id/location')
  @RequirePermissions('delivery.dispatch', 'delivery.manage_drivers')
  async updateLocation(
    @Request() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() data: UpdateDriverLocationDTO,
  ) {
    return this.driversService.updateDriverLocation(req.user.tenantId, id, data);
  }

  @Delete(':id')
  @RequirePermissions('delivery.manage_drivers')
  async remove(
    @Request() req: AuthenticatedRequest,
    @Param('id') id: string,
  ) {
    await this.driversService.deleteDriver(req.user.tenantId, id);
    return { success: true };
  }
}
