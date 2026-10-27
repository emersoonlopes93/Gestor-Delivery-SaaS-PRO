export interface PublicCommercialRevenueTierDTO {
  id: string;
  minRevenue: string;
  maxRevenue: string | null;
  price: string;
  label: string | null;
  sortOrder: number;
}

export interface PublicCommercialPlanDTO {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  type: 'revenue_tiered';
  cycleInterval: 'monthly' | 'yearly';
  currency: string;
  trialDays: number;
  requiresPaymentMethod: boolean;
  includedModules: string[];
  revenueTiers: PublicCommercialRevenueTierDTO[];
}

export interface PublicCommercialPricingDTO {
  termsVersion: string;
  plans: PublicCommercialPlanDTO[];
}
