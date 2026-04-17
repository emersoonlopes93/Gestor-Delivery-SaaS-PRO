import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Put,
  Body,
  Param,
  Request,
  UseGuards,
} from '@nestjs/common';
import { UpsellsService } from './upsells.service';
import { TenantAuthGuard } from '../auth/guards/tenant-auth.guard';
import { PermissionsGuard } from '../rbac/guards/permissions.guard';
import { RequirePermissions } from '../common/decorators';
import { CreateUpsellDto, UpdateUpsellDto } from '@gestor/types';

@Controller('upsells')
@UseGuards(TenantAuthGuard, PermissionsGuard)
export class UpsellsController {
  constructor(private readonly upsellsService: UpsellsService) {}

  @Get()
  @RequirePermissions('catalog.read')
  async list(@Request() req: any) {
    return this.upsellsService.listUpsells(req.user.tenantId);
  }

  @Get(':id')
  @RequirePermissions('catalog.read')
  async getDetail(@Request() req: any, @Param('id') id: string) {
    return this.upsellsService.getUpsellDetail(req.user.tenantId, id);
  }

  @Post()
  @RequirePermissions('catalog.write')
  async create(@Request() req: any, @Body() dto: CreateUpsellDto) {
    return this.upsellsService.createUpsell(req.user.tenantId, dto);
  }

  @Patch(':id')
  @RequirePermissions('catalog.write')
  async update(
    @Request() req: any,
    @Param('id') id: string,
    @Body() dto: UpdateUpsellDto,
  ) {
    return this.upsellsService.updateUpsell(req.user.tenantId, id, dto);
  }

  @Delete(':id')
  @RequirePermissions('catalog.write')
  async delete(@Request() req: any, @Param('id') id: string) {
    return this.upsellsService.deleteUpsell(req.user.tenantId, id);
  }

  @Put(':id/items')
  @RequirePermissions('catalog.write')
  async setItems(
    @Request() req: any,
    @Param('id') id: string,
    @Body() dto: { productIds: string[] },
  ) {
    return this.upsellsService.setUpsellItems(req.user.tenantId, id, dto.productIds);
  }

  @Post(':id/link/:productId')
  @RequirePermissions('catalog.write')
  async link(
    @Request() req: any,
    @Param('id') id: string,
    @Param('productId') productId: string,
  ) {
    return this.upsellsService.linkToProduct(req.user.tenantId, id, productId);
  }

  @Delete(':id/link/:productId')
  @RequirePermissions('catalog.write')
  async unlink(
    @Request() req: any,
    @Param('id') id: string,
    @Param('productId') productId: string,
  ) {
    return this.upsellsService.unlinkFromProduct(req.user.tenantId, id, productId);
  }
}
