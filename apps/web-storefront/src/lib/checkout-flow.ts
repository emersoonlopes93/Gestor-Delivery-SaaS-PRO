import type { FulfillmentType } from '@gestor/types';

export type CheckoutStep = 'contact' | 'fulfillment' | 'address' | 'payment' | 'review';

export interface CheckoutStepDefinition {
  id: CheckoutStep;
  label: string;
  shortLabel: string;
}

const STEP_DEFINITIONS: Record<CheckoutStep, CheckoutStepDefinition> = {
  contact: { id: 'contact', label: 'Identificação e contato', shortLabel: 'Dados' },
  fulfillment: { id: 'fulfillment', label: 'Como receber', shortLabel: 'Receber' },
  address: { id: 'address', label: 'Endereço de entrega', shortLabel: 'Endereço' },
  payment: { id: 'payment', label: 'Pagamento e detalhes', shortLabel: 'Pagamento' },
  review: { id: 'review', label: 'Revisar e enviar', shortLabel: 'Revisão' },
};

export interface CheckoutStepValidationContext {
  contactValid: boolean;
  fulfillmentValid: boolean;
  addressValid: boolean;
  addressQuoteCurrent: boolean;
  addressValidationPending: boolean;
  addressValidationError: boolean;
  paymentValid: boolean;
  schedulingValid: boolean;
  orderValid: boolean;
}

export function getCheckoutSteps(
  fulfillmentType: FulfillmentType,
  isTableOrder: boolean,
): CheckoutStepDefinition[] {
  const ids: CheckoutStep[] = isTableOrder
    ? ['contact', 'payment', 'review']
    : fulfillmentType === 'delivery'
      ? ['contact', 'fulfillment', 'address', 'payment', 'review']
      : ['contact', 'fulfillment', 'payment', 'review'];

  return ids.map((id) => STEP_DEFINITIONS[id]);
}

export function getCheckoutStepError(
  step: CheckoutStep,
  context: CheckoutStepValidationContext,
): string | null {
  if (step === 'contact' && !context.contactValid) {
    return 'Informe seu nome, WhatsApp e um e-mail válido quando preenchido.';
  }
  if (step === 'fulfillment' && !context.fulfillmentValid) {
    return 'Escolha uma forma de receber o pedido.';
  }
  if (step === 'address') {
    if (!context.addressValid) return 'Complete o endereço de entrega, incluindo CEP e número.';
    if (context.addressValidationPending) return 'Aguarde a verificação da região de entrega.';
    if (context.addressValidationError || !context.addressQuoteCurrent) {
      return 'Confirme um endereço atendido pela loja antes de continuar.';
    }
  }
  if (step === 'payment' && (!context.paymentValid || !context.schedulingValid)) {
    return context.schedulingValid
      ? 'Escolha e complete a forma de pagamento.'
      : 'Escolha um horário disponível para o pedido.';
  }
  if (step === 'review' && !context.orderValid) {
    return 'Revise os dados pendentes antes de enviar o pedido.';
  }
  return null;
}

export function getAdjacentCheckoutStep(
  steps: CheckoutStepDefinition[],
  current: CheckoutStep,
  direction: 'back' | 'next',
): CheckoutStep {
  const currentIndex = Math.max(0, steps.findIndex((step) => step.id === current));
  const offset = direction === 'next' ? 1 : -1;
  const targetIndex = Math.min(steps.length - 1, Math.max(0, currentIndex + offset));
  return steps[targetIndex]?.id ?? current;
}
