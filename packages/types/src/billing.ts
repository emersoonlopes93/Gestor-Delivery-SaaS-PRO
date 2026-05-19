export interface PlanDTO {
  id: string;
  name: string;
  slug: string;
  price: number;
  billingCycle: 'monthly' | 'yearly';
  features: Record<string, boolean | string | number> | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  _count?: { subscriptions: number };
}

export interface CreatePlanDTO {
  name: string;
  slug: string;
  price: number;
  billingCycle: 'monthly' | 'yearly';
  features?: Record<string, boolean | string | number>;
  isActive?: boolean;
}

export interface UpdatePlanDTO extends Partial<CreatePlanDTO> {}

export interface TenantSubscriptionDTO {
  id: string;
  tenantId: string;
  planId: string;
  status: 'active' | 'past_due' | 'unpaid' | 'canceled' | 'incomplete' | 'incomplete_expired' | 'trialing' | 'paused' | 'overdue';
  currentPeriodEndsAt?: string;
  asaasSubscriptionId?: string;
  asaasCustomerId?: string;
  createdAt: string;
  updatedAt: string;
  plan?: PlanDTO;
}
