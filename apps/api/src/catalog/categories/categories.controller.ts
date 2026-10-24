import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards } from '@nestjs/common';
import { CategoriesService } from './categories.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { TenantAuthGuard } from '../../auth/guards/tenant-auth.guard';
import { RequirePermissions } from '../../common/decorators';
import { PermissionsGuard } from '../../rbac/guards/permissions.guard';
import { BulkSetCategoryActiveDto } from './dto/bulk-set-category-active.dto';

@Controller('catalog/categories')
@UseGuards(TenantAuthGuard, PermissionsGuard)
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  @Post()
  @RequirePermissions('catalog.create')
  create(@Body() createCategoryDto: CreateCategoryDto) {
    return this.categoriesService.create(createCategoryDto);
  }

  @Get()
  @RequirePermissions('catalog.read')
  findAll() {
    return this.categoriesService.findAll();
  }

  @Get('with-product-count')
  @RequirePermissions('catalog.read')
  findAllWithProductCount() {
    return this.categoriesService.findAllWithProductCount();
  }

  @Patch('bulk-active')
  @RequirePermissions('catalog.update')
  bulkSetActive(@Body() dto: BulkSetCategoryActiveDto) {
    return this.categoriesService.bulkSetActive(dto);
  }

  @Get(':id')
  @RequirePermissions('catalog.read')
  findOne(@Param('id') id: string) {
    return this.categoriesService.findOne(id);
  }

  @Get(':id/products')
  @RequirePermissions('catalog.read')
  listProducts(@Param('id') id: string) {
    return this.categoriesService.listProductsByCategory(id);
  }

  @Patch(':id')
  @RequirePermissions('catalog.update')
  update(@Param('id') id: string, @Body() updateCategoryDto: UpdateCategoryDto) {
    return this.categoriesService.update(id, updateCategoryDto);
  }

  @Delete(':id')
  @RequirePermissions('catalog.delete')
  remove(@Param('id') id: string) {
    return this.categoriesService.remove(id);
  }
}
