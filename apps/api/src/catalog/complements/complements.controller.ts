import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards, Request } from '@nestjs/common';
import { ComplementsService } from './complements.service';
import { CreateComplementGroupDto } from './dto/create-complement-group.dto';
import { UpdateComplementGroupDto } from './dto/update-complement-group.dto';
import { CreateComplementItemDto } from './dto/create-complement-item.dto';
import { UpdateComplementItemDto } from './dto/update-complement-item.dto';
import { TenantAuthGuard } from '../../auth/guards/tenant-auth.guard';
import { RequirePermissions } from '../../common/decorators';
import { PermissionsGuard } from '../../rbac/guards/permissions.guard';

interface TenantRequest {
  user: {
    tenantId: string;
    id: string;
    permissions?: string[];
  };
}

@Controller('catalog/complements/groups')
@UseGuards(TenantAuthGuard, PermissionsGuard)
export class ComplementsController {
  constructor(private readonly complementsService: ComplementsService) {}

  @Post()
  @RequirePermissions('catalog.manage_complements')
  create(@Request() req: TenantRequest, @Body() createGroupDto: CreateComplementGroupDto) {
    return this.complementsService.createGroup(req.user.tenantId, createGroupDto);
  }

  @Get()
  @RequirePermissions('catalog.read')
  findAll(@Request() req: TenantRequest) {
    return this.complementsService.findAllGroups(req.user.tenantId);
  }

  @Get(':id')
  @RequirePermissions('catalog.read')
  findOne(@Request() req: TenantRequest, @Param('id') id: string) {
    return this.complementsService.findOneGroup(req.user.tenantId, id);
  }

  @Patch(':id')
  @RequirePermissions('catalog.manage_complements')
  update(@Request() req: TenantRequest, @Param('id') id: string, @Body() updateGroupDto: UpdateComplementGroupDto) {
    return this.complementsService.updateGroup(req.user.tenantId, id, updateGroupDto);
  }

  @Delete(':id')
  @RequirePermissions('catalog.manage_complements')
  remove(@Request() req: TenantRequest, @Param('id') id: string) {
    return this.complementsService.removeGroup(req.user.tenantId, id);
  }

  // --- Complement Items ---

  @Post('items')
  @RequirePermissions('catalog.manage_complements')
  createItem(@Request() req: TenantRequest, @Body() dto: CreateComplementItemDto) {
    return this.complementsService.createItem(req.user.tenantId, dto);
  }

  @Get('items')
  @RequirePermissions('catalog.read')
  findAllItems(@Request() req: TenantRequest) {
    return this.complementsService.findAllItems(req.user.tenantId);
  }

  
  @Get('items/:id')
  @RequirePermissions('catalog.read')
  findOneItem(@Request() req: TenantRequest, @Param('id') id: string) {
    return this.complementsService.findOneItem(req.user.tenantId, id);
  }

  @Patch('items/:id')
  @RequirePermissions('catalog.manage_complements')
  updateItem(@Request() req: TenantRequest, @Param('id') id: string, @Body() dto: UpdateComplementItemDto) {
    return this.complementsService.updateItem(req.user.tenantId, id, dto);
  }

  @Delete('items/:id')
  @RequirePermissions('catalog.manage_complements')
  removeItem(@Request() req: TenantRequest, @Param('id') id: string) {
    return this.complementsService.removeItem(req.user.tenantId, id);
  }
}
