// ============================================================
// ORDER DOMAIN TYPES — Phase 4
// ============================================================

import { IsString, IsNotEmpty, IsOptional, IsArray, ValidateNested, IsNumber, IsEmail } from 'class-validator';
import { Type } from 'class-transformer';
import { PaymentMethod } from './enums';

export type OrderStatus =
  | 'pending'
  | 'confirmed'
  | 'preparing'
  | 'ready_for_pickup'
  | 'ready_for_delivery'
  | 'out_for_delivery'
  | 'completed'
  | 'cancelled'
  | 'draft';

export type FulfillmentType = 'delivery' | 'pickup' | 'dine_in' | 'table';

export const FULFILLMENT_TYPE_LABELS: Record<FulfillmentType, string> = {
  delivery: 'Entrega',
  pickup: 'Retirada no Balcão',
  dine_in: 'Salão',
  table: 'Mesa',
};

export function formatFulfillmentTypeLabel(value?: string | null): string {
  switch (value) {
    case 'delivery':
      return FULFILLMENT_TYPE_LABELS.delivery;
    case 'pickup':
      return FULFILLMENT_TYPE_LABELS.pickup;
    case 'dine_in':
      return FULFILLMENT_TYPE_LABELS.dine_in;
    case 'table':
      return FULFILLMENT_TYPE_LABELS.table;
    default:
      return 'Outro';
  }
}

export type OrderLineType = 'product' | 'combo';

export class PaymentInput {
  @IsString() @IsNotEmpty() method!: PaymentMethod;
  @IsNumber() @IsOptional() changeFor?: number | null;
  
  // Online Payment Fields (Mercado Pago / Stripe)
  @IsString() @IsOptional() cardToken?: string;
  @IsString() @IsOptional() paymentMethodId?: string;
  @IsString() @IsOptional() issuerId?: string;
  @IsNumber() @IsOptional() installments?: number;
}

// --- Queue Constants ---
export const ORDERS_QUEUE = 'orders';
export const ORDERS_QUEUE_EVENTS = {
  AUTO_ACCEPT: 'auto-accept',
  PRINT: 'print',
  KDS_SYNC: 'kds-sync',
} as const;

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
  draft: ['confirmed', 'cancelled'],
};

// --- DTOs de Entrada (Checkout) ---

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


export class CreateOrderItemSelectionItemDTO {
  @IsString() @IsNotEmpty() optionItemId!: string;
  @IsNumber() @IsOptional() qty?: number;
}

export class CreateOrderItemSelectionGroupDTO {
  @IsString() @IsNotEmpty() optionGroupId!: string;

  @IsArray()
  @IsNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => CreateOrderItemSelectionItemDTO)
  items!: CreateOrderItemSelectionItemDTO[];
}

export class CreateOrderItemComboSlotSelectionItemDTO {
  @IsString() @IsNotEmpty() productId!: string;
  @IsNumber() @IsOptional() qty?: number;
}

export class CreateOrderItemComboSlotSelectionDTO {
  @IsString() @IsNotEmpty() comboSlotId!: string;

  @IsArray()
  @IsNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => CreateOrderItemComboSlotSelectionItemDTO)
  items!: CreateOrderItemComboSlotSelectionItemDTO[];
}

export class PizzaCompositionFlavorDTO {
  @IsString() @IsNotEmpty() productId!: string;
  @IsNumber() @IsNotEmpty() fraction!: number;
  @IsString() @IsOptional() name?: string;
}

export class PizzaCompositionDTO {
  @IsString() @IsNotEmpty() sizeId!: string;
  @IsString() @IsOptional() sizeName?: string;
  @IsString() @IsOptional() pricingStrategy?: string;
  @IsNumber() @IsOptional() calculatedPrice?: number;
  
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PizzaCompositionFlavorDTO)
  flavors!: PizzaCompositionFlavorDTO[];
}

export class CreateOrderItemDTO {
  @IsString() @IsNotEmpty() lineType!: OrderLineType;
  
  @IsString() @IsOptional() productId?: string;
  @IsString() @IsOptional() comboId?: string; // Legacy field

  @IsNumber() @IsNotEmpty() quantity!: number;
  @IsString() @IsOptional() notes?: string;



