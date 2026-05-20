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
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { IsEnum, IsString, IsNumber, IsOptional, IsBoolean, IsObject, IsArray } from 'class-validator';
import { DeliveryRateService } from './delivery-rate.service';
import { TenantAuthGuard } from '../auth/guards/tenant-auth.guard';
import { PermissionsGuard } from '../rbac/guards/permissions.guard';
import { Public, RequirePermissions } from '../common/decorators';
import type { Request as ExpressRequest } from 'express';
import type { DeliveryAddressDTO, TenantJwtPayload } from '@gestor/types';
import type { Prisma } from '@prisma/client';

class CreateDeliveryRateRuleDto {
  @IsEnum(['neighborhood', 'distance', 'fixed', 'polygon'])
  type!: 'neighborhood' | 'distance' | 'fixed' | 'polygon';

  // Campos evoluídos para zonas (engine híbrida)
  // Mantemos opcionais para preservar compatibilidade.
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  color?: string;

  @IsOptional()
  @IsEnum(['blocked_zone', 'custom_zone'])
  zoneKind?: 'blocked_zone' | 'custom_zone';

  @IsOptional()
  @IsEnum(['fixed', 'distance', 'free', 'tiers'])
  pricingMode?: 'fixed' | 'distance' | 'free' | 'tiers';

  @IsOptional()
  @IsArray()
  distanceTiers?: any[];

  @IsOptional()
  @IsBoolean()
  blocksDelivery?: boolean;

  @IsOptional()
  @IsNumber()
  fixedFee?: number;

  @IsOptional()
  @IsNumber()
  pricePerKm?: number;

  @IsOptional()
  @IsNumber()
  priority?: number;

  @IsOptional()
  @IsBoolean()
  isFallback?: boolean;

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
  minDistanceKm?: number;

  @IsOptional()
  @IsNumber()
  maxDistanceKm?: number;

  @IsOptional()
  @IsNumber()
  ratePerKm?: number;

  @IsOptional()
  @IsNumber()
  fixedRate?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsObject()
  geoJson?: Record<string, unknown>;

  @IsOptional()
  @IsArray()
  polygonCoordinates?: unknown[];
}

@Controller('delivery/rates')
@UseGuards(TenantAuthGuard, PermissionsGuard)
export class DeliveryRateController {
  constructor(private readonly deliveryRateService: DeliveryRateService) {}

  private toInputJsonValue(value: unknown): Prisma.InputJsonValue | undefined {
    const isPrimitive =
      typeof value === 'string' ||
      typeof value === 'number' ||
      typeof value === 'boolean';
    if (value === null) return undefined;
    if (isPrimitive) return value;

    if (Array.isArray(value)) {
      const mapped: Prisma.InputJsonValue[] = [];
      for (const item of value) {
        const conv = this.toInputJsonValue(item);
        if (conv === undefined) return undefined;
        mapped.push(conv);
      }
      return mapped;
    }

    if (typeof value === 'object' && value !== null) {
      const out: Record<string, Prisma.InputJsonValue> = {};
      for (const [k, v] of Object.entries(value)) {
        const conv = this.toInputJsonValue(v);
        if (conv === undefined) return undefined;
        out[k] = conv;
      }
      return out;
    }

    return undefined;
  }

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
    return this.deliveryRateService.upsertRule(tenantId, {
      ...dto,
      geoJson: this.toInputJsonValue(dto.geoJson),
      polygonCoordinates: this.toInputJsonValue(dto.polygonCoordinates),
    });
  }

  @Put(':id')
  @RequirePermissions('delivery.manage')
  async update(
    @Request() req: ExpressRequest & { user: TenantJwtPayload },
    @Param('id') id: string,
    @Body() dto: CreateDeliveryRateRuleDto,
  ) {
    const tenantId = this.getTenantIdFromRequest(req);
    return this.deliveryRateService.upsertRule(tenantId, {
      ...dto,
      id,
      geoJson: this.toInputJsonValue(dto.geoJson),
      polygonCoordinates: this.toInputJsonValue(dto.polygonCoordinates),
    });
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
  @HttpCode(HttpStatus.OK)
  async calculate(
    @Body() body: { tenantId: string; address?: DeliveryAddressDTO | null; distanceKm?: number | null },
  ) {
    // Este endpoint será público mas validado por tenantId
    // Futuramente podemos adicionar chave de API ou validar por slug
    return this.deliveryRateService.calculateRate({
      tenantId: body.tenantId,
      address: body.address,
      distanceKm: body.distanceKm ?? null,
    });
  }

  // Endpoint para o novo engine híbrido
  @Post('calculate-decision')
  @Public()
  @HttpCode(HttpStatus.OK)
  async calculateDecision(
    @Body() body: { tenantId: string; address?: DeliveryAddressDTO | null; distanceKm?: number | null },
  ) {
    return this.deliveryRateService.calculateDeliveryDecision({
      tenantId: body.tenantId,
      address: body.address,
      distanceKm: body.distanceKm ?? null,
    });
  }
}
