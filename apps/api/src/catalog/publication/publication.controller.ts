import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { TenantAuthGuard } from '../../auth/guards/tenant-auth.guard';
import { RequirePermissions } from '../../common/decorators';
import { PermissionsGuard } from '../../rbac/guards/permissions.guard';
import { PublicationService } from './publication.service';
import { UpsertPublicationDto } from './dto/upsert-publication.dto';
import { CreateAvailabilityRuleDto } from './dto/create-availability-rule.dto';
import { UpdateAvailabilityRuleDto } from './dto/update-availability-rule.dto';

@Controller('catalog/products/:productId/publication')
@UseGuards(TenantAuthGuard, PermissionsGuard)
export class PublicationController {
  constructor(private readonly service: PublicationService) {}

  @Get()
  @RequirePermissions('catalog.read')
  getPublication(@Param('productId') productId: string) {
    return this.service.getPublication(productId);
  }

  @Patch()
  @RequirePermissions('catalog.publish')
  upsertPublication(@Param('productId') productId: string, @Body() dto: UpsertPublicationDto) {
    return this.service.upsertPublication(productId, dto);
  }

  @Get('rules')
  @RequirePermissions('catalog.read')
  listRules(@Param('productId') productId: string) {
    return this.service.listRules(productId);
  }

  @Post('rules')
  @RequirePermissions('catalog.publish')
  createRule(@Param('productId') productId: string, @Body() dto: CreateAvailabilityRuleDto) {
    return this.service.createRule(productId, dto);
  }

  @Patch('rules/:ruleId')
  @RequirePermissions('catalog.publish')
  updateRule(@Param('ruleId') ruleId: string, @Body() dto: UpdateAvailabilityRuleDto) {
    return this.service.updateRule(ruleId, dto);
  }

  @Delete('rules/:ruleId')
  @RequirePermissions('catalog.publish')
  deleteRule(@Param('ruleId') ruleId: string) {
    return this.service.deleteRule(ruleId);
  }
}
