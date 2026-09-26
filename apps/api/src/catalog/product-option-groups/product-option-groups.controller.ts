import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { TenantAuthGuard } from '../../auth/guards/tenant-auth.guard';
import { CurrentUser, RequirePermissions } from '../../common/decorators';
import { PermissionsGuard } from '../../rbac/guards/permissions.guard';
import { ProductOptionGroupsService } from './product-option-groups.service';
import { CreateProductOptionGroupLinkDto } from './dto/create-product-option-group-link.dto';
import { UpdateProductOptionGroupLinkDto } from './dto/update-product-option-group-link.dto';
import { ReorderProductOptionGroupLinksDto } from './dto/reorder-product-option-group-links.dto';
import { UpdateProductOptionItemOverrideDto } from './dto/update-product-option-item-override.dto';

@Controller('catalog/products/:productId/option-groups')
@UseGuards(TenantAuthGuard, PermissionsGuard)
export class ProductOptionGroupsController {
  constructor(private readonly service: ProductOptionGroupsService) {}

  @Get()
  @RequirePermissions('catalog.read')
  list(@Param('productId') productId: string) {
    return this.service.listByProduct(productId);
  }

  @Post()
  @RequirePermissions('catalog.manage_products')
  link(@Param('productId') productId: string, @Body() dto: Omit<CreateProductOptionGroupLinkDto, 'productId'>, @CurrentUser('sub') actorId: string) {
    return this.service.link({ ...dto, productId }, actorId);
  }

  @Patch('items/:optionItemId/override')
  @RequirePermissions('catalog.manage_products')
  upsertItemOverride(
    @Param('productId') productId: string,
    @Param('optionItemId') optionItemId: string,
    @Body() dto: UpdateProductOptionItemOverrideDto,
    @CurrentUser('sub') actorId: string,
  ) {
    return this.service.upsertItemOverride(productId, optionItemId, dto, actorId);
  }

  @Patch(':linkId')
  @RequirePermissions('catalog.manage_products')
  update(@Param('linkId') linkId: string, @Body() dto: UpdateProductOptionGroupLinkDto, @CurrentUser('sub') actorId: string) {
    return this.service.update(linkId, dto, actorId);
  }

  @Delete(':linkId')
  @RequirePermissions('catalog.manage_products')
  unlink(@Param('linkId') linkId: string, @CurrentUser('sub') actorId: string) {
    return this.service.unlink(linkId, actorId);
  }

  @Post('reorder')
  @RequirePermissions('catalog.manage_products')
  reorder(@Param('productId') productId: string, @Body() dto: ReorderProductOptionGroupLinksDto, @CurrentUser('sub') actorId: string) {
    return this.service.reorderLinks(productId, dto.orderedLinkIds, actorId);
  }
}
