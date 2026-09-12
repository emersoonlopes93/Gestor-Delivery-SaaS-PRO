import { Injectable } from '@nestjs/common';
import { OrderResponseDTO } from '@gestor/types';

@Injectable()
export class PrinterService {
  private getKdsOptionItems(snapshot: unknown): Array<{ snapshotName: string; quantity: number }> {
    if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) return [];

    const optionItems = (snapshot as { optionItems?: unknown }).optionItems;
    if (!Array.isArray(optionItems)) return [];

    return optionItems.flatMap((option) => {
      if (!option || typeof option !== 'object' || Array.isArray(option)) return [];

      const { snapshotName, quantity } = option as { snapshotName?: unknown; quantity?: unknown };
      if (typeof snapshotName !== 'string' || !snapshotName.trim()) return [];

      return [{
        snapshotName: snapshotName.trim(),
        quantity: typeof quantity === 'number' && Number.isFinite(quantity) && quantity > 0 ? quantity : 1,
      }];
    });
  }

  private getMarketplaceCompositionLines(composition?: string | null): string[] {
    if (!composition) return [];

    return composition
      .split('\n')
      .map((line) => line.trim().replace(/^[-+]\s*/, ''))
      .filter(Boolean);
  }

  private getFulfillmentLabel(value?: string | null): string {
    if (typeof value !== 'string') return 'PEDIDO';
    const normalized = value.trim();
    if (!normalized) return 'PEDIDO';
    return normalized.toUpperCase();
  }

  /**
   * Generates a TXT string formatted for 80mm thermal printers.
   * Can return plain text or RAW ESC/POS commands.
   */
  async formatTicket(
    order: OrderResponseDTO, 
    type: 'customer' | 'kitchen' = 'customer',
    station?: string,
    format: 'text' | 'escpos' = 'text'
  ): Promise<string> {
    const lines: string[] = [];
    const width = 48;

    // ESC/POS Commands
    const ESC = '\x1B';
    const GS = '\x1D';
    const INITIALIZE = `${ESC}@`;
    const BOLD_ON = `${ESC}E\x01`;
    const BOLD_OFF = `${ESC}E\x00`;
    const CENTER = `${ESC}a\x01`;
    const LEFT = `${ESC}a\x00`;
    const FONT_NORMAL = `${GS}!\x00`;
    const FONT_DOUBLE = `${GS}!\x11`;
    const CUT = `${GS}V\x41\x03`;

    const center = (text: string) => {
      const padding = Math.max(0, Math.floor((width - text.length) / 2));
      return ' '.repeat(padding) + text;
    };

    const separator = '='.repeat(width);
    const thinSeparator = '-'.repeat(width);

    const itemsToPrint = order.items;

    if (format === 'escpos') lines.push(INITIALIZE);

    const providerOrderNumber = order.operational?.origin === 'FOOD_99'
      ? order.operational.providerOrderNumber
      : null;

    // Header
    if (type === 'customer') {
      if (format === 'escpos') lines.push(CENTER, FONT_DOUBLE, BOLD_ON);
      lines.push(center('GESTOR DELIVERY SAAS PRO'));
      if (format === 'escpos') lines.push(FONT_NORMAL);
      if (providerOrderNumber) {
        lines.push(center(`99FOOD - PEDIDO #${providerOrderNumber}`));
        lines.push(center(`PEDEHUB #${order.orderNumber}`));
      } else {
        lines.push(center(`${this.getFulfillmentLabel(order.fulfillmentType)} - ${order.orderNumber}`));
      }
    } else {
      if (format === 'escpos') lines.push(CENTER, BOLD_ON);
      lines.push(center('*** PRODUCAO / KDS ***'));
      lines.push(center(`SETOR: ${station?.toUpperCase() || 'GERAL'}`));
      if (format === 'escpos') lines.push(FONT_DOUBLE);
      if (providerOrderNumber) {
        lines.push(center(`99FOOD - PEDIDO #${providerOrderNumber}`));
        lines.push(center(`PEDEHUB #${order.orderNumber}`));
      } else {
        lines.push(center(`PEDIDO: #${order.orderNumber}`));
      }
      if (format === 'escpos') lines.push(FONT_NORMAL);
    }
    
    if (format === 'escpos') lines.push(CENTER);
    lines.push(center(new Date(order.createdAt).toLocaleString('pt-BR')));
    if (format === 'escpos') lines.push(LEFT, BOLD_OFF);
    lines.push(separator);

    // Info
    if (order.customerName) lines.push(`CLIENTE: ${order.customerName.toUpperCase()}`);
    if (order.customerPhone) lines.push(`FONE: ${order.customerPhone}`);
    if (order.fulfillmentType === 'table' && order.tableNumber) {
      if (format === 'escpos') lines.push(BOLD_ON);
      lines.push(`MESA: ${order.tableNumber}`);
      if (format === 'escpos') lines.push(BOLD_OFF);
    }
    if (type === 'customer' && order.deliveryAddress) {
      const address = order.deliveryAddress;
      lines.push(thinSeparator);
      lines.push('ENTREGA');
      lines.push(`${address.street}, ${address.number}`);
      if (address.complement) lines.push(`${address.complement}`);
      lines.push(`${address.neighborhood} - ${address.city}/${address.state}`);
      if (address.reference) lines.push(`REF: ${address.reference}`);
    }
    if (type === 'customer') {
      const financial = order.operational?.financialSummary;
      lines.push(thinSeparator);
      if (financial?.amountToCollectState) {
        lines.push(`PAGAMENTO: ${financial.paymentLabel.toUpperCase()}`);
        lines.push(`METODO: ${String(order.paymentMethod || 'NAO INFORMADO').toUpperCase()}`);
        if (financial.paymentState === 'PAID' && financial.amountToCollect === 0) {
          lines.push('*** NAO COBRAR DO CLIENTE ***');
          lines.push('VALOR A COBRAR: R$ 0,00');
        } else if (financial.amountToCollectState === 'KNOWN' && typeof financial.amountToCollect === 'number') {
          lines.push(`VALOR A COBRAR: ${financial.amountToCollect.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`);
        } else {
          lines.push('VALOR A COBRAR: NAO INFORMADO');
        }
      } else {
        lines.push(`PAGAMENTO: ${String(order.paymentMethod || 'NAO INFORMADO').toUpperCase()}`);
      }
      if (order.changeFor) {
        lines.push(`TROCO PARA: ${order.changeFor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`);
      }
      if (order.notes) {
        lines.push(`OBS PEDIDO: ${order.notes.toUpperCase()}`);
      }
    }
    lines.push(separator);

    // Items
    lines.push('QTD  DESCRICAO                      ');
    lines.push(thinSeparator);

    for (const item of itemsToPrint) {
      const qtyStr = item.quantity.toString().padEnd(5);
      const nameStr = item.snapshotName.toUpperCase().substring(0, 40);
      
      if (format === 'escpos') lines.push(BOLD_ON);
      lines.push(`${qtyStr}${nameStr}`);
      if (format === 'escpos') lines.push(BOLD_OFF);

      if (item.notes) {
        lines.push(`  >> OBS: ${item.notes.toUpperCase()}`);
      }

      for (const option of this.getKdsOptionItems(item.snapshotCatalogV2Json)) {
        lines.push(`  - ${option.quantity}x ${option.snapshotName.toUpperCase()}`);
      }

      for (const compositionLine of this.getMarketplaceCompositionLines(item.snapshotComposition)) {
        lines.push(`  - ${compositionLine.toUpperCase()}`);
      }
      
      // V3 Options and Combo Slots
      if (item.snapshotCatalogV2Json) {
        const v2 = item.snapshotCatalogV2Json as {
          selections?: Array<{ name: string; qty: number; additionalPrice?: number }>;
          slots?: Array<{ slotName: string; items?: Array<{ name: string; qty: number; additionalPrice?: number }> }>;
        };
        if (v2.selections && Array.isArray(v2.selections)) {
          for (const sel of v2.selections) {
            const extraStr = sel.additionalPrice && sel.additionalPrice > 0 ? ` (+${Number(sel.additionalPrice).toFixed(2)})` : '';
            lines.push(`     + ${sel.name.toUpperCase()} (x${sel.qty})${extraStr}`);
          }
        }
        if (v2.slots && Array.isArray(v2.slots)) {
          for (const slot of v2.slots) {
            if (slot.items && Array.isArray(slot.items)) {
              for (const slotItem of slot.items) {
                const extraStr = slotItem.additionalPrice && slotItem.additionalPrice > 0 ? ` (+${Number(slotItem.additionalPrice).toFixed(2)})` : '';
                lines.push(`     * ${slotItem.name.toUpperCase()} (x${slotItem.qty})${extraStr} [${slot.slotName.toUpperCase()}]`);
              }
            }
          }
        }
      }


    }

    lines.push(separator);

    if (type === 'customer') {
      const subStr = order.itemsSubtotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 }).padStart(10);
      const financial = order.operational?.financialSummary;
      
      lines.push(`SUBTOTAL: ${subStr}`);
      if (order.discountTotal > 0) lines.push(`DESCONTO: ${order.discountTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 }).padStart(10)}`);
      lines.push(thinSeparator);
      
      if (format === 'escpos') lines.push(BOLD_ON, FONT_DOUBLE);
      const customerActuallyPaid = financial?.customerActuallyPaid ?? financial?.customerPaid;
      if (financial?.paymentState === 'PAID' && typeof customerActuallyPaid === 'number') {
        const customerPaid = customerActuallyPaid.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
        lines.push(`TOTAL PAGO PELO CLIENTE: ${customerPaid}`);
      } else if (financial?.paymentState === 'PENDING' && typeof financial.amountToCollect === 'number') {
        const amountToCollect = financial.amountToCollect.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
        lines.push(`TOTAL DO CLIENTE: ${amountToCollect}`);
      } else {
        const total = order.total.toLocaleString('pt-BR', { minimumFractionDigits: 2 }).padStart(10);
        lines.push(`TOTAL INFORMADO: ${total}`);
      }
      if (format === 'escpos') lines.push(FONT_NORMAL, BOLD_OFF);

      lines.push(separator);
      if (format === 'escpos') lines.push(CENTER);
      lines.push(center('Obrigado pela preferencia!'));
    } else {
      if (format === 'escpos') lines.push(CENTER);
      lines.push(center(`--- FIM DO DOCUMENTO ---`));
    }

    if (format === 'escpos') {
      lines.push('\n\n\n\n\n');
      lines.push(CUT);
    } else {
      lines.push('\n\n\n\n\n');
    }

    return lines.join('\n');
  }
}
