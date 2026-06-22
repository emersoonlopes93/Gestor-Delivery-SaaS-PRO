import { Body, Controller, Get, Param, Post, Request, UseGuards } from '@nestjs/common';
import { CustomerJwtPayload } from '@gestor/types';
import { CurrentCustomer } from '../common/decorators';
import { CustomerAuthGuard } from '../auth/guards/customer-auth.guard';
import { TenantAuthGuard } from '../auth/guards/tenant-auth.guard';
import { PermissionsGuard } from '../rbac/guards/permissions.guard';
import { RequirePermissions } from '../common/decorators';
import { LoyaltyService } from './loyalty.service';

@Controller('loyalty')
@UseGuards(TenantAuthGuard, PermissionsGuard)
export class LoyaltyController {
  constructor(private readonly loyaltyService: LoyaltyService) {}

  @Get('customer/:customerId')
  @RequirePermissions('crm.read', 'crm.manage_customers')
  summary(@Request() req: { user: { tenantId: string } }, @Param('customerId') customerId: string) {
    return this.loyaltyService.getSummary(req.user.tenantId, customerId);
  }

  @Post('customer/:customerId/redeem')
  @RequirePermissions('crm.manage_loyalty_cashback')
  redeem(
    @Request() req: { user: { tenantId: string } },
    @Param('customerId') customerId: string,
    @Body() body: { points: number; description?: string },
  ) {
    return this.loyaltyService.redeem(req.user.tenantId, customerId, body.points, body.description);
  }

  @Post('customer/:customerId/add')
  @RequirePermissions('crm.manage_loyalty_cashback')
  add(
    @Request() req: { user: { tenantId: string } },
    @Param('customerId') customerId: string,
    @Body() body: { points: number; description?: string },
  ) {
    return this.loyaltyService.add(req.user.tenantId, customerId, body.points, body.description);
  }
}

@Controller('public/customer/loyalty')
@UseGuards(CustomerAuthGuard)
export class PublicCustomerLoyaltyController {
  constructor(private readonly loyaltyService: LoyaltyService) {}

  @Get()
  summary(@CurrentCustomer() customer: CustomerJwtPayload) {
    return this.loyaltyService.getSummary(customer.tenantId, customer.sub);
  }
}
