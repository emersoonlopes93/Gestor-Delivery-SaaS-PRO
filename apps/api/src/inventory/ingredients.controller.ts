import { Controller, Get, Post, Put, Body, Param, UseGuards } from '@nestjs/common';
import { IngredientsService } from './ingredients.service';
import { CreateIngredientDTO, UpdateIngredientDTO, IngredientDTO } from '@gestor/types';
import { TenantId } from '../common/decorators/tenant-id.decorator';
import { Roles } from '../rbac/decorators/roles.decorator';
import { PermissionGate } from '../rbac/guards/permission-gate.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('inventory/ingredients')
@UseGuards(JwtAuthGuard, PermissionGate)
export class IngredientsController {
  constructor(private readonly ingredientsService: IngredientsService) {}

  @Get()
  @Roles('inventory.read')
  async findAll(@TenantId() tenantId: string): Promise<IngredientDTO[]> {
    return this.ingredientsService.findAll(tenantId);
  }

  @Get(':id')
  @Roles('inventory.read')
  async findOne(
    @TenantId() tenantId: string,
    @Param('id') id: string
  ): Promise<IngredientDTO> {
    return this.ingredientsService.findOne(tenantId, id);
  }

  @Post()
  @Roles('inventory.create')
  async create(
    @TenantId() tenantId: string,
    @Body() dto: CreateIngredientDTO
  ): Promise<IngredientDTO> {
    return this.ingredientsService.create(tenantId, dto);
  }

  @Put(':id')
  @Roles('inventory.update')
  async update(
    @TenantId() tenantId: string,
    @Param('id') id: string,
    @Body() dto: UpdateIngredientDTO
  ): Promise<IngredientDTO> {
    return this.ingredientsService.update(tenantId, id, dto);
  }
}
