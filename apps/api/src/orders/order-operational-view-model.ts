import type {
  FulfillmentType,
  OrderDeliveryOwnership,
  OrderOperationalAction,
  OrderOperationalActionMode,
  OrderOperationalActionType,
  OrderOperationalCapabilities,
  OrderOperationalViewModel,
  OrderOrigin,
  OrderStatus,
} from '@gestor/types';

type MarketplaceOperationInput = {
  operation: string;
  status: string;
} | null;

export type OperationalOrderInput = {
  status: OrderStatus;
  fulfillmentType: FulfillmentType;
  sourceChannel: string;
  total: number;
  itemsSubtotal: number;
  deliveryDriverName?: string | null;
  provider?: string | null;
  externalDisplayId?: string | null;
  marketplaceOrderId?: string | null;
  marketplaceExternalStatus?: string | null;
  deliveryOwnership?: string | null;
  marketplaceRawPayload?: unknown;
  marketplaceNormalizedPayload?: unknown;
  latestMarketplaceOperation?: MarketplaceOperationInput;
};

const pendingOperationStatuses = new Set(['PENDING', 'QUEUED', 'PROCESSING', 'ACCEPTED']);
const failedOperationStatuses = new Set(['FAILED', 'INTERVENTION_REQUIRED']);

function resolveOrigin(provider?: string | null): OrderOrigin {
  if (!provider) return 'PEDEHUB';
  if (provider === 'IFOOD') return 'IFOOD';
  if (provider === 'FOOD_99') return 'FOOD_99';
  return 'MARKETPLACE';
}

function resolveOwnership(input: OperationalOrderInput): OrderDeliveryOwnership {
  if (!input.provider) return 'MERCHANT';
  if (input.deliveryOwnership === 'MERCHANT' || input.deliveryOwnership === 'PROVIDER') {
    return input.deliveryOwnership;
  }
  return 'UNKNOWN';
}

function providerDisplayName(origin: OrderOrigin): string {
  if (origin === 'IFOOD') return 'iFood';
  if (origin === 'FOOD_99') return '99Food';
  if (origin === 'PEDEHUB') return 'PedeHub';
  return 'Marketplace';
}

function providerMode(origin: OrderOrigin, action: OrderOperationalActionType): OrderOperationalActionMode {
  if (origin === 'PEDEHUB') return 'LOCAL';
  if (action === 'CONFIRM' || action === 'MARK_READY' || action === 'COMPLETE' || action === 'CANCEL') {
    if (origin === 'IFOOD' && action === 'MARK_READY') return 'LOCAL';
    return 'PROVIDER_ASYNC';
  }
  return 'LOCAL';
}

