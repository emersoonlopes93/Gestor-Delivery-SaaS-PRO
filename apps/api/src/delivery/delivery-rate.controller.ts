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

  private mapBodyToUpsertInput(
    body: Record<string, unknown>,
    id?: string,
  ): UpsertDeliveryRateRuleInput {
    const distanceTiers = Array.isArray(body.distanceTiers) ? body.distanceTiers : undefined;
    const geoJson = body.geoJson;
    const polygonCoordinates = body.polygonCoordinates;
    const rest = { ...body } as Record<string, unknown>;
    delete rest.distanceTiers;
    delete rest.geoJson;
    delete rest.polygonCoordinates;

    return {
      ...(rest as Omit<UpsertDeliveryRateRuleInput, 'distanceTiers' | 'geoJson' | 'polygonCoordinates'>),
      ...(id !== undefined ? { id } : {}),
      geoJson: this.toInputJsonValue(geoJson),
      polygonCoordinates: this.toInputJsonValue(polygonCoordinates),
      distanceTiers: distanceTiers?.map((tier, idx) => {
        const current = (tier ?? {}) as Record<string, unknown>;
        return {
          id: typeof current.id === 'string' ? current.id : undefined,
          minDistanceKm: Number(current.minDistanceKm),
          maxDistanceKm: Number(current.maxDistanceKm),
          fee: Number(current.fee),
          estimatedDeliveryMinutes:
            current.estimatedDeliveryMinutes == null ? undefined : Number(current.estimatedDeliveryMinutes),
          sortOrder: current.sortOrder == null ? idx : Number(current.sortOrder),
        };
      }),
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
    @Body() body: Record<string, unknown>,
  ) {
    const tenantId = this.getTenantIdFromRequest(req);
    return this.deliveryRateService.upsertRule(tenantId, this.mapBodyToUpsertInput(body));
  }

  @Put(':id')
  @RequirePermissions('delivery.manage')
  async update(
    @Request() req: ExpressRequest & { user: TenantJwtPayload },
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
  ) {
    const tenantId = this.getTenantIdFromRequest(req);
    return this.deliveryRateService.upsertRule(tenantId, this.mapBodyToUpsertInput(body, id));
  }

  @Delete(':id')
  @RequirePermissions('delivery.manage')
  async delete(@Request() req: ExpressRequest & { user: TenantJwtPayload }, @Param('id') id: string) {
    const tenantId = this.getTenantIdFromRequest(req);
    return this.deliveryRateService.deleteRule(tenantId, id);
  }

  // Endpoint público para cálculo (usado no checkout)
  // Endpoint autenticado para uso interno do PDV/tenant app.
  @Post('calculate-current')
  @RequirePermissions('delivery.read')
  @HttpCode(HttpStatus.OK)
  async calculateCurrentTenant(
    @Request() req: ExpressRequest & { user: TenantJwtPayload },
    @Body() body: { address?: DeliveryAddressDTO | null; distanceKm?: number | null },
  ) {
    const tenantId = this.getTenantIdFromRequest(req);
    return this.deliveryRateService.calculateRate({
      tenantId,
      address: body.address,
      distanceKm: body.distanceKm ?? null,
    });
  }

  @Post('test-current')
  @RequirePermissions('delivery.read')
  @HttpCode(HttpStatus.OK)
  async testCurrentTenant(
    @Request() req: ExpressRequest & { user: TenantJwtPayload },
    @Body() body: { query: string },
  ) {
    const tenantId = this.getTenantIdFromRequest(req);
    return this.deliveryRateService.testDeliveryByQuery(tenantId, body.query);
  }

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
