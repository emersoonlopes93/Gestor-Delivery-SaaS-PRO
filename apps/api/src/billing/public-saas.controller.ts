import { Controller, Get } from '@nestjs/common';
import { Public } from '../common/decorators';
import { COMMERCIAL_OFFER_TERMS_VERSION, TenantBillingResolverService } from './tenant-billing-resolver.service';

@Controller('saas/pricing')
export class PublicSaasController {
  constructor(private readonly tenantBillingResolver: TenantBillingResolverService) {}

  @Public()
  @Get()
  async getPricingTable() {
    return {
      termsVersion: COMMERCIAL_OFFER_TERMS_VERSION,
      plans: await this.tenantBillingResolver.listPublicCommercialPlans(),
    };
  }
}
