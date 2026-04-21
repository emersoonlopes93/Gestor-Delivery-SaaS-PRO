import { Injectable } from '@nestjs/common';
import { OrderResponseDTO } from '@gestor/types';

@Injectable()
export class PrinterService {
  /**
   * Generates a TXT string formatted for 80mm thermal printers.
   */
  async formatTicket(order: OrderResponseDTO, type: 'customer' | 'kitchen' = 'customer'): Promise<string> {
    const lines: string[] = [];
    const width = 48; // Standard 80mm chars

    const center = (text: string) => {
      const padding = Math.max(0, Math.floor((width - text.length) / 2));
      return ' '.repeat(padding) + text;
    };

    const separator = '='.repeat(width);
    const thinSeparator = '-'.repeat(width);

    // Header
    if (type === 'customer') {
      lines.push(center('GESTOR DELIVERY SAAS PRO'));
      lines.push(center(`${order.fulfillmentType.toUpperCase()} - ${order.orderNumber}`));
    } else {
      lines.push(center('*** PRODUCAO / COZINHA ***'));
      lines.push(center(`PEDIDO: ${order.orderNumber}`));
    }
    
    lines.push(center(new Date(order.createdAt).toLocaleString('pt-BR')));
    lines.push(separator);

    // Info
    if (order.customerName) lines.push(`CLIENTE: ${order.customerName}`);
    if (order.fulfillmentType === 'table') lines.push(`MESA: ${order.orderNumber}`); // We should use tableNumber if available, but for now we follow the structure
    lines.push(separator);

    // Items
    lines.push('QTD  DESCRICAO                      TOTAL');
    lines.push(thinSeparator);

    for (const item of order.items) {
      const qtyStr = item.quantity.toString().padEnd(5);
      const nameStr = item.snapshotName.substring(0, 25).padEnd(26);
      const totalStr = (item.lineTotal).toLocaleString('pt-BR', { minimumFractionDigits: 2 }).padStart(10);
      
      lines.push(`${qtyStr}${nameStr}${type === 'customer' ? totalStr : ''}`);
      if (item.notes) lines.push(`  OBS: ${item.notes}`);
    }

    lines.push(separator);

    // Footer for Customer
    if (type === 'customer') {
      const subStr = order.itemsSubtotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 }).padStart(10);
      const totalStr = order.total.toLocaleString('pt-BR', { minimumFractionDigits: 2 }).padStart(10);
      
      lines.push(`SUBTOTAL: ${subStr}`);
      if (order.discountTotal > 0) lines.push(`DESCONTO: ${order.discountTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 }).padStart(10)}`);
      lines.push(thinSeparator);
      lines.push(`TOTAL PAGO: ${totalStr}`);
      lines.push(separator);
      lines.push(center('Obrigado pela preferencia!'));
    } else {
      lines.push(center('--- FIM DO PEDIDO ---'));
    }

    // Cut command simulation (ESC/POS)
    lines.push('\n\n\n\n\n');

    return lines.join('\n');
  }
}
