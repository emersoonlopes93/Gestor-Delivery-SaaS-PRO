export interface PosFinishBlockerState {
  hasActiveSession: boolean;
  hasItems: boolean;
  customerMissingRequiredData: boolean;
  isDelivery: boolean;
  deliveryMissingRequiredData: boolean;
  deliveryFeeCalculated: boolean;
}

/** Presentation-only explanation of the validation state already enforced by PosPage. */
export function getPosFinishBlocker(state: PosFinishBlockerState): string {
  if (!state.hasActiveSession) return 'Abra o caixa para iniciar vendas no PDV.';
  if (!state.hasItems) return 'Adicione itens para iniciar a venda.';
  if (state.customerMissingRequiredData) return 'Informe nome e telefone para fechar a conta.';
  if (state.isDelivery && state.deliveryMissingRequiredData) return 'Delivery exige cliente, telefone, rua, número e bairro.';
  if (state.isDelivery && !state.deliveryFeeCalculated) return 'Calcule o frete antes de finalizar a venda delivery.';
  return 'Complete os dados obrigatórios para continuar.';
}
