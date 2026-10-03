import { getOrderOperationalViewModel, type OperationalOrderInput } from './order-operational-view-model';

const base: OperationalOrderInput = {
  status: 'pending',
  fulfillmentType: 'delivery',
  sourceChannel: 'direct_online',
  total: 52.9,
  itemsSubtotal: 48,
};

describe('getOrderOperationalViewModel', () => {
  it('builds the PedeHub local policy and provider-neutral financial summary', () => {
    const result = getOrderOperationalViewModel(base);

    expect(result.origin).toBe('PEDEHUB');
    expect(result.deliveryOwnership).toBe('MERCHANT');
    expect(result.primaryAction).toMatchObject({ type: 'CONFIRM', mode: 'LOCAL', targetStatus: 'confirmed' });
    expect(result.financialSummary).toEqual({
      operationalValue: 52.9,
      operationalValueLabel: 'Venda',
      saleAmount: 52.9,
      customerPaid: null,
      paymentState: 'UNKNOWN',
      paymentLabel: 'Pagamento não confirmado',
    });
  });

  it.each([
    ['pending', 'CONFIRM'],
    ['confirmed', 'START_PREPARATION'],
    ['preparing', 'MARK_READY'],
    ['ready_for_delivery', 'DISPATCH'],
    ['out_for_delivery', 'COMPLETE'],
  ] as const)('derives %s primary action from the canonical status', (status, expectedAction) => {
    expect(getOrderOperationalViewModel({ ...base, status }).primaryAction?.type).toBe(expectedAction);
  });

  it('keeps iFood confirmation asynchronous and exposes pending/failed friendly states', () => {
    const pending = getOrderOperationalViewModel({
      ...base,
      sourceChannel: 'marketplace_ifood',
      provider: 'IFOOD',
      deliveryOwnership: 'MERCHANT',
      latestMarketplaceOperation: { operation: 'CONFIRM', status: 'QUEUED' },
    });
    expect(pending.marketplaceOperation).toMatchObject({
      state: 'PENDING',
      action: 'CONFIRM',
      friendlyMessage: 'Sincronizando com iFood',
    });
    expect(pending.primaryAction).toBeNull();

    const failed = getOrderOperationalViewModel({
      ...base,
      provider: 'IFOOD',
      deliveryOwnership: 'MERCHANT',
      latestMarketplaceOperation: { operation: 'CONFIRM', status: 'INTERVENTION_REQUIRED' },
    });
    expect(failed.marketplaceOperation).toMatchObject({
      state: 'FAILED',
      friendlyMessage: 'Não foi possível sincronizar — tente novamente',
    });
  });

  it('supports 99Food confirm and ready while keeping outbound cancellation unavailable', () => {
    const pending = getOrderOperationalViewModel({
      ...base,
      provider: 'FOOD_99',
      externalDisplayId: '210007',
      deliveryOwnership: 'MERCHANT',
    });
    expect(pending.capabilities).toMatchObject({ canConfirm: true, canMarkReady: true, canCancel: false });
    expect(pending.primaryAction).toMatchObject({ type: 'CONFIRM', mode: 'PROVIDER_ASYNC' });
    expect(pending.availableActions.some((candidate) => candidate.type === 'CANCEL')).toBe(false);
    expect(pending.financialSummary).toMatchObject({
      operationalValue: 48,
      operationalValueLabel: 'Venda dos produtos',
      customerPaid: null,
      amountToCollect: null,
      paymentState: 'UNKNOWN',
      collectionResponsibility: 'UNKNOWN',
    });

    const preparing = getOrderOperationalViewModel({
      ...base,
      status: 'preparing',
      provider: 'FOOD_99',
      deliveryOwnership: 'MERCHANT',
    });
    expect(preparing.primaryAction).toMatchObject({ type: 'MARK_READY', mode: 'PROVIDER_ASYNC' });
  });

  it('separates paid-online 99Food sale, customer payment and zero collection amount', () => {
    const result = getOrderOperationalViewModel({
      ...base,
      provider: 'FOOD_99',
      externalDisplayId: '210007',
      deliveryOwnership: 'MERCHANT',
      marketplaceNormalizedPayload: {
        itemsSubtotal: 48,
        grossOrderValue: 68.99,
        total: 42,
        customerPaidAmount: 42,
        customerActuallyPaid: 40.76,
        customerNeedsToPay: 40.76,
        merchantEstimatedReceivable: 51.2,
        amountToCollect: 0,
        paymentStatus: 'PAID',
        collectionResponsibility: 'MARKETPLACE',
        discountTotal: 6,
      },
    });

    expect(result.financialSummary).toMatchObject({
      operationalValue: 48,
      operationalValueLabel: 'Venda dos produtos',
      saleAmount: 48,
      customerPaid: 42,
      customerActuallyPaid: 40.76,
      customerActuallyPaidState: 'KNOWN',
      customerNeedsToPay: 40.76,
      customerNeedsToPayState: 'KNOWN',
      paymentState: 'PAID',
      paymentLabel: 'Pago na 99Food',
      amountToCollect: 0,
      amountToCollectState: 'KNOWN',
      collectionResponsibility: 'MARKETPLACE',
      merchantReceivable: null,
      merchantReceivableState: 'UNKNOWN',
      merchantEstimatedReceivable: 51.2,
      merchantEstimatedReceivableState: 'KNOWN',
      discountFundingState: 'UNKNOWN',
      platformFees: null,
      platformFeesState: 'UNKNOWN',
    });
    expect(result.providerOrderNumber).toBe('210007');
  });

  it('exposes the real amount for self-delivery collection without marking it paid', () => {
    const result = getOrderOperationalViewModel({
      ...base,
      provider: 'FOOD_99',
      deliveryOwnership: 'MERCHANT',
      marketplaceNormalizedPayload: {
        customerPaidAmount: null,
        amountToCollect: 52.9,
        paymentStatus: 'PENDING',
        collectionResponsibility: 'DRIVER',
      },
    });

    expect(result.financialSummary).toMatchObject({
      customerPaid: null,
      paymentState: 'PENDING',
      paymentLabel: 'A cobrar na entrega',
      amountToCollect: 52.9,
      amountToCollectState: 'KNOWN',
      collectionResponsibility: 'DRIVER',
    });
  });

  it('exposes 99Food courier cash confirmation only from the same stored facts enforced by the provider action', () => {
    const eligible = getOrderOperationalViewModel({
      ...base,
      provider: 'FOOD_99',
      externalDisplayId: '210007',
      marketplaceOrderId: 'marketplace-order-1',
      marketplaceExternalStatus: '200',
      marketplaceRawPayload: { pay_type: 2, delivery_type: 1 },
      marketplaceNormalizedPayload: { amountToCollect: 52.9 },
    });

    expect(eligible.marketplaceOrderId).toBe('marketplace-order-1');
    expect(eligible.capabilities.courierCashConfirmation).toEqual({
      eligible: true,
      amountToCollect: 52.9,
      reasonUnavailable: null,
    });

    const ineligible = getOrderOperationalViewModel({
      ...base,
      provider: 'FOOD_99',
      marketplaceExternalStatus: '100',
      marketplaceRawPayload: { pay_type: 2, delivery_type: 1 },
    });
    expect(ineligible.capabilities.courierCashConfirmation).toMatchObject({ eligible: false });
  });

  it('presents stored 99Food logistics facts without inferring a commercial status change', () => {
    const result = getOrderOperationalViewModel({
      ...base,
      status: 'preparing',
      provider: 'FOOD_99',
      marketplaceNormalizedPayload: {
        logistics: {
          deliveryStatus: '170',
          riderName: 'Entregador da plataforma',
          riderPhone: '11999999999',
          riderToBusinessEta: '2026-10-03T16:30:00.000Z',
        },
      },
    });

    expect(result.deliverySummary).toMatchObject({
      providerStatus: '170',
      providerStatusLabel: 'Ocorrência logística',
      riderName: 'Entregador da plataforma',
      riderPhone: '11999999999',
    });
    expect(result.primaryAction?.type).toBe('MARK_READY');
  });

  it('preserves unknown payment and collection values as null', () => {
    const result = getOrderOperationalViewModel({
      ...base,
      provider: 'FOOD_99',
      deliveryOwnership: 'MERCHANT',
      marketplaceNormalizedPayload: {
        paymentStatus: 'UNKNOWN',
        collectionResponsibility: 'UNKNOWN',
      },
    });

    expect(result.financialSummary).toMatchObject({
      customerPaid: null,
      amountToCollect: null,
      amountToCollectState: 'UNKNOWN',
      paymentState: 'UNKNOWN',
      paymentLabel: 'Pagamento a confirmar',
      collectionResponsibility: 'UNKNOWN',
    });
  });

  it.each([
    ['PROVIDER', 'Entrega pela iFood'],
    ['UNKNOWN', 'Responsável pela entrega não confirmado'],
  ] as const)('blocks own-fleet actions for %s ownership', (ownership, label) => {
    const result = getOrderOperationalViewModel({
      ...base,
      status: 'ready_for_delivery',
      provider: 'IFOOD',
      deliveryOwnership: ownership,
    });

    expect(result.deliverySummary.label).toBe(label);
    expect(result.capabilities).toMatchObject({
      canAssignDriver: false,
      canDispatch: false,
      canRecalculateRoute: false,
      canComplete: false,
    });
    expect(result.primaryAction).toBeNull();
    expect(result.availableActions.find((candidate) => candidate.type === 'DISPATCH')).toMatchObject({ enabled: false });
  });

  it('permits own-fleet assignment and dispatch for MERCHANT ownership', () => {
    const result = getOrderOperationalViewModel({
      ...base,
      status: 'ready_for_delivery',
      provider: 'IFOOD',
      deliveryOwnership: 'MERCHANT',
    });

    expect(result.capabilities).toMatchObject({ canAssignDriver: true, canDispatch: true });
    expect(result.primaryAction).toMatchObject({ type: 'DISPATCH', enabled: true });
    expect(result.secondaryActions).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'ASSIGN_DRIVER', enabled: true }),
    ]));
  });

  it('derives production summary only from canonical order status', () => {
    expect(getOrderOperationalViewModel({ ...base, status: 'confirmed' }).productionSummary.state).toBe('NOT_SENT');
    expect(getOrderOperationalViewModel({ ...base, status: 'preparing' }).productionSummary.state).toBe('IN_PRODUCTION');
    expect(getOrderOperationalViewModel({ ...base, status: 'ready_for_delivery' }).productionSummary.state).toBe('READY');
  });
});
