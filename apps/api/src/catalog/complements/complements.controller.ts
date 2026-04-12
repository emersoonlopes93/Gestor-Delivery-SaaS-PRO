import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards } from '@nestjs/common';
import { ComplementsService } from './complements.service';
import { CreateComplementGroupDto } from './dto/create-complement-group.dto';
import { UpdateComplementGroupDto } from './dto/update-complement-group.dto';
import { CreateComplementItemDto } from './dto/create-complement-item.dto';
import { UpdateComplementItemDto } from './dto/update-complement-item.dto';
import { TenantAuthGuard } from '../../auth/guards/tenant-auth.guard';
import { RequirePermissions } from '../../common/decorators';
import { PermissionsGuard } from '../../rbac/guards/permissions.guard';

@Controller('tenant/catalog/complements/groups')
@UseGuards(TenantAuthGuard, PermissionsGuard)
export class ComplementsController {
  constructor(private readonly complementsService: ComplementsService) {}

  @Post()
  @RequirePermissions('catalog.manage_complements')
  create(@Body() createGroupDto: CreateComplementGroupDto) {
    return this.complementsService.createGroup(createGroupDto);
  }

  @Get()
  @RequirePermissions('catalog.read')
  findAll() {
    return this.complementsService.findAllGroups();
  }

  @Get(':id')
  @RequirePermissions('catalog.read')
  findOne(@Param('id') id: string) {
    return this.complementsService.findOneGroup(id);
  }

  @Patch(':id')
  @RequirePermissions('catalog.manage_complements')
  update(@Param('id') id: string, @Body() updateGroupDto: UpdateComplementGroupDto) {
    return this.complementsService.updateGroup(id, updateGroupDto);
  }

  @Delete(':id')
  @RequirePermissions('catalog.manage_complements')
  remove(@Param('id') id: string) {
    return this.complementsService.removeGroup(id);
  }

  // --- Complement Items ---

  @Post('items')
  @RequirePermissions('catalog.manage_complements')
  createItem(@Body() dto: CreateComplementItemDto) {
    return this.complementsService.createItem(dto);
  }

  @Get('items')
  @RequirePermissions('catalog.read')
  findAllItems() {
    return this.complementsService.findAllItems();
  }

  @Get('items/:id')
  @RequirePermissions('catalog.read')
  findOneItem(@Param('id') id: string) {
    return this.complementsService.findOneItem(id);
  }

  @Patch('items/:id')
  @RequirePermissions('catalog.manage_complements')
  updateItem(@Param('id') id: string, @Body() dto: UpdateComplementItemDto) {
    return this.complementsService.updateItem(id, dto);
  }

  @Delete('items/:id')
  @RequirePermissions('catalog.manage_complements')
  removeItem(@Param('id') id: string) {
    return this.complementsService.removeItem(id);
  }
}
