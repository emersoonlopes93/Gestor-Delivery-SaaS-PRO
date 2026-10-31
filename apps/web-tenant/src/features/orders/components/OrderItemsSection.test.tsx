import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { OrderItemsSection } from './OrderItemsSection';

describe('OrderItemsSection marketplace composition', () => {
  it('shows every 99Food add-on and preserves nested composition indentation', () => {
    const html = renderToStaticMarkup(<OrderItemsSection items={[{
      id: 'item-1', lineType: 'product', productId: null, comboId: null, quantity: 1,
      unitPrice: 24, lineTotal: 24, notes: 'Sem gelo', snapshotName: 'Copo Acai', snapshotImage: null,
      snapshotBasePrice: 24, snapshotExtrasTotal: 0,
      snapshotComposition: '+ 1x Creme\n+  + 1x Banana\n+  + 1x Sucrilhos', snapshotCatalogV2Json: null,
    }]} />);

    expect(html).toContain('Copo Acai');
    expect(html).toContain('Creme');
    expect(html).toContain('Banana');
    expect(html).toContain('Sucrilhos');
    expect(html).toContain('whitespace-pre-wrap');
    expect(html).toContain('Sem gelo');
  });
});
