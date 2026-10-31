import type { PublicCommercialPlanDTO } from '@gestor/types';

export function commercialPlanCta(plan: PublicCommercialPlanDTO): string {
  if (plan.requiresPaymentMethod) return 'Conhecer a oferta';
  if (plan.trialDays > 0) return `Começar teste de ${plan.trialDays} dias`;
  return 'Criar conta e conhecer a oferta';
}
