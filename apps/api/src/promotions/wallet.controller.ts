import { Body, Controller, Get, Param, Post, Request, UseGuards } from '@nestjs/common';
import { CustomerJwtPayload } from '@gestor/types';
import { CurrentCustomer } from '../common/decorators';
import { CustomerAuthGuard } from '../auth/guards/customer-auth.guard';
import { TenantAuthGuard } from '../auth/guards/tenant-auth.guard';
import { PermissionsGuard } from '../rbac/guards/permissions.guard';
import { RequirePermissions } from '../common/decorators';
import { RequiresFeature } from '../common/decorators/requires-feature.decorator';
import { WalletService } from './wallet.service';

@Controller('wallet')
@UseGuards(TenantAuthGuard, PermissionsGuard)
@RequiresFeature('crm')
export class WalletController {
  constructor(private readonly walletService: WalletService) {}

  @Get('customer/:customerId')
  @RequirePermissions('crm.read', 'crm.manage_customers')
  get(@Request() req: { user: { tenantId: string } }, @Param('customerId') customerId: string) {
    return this.walletService.getWallet(req.user.tenantId, customerId);
  }

  @Post('customer/:customerId/credit')
  @RequirePermissions('crm.manage_loyalty_cashback')
  credit(
    @Request() req: { user: { tenantId: string } },
    @Param('customerId') customerId: string,
    @Body() body: { amount: number; source?: string; description?: string; expiresAt?: string },
  ) {
    return this.walletService.createTransaction({
      tenantId: req.user.tenantId,
      customerId,
      type: 'credit',
      amount: body.amount,
      source: body.source ?? 'manual_bonus',
      description: body.description,
      expiresAt: body.expiresAt ? new Date(body.expiresAt) : undefined,
    });
  }

  @Post('customer/:customerId/debit')
  @RequirePermissions('crm.manage_loyalty_cashback')
  debit(
    @Request() req: { user: { tenantId: string } },
    @Param('customerId') customerId: string,
    @Body() body: { amount: number; description?: string },
  ) {
    return this.walletService.createTransaction({
      tenantId: req.user.tenantId,
      customerId,
      type: 'debit',
      amount: body.amount,
      source: 'manual_debit',
      description: body.description,
    });
  }
}

@Controller('public/customer/wallet')
@UseGuards(CustomerAuthGuard)
export class PublicCustomerWalletController {
  constructor(private readonly walletService: WalletService) {}

  @Get()
  get(@CurrentCustomer() customer: CustomerJwtPayload) {
    return this.walletService.getWallet(customer.tenantId, customer.sub);
  }
}
