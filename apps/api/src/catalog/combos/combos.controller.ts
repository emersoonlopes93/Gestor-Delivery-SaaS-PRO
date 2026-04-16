import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards } from '@nestjs/common';
import { CombosService } from './combos.service';
import { CreateComboBlockDto, CreateComboBlockItemDto, CreateComboDto } from './dto/create-combo.dto';
import { UpdateComboBlockDto, UpdateComboBlockItemDto, UpdateComboDto } from './dto/update-combo.dto';
import { TenantAuthGuard } from '../../auth/guards/tenant-auth.guard';
import { RequirePermissions } from '../../common/decorators';
import { PermissionsGuard } from '../../rbac/guards/permissions.guard';

/**
 * @deprecated Este controlador faz parte do sistema legado de combos.
 * Favor utilizar ComboSlots e o fluxo de Catálogo V2.
 */
@Controller('catalog/combos')
@UseGuards(TenantAuthGuard, PermissionsGuard)
export class CombosController {
  constructor(private readonly combosService: CombosService) {
    console.warn('[LEGACY] CombosController is deprecated and will be removed in future versions.');
  }

  @Post()
  @RequirePermissions('catalog.manage_combos')
  create(@Body() createComboDto: CreateComboDto) {
    return this.combosService.create(createComboDto);
  }

  @Get()
  @RequirePermissions('catalog.read')
  findAll() {
    return this.combosService.findAll();
  }

  @Get(':id')
  @RequirePermissions('catalog.read')
  findOne(@Param('id') id: string) {
    return this.combosService.findOne(id);
  }

  @Patch(':id')
  @RequirePermissions('catalog.manage_combos')
  update(@Param('id') id: string, @Body() updateComboDto: UpdateComboDto) {
    return this.combosService.update(id, updateComboDto);
  }

  @Delete(':id')
  @RequirePermissions('catalog.manage_combos')
  remove(@Param('id') id: string) {
    return this.combosService.remove(id);
  }

  @Post(':id/blocks')
  @RequirePermissions('catalog.manage_combos')
  createBlock(@Param('id') comboId: string, @Body() dto: Omit<CreateComboBlockDto, 'comboId'>) {
    return this.combosService.createBlock({ ...dto, comboId });
  }

  @Get(':id/blocks')
  @RequirePermissions('catalog.read')
  listBlocks(@Param('id') comboId: string) {
    return this.combosService.listBlocks(comboId);
  }

  @Patch(':id/blocks/:blockId')
  @RequirePermissions('catalog.manage_combos')
  updateBlock(
    @Param('id') comboId: string,
    @Param('blockId') blockId: string,
    @Body() dto: UpdateComboBlockDto,
  ) {
    return this.combosService.updateBlock(comboId, blockId, dto);
  }

  @Delete(':id/blocks/:blockId')
  @RequirePermissions('catalog.manage_combos')
  removeBlock(@Param('id') comboId: string, @Param('blockId') blockId: string) {
    return this.combosService.removeBlock(comboId, blockId);
  }

  @Post(':id/blocks/:blockId/items')
  @RequirePermissions('catalog.manage_combos')
  createBlockItem(
    @Param('id') comboId: string,
    @Param('blockId') blockId: string,
    @Body() dto: Omit<CreateComboBlockItemDto, 'blockId'>,
  ) {
    return this.combosService.createBlockItem(comboId, { ...dto, blockId });
  }

  @Get(':id/blocks/:blockId/items')
  @RequirePermissions('catalog.read')
  listBlockItems(@Param('id') comboId: string, @Param('blockId') blockId: string) {
    return this.combosService.listBlockItems(comboId, blockId);
  }

  @Patch(':id/blocks/:blockId/items/:itemId')
  @RequirePermissions('catalog.manage_combos')
  updateBlockItem(
    @Param('id') comboId: string,
    @Param('blockId') blockId: string,
    @Param('itemId') itemId: string,
    @Body() dto: UpdateComboBlockItemDto,
  ) {
    return this.combosService.updateBlockItem(comboId, blockId, itemId, dto);
  }

  @Delete(':id/blocks/:blockId/items/:itemId')
  @RequirePermissions('catalog.manage_combos')
  removeBlockItem(
    @Param('id') comboId: string,
    @Param('blockId') blockId: string,
    @Param('itemId') itemId: string,
  ) {
    return this.combosService.removeBlockItem(comboId, blockId, itemId);
  }
}
