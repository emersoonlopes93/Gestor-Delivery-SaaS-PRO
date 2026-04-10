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
import { IsString, IsNotEmpty, IsOptional, IsArray, ValidateNested, IsNumber, IsEnum, IsEmail } from 'class-validator';
import { Type } from 'class-transformer';

export class DeliveryAddressDTO {
  @IsString() @IsNotEmpty() street!: string;
  @IsString() @IsNotEmpty() number!: string;
  @IsString() @IsOptional() complement?: string;
  @IsString() @IsNotEmpty() neighborhood!: string;
  @IsString() @IsNotEmpty() city!: string;
  @IsString() @IsNotEmpty() state!: string;
  @IsString() @IsNotEmpty() zipCode!: string;
  @IsString() @IsOptional() reference?: string;
  @IsNumber() @IsOptional() lat?: number;
  @IsNumber() @IsOptional() lng?: number;
}

export class CreateOrderItemComplementDTO {
  @IsString() @IsNotEmpty() groupId!: string;
  @IsString() @IsNotEmpty() itemId!: string;
}

export class CreateOrderItemComboSelectionDTO {
  @IsString() @IsNotEmpty() blockId!: string;
  @IsString() @IsNotEmpty() blockItemId!: string;
}

export class CreateOrderItemDTO {
  @IsString() @IsNotEmpty() lineType!: OrderLineType;
  @IsString() @IsOptional() productId?: string;
  @IsString() @IsOptional() comboId?: string;
  @IsNumber() @IsNotEmpty() quantity!: number;
  @IsString() @IsOptional() notes?: string;
  
  @IsArray()
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => CreateOrderItemComplementDTO)
  complements?: CreateOrderItemComplementDTO[];

  @IsArray()
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => CreateOrderItemComboSelectionDTO)
  comboSelections?: CreateOrderItemComboSelectionDTO[];
}

export class CreateOrderDTO {
  @IsString() @IsNotEmpty() idempotencyKey!: string;

  @IsArray()
  @IsNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => CreateOrderItemDTO)
  items!: CreateOrderItemDTO[];

  @IsString() @IsNotEmpty() customerName!: string;
  @IsString() @IsNotEmpty() customerPhone!: string;
  
  @IsEmail()
  @IsOptional()
  customerEmail?: string;

  @IsString() @IsNotEmpty() fulfillmentType!: FulfillmentType;

  @IsOptional()
  @ValidateNested()
  @Type(() => DeliveryAddressDTO)
  deliveryAddress?: DeliveryAddressDTO;

  @IsString() @IsOptional() notes?: string;
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

// --- Operation (Phase 5) DTOs ---

export interface OrderBoardItemDTO {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  fulfillmentType: FulfillmentType;
  customerName: string;
  total: number;
  itemCount: number;
  itemsSummary: string; // Ex: "1x Pizza Calabresa, 2x Coca Cola"
  createdAt: string;
}

export interface OrderKdsItemDTO {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  fulfillmentType: FulfillmentType;
  notes?: string | null;
  items: {
    id: string;
    quantity: number;
    notes?: string | null;
    snapshotName: string;
    snapshotComposition?: string | null;
    complements: {
      id: string;
      snapshotName: string;
    }[];
    comboSelections: {
      id: string;
      snapshotBlockName: string;
      snapshotProductName: string;
    }[];
  }[]
  createdAt: string;
}

export interface OrderDispatchItemDTO {
  id: string;
  orderNumber: string;
  customerName: string;
  fulfillmentType: FulfillmentType;
  status: OrderStatus;
  
  customerPhone?: string;
  deliveryAddress?: DeliveryAddressDTO;
  
  deliveryDriverId?: string;
  deliveryDriverName?: string;
  
  total: number;
  createdAt?: string;
}
