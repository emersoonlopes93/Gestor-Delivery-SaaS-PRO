import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards } from '@nestjs/common';
import { GoalsService } from './goals.service';
import { TenantAuthGuard } from '../auth/guards/tenant-auth.guard';
import { PermissionsGuard } from '../rbac/guards/permissions.guard';
import { RequirePermissions, CurrentTenant } from '../common/decorators';
import { CreateGoalDTO, UpdateGoalDTO, GoalDTO } from '@gestor/types';

@Controller('goals')
@UseGuards(TenantAuthGuard, PermissionsGuard)
export class GoalsController {
  constructor(private readonly goalsService: GoalsService) {}

  @Post()
  @RequirePermissions('goals.create')
  async create(@CurrentTenant() tenantId: string, @Body() createGoalDto: CreateGoalDTO): Promise<GoalDTO> {
    return this.goalsService.create(tenantId, createGoalDto);
  }

  @Get()
  @RequirePermissions('goals.read')
  async findAll(@CurrentTenant() tenantId: string): Promise<GoalDTO[]> {
    return this.goalsService.findAll(tenantId);
  }

  @Get(':id')
  @RequirePermissions('goals.read')
  async findOne(@CurrentTenant() tenantId: string, @Param('id') id: string): Promise<GoalDTO> {
    return this.goalsService.findOne(tenantId, id);
  }

  @Patch(':id')
  @RequirePermissions('goals.update')
  async update(
    @CurrentTenant() tenantId: string, 
    @Param('id') id: string, 
    @Body() updateGoalDto: UpdateGoalDTO
  ): Promise<GoalDTO> {
    return this.goalsService.update(tenantId, id, updateGoalDto);
  }

  @Delete(':id')
  @RequirePermissions('goals.delete')
  async remove(@CurrentTenant() tenantId: string, @Param('id') id: string): Promise<void> {
    return this.goalsService.remove(tenantId, id);
  }
}
