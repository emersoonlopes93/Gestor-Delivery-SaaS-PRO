// ============================================================
// ORDER DOMAIN TYPES — Phase 4
// ============================================================

// --- Enums (mirroring Prisma) ---

export type OrderStatus =
  | 'pending'
  | 'confirmed'
  | 'preparing'
  | 'ready_for_pickup'
  | 'ready_for_delivery'
  | 'out_for_delivery'
  | 'completed'
  | 'cancelled';

export type FulfillmentType = 'delivery' | 'pickup';

export type OrderLineType = 'product' | 'combo';

// --- Valid status transitions ---

export const ORDER_STATUS_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  pending: ['confirmed', 'cancelled'],
  confirmed: ['preparing', 'cancelled'],
  preparing: ['ready_for_pickup', 'ready_for_delivery', 'cancelled'],
  ready_for_pickup: ['completed'],
  ready_for_delivery: ['out_for_delivery'],
  out_for_delivery: ['completed'],
  completed: [],
  cancelled: [],
};

// --- DTOs de Entrada (Checkout) ---

export interface DeliveryAddressDTO {
  street: string;
  number: string;
  complement?: string;
  neighborhood: string;
  city: string;
  state: string;
  zipCode: string;
  reference?: string;
  lat?: number;
  lng?: number;
}

export interface CreateOrderItemComplementDTO {
  groupId: string;
  itemId: string;
}

export interface CreateOrderItemComboSelectionDTO {
  blockId: string;
  blockItemId: string;
}

export interface CreateOrderItemDTO {
  lineType: OrderLineType;
  productId?: string;
  comboId?: string;
  quantity: number;
  notes?: string;
  complements?: CreateOrderItemComplementDTO[];
  comboSelections?: CreateOrderItemComboSelectionDTO[];
}

export interface CreateOrderDTO {
  idempotencyKey: string;
  items: CreateOrderItemDTO[];
  customerName: string;
  customerPhone: string;
  customerEmail?: string;
  fulfillmentType: FulfillmentType;
  deliveryAddress?: DeliveryAddressDTO;
  notes?: string;
}

// --- DTOs de Saída ---

export interface OrderItemComplementResponseDTO {
  id: string;
  snapshotName: string;
  snapshotPrice: number;
}

export interface OrderItemComboSelectionResponseDTO {
  id: string;
  snapshotBlockName: string;
  snapshotProductName: string;
  snapshotAdditionalPrice: number;
}

export interface OrderItemResponseDTO {
  id: string;
  lineType: OrderLineType;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  notes?: string | null;
  snapshotName: string;
  snapshotImage?: string | null;
  snapshotBasePrice: number;
  snapshotExtrasTotal: number;
  snapshotComposition?: string | null;
  complements: OrderItemComplementResponseDTO[];
  comboSelections: OrderItemComboSelectionResponseDTO[];
}

export interface OrderTimelineEntryDTO {
  id: string;
  status: OrderStatus;
  note?: string | null;
  createdAt: string;
}

export interface OrderResponseDTO {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  fulfillmentType: FulfillmentType;
  customerName: string;
  customerPhone: string;
  customerEmail?: string | null;
  itemsSubtotal: number;
  discountTotal: number;
  deliveryFee: number;
  serviceFee: number;
  total: number;
  sourceChannel: string;
  notes?: string | null;
  items: OrderItemResponseDTO[];
  deliveryAddress?: DeliveryAddressDTO | null;
  timeline: OrderTimelineEntryDTO[];
  createdAt: string;
  updatedAt: string;
}

export interface OrderListItemDTO {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  fulfillmentType: FulfillmentType;
  customerName: string;
  customerPhone: string;
  total: number;
  itemCount: number;
  createdAt: string;
}

export interface UpdateOrderStatusDTO {
  status: OrderStatus;
  note?: string;
}
