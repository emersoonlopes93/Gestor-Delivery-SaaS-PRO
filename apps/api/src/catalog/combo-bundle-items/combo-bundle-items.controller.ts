import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { TenantAuthGuard } from '../../auth/guards/tenant-auth.guard';
import { PermissionsGuard } from '../../rbac/guards/permissions.guard';
import { RequirePermissions } from '../../common/decorators';
import { ComboBundleItemsService } from './combo-bundle-items.service';
import { CreateComboBundleItemDto } from './dto/create-combo-bundle-item.dto';
import { UpdateComboBundleItemDto } from './dto/update-combo-bundle-item.dto';
import { ReorderComboBundleItemsDto } from './dto/reorder-combo-bundle-items.dto';

@Controller('catalog/products/:comboProductId/bundle-items')
@UseGuards(TenantAuthGuard, PermissionsGuard)
export class ComboBundleItemsController {
  constructor(private readonly service: ComboBundleItemsService) {}

  @Get()
  @RequirePermissions('catalog.read')
  list(@Param('comboProductId') comboProductId: string) {
    return this.service.list(comboProductId);
  }

  @Post()
  @RequirePermissions('catalog.manage_combos')
  create(@Param('comboProductId') comboProductId: string, @Body() dto: CreateComboBundleItemDto) {
    return this.service.create(comboProductId, dto);
  }

  @Patch(':id')
  @RequirePermissions('catalog.manage_combos')
  update(
    @Param('comboProductId') comboProductId: string,
    @Param('id') id: string,
    @Body() dto: UpdateComboBundleItemDto,
  ) {
    return this.service.update(comboProductId, id, dto);
  }

  @Delete(':id')
  @RequirePermissions('catalog.manage_combos')
  remove(@Param('comboProductId') comboProductId: string, @Param('id') id: string) {
    return this.service.remove(comboProductId, id);
  }

  @Post('reorder')
  @RequirePermissions('catalog.manage_combos')
  reorder(@Param('comboProductId') comboProductId: string, @Body() dto: ReorderComboBundleItemsDto) {
    return this.service.reorder(comboProductId, dto.orderedItemIds);
  }

  @Get('summary')
  @RequirePermissions('catalog.read')
  summary(@Param('comboProductId') comboProductId: string) {
    return this.service.pricingSummary(comboProductId);
  }
}

