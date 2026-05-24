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
import { DeliveryRateService } from './delivery-rate.service';
import { TenantAuthGuard } from '../auth/guards/tenant-auth.guard';
import { PermissionsGuard } from '../rbac/guards/permissions.guard';
import { Public, RequirePermissions } from '../common/decorators';
import type { Request as ExpressRequest } from 'express';
import type {
  CreateDeliveryRateRuleDTO,
  DeliveryAddressDTO,
  TenantJwtPayload,
  UpsertDeliveryRateRuleInput,
} from '@gestor/types';
import type { Prisma } from '@prisma/client';

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

  private mapDtoToUpsertInput(
    dto: CreateDeliveryRateRuleDTO,
    id?: string,
  ): UpsertDeliveryRateRuleInput {
    const { distanceTiers, geoJson, polygonCoordinates, ...rest } = dto;

    return {
      ...rest,
      ...(id !== undefined ? { id } : {}),
      geoJson: this.toInputJsonValue(geoJson),
      polygonCoordinates: this.toInputJsonValue(polygonCoordinates),
      distanceTiers: distanceTiers?.map((tier, idx) => ({
        id: tier.id,
        minDistanceKm: tier.minDistanceKm,
        maxDistanceKm: tier.maxDistanceKm,
        fee: tier.fee,
        sortOrder: tier.sortOrder ?? idx,
      })),
    };
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
    @Body() dto: CreateDeliveryRateRuleDTO,
  ) {
    const tenantId = this.getTenantIdFromRequest(req);
    return this.deliveryRateService.upsertRule(tenantId, this.mapDtoToUpsertInput(dto));
  }

  @Put(':id')
  @RequirePermissions('delivery.manage')
  async update(
    @Request() req: ExpressRequest & { user: TenantJwtPayload },
    @Param('id') id: string,
    @Body() dto: CreateDeliveryRateRuleDTO,
  ) {
    const tenantId = this.getTenantIdFromRequest(req);
    return this.deliveryRateService.upsertRule(tenantId, this.mapDtoToUpsertInput(dto, id));
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