  // For Catalog V2 Product Options
  @IsArray()
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => CreateOrderItemSelectionGroupDTO)
  selections?: CreateOrderItemSelectionGroupDTO[];

  // For Pizza Engine
  @IsOptional()
  @ValidateNested()
  @Type(() => PizzaCompositionDTO)
  pizzaComposition?: PizzaCompositionDTO;

  // For Catalog V2 Combo Slots
  @IsArray()
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => CreateOrderItemComboSlotSelectionDTO)
  slots?: CreateOrderItemComboSlotSelectionDTO[];

  @IsString()
  @IsOptional()
  sourceUpsellId?: string;
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

  @IsString() @IsOptional() tableId?: string;

  @IsString() @IsOptional() notes?: string;
  
  @IsString() @IsOptional() couponCode?: string;
  @IsNumber() @IsOptional() useCashbackAmount?: number;

  @ValidateNested()
  @Type(() => PaymentInput)
  @IsNotEmpty()
  payment!: PaymentInput;

  @IsString() @IsOptional() sourceChannel?: string;

  // API Preference
  @IsString() @IsOptional() returnUrl?: string;

  // Agendamento
  @IsString() @IsOptional() scheduledFor?: string;
  @IsString() @IsOptional() timeSlotId?: string;
  @IsNumber() @IsOptional() estimatedDuration?: number;
}

function normalizeIdempotencyValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(normalizeIdempotencyValue);
  }

  if (value !== null && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const normalized: Record<string, unknown> = {};

    for (const key of Object.keys(record).sort()) {
      if (record[key] !== undefined) {
        normalized[key] = normalizeIdempotencyValue(record[key]);
      }
    }

    return normalized;
  }

  return value;
}

/**
 * Produces the cross-runtime canonical request used by the checkout
 * idempotency fingerprint. The key itself is deliberately excluded.
 */
export function canonicalizeOrderSubmission(dto: CreateOrderDTO): string {
  const materialPayload: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(dto)) {
    if (key !== 'idempotencyKey' && value !== undefined) {
      materialPayload[key] = value;
    }
  }

  return JSON.stringify(normalizeIdempotencyValue(materialPayload));
}

export class EditOrderOperationDTO {
  @IsString() @IsNotEmpty() type!: 'add_item' | 'remove_item' | 'update_quantity' | 'update_item_notes' | 'update_order_notes';
  
  @IsOptional()
  @ValidateNested()
  @Type(() => CreateOrderItemDTO)
  payload?: CreateOrderItemDTO; // Para add_item

  @IsString() @IsOptional() orderItemId?: string; // Para remove_item, update_quantity, update_item_notes
  @IsNumber() @IsOptional() quantity?: number; // Para update_quantity
  @IsString() @IsOptional() notes?: string; // Para update_item_notes, update_order_notes
}

export class EditOrderDTO {
  @IsArray()
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => CreateOrderItemDTO)
  items?: CreateOrderItemDTO[]; // Mantido para retrocompatibilidade ou fallback

  @IsArray()
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => EditOrderOperationDTO)
  operations?: EditOrderOperationDTO[];

  @IsString() @IsOptional() reason?: string;
}

export class UpdateOrderNotesDTO {
  @IsString() @IsOptional() notes?: string;
}

// --- DTOs de Saída ---



export interface OrderItemResponseDTO {
  id: string;
  lineType: OrderLineType;
  productId?: string | null;
  comboId?: string | null;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  notes?: string | null;
  snapshotName: string;
  snapshotImage?: string | null;
  snapshotBasePrice: number;
  snapshotExtrasTotal: number;
  snapshotComposition?: string | null;
  snapshotCatalogV2Json?: unknown;
}

export interface OrderTimelineEntryDTO {
  id: string;
  status: OrderStatus;
  note?: string | null;
  createdAt: string;
}

export interface PixPaymentDTO {
  transactionId: string;
  qrCode: string;
  qrCodeBase64: string;
  ticketUrl: string;
  expiresAt: string;
  status?: 'pending' | 'confirmed' | 'failed' | 'expired';
}

export interface PreferencePaymentDTO {
  preferenceId: string;
  initPoint: string;
}

