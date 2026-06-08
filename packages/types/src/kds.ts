import { OrderResponseDTO } from './order';

export enum PrintJobStatus {
  pending = 'pending',
  printing = 'printing',
  completed = 'completed',
  failed = 'failed'
}

export enum PrintType {
  kitchen = 'kitchen',
  customer = 'customer',
  summary = 'summary'
}

export interface PrintJobDTO {
  id: string;
  tenantId: string;
  orderId: string;
  station: string;
  type: PrintType;
  content: string;
  status: PrintJobStatus;
  tries: number;
  lastTriedAt?: Date | string | null;
  printedAt?: Date | string | null;
  createdAt: Date | string;
}

export interface KdsPrintJobDTO extends PrintJobDTO {
  order: OrderResponseDTO;
}

export interface KdsStationDTO {
  id: string;
  name: string;
  description?: string;
  isActive: boolean;
}

export interface KdsOrderItemDTO {
  id: string;
  productId?: string | null;
  quantity: number;
  notes?: string | null;
  snapshotName: string;
  snapshotComposition?: string | null;
  snapshotCatalogV2Json?: unknown;
}

export interface KdsOrderDTO {
  id: string;
  orderNumber: string;
  status: string;
  fulfillmentType: string;
  customerName: string;
  notes?: string | null;
  items: KdsOrderItemDTO[];
  createdAt: string | Date;
}

export interface KdsOrderUpdatedEvent {
  tenantId: string;
  orderId: string;
  status: string;
  updatedAt: string;
}

export interface KdsStatusUpdatedEvent {
  tenantId: string;
  orderId: string;
  status: string;
  updatedAt: string;
}
