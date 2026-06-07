import { Injectable } from '@nestjs/common';
import { OrderResponseDTO } from '@gestor/types';

@Injectable()
export class PrinterService {
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

    // Header
    if (type === 'customer') {
      if (format === 'escpos') lines.push(CENTER, FONT_DOUBLE, BOLD_ON);
      lines.push(center('GESTOR DELIVERY SAAS PRO'));
      if (format === 'escpos') lines.push(FONT_NORMAL);
      lines.push(center(`${order.fulfillmentType.toUpperCase()} - ${order.orderNumber}`));
    } else {
      if (format === 'escpos') lines.push(CENTER, BOLD_ON);
      lines.push(center('*** PRODUCAO / KDS ***'));
      lines.push(center(`SETOR: ${station?.toUpperCase() || 'GERAL'}`));
      if (format === 'escpos') lines.push(FONT_DOUBLE);
      lines.push(center(`PEDIDO: #${order.orderNumber}`));
      if (format === 'escpos') lines.push(FONT_NORMAL);
    }
    
    if (format === 'escpos') lines.push(CENTER);
    lines.push(center(new Date(order.createdAt).toLocaleString('pt-BR')));
    if (format === 'escpos') lines.push(LEFT, BOLD_OFF);
    lines.push(separator);

    // Info
    if (order.customerName) lines.push(`CLIENTE: ${order.customerName.toUpperCase()}`);
    if (order.fulfillmentType === 'table' && order.tableNumber) {
      if (format === 'escpos') lines.push(BOLD_ON);
      lines.push(`MESA: ${order.tableNumber}`);
      if (format === 'escpos') lines.push(BOLD_OFF);
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
      
      // V3 Options and Combo Slots
      if (item.snapshotCatalogV2Json) {
        const v2 = item.snapshotCatalogV2Json as any;
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

      // Legacy Complements / Combos (Fallback)
      if (item.complements && item.complements.length > 0) {
        for (const comp of item.complements) {
          lines.push(`     + ${comp.snapshotName.toUpperCase()}`);
        }
      }
      if (item.comboSelections && item.comboSelections.length > 0) {
        for (const comp of item.comboSelections) {
          lines.push(`     * ${comp.snapshotProductName.toUpperCase()} [${comp.snapshotBlockName.toUpperCase()}]`);
        }
      }
    }

    lines.push(separator);

    if (type === 'customer') {
      const subStr = order.itemsSubtotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 }).padStart(10);
      const totalStr = order.total.toLocaleString('pt-BR', { minimumFractionDigits: 2 }).padStart(10);
      
      lines.push(`SUBTOTAL: ${subStr}`);
      if (order.discountTotal > 0) lines.push(`DESCONTO: ${order.discountTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 }).padStart(10)}`);
      lines.push(thinSeparator);
      
      if (format === 'escpos') lines.push(BOLD_ON, FONT_DOUBLE);
      lines.push(`TOTAL PAGO: ${totalStr}`);
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
