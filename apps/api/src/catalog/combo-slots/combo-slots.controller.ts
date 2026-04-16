import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { TenantAuthGuard } from '../../auth/guards/tenant-auth.guard';
import { RequirePermissions } from '../../common/decorators';
import { PermissionsGuard } from '../../rbac/guards/permissions.guard';
import { ComboSlotsService } from './combo-slots.service';
import { CreateComboSlotDto } from './dto/create-combo-slot.dto';
import { UpdateComboSlotDto } from './dto/update-combo-slot.dto';
import { ReorderComboSlotsDto } from './dto/reorder-combo-slots.dto';
import { CreateComboSlotAllowedItemDto } from './dto/create-combo-slot-allowed-item.dto';
import { UpdateComboSlotAllowedItemDto } from './dto/update-combo-slot-allowed-item.dto';
import { ReorderComboSlotAllowedItemsDto } from './dto/reorder-combo-slot-allowed-items.dto';

@Controller('catalog/products/:comboProductId/combo-slots')
@UseGuards(TenantAuthGuard, PermissionsGuard)
export class ComboSlotsController {
  constructor(private readonly service: ComboSlotsService) {}

  @Get()
  @RequirePermissions('catalog.read')
  list(@Param('comboProductId') comboProductId: string) {
    return this.service.listSlotsByComboProduct(comboProductId);
  }

  @Post()
  @RequirePermissions('catalog.manage_combos')
  create(@Param('comboProductId') comboProductId: string, @Body() dto: Omit<CreateComboSlotDto, 'comboProductId'>) {
    return this.service.createSlot({ ...dto, comboProductId });
  }

  @Patch(':slotId')
  @RequirePermissions('catalog.manage_combos')
  update(@Param('slotId') slotId: string, @Body() dto: UpdateComboSlotDto) {
    return this.service.updateSlot(slotId, dto);
  }

  @Delete(':slotId')
  @RequirePermissions('catalog.manage_combos')
  delete(@Param('slotId') slotId: string) {
    return this.service.deleteSlot(slotId);
  }

  @Post('reorder')
  @RequirePermissions('catalog.manage_combos')
  reorder(@Param('comboProductId') comboProductId: string, @Body() dto: ReorderComboSlotsDto) {
    return this.service.reorderSlots(comboProductId, dto.orderedSlotIds);
  }

  @Post(':slotId/allowed-items')
  @RequirePermissions('catalog.manage_combos')
  addAllowedItem(@Param('slotId') comboSlotId: string, @Body() dto: Omit<CreateComboSlotAllowedItemDto, 'comboSlotId'>) {
    return this.service.addAllowedItem({ ...dto, comboSlotId });
  }

  @Patch(':slotId/allowed-items/:id')
  @RequirePermissions('catalog.manage_combos')
  updateAllowedItem(@Param('id') id: string, @Body() dto: UpdateComboSlotAllowedItemDto) {
    return this.service.updateAllowedItem(id, dto);
  }

  @Delete(':slotId/allowed-items/:id')
  @RequirePermissions('catalog.manage_combos')
  deleteAllowedItem(@Param('id') id: string) {
    return this.service.deleteAllowedItem(id);
  }

  @Post(':slotId/allowed-items/reorder')
  @RequirePermissions('catalog.manage_combos')
  reorderAllowedItems(@Param('slotId') comboSlotId: string, @Body() dto: ReorderComboSlotAllowedItemsDto) {
    return this.service.reorderAllowedItems(comboSlotId, dto.orderedAllowedItemIds);
  }
}
