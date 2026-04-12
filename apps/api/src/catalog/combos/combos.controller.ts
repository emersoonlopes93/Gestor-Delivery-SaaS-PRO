import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards } from '@nestjs/common';
import { CombosService } from './combos.service';
import { CreateComboDto } from './dto/create-combo.dto';
import { UpdateComboDto } from './dto/update-combo.dto';
import { TenantAuthGuard } from '../../auth/guards/tenant-auth.guard';
import { RequirePermissions } from '../../common/decorators';
import { PermissionsGuard } from '../../rbac/guards/permissions.guard';

@Controller('catalog/combos')
@UseGuards(TenantAuthGuard, PermissionsGuard)
export class CombosController {
  constructor(private readonly combosService: CombosService) {}

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
}
