import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
} from '@nestjs/common';
import { TenantUserService } from './tenant-user.service';
import { TenantAuthGuard } from '../auth/guards/tenant-auth.guard';
import { CurrentTenant, CurrentUser, RequirePermissions } from '../common/decorators';
import { PermissionsGuard } from '../rbac/guards/permissions.guard';
import { CreateTenantUserDto } from './dto/create-tenant-user.dto';
import { UpdateTenantUserDto } from './dto/update-tenant-user.dto';

@Controller('tenant/users')
@UseGuards(TenantAuthGuard, PermissionsGuard)
export class TenantUserController {
  constructor(private readonly tenantUserService: TenantUserService) {}

  @Get()
  @RequirePermissions('users.read')
  async findAll(@CurrentTenant() tenantId: string) {
    return this.tenantUserService.findAll(tenantId);
  }

  @Get('roles')
  @RequirePermissions('users.read')
  async getRoles(@CurrentTenant() tenantId: string) {
    return this.tenantUserService.getAvailableRoles(tenantId);
  }

  @Get(':id')
  @RequirePermissions('users.read')
  async findOne(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    return this.tenantUserService.findById(tenantId, id);
  }

  @Post()
  @RequirePermissions('users.create', 'users.roles')
  async create(
    @CurrentTenant() tenantId: string,
    @CurrentUser('sub') actorUserId: string,
    @Body() dto: CreateTenantUserDto,
  ) {
    return this.tenantUserService.createWithActor(tenantId, dto, actorUserId);
  }

  @Patch(':id')
  @RequirePermissions('users.update', 'users.roles')
  async update(
    @CurrentTenant() tenantId: string,
    @CurrentUser('sub') actorUserId: string,
    @Param('id') id: string,
    @Body() dto: UpdateTenantUserDto,
  ) {
    return this.tenantUserService.updateWithActor(tenantId, id, dto, actorUserId);
  }

  @Delete(':id')
  @RequirePermissions('users.delete')
  async remove(
    @CurrentTenant() tenantId: string,
    @CurrentUser('sub') actorUserId: string,
    @Param('id') id: string,
  ) {
    return this.tenantUserService.deleteWithActor(tenantId, id, actorUserId);
  }
}
