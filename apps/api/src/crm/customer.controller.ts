import { Body, Controller, Get, Param, Patch, Request, UseGuards } from '@nestjs/common';
import { CustomerService } from './customer.service';
import { TenantAuthGuard } from '../auth/guards/tenant-auth.guard';
import { PermissionsGuard } from '../rbac/guards/permissions.guard';
import { RequirePermissions } from '../common/decorators';
import { UpdateCustomerDTO } from '@gestor/types';

@Controller('crm/customers')
@UseGuards(TenantAuthGuard, PermissionsGuard)
export class CustomerController {
  constructor(private readonly customerService: CustomerService) {}

  @Get()
  @RequirePermissions('crm.read', 'crm.manage_customers')
  async list(@Request() req: { user: { tenantId: string } }) {
    return this.customerService.listCustomers(req.user.tenantId);
  }

  @Get(':id')
  @RequirePermissions('crm.read', 'crm.manage_customers')
  async get(
    @Request() req: { user: { tenantId: string } },
    @Param('id') id: string
  ) {
    return this.customerService.getCustomer(req.user.tenantId, id);
  }

  @Patch(':id')
  @RequirePermissions('crm.manage_customers')
  async update(
    @Request() req: { user: { tenantId: string } },
    @Param('id') id: string,
    @Body() data: UpdateCustomerDTO
  ) {
    return this.customerService.updateCustomer(req.user.tenantId, id, data);
  }
}
