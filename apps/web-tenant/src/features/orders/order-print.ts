import { Capacitor } from '@capacitor/core';
import type { OrderResponseDTO } from '@gestor/types';
import { printTicketViaPrimaryBluetooth } from '../../lib/bluetooth';
import { api } from '../../lib/api-client';
import { printThermalText } from '../../lib/thermal-print';
import { formatOrderNumber } from './order-presenters';

export type OrderPrintResult = { order: OrderResponseDTO; target: 'bluetooth' | 'browser' };

/** Canonical customer-receipt request, log and transport shared by order boards. */
export async function printOrderCustomerReceipt(orderId: string): Promise<OrderPrintResult> {
  const [orderResponse, printResponse] = await Promise.all([
    api.get<OrderResponseDTO>(`/orders/${orderId}`),
    api.get<{ content: string }>(`/pos/sales/${orderId}/print?type=customer`),
  ]);
  const order = orderResponse.data;
  if (!order) throw new Error('Pedido não encontrado.');

  await api.post(`/orders/${orderId}/print-log`);
  const content = printResponse.data?.content ?? '';
  if (Capacitor.isNativePlatform() && content.trim()) {
    await printTicketViaPrimaryBluetooth(content);
    return { order, target: 'bluetooth' };
  }

  if (!printThermalText(content, { title: `Pedido ${formatOrderNumber(order.orderNumber)}`, paperWidthMm: 58 })) {
    throw new Error('A janela de impressão foi bloqueada.');
  }
  return { order, target: 'browser' };
}
