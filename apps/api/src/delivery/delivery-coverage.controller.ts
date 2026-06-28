import {
  Body,
  Controller,
  Get,
  Put,
  Request,
  UseGuards,
} from '@nestjs/common';
import { IsBoolean, IsNumber, IsOptional } from 'class-validator';
import { TenantAuthGuard } from '../auth/guards/tenant-auth.guard';
import { PermissionsGuard } from '../rbac/guards/permissions.guard';
import { RequirePermissions } from '../common/decorators';
import type { Request as ExpressRequest } from 'express';
import type { TenantJwtPayload } from '@gestor/types';
import { DeliveryCoverageService } from './delivery-coverage.service';

class UpsertDeliveryCoverageDto {
  @IsNumber()
  storeLat!: number;

  @IsNumber()
  storeLng!: number;

  @IsNumber()
  maxRadiusKm!: number;

  @IsNumber()
  defaultPricePerKm!: number;

  @IsOptional()
  @IsNumber()
  minimumFee?: number;

  @IsOptional()
  @IsNumber()
  maximumFee?: number;

  @IsOptional()
  @IsNumber()
  defaultEstimatedDeliveryMinutes?: number;

  @IsOptional()
  @IsBoolean()
  isDeliveryEnabled?: boolean;
}

@Controller('delivery/coverage')
@UseGuards(TenantAuthGuard, PermissionsGuard)
export class DeliveryCoverageController {
  constructor(private readonly deliveryCoverageService: DeliveryCoverageService) {}

  private getTenantIdFromRequest(req: ExpressRequest & { user: TenantJwtPayload }): string {
    return req.user.tenantId;
  }

  @Get()
  @RequirePermissions('delivery.read')
  async get(@Request() req: ExpressRequest & { user: TenantJwtPayload }) {
    const tenantId = this.getTenantIdFromRequest(req);
    return this.deliveryCoverageService.getCoverageConfig(tenantId);
  }

  @Put()
  @RequirePermissions('delivery.manage')
  async upsert(
    @Request() req: ExpressRequest & { user: TenantJwtPayload },
    @Body() dto: UpsertDeliveryCoverageDto,
  ) {
    const tenantId = this.getTenantIdFromRequest(req);
    return this.deliveryCoverageService.upsertCoverageConfig(tenantId, dto);
  }
}
