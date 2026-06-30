import {
  Body,
  Controller,
  Get,
  Post,
  Put,
  Request,
  UseGuards,
} from '@nestjs/common';
import { IsBoolean, IsNumber, IsOptional, IsString } from 'class-validator';
import { TenantAuthGuard } from '../auth/guards/tenant-auth.guard';
import { PermissionsGuard } from '../rbac/guards/permissions.guard';
import { RequirePermissions } from '../common/decorators';
import type { Request as ExpressRequest } from 'express';
import type { TenantJwtPayload } from '@gestor/types';
import { DeliveryCoverageService } from './delivery-coverage.service';
import { GeocodingService } from './geocoding.service';

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

class GeocodeCoverageAddressDto {
  @IsString()
  query!: string;
}

@Controller('delivery/coverage')
@UseGuards(TenantAuthGuard, PermissionsGuard)
export class DeliveryCoverageController {
  constructor(
    private readonly deliveryCoverageService: DeliveryCoverageService,
    private readonly geocodingService: GeocodingService,
  ) {}

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

  @Post('geocode')
  @RequirePermissions('settings.manage')
  async geocode(@Body() dto: GeocodeCoverageAddressDto) {
    const coords = await this.geocodingService.geocodeFreeform(dto.query.trim());
    return {
      lat: coords?.lat ?? null,
      lng: coords?.lng ?? null,
    };
  }
}
