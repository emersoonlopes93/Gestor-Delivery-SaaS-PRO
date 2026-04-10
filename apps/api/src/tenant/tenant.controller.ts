import { Controller, Get, UseGuards } from '@nestjs/common';
import { TenantService } from './tenant.service';
import { TenantAuthGuard } from '../auth/guards/tenant-auth.guard';
import { CurrentTenant } from '../common/decorators';

@Controller('tenant')
@UseGuards(TenantAuthGuard)
export class TenantController {
  constructor(private readonly tenantService: TenantService) {}

  /**
   * Get the current tenant context and settings.
   */
  @Get('me')
  async getCurrentTenant(@CurrentTenant() tenantId: string) {
    return this.tenantService.findById(tenantId);
  }
}
