import { Injectable } from '@nestjs/common';
import { OrderResponseDTO } from '@gestor/types';

@Injectable()
export class PrinterService {
  /**
   * Generates a TXT string formatted for 80mm thermal printers.
   */
  async formatTicket(
    order: OrderResponseDTO, 
    type: 'customer' | 'kitchen' = 'customer',
    station?: string
  ): Promise<string> {
    const lines: string[] = [];
    const width = 48;

    const center = (text: string) => {
      const padding = Math.max(0, Math.floor((width - text.length) / 2));
      return ' '.repeat(padding) + text;
    };

    const separator = '='.repeat(width);
    const thinSeparator = '-'.repeat(width);

    // Filter items if station is provided (only for kitchen)
    const itemsToPrint = order.items;
    if (type === 'kitchen' && station) {
      // Note: This assumes items have a 'categoryName' property or similar in OrderResponseDTO
      // If not available, we'll need to pass filtered items directly or enhance the DTO
      // For now, we'll allow passing filtered items or just use all if no station filter logic is here
      // Better: The caller should pass the station items
    }

    // Header
    if (type === 'customer') {
      lines.push(center('GESTOR DELIVERY SAAS PRO'));
      lines.push(center(`${order.fulfillmentType.toUpperCase()} - ${order.orderNumber}`));
    } else {
      lines.push(center('*** PRODUCAO / KDS ***'));
      lines.push(center(`SETOR: ${station?.toUpperCase() || 'GERAL'}`));
      lines.push(center(`PEDIDO: #${order.orderNumber}`));
    }
    
    lines.push(center(new Date(order.createdAt).toLocaleString('pt-BR')));
    lines.push(separator);

    // Info
    if (order.customerName) lines.push(`CLIENTE: ${order.customerName.toUpperCase()}`);
    if (order.fulfillmentType === 'table' && order.tableNumber) {
      lines.push(`MESA: ${order.tableNumber}`);
    }
    lines.push(separator);

    // Items
    lines.push('QTD  DESCRICAO                      ');
    lines.push(thinSeparator);

    for (const item of itemsToPrint) {
      const qtyStr = item.quantity.toString().padEnd(5);
      // More space for name in kitchen tickets
      const nameStr = item.snapshotName.toUpperCase().substring(0, 40);
      
      lines.push(`${qtyStr}${nameStr}`);
      if (item.notes) {
        lines.push(`  >> OBS: ${item.notes.toUpperCase()}`);
      }
      
      // Complements
      if ((item as any).complements?.length > 0) {
        for (const comp of (item as any).complements) {
          lines.push(`     + ${comp.snapshotName.toUpperCase()}`);
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
      lines.push(`TOTAL PAGO: ${totalStr}`);
      lines.push(separator);
      lines.push(center('Obrigado pela preferencia!'));
    } else {
      lines.push(center(`--- FIM DO DOCUMENTO ---`));
    }

    lines.push('\n\n\n\n\n');
    return lines.join('\n');
  }
}
