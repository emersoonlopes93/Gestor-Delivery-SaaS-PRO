import { PaymentMethod, type OrderResponseDTO, type OrderStatus } from '@gestor/types';
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
