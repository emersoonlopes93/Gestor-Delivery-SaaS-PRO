import { Controller, Get, Post, Put, Body, Param, UseGuards } from '@nestjs/common';
import { CurrentTenant, RequirePermissions } from '../common/decorators';
import { TenantAuthGuard } from '../auth/guards/tenant-auth.guard';
import { PermissionsGuard } from '../rbac/guards/permissions.guard';
import { IngredientsService } from './ingredients.service';
import { CreateIngredientDTO, UpdateIngredientDTO, IngredientDTO } from '@gestor/types';

@Controller('inventory/ingredients')
@UseGuards(TenantAuthGuard, PermissionsGuard)
export class IngredientsController {
  constructor(private readonly ingredientsService: IngredientsService) {}

  @Get()
  @RequirePermissions('inventory.read')
  async findAll(@CurrentTenant() tenantId: string): Promise<IngredientDTO[]> {
    return this.ingredientsService.findAll(tenantId);
  }

  @Get('summary')
  @RequirePermissions('inventory.read')
  async getSummary(@CurrentTenant() tenantId: string) {
    return this.ingredientsService.getSummary(tenantId);
  }

  @Get(':id')
  @RequirePermissions('inventory.read')
  async findOne(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string
  ): Promise<IngredientDTO> {
    return this.ingredientsService.findOne(tenantId, id);
  }

  @Post()
  @RequirePermissions('inventory.create')
  async create(
    @CurrentTenant() tenantId: string,
    @Body() dto: CreateIngredientDTO
  ): Promise<IngredientDTO> {
    return this.ingredientsService.create(tenantId, dto);
  }

  @Put(':id')
  @RequirePermissions('inventory.update')
  async update(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
    @Body() dto: UpdateIngredientDTO
  ): Promise<IngredientDTO> {
    return this.ingredientsService.update(tenantId, id, dto);
  }
}
