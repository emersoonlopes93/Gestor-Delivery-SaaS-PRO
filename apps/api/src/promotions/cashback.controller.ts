import { Controller, Get, Param, Request, UseGuards, Post, Body } from '@nestjs/common';
import { CashbackService } from './cashback.service';
import { TenantAuthGuard } from '../auth/guards/tenant-auth.guard';
import { PermissionsGuard } from '../rbac/guards/permissions.guard';
import { RequirePermissions } from '../common/decorators';
import { CashbackTransactionType } from '@prisma/client';

@Controller('promotions/cashback')
@UseGuards(TenantAuthGuard, PermissionsGuard)
export class CashbackController {
  constructor(private readonly cashbackService: CashbackService) {}

  @Get('customer/:customerId')
  @RequirePermissions('crm.read', 'crm.manage_customers')
  async listTransactions(
    @Request() req: { user: { tenantId: string } },
    @Param('customerId') customerId: string
  ) {
    return this.cashbackService.listCashbackTransactions(req.user.tenantId, customerId);
  }

  @Post('customer/:customerId/adjustment')
  @RequirePermissions('crm.manage_loyalty_cashback')
  async createAdjustment(
    @Request() req: { user: { tenantId: string } },
    @Param('customerId') customerId: string,
    @Body() body: { amount: number; description?: string, type?: CashbackTransactionType }
  ) {
    return this.cashbackService.createTransaction({
      tenantId: req.user.tenantId,
      customerId,
      type: body.type || 'adjustment',
      amount: body.amount,
      description: body.description || 'Manual adjustment',
    });
  }
}