function operationAction(operation?: string): OrderOperationalActionType | null {
  if (operation === 'CONFIRM') return 'CONFIRM';
  if (operation === 'READY') return 'MARK_READY';
  if (operation === 'DISPATCH') return 'DISPATCH';
  if (operation === 'DELIVER') return 'COMPLETE';
  if (operation === 'CANCEL') return 'CANCEL';
  return null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function finiteNumber(record: Record<string, unknown> | null, field: string): number | null {
  const value = record?.[field];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function food99FinancialSummary(input: OperationalOrderInput): OrderOperationalViewModel['financialSummary'] {
  const payload = asRecord(input.marketplaceNormalizedPayload);
  const paymentStatus = payload?.paymentStatus;
  const paymentState = paymentStatus === 'PAID' || paymentStatus === 'PENDING'
    ? paymentStatus
    : 'UNKNOWN';
  const collection = payload?.collectionResponsibility;
  const collectionResponsibility = collection === 'MARKETPLACE'
    || collection === 'MERCHANT'
    || collection === 'DRIVER'
    ? collection
    : 'UNKNOWN';
  const customerPaid = finiteNumber(payload, 'customerPaidAmount');
  const customerActuallyPaid = finiteNumber(payload, 'customerActuallyPaid');
  const customerNeedsToPay = finiteNumber(payload, 'customerNeedsToPay');
  const amountToCollect = finiteNumber(payload, 'amountToCollect');
  const merchantEstimatedReceivable = finiteNumber(payload, 'merchantEstimatedReceivable');
  const discountTotal = finiteNumber(payload, 'discountTotal');
  const merchantFundedDiscount = finiteNumber(payload, 'merchantFundedDiscount');

  return {
    operationalValue: input.itemsSubtotal,
    operationalValueLabel: 'Venda dos produtos',
    saleAmount: input.itemsSubtotal,
    customerPaid,
    customerActuallyPaid,
    customerActuallyPaidState: customerActuallyPaid === null ? 'UNKNOWN' : 'KNOWN',
    customerNeedsToPay,
    customerNeedsToPayState: customerNeedsToPay === null ? 'UNKNOWN' : 'KNOWN',
    paymentState,
    paymentLabel: paymentState === 'PAID'
      ? 'Pago na 99Food'
      : paymentState === 'PENDING'
        ? 'A cobrar na entrega'
        : 'Pagamento a confirmar',
    amountToCollect,
    amountToCollectState: amountToCollect === null ? 'UNKNOWN' : 'KNOWN',
    collectionResponsibility,
    merchantReceivable: null,
    merchantReceivableState: 'UNKNOWN',
    merchantEstimatedReceivable,
    merchantEstimatedReceivableState: merchantEstimatedReceivable === null ? 'UNKNOWN' : 'KNOWN',
    settledReceivable: null,
    settledReceivableState: 'UNKNOWN',
    merchantFundedDiscount,
    merchantFundedDiscountState: merchantFundedDiscount === null ? 'UNKNOWN' : 'KNOWN',
    discountFundingState: discountTotal === 0 ? 'NOT_APPLICABLE' : 'UNKNOWN',
    platformFees: null,
    platformFeesState: 'UNKNOWN',
  };
}

function food99CourierCashCapability(input: OperationalOrderInput): NonNullable<OrderOperationalCapabilities['courierCashConfirmation']> {
  const rawPayload = asRecord(input.marketplaceRawPayload);
  const payType = finiteNumber(rawPayload, 'pay_type');
  const deliveryType = finiteNumber(rawPayload, 'delivery_type');
  const normalizedPayload = asRecord(input.marketplaceNormalizedPayload);
  const amountToCollect = finiteNumber(normalizedPayload, 'amountToCollect');

  if (payType !== 2) {
    return { eligible: false, amountToCollect: null, reasonUnavailable: 'Disponível somente para pedidos em dinheiro.' };
  }
  if (deliveryType !== 1) {
    return { eligible: false, amountToCollect: null, reasonUnavailable: 'Disponível somente para entregas realizadas pela 99Food.' };
  }
  if (input.marketplaceExternalStatus !== '200') {
    return { eligible: false, amountToCollect, reasonUnavailable: 'Disponível quando a 99Food confirmar o aceite do pedido.' };
  }
  return { eligible: true, amountToCollect, reasonUnavailable: null };
}

function food99DeliveryFacts(input: OperationalOrderInput): Pick<OrderOperationalViewModel['deliverySummary'], 'providerStatus' | 'providerStatusLabel' | 'riderName' | 'riderPhone' | 'riderToBusinessEta'> {
  const logistics = asRecord(asRecord(input.marketplaceNormalizedPayload)?.logistics);
  const deliveryStatus = typeof logistics?.deliveryStatus === 'string' ? logistics.deliveryStatus : null;
  const labels: Record<string, string> = {
    '120': 'Entregador atribuído',
    '130': 'Chegou ao restaurante',
    '140': 'Retirou o pedido',
    '150': 'Chegou ao cliente',
    '160': 'Entregue',
    '170': 'Ocorrência logística',
    '180': 'Entregador reassociado',
    '190': 'Operação logística abortada',
  };
  const stringFact = (field: string): string | null => typeof logistics?.[field] === 'string' && logistics[field].trim()
    ? logistics[field]
    : null;
  return {
    providerStatus: deliveryStatus,
    providerStatusLabel: deliveryStatus ? labels[deliveryStatus] ?? 'Atualização logística recebida' : null,
    riderName: stringFact('riderName'),
    riderPhone: stringFact('riderPhone'),
    riderToBusinessEta: stringFact('riderToBusinessEta'),
  };
}

function action(
  type: OrderOperationalActionType,
  label: string,
  mode: OrderOperationalActionMode,
  targetStatus?: OrderStatus,
  enabled = true,
  reason?: string,
): OrderOperationalAction {
  return { type, label, mode: enabled ? mode : 'DISABLED', enabled, targetStatus, reason: reason ?? null };
}

export function getOrderOperationalViewModel(input: OperationalOrderInput): OrderOperationalViewModel {
  const origin = resolveOrigin(input.provider);
  const ownership = resolveOwnership(input);
  const displayChannel = providerDisplayName(origin);
  const marketplaceOperationStatus = input.latestMarketplaceOperation?.status;
  const syncState = marketplaceOperationStatus && pendingOperationStatuses.has(marketplaceOperationStatus)
    ? 'PENDING'
    : marketplaceOperationStatus && failedOperationStatuses.has(marketplaceOperationStatus)
      ? 'FAILED'
      : 'NONE';
  const ownFleet = input.fulfillmentType !== 'delivery' || ownership === 'MERCHANT';
  const isMarketplace = origin !== 'PEDEHUB';
  const supportedMarketplace = origin === 'IFOOD' || origin === 'FOOD_99';
  const pendingBlocksActions = syncState === 'PENDING';

  const capabilities: OrderOperationalCapabilities = {
    canConfirm: !isMarketplace || supportedMarketplace,
    canStartPreparation: true,
    canMarkReady: !isMarketplace || supportedMarketplace,
    canCancel: origin === 'PEDEHUB' || origin === 'IFOOD',
    canAssignDriver: input.fulfillmentType === 'delivery' && ownFleet,
    canDispatch: input.fulfillmentType === 'delivery' && ownFleet,
    canRecalculateRoute: input.fulfillmentType === 'delivery' && ownFleet,
    canComplete: (!isMarketplace || supportedMarketplace) && (input.fulfillmentType !== 'delivery' || ownFleet),
    canPrint: true,
    canEdit: !isMarketplace,
    ...(origin === 'FOOD_99' ? { courierCashConfirmation: food99CourierCashCapability(input) } : {}),
  };

  const availableActions: OrderOperationalAction[] = [];
  const blockedReason = pendingBlocksActions ? `Aguardando retorno do ${displayChannel}.` : undefined;

  if (input.status === 'pending') {
    availableActions.push(action(
      'CONFIRM', 'Confirmar', providerMode(origin, 'CONFIRM'), 'confirmed',
      capabilities.canConfirm && !pendingBlocksActions,
      capabilities.canConfirm ? blockedReason : 'A confirmação não está habilitada para este marketplace.',
    ));
  } else if (input.status === 'confirmed') {
    availableActions.push(action('START_PREPARATION', 'Enviar para cozinha', 'LOCAL', 'preparing', !pendingBlocksActions, blockedReason));
  } else if (input.status === 'preparing') {
    const readyStatus = input.fulfillmentType === 'delivery' ? 'ready_for_delivery' : 'ready_for_pickup';
    availableActions.push(action(
      'MARK_READY', 'Marcar pronto', providerMode(origin, 'MARK_READY'), readyStatus,
      capabilities.canMarkReady && !pendingBlocksActions,
      capabilities.canMarkReady ? blockedReason : 'A atualização de pronto não está habilitada para este marketplace.',
    ));
  } else if (input.status === 'ready_for_delivery' && input.fulfillmentType === 'delivery') {
    availableActions.push(action(
      'DISPATCH',
      'Despachar',
      'LOCAL',
      'out_for_delivery',
      capabilities.canDispatch && !pendingBlocksActions,
      capabilities.canDispatch ? blockedReason : ownership === 'PROVIDER'
        ? 'A entrega é realizada pelo marketplace.'
        : 'O responsável pela entrega ainda não foi confirmado.',
    ));
  } else if (input.status === 'out_for_delivery' || input.status === 'ready_for_pickup') {
    availableActions.push(action(
      'COMPLETE',
      input.status === 'ready_for_pickup' ? 'Entregar ao cliente' : 'Concluir entrega',
      providerMode(origin, 'COMPLETE'),
      'completed',
      capabilities.canComplete && !pendingBlocksActions,
      capabilities.canComplete ? blockedReason : 'A conclusão desta entrega pertence ao marketplace.',
    ));
  }

  if (['pending', 'confirmed', 'preparing'].includes(input.status)) {
    if (capabilities.canCancel) {
      const ifoodNeedsReasonFlow = origin === 'IFOOD';
      availableActions.push(action(
        'CANCEL',
        'Cancelar',
        providerMode(origin, 'CANCEL'),
        'cancelled',
        !pendingBlocksActions && !ifoodNeedsReasonFlow,
        ifoodNeedsReasonFlow ? 'Use o fluxo de cancelamento com motivo do iFood.' : blockedReason,
      ));
    }
    if (capabilities.canEdit) availableActions.push(action('EDIT', 'Editar', 'LOCAL'));
  }

  if (input.status === 'ready_for_delivery' && capabilities.canAssignDriver) {
    availableActions.push(action('ASSIGN_DRIVER', input.deliveryDriverName ? 'Trocar motoboy' : 'Atribuir motoboy', 'LOCAL'));
  }
  availableActions.push(action('PRINT', 'Imprimir', 'LOCAL'));
  availableActions.push(action('OPEN_DETAILS', 'Detalhes', 'LOCAL'));

  const primaryAction = availableActions.find((candidate) =>
    candidate.enabled && ['CONFIRM', 'START_PREPARATION', 'MARK_READY', 'DISPATCH', 'COMPLETE'].includes(candidate.type),
  ) ?? null;
  const secondaryActions = availableActions.filter((candidate) => candidate !== primaryAction && candidate.enabled);

  const productionState = input.status === 'confirmed'
    ? 'NOT_SENT'
    : input.status === 'preparing'
      ? 'IN_PRODUCTION'
      : ['ready_for_pickup', 'ready_for_delivery', 'out_for_delivery', 'completed'].includes(input.status)
        ? 'READY'
        : 'UNKNOWN';
  const productionLabel = productionState === 'NOT_SENT'
    ? 'Aguardando cozinha'
    : productionState === 'IN_PRODUCTION'
      ? 'Na cozinha'
      : productionState === 'READY'
        ? 'Pronto'
        : 'Produção não iniciada';
  const deliveryLabel = input.fulfillmentType !== 'delivery'
    ? 'Sem entrega'
    : ownership === 'MERCHANT'
      ? 'Entrega própria'
      : ownership === 'PROVIDER'
        ? `Entrega pela ${displayChannel}`
        : 'Responsável pela entrega não confirmado';
  const operationState = syncState;
  const operationProvider = isMarketplace ? displayChannel : null;
  const operationFriendlyMessage = operationState === 'PENDING'
    ? `Sincronizando com ${displayChannel}`
    : operationState === 'FAILED'
      ? 'Não foi possível sincronizar — tente novamente'
      : null;

  return {
    origin,
    provider: input.provider ?? null,
    providerOrderNumber: input.externalDisplayId ?? null,
    marketplaceOrderId: input.marketplaceOrderId ?? null,
    displayChannel,
    deliveryOwnership: ownership,
    fulfillmentMode: input.fulfillmentType,
    capabilities,
    availableActions,
    marketplaceOperation: {
      state: operationState,
      action: operationAction(input.latestMarketplaceOperation?.operation),
      provider: operationProvider,
      friendlyMessage: operationFriendlyMessage,
    },
    syncState,
    financialSummary: origin === 'FOOD_99' ? food99FinancialSummary(input) : {
      operationalValue: input.total,
      operationalValueLabel: 'Venda',
      saleAmount: input.total,
      customerPaid: null,
      paymentState: 'UNKNOWN',
      paymentLabel: 'Pagamento não confirmado',
    },
    deliverySummary: {
      ownership,
      label: deliveryLabel,
      driverName: input.deliveryDriverName ?? null,
      ...(origin === 'FOOD_99' ? food99DeliveryFacts(input) : {}),
    },
    productionSummary: { state: productionState, label: productionLabel },
    primaryAction,
    secondaryActions,
  };
}