export interface OrderResponseDTO {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  fulfillmentType: FulfillmentType;
  customerName: string;
  customerPhone: string;
  customerEmail?: string | null;
  publicTrackingToken?: string;
  itemsSubtotal: number;
  discountTotal: number;
  deliveryFee: number;
  normalDeliveryFee?: number;
  serviceFee: number;
  total: number;
  sourceChannel: string;
  notes?: string | null;
  items: OrderItemResponseDTO[];
  deliveryAddress?: DeliveryAddressDTO | null;
  tableId?: string | null;
  tableNumber?: string | null;
  table?: { id: string; name: string } | null;
  timeline: OrderTimelineEntryDTO[];

  paymentMethod: PaymentMethod;
  changeFor?: number | null;
  
  customerId?: string | null;
  waiterId?: string | null;
  couponId?: string | null;
  cashbackUsed?: number | null;

  deliveryDriverId?: string | null;
  deliveryDriverName?: string | null;
  deliveryDriverPhone?: string | null;
  deliveryDriverStatus?: string | null;

  pixPayment?: PixPaymentDTO;
  preferencePayment?: PreferencePaymentDTO;

  createdAt: string;
  updatedAt: string;
  // Scheduling
  scheduledFor?: string | null;
  isScheduled?: boolean | null;
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
  paymentMethod: PaymentMethod;
  sourceChannel: string;
  waiterId?: string | null;
  publicTrackingToken?: string | null;
  createdAt: string;
  // Scheduling
  scheduledFor?: string | null;
  isScheduled?: boolean | null;
}

export class UpdateOrderStatusDTO {
  @IsString() @IsNotEmpty() status!: OrderStatus;
  @IsString() @IsOptional() note?: string;
  @IsString() @IsOptional() marketplaceReasonCode?: string;
}

// --- Operation (Phase 5) DTOs ---

export interface OrderBoardItemDTO {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  fulfillmentType: FulfillmentType;
  customerName: string;
  total: number;
  itemsSubtotal: number;
  itemCount: number;
  itemsSummary: string; // Ex: "1x Pizza Calabresa, 2x Coca Cola"
  sourceChannel?: string;
  createdAt: string;
  notes?: string | null;
  deliveryDriverId?: string;
  deliveryDriverName?: string;
  deliveryDriverStatus?: string;
  // Scheduling
  scheduledFor?: string | null;
  isScheduled?: boolean | null;
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
    snapshotCatalogV2Json?: unknown;
  }[]
  createdAt: string;
  scheduledFor?: string | null;
  isScheduled?: boolean | null;
}

export interface OrderDispatchItemDTO {
  id: string;
  orderNumber: string;
  customerName: string;
  fulfillmentType: FulfillmentType;
  status: OrderStatus;
  
  customerPhone?: string;
  deliveryAddress?: DeliveryAddressDTO;
  deliveryLat?: number | null;
  deliveryLng?: number | null;
  
  deliveryDriverId?: string;
  deliveryDriverName?: string;
  deliveryDriverStatus?: string;
  deliveryDriverPhone?: string;
  
  total: number;
  createdAt?: string;
}

export interface ValidatedProductLine {
  lineType: 'product';
  productId: string;
  name: string;
  image: string | null;
  basePrice: number;
  effectiveBasePrice?: number;
  extrasTotal: number;
  unitPrice: number;
  lineTotal: number;
  quantity: number;
  notes?: string;
  composition: string;
  sourceUpsellId?: string | null;
  snapshotCatalogV2Json?: unknown;
}

export interface ValidatedComboLine {
  lineType: 'combo';
  comboId: string;
  name: string;
  image: string | null;
  basePrice: number;
  effectiveBasePrice: number;
  extrasTotal: number;
  unitPrice: number;
  lineTotal: number;
  quantity: number;
  notes?: string;
  composition: string;
  snapshotCatalogV2Json?: unknown;
}

export type ValidatedLine = ValidatedProductLine | ValidatedComboLine;

export interface CheckoutValidationResult {
  tenantId: string;
  lines: ValidatedLine[];
  itemsSubtotal: number;
  discountTotal: number;
  deliveryFee: number;
  normalDeliveryFee?: number;
  estimatedDeliveryMinutes?: number | null;
  resolvedDeliveryCoordinates?: { lat: number; lng: number };
  total: number;
  couponId: string | null;
  cashbackUsed: number | null;
}
