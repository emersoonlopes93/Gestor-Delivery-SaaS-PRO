import { Body, Controller, Get, Param, Patch, Post, Request, UseGuards } from '@nestjs/common';
import { CouponsService } from './coupons.service';
import { TenantAuthGuard } from '../auth/guards/tenant-auth.guard';
import { PermissionsGuard } from '../rbac/guards/permissions.guard';
import { RequirePermissions } from '../common/decorators';
import { CreateCouponDTO, UpdateCouponDTO } from '@gestor/types';

@Controller('promotions/coupons')
@UseGuards(TenantAuthGuard, PermissionsGuard)
export class CouponsController {
  constructor(private readonly couponsService: CouponsService) {}

  @Get()
  @RequirePermissions('crm.read', 'crm.manage_coupons')
  async list(@Request() req: { user: { tenantId: string } }) {
    return this.couponsService.listCoupons(req.user.tenantId);
  }

  @Get(':id')
  @RequirePermissions('crm.read', 'crm.manage_coupons')
  async get(
    @Request() req: { user: { tenantId: string } },
    @Param('id') id: string
  ) {
    return this.couponsService.getCoupon(req.user.tenantId, id);
  }

  @Post()
  @RequirePermissions('crm.manage_coupons')
  async create(
    @Request() req: { user: { tenantId: string } },
    @Body() data: CreateCouponDTO
  ) {
    return this.couponsService.createCoupon(req.user.tenantId, data);
  }

  @Patch(':id')
  @RequirePermissions('crm.manage_coupons')
  async update(
    @Request() req: { user: { tenantId: string } },
    @Param('id') id: string,
    @Body() data: UpdateCouponDTO
  ) {
    return this.couponsService.updateCoupon(req.user.tenantId, id, data);
  }
}
