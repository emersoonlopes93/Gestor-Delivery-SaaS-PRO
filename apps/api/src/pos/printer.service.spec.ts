import { PaymentMethod, type OrderFinancialSummary, type OrderResponseDTO, type OrderStatus } from '@gestor/types';
import { PrinterService } from './printer.service';

function makeOrder(): OrderResponseDTO {
  return {
    id: 'order-1',
    orderNumber: '0056',
    status: 'preparing' as OrderStatus,
    fulfillmentType: 'delivery',
    customerName: 'Ana Carolina',
    customerPhone: '11999999999',
    itemsSubtotal: 24,
    discountTotal: 0,
    deliveryFee: 0,
    serviceFee: 0,
    total: 24,
    sourceChannel: '99food',
    paymentMethod: PaymentMethod.cash,
    timeline: [],
    createdAt: '2026-09-06T12:00:00.000Z',
    updatedAt: '2026-09-06T12:00:00.000Z',
    items: [{
      id: 'item-1',
      lineType: 'product',
      quantity: 1,
      unitPrice: 24,
      lineTotal: 24,
      snapshotName: 'Copo Açaí Trufado 330 ml',
      snapshotBasePrice: 24,
      snapshotExtrasTotal: 0,
      snapshotComposition: '+ 1x Creme Ninho\n+ 1x Banana\n+ 1x Leite Condensado',
      snapshotCatalogV2Json: {
        optionItems: [
          { snapshotName: 'Granola', quantity: 1 },
          { snapshotName: 'Morango', quantity: 2 },
        ],
      },
    }],
  };
}

function withFood99Financial(order: OrderResponseDTO, financialSummary: OrderFinancialSummary): OrderResponseDTO {
  return {
    ...order,
    operational: {
      origin: 'FOOD_99', provider: 'FOOD_99', displayChannel: '99Food',
      providerOrderNumber: '210007',
      deliveryOwnership: 'MERCHANT', fulfillmentMode: 'delivery',
      capabilities: {
        canConfirm: true, canStartPreparation: true, canMarkReady: true, canCancel: false,
        canAssignDriver: true, canDispatch: true, canRecalculateRoute: true, canComplete: true,
        canPrint: true, canEdit: false,
      },
      availableActions: [], marketplaceOperation: { state: 'NONE' }, syncState: 'NONE',
      financialSummary,
      deliverySummary: { ownership: 'MERCHANT', label: 'Entrega própria' },
      productionSummary: { state: 'IN_PRODUCTION', label: 'Na cozinha' },
      primaryAction: null, secondaryActions: [],
    },
  };
}

describe('PrinterService kitchen ticket', () => {
  it('prints the same marketplace composition visible in KDS cards', async () => {
    const content = await new PrinterService().formatTicket(makeOrder(), 'kitchen', 'GERAL');

    expect(content).toContain('1    COPO AÇAÍ TRUFADO 330 ML');
    expect(content).toContain('- 1X CREME NINHO');
    expect(content).toContain('- 1X BANANA');
    expect(content).toContain('- 1X LEITE CONDENSADO');
  });

  it('prints catalog option items when they are the KDS operational source', async () => {
    const content = await new PrinterService().formatTicket(makeOrder(), 'kitchen', 'GERAL');

    expect(content).toContain('- 1x GRANOLA');
    expect(content).toContain('- 2x MORANGO');
  });
});

describe('PrinterService 99Food payment semantics', () => {
  const baseFinancial: OrderFinancialSummary = {
    operationalValue: 24, operationalValueLabel: 'Venda dos produtos', saleAmount: 24,
    customerPaid: null, paymentState: 'UNKNOWN', paymentLabel: 'Pagamento a confirmar',
    amountToCollect: null, amountToCollectState: 'UNKNOWN', collectionResponsibility: 'UNKNOWN',
    merchantReceivable: null, merchantReceivableState: 'UNKNOWN',
    discountFundingState: 'UNKNOWN', platformFees: null, platformFeesState: 'UNKNOWN',
  };

  it('prints a clear no-charge instruction for marketplace-paid self-delivery', async () => {
    const order = withFood99Financial(makeOrder(), {
      ...baseFinancial,
      customerPaid: 24, paymentState: 'PAID', paymentLabel: 'Pago na 99Food',
      amountToCollect: 0, amountToCollectState: 'KNOWN', collectionResponsibility: 'MARKETPLACE',
    });

    const content = await new PrinterService().formatTicket(order, 'customer');

    expect(content).toContain('PAGAMENTO: PAGO NA 99FOOD');
    expect(content).toContain('*** NAO COBRAR DO CLIENTE ***');
    expect(content).toContain('VALOR A COBRAR: R$ 0,00');
  });

  it('prints provider and internal numbers and never labels gross as customer-paid', async () => {
    const order = withFood99Financial({ ...makeOrder(), itemsSubtotal: 68.99, total: 40.76 }, {
      ...baseFinancial,
      operationalValue: 68.99,
      saleAmount: 68.99,
      customerPaid: 40.76,
      paymentState: 'PAID',
      paymentLabel: 'Pago na 99Food',
      amountToCollect: 0,
      amountToCollectState: 'KNOWN',
      collectionResponsibility: 'MARKETPLACE',
    });

    const content = await new PrinterService().formatTicket(order, 'customer');

    expect(content).toContain('99FOOD - PEDIDO #210007');
    expect(content).toContain('PEDEHUB #0056');
    expect(content.replace(/\u00a0/g, ' ')).toContain('TOTAL PAGO PELO CLIENTE: R$ 40,76');
    expect(content).not.toContain('TOTAL PAGO:');
    expect(content).not.toContain('TOTAL PAGO PELO CLIENTE: R$ 68,99');

    const kitchenContent = await new PrinterService().formatTicket(order, 'kitchen', 'GERAL');
    expect(kitchenContent).toContain('99FOOD - PEDIDO #210007');
    expect(kitchenContent).toContain('PEDEHUB #0056');
  });

  it('prints the exact driver collection amount for pay on delivery', async () => {
    const order = withFood99Financial(makeOrder(), {
      ...baseFinancial,
      paymentState: 'PENDING', paymentLabel: 'A cobrar na entrega',
      amountToCollect: 24, amountToCollectState: 'KNOWN', collectionResponsibility: 'DRIVER',
    });

    const content = await new PrinterService().formatTicket(order, 'customer');

    expect(content).toContain('PAGAMENTO: A COBRAR NA ENTREGA');
    expect(content).toContain('VALOR A COBRAR:');
    expect(content).toContain('24,00');
    expect(content).toContain('TOTAL DO CLIENTE:');
    expect(content).not.toContain('TOTAL PAGO:');
  });

  it('prints an unknown collection amount without converting it to zero', async () => {
    const order = withFood99Financial(makeOrder(), baseFinancial);

    const content = await new PrinterService().formatTicket(order, 'customer');

    expect(content).toContain('PAGAMENTO: PAGAMENTO A CONFIRMAR');
    expect(content).toContain('VALOR A COBRAR: NAO INFORMADO');
    expect(content).not.toContain('VALOR A COBRAR: R$ 0,00');
  });
});
