import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Request, UseGuards } from '@nestjs/common';
import { CustomerService } from './customer.service';
import { TenantAuthGuard } from '../auth/guards/tenant-auth.guard';
import { PermissionsGuard } from '../rbac/guards/permissions.guard';
import { RequirePermissions } from '../common/decorators';
import { CreateCustomerDTO, UpdateCustomerDTO, UpsertCustomerAddressDTO } from '@gestor/types';
import { CrmSegmentationService } from './crm-segmentation.service';

@Controller('crm/customers')
@UseGuards(TenantAuthGuard, PermissionsGuard)
export class CustomerController {
  constructor(
    private readonly customerService: CustomerService,
    private readonly crmSegmentationService: CrmSegmentationService,
  ) {}

  @Get()
  @RequirePermissions('crm.read', 'crm.manage_customers')
  async list(@Request() req: { user: { tenantId: string } }) {
    return this.crmSegmentationService.getSegmentedCustomers(req.user.tenantId);
  }

  @Get('search')
  @RequirePermissions('crm.read', 'crm.manage_customers')
  async search(
    @Request() req: { user: { tenantId: string } },
    @Query('q') q = '',
    @Query('limit') limit?: string,
  ) {
    return this.customerService.searchCustomers(req.user.tenantId, q, limit ? Number(limit) : undefined);
  }

  @Post()
  @RequirePermissions('crm.manage_customers')
  async create(
    @Request() req: { user: { tenantId: string } },
    @Body() data: CreateCustomerDTO,
  ) {
    return this.customerService.createCustomer(req.user.tenantId, data);
  }

  @Get('analytics/retention')
  @RequirePermissions('crm.read')
  async getRetentionMetrics(@Request() req: { user: { tenantId: string } }) {
    return this.crmSegmentationService.getRetentionMetrics(req.user.tenantId);
  }

  @Get(':id/addresses')
  @RequirePermissions('crm.read', 'crm.manage_customers')
  async listAddresses(
    @Request() req: { user: { tenantId: string } },
    @Param('id') id: string,
  ) {
    return this.customerService.listAddresses(req.user.tenantId, id);
  }

  @Post(':id/addresses')
  @RequirePermissions('crm.manage_customers')
  async createAddress(
    @Request() req: { user: { tenantId: string } },
    @Param('id') id: string,
    @Body() data: UpsertCustomerAddressDTO,
  ) {
    return this.customerService.createAddress(req.user.tenantId, id, data);
  }

  @Patch(':id/addresses/:addressId')
  @RequirePermissions('crm.manage_customers')
  async updateAddress(
    @Request() req: { user: { tenantId: string } },
    @Param('id') id: string,
    @Param('addressId') addressId: string,
    @Body() data: UpsertCustomerAddressDTO,
  ) {
    return this.customerService.updateAddress(req.user.tenantId, id, addressId, data);
  }

  @Delete(':id/addresses/:addressId')
  @RequirePermissions('crm.manage_customers')
  async deleteAddress(
    @Request() req: { user: { tenantId: string } },
    @Param('id') id: string,
    @Param('addressId') addressId: string,
  ) {
    await this.customerService.deleteAddress(req.user.tenantId, id, addressId);
    return { success: true };
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
