import { Controller, Get } from '@nestjs/common';
import { Public } from '../common/decorators';
import { TenantBillingResolverService } from './tenant-billing-resolver.service';

@Controller('saas/pricing')
export class PublicSaasController {
  constructor(private readonly tenantBillingResolver: TenantBillingResolverService) {}

  @Public()
  @Get()
  async getPricingTable() {
    const defaultPlan = await this.tenantBillingResolver.getDefaultBillingPlan();
    if (!defaultPlan) {
      return { plan: null, tiers: [] };
    }

    return {
      plan: {
        id: defaultPlan.id,
        name: defaultPlan.name,
        currency: defaultPlan.currency,
        isActive: defaultPlan.isActive,
      },
      tiers: defaultPlan.revenueTiers.map(t => ({
        id: t.id,
        minRevenue: Number(t.minRevenue),
        maxRevenue: t.maxRevenue ? Number(t.maxRevenue) : null,
        price: Number(t.price),
        label: t.label,
        sortOrder: t.sortOrder,
      })).sort((a, b) => a.sortOrder - b.sortOrder),
    };
  }
}
