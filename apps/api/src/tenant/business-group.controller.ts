import { Controller, Get, Post, Patch, Body, Param, UseGuards } from '@nestjs/common';
import { BusinessGroupService } from './business-group.service';
import { AdminAuthGuard } from '../admin/auth/admin-auth.guard';
import { ApiTags, ApiOperation } from '@nestjs/swagger';

@ApiTags('Business Groups')
@Controller('admin/business-groups')
@UseGuards(AdminAuthGuard)
export class BusinessGroupController {
  constructor(private readonly businessGroupService: BusinessGroupService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new business group (multi-unit)' })
  async create(@Body() body: { name: string; ownerId?: string }) {
    return this.businessGroupService.create(body);
  }

  @Get()
  @ApiOperation({ summary: 'List all business groups' })
  async listAll() {
    return this.businessGroupService.listAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get business group details' })
  async findById(@Param('id') id: string) {
    return this.businessGroupService.findById(id);
  }

  @Patch(':id/add-tenant/:tenantId')
  @ApiOperation({ summary: 'Add a tenant to a business group' })
  async addTenant(
    @Param('id') id: string,
    @Param('tenantId') tenantId: string,
  ) {
    return this.businessGroupService.addTenant(id, tenantId);
  }
}
