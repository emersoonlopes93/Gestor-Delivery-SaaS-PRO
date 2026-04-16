import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { TenantAuthGuard } from '../../auth/guards/tenant-auth.guard';
import { RequirePermissions } from '../../common/decorators';
import { PermissionsGuard } from '../../rbac/guards/permissions.guard';
import { OptionGroupsService } from './option-groups.service';
import { CreateOptionGroupDto } from './dto/create-option-group.dto';
import { UpdateOptionGroupDto } from './dto/update-option-group.dto';
import { CreateOptionItemDto } from './dto/create-option-item.dto';
import { UpdateOptionItemDto } from './dto/update-option-item.dto';
import { ReorderOptionItemsDto } from './dto/reorder-option-items.dto';

@Controller('catalog/option-groups')
@UseGuards(TenantAuthGuard, PermissionsGuard)
export class OptionGroupsController {
  constructor(private readonly service: OptionGroupsService) {}

  @Post()
  @RequirePermissions('catalog.manage_option_groups')
  createGroup(@Body() dto: CreateOptionGroupDto) {
    return this.service.createGroup(dto);
  }

  @Get()
  @RequirePermissions('catalog.read')
  listGroups() {
    return this.service.listGroups();
  }

  @Get(':id')
  @RequirePermissions('catalog.read')
  getGroup(@Param('id') id: string) {
    return this.service.getGroup(id);
  }

  @Patch(':id')
  @RequirePermissions('catalog.manage_option_groups')
  updateGroup(@Param('id') id: string, @Body() dto: UpdateOptionGroupDto) {
    return this.service.updateGroup(id, dto);
  }

  @Delete(':id')
  @RequirePermissions('catalog.manage_option_groups')
  deleteGroup(@Param('id') id: string) {
    return this.service.deleteGroup(id);
  }

  @Post('items')
  @RequirePermissions('catalog.manage_option_groups')
  createItem(@Body() dto: CreateOptionItemDto) {
    return this.service.createItem(dto);
  }

  @Patch('items/:id')
  @RequirePermissions('catalog.manage_option_groups')
  updateItem(@Param('id') id: string, @Body() dto: UpdateOptionItemDto) {
    return this.service.updateItem(id, dto);
  }

  @Delete('items/:id')
  @RequirePermissions('catalog.manage_option_groups')
  deleteItem(@Param('id') id: string) {
    return this.service.deleteItem(id);
  }

  @Post(':id/items/reorder')
  @RequirePermissions('catalog.manage_option_groups')
  reorderItems(@Param('id') optionGroupId: string, @Body() dto: ReorderOptionItemsDto) {
    return this.service.reorderItems(optionGroupId, dto.orderedItemIds);
  }
}
