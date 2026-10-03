import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { TenantAuthGuard } from '../../auth/guards/tenant-auth.guard';
import { CurrentUser, RequirePermissions } from '../../common/decorators';
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
  createGroup(@Body() dto: CreateOptionGroupDto, @CurrentUser('sub') actorId: string) {
    return this.service.createGroup(dto, actorId);
  }

  @Get()
  @RequirePermissions('catalog.read')
  listGroups(@Query('includeArchived') includeArchived?: string) {
    return this.service.listGroups(includeArchived === 'true');
  }

  @Get(':id')
  @RequirePermissions('catalog.read')
  getGroup(@Param('id') id: string, @Query('includeArchived') includeArchived?: string) {
    return this.service.getGroup(id, includeArchived === 'true');
  }

  @Patch(':id')
  @RequirePermissions('catalog.manage_option_groups')
  updateGroup(@Param('id') id: string, @Body() dto: UpdateOptionGroupDto, @CurrentUser('sub') actorId: string) {
    return this.service.updateGroup(id, dto, actorId);
  }

  @Delete(':id')
  @RequirePermissions('catalog.manage_option_groups')
  deleteGroup(@Param('id') id: string, @CurrentUser('sub') actorId: string) {
    return this.service.deleteGroup(id, actorId);
  }

  @Patch(':id/archive')
  @RequirePermissions('catalog.manage_option_groups')
  archiveGroup(@Param('id') id: string, @CurrentUser('sub') actorId: string) {
    return this.service.archiveGroup(id, actorId);
  }

  @Patch(':id/restore')
  @RequirePermissions('catalog.manage_option_groups')
  restoreGroup(@Param('id') id: string, @CurrentUser('sub') actorId: string) {
    return this.service.restoreGroup(id, actorId);
  }

  @Post('items')
  @RequirePermissions('catalog.manage_option_groups')
  createItem(@Body() dto: CreateOptionItemDto, @CurrentUser('sub') actorId: string) {
    return this.service.createItem(dto, actorId);
  }

  @Post(':id/items')
  @RequirePermissions('catalog.manage_option_groups')
  createItemWithId(@Param('id') id: string, @Body() dto: CreateOptionItemDto, @CurrentUser('sub') actorId: string) {
    dto.optionGroupId = id;
    return this.service.createItem(dto, actorId);
  }


  @Patch('items/:id')
  @RequirePermissions('catalog.manage_option_groups')
  updateItem(@Param('id') id: string, @Body() dto: UpdateOptionItemDto, @CurrentUser('sub') actorId: string) {
    return this.service.updateItem(id, dto, actorId);
  }

  @Delete('items/:id')
  @RequirePermissions('catalog.manage_option_groups')
  deleteItem(@Param('id') id: string, @CurrentUser('sub') actorId: string) {
    return this.service.deleteItem(id, actorId);
  }

  @Patch('items/:id/archive')
  @RequirePermissions('catalog.manage_option_groups')
  archiveItem(@Param('id') id: string, @CurrentUser('sub') actorId: string) {
    return this.service.archiveItem(id, actorId);
  }

  @Patch('items/:id/restore')
  @RequirePermissions('catalog.manage_option_groups')
  restoreItem(@Param('id') id: string, @CurrentUser('sub') actorId: string) {
    return this.service.restoreItem(id, actorId);
  }

  @Post(':id/items/reorder')
  @RequirePermissions('catalog.manage_option_groups')
  reorderItems(@Param('id') optionGroupId: string, @Body() dto: ReorderOptionItemsDto) {
    return this.service.reorderItems(optionGroupId, dto.orderedItemIds);
  }
}
