import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Request,
  UseGuards,
} from '@nestjs/common';
import { IsEnum, IsString, IsNumber, IsOptional, IsBoolean } from 'class-validator';
import { DeliveryRateService } from './delivery-rate.service';
import { TenantAuthGuard } from '../auth/guards/tenant-auth.guard';
import { PermissionsGuard } from '../rbac/guards/permissions.guard';
import { Public, RequirePermissions } from '../common/decorators';
import type { Request as ExpressRequest } from 'express';
import type { DeliveryAddressDTO, TenantJwtPayload } from '@gestor/types';

class CreateDeliveryRateRuleDto {
  @IsEnum(['neighborhood', 'distance', 'fixed'])
  type!: 'neighborhood' | 'distance' | 'fixed';

  @IsOptional()
  @IsString()
  neighborhood?: string;

  @IsOptional()
  @IsNumber()
  rate?: number;

  @IsOptional()
  @IsNumber()
  minKm?: number;

  @IsOptional()
  @IsNumber()
  maxKm?: number;

  @IsOptional()
  @IsNumber()
  ratePerKm?: number;

  @IsOptional()
  @IsNumber()
  fixedRate?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

@Controller('delivery/rates')
@UseGuards(TenantAuthGuard, PermissionsGuard)
export class DeliveryRateController {
  constructor(private readonly deliveryRateService: DeliveryRateService) {}

  private getTenantIdFromRequest(req: ExpressRequest & { user: TenantJwtPayload }): string {
    return req.user.tenantId;
  }

  @Get()
  @RequirePermissions('delivery.read')
  async list(@Request() req: ExpressRequest & { user: TenantJwtPayload }) {
    const tenantId = this.getTenantIdFromRequest(req);
    return this.deliveryRateService.listRules(tenantId);
  }

  @Post()
  @RequirePermissions('delivery.manage')
  async create(
    @Request() req: ExpressRequest & { user: TenantJwtPayload },
    @Body() dto: CreateDeliveryRateRuleDto,
  ) {
    const tenantId = this.getTenantIdFromRequest(req);
    return this.deliveryRateService.upsertRule(tenantId, dto);
  }

  @Put(':id')
  @RequirePermissions('delivery.manage')
  async update(
    @Request() req: ExpressRequest & { user: TenantJwtPayload },
    @Param('id') id: string,
    @Body() dto: CreateDeliveryRateRuleDto,
  ) {
    const tenantId = this.getTenantIdFromRequest(req);
    return this.deliveryRateService.upsertRule(tenantId, { ...dto, id });
  }

  @Delete(':id')
  @RequirePermissions('delivery.manage')
  async delete(@Request() req: ExpressRequest & { user: TenantJwtPayload }, @Param('id') id: string) {
    const tenantId = this.getTenantIdFromRequest(req);
    return this.deliveryRateService.deleteRule(tenantId, id);
  }

  // Endpoint público para cálculo (usado no checkout)
  @Post('calculate')
  @Public()
  async calculate(
    @Body() body: { tenantId: string; address?: DeliveryAddressDTO | null },
  ) {
    // Este endpoint será público mas validado por tenantId
    // Futuramente podemos adicionar chave de API ou validar por slug
    return this.deliveryRateService.calculateDeliveryFee(
      body.tenantId,
      body.address,
    );
  }
}
