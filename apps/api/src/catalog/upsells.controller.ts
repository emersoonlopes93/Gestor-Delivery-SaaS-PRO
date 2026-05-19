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
import { AuthenticatedRequest } from '../common/interfaces/request.interface';

@Controller('upsells')
@UseGuards(TenantAuthGuard, PermissionsGuard)
export class UpsellsController {
  constructor(private readonly upsellsService: UpsellsService) {}

  @Get()
  @RequirePermissions('catalog.read')
  async list(@Request() req: AuthenticatedRequest) {
    return this.upsellsService.listUpsells(req.user.tenantId);
  }

  @Get(':id')
  @RequirePermissions('catalog.read')
  async getDetail(@Request() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.upsellsService.getUpsellDetail(req.user.tenantId, id);
  }

  @Post()
  @RequirePermissions('catalog.create')
  async create(@Request() req: AuthenticatedRequest, @Body() dto: CreateUpsellDto) {
    return this.upsellsService.createUpsell(req.user.tenantId, dto);
  }

  @Patch(':id')
  @RequirePermissions('catalog.update')
  async update(
    @Request() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() dto: UpdateUpsellDto,
  ) {
    return this.upsellsService.updateUpsell(req.user.tenantId, id, dto);
  }

  @Delete(':id')
  @RequirePermissions('catalog.delete')
  async delete(@Request() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.upsellsService.deleteUpsell(req.user.tenantId, id);
  }

  @Put(':id/items')
  @RequirePermissions('catalog.update')
  async setItems(
    @Request() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() dto: { productIds: string[] },
  ) {
    return this.upsellsService.setUpsellItems(req.user.tenantId, id, dto.productIds);
  }

  @Post(':id/link/:productId')
  @RequirePermissions('catalog.update')
  async link(
    @Request() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Param('productId') productId: string,
  ) {
    return this.upsellsService.linkToProduct(req.user.tenantId, id, productId);
  }

  @Delete(':id/link/:productId')
  @RequirePermissions('catalog.update')
  async unlink(
    @Request() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Param('productId') productId: string,
  ) {
    return this.upsellsService.unlinkFromProduct(req.user.tenantId, id, productId);
  }
}
