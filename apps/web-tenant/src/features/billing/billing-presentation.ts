import type { TenantBillingPaymentModeInfo } from './billing-api';

export function billingGatewayCapabilityLabel(info: TenantBillingPaymentModeInfo | undefined): string {
  if (!info || info.gatewayStatus === 'disabled') return 'Desativadas';
  if (info.gatewayStatus === 'manual_ready') return 'Manuais disponiveis';
  if (info.gatewayStatus === 'sandbox_ready') return 'Sandbox disponivel';
  return 'Configuracao indisponivel';
}

export function billingProductionCapabilityLabel(info: TenantBillingPaymentModeInfo | undefined): string {
  return info?.productionAllowed ? 'Liberada' : 'Bloqueada';
}
