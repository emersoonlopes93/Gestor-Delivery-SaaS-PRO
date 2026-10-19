import { Body, Controller, Get, Param, Post, Put, UseGuards } from '@nestjs/common';
import { CreateRecipeBaseDTO, UpdateRecipeBaseDTO, UpsertRecipeBaseComponentDTO } from '@gestor/types';
import { CurrentTenant, RequirePermissions } from '../common/decorators';
import { RequiresFeature } from '../common/decorators/requires-feature.decorator';
import { TenantAuthGuard } from '../auth/guards/tenant-auth.guard';
import { PermissionsGuard } from '../rbac/guards/permissions.guard';
import { RecipeBasesService } from './recipe-bases.service';

@Controller('inventory/recipe-bases')
@UseGuards(TenantAuthGuard, PermissionsGuard)
@RequiresFeature('inventory')
export class RecipeBasesController {
  constructor(private readonly service: RecipeBasesService) {}
  @Get() @RequirePermissions('inventory.read') list(@CurrentTenant() tenantId: string) { return this.service.list(tenantId); }
  @Get(':id') @RequirePermissions('inventory.read') detail(@CurrentTenant() tenantId: string, @Param('id') id: string) { return this.service.detail(tenantId, id); }
  @Post() @RequirePermissions('inventory.manage_recipe') create(@CurrentTenant() tenantId: string, @Body() dto: CreateRecipeBaseDTO) { return this.service.create(tenantId, dto); }
  @Put(':id') @RequirePermissions('inventory.manage_recipe') update(@CurrentTenant() tenantId: string, @Param('id') id: string, @Body() dto: UpdateRecipeBaseDTO) { return this.service.update(tenantId, id, dto); }
  @Put(':id/components') @RequirePermissions('inventory.manage_recipe') components(@CurrentTenant() tenantId: string, @Param('id') id: string, @Body() components: UpsertRecipeBaseComponentDTO[]) { return this.service.replaceComponents(tenantId, id, components); }
  @Post(':id/archive') @RequirePermissions('inventory.manage_recipe') archive(@CurrentTenant() tenantId: string, @Param('id') id: string) { return this.service.archive(tenantId, id); }
  @Post(':id/restore') @RequirePermissions('inventory.manage_recipe') restore(@CurrentTenant() tenantId: string, @Param('id') id: string) { return this.service.restore(tenantId, id); }
}
