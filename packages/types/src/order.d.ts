import { PaymentMethod } from './enums';
export type OrderStatus = 'pending' | 'confirmed' | 'preparing' | 'ready_for_pickup' | 'ready_for_delivery' | 'out_for_delivery' | 'completed' | 'cancelled' | 'draft';
export type FulfillmentType = 'delivery' | 'pickup' | 'dine_in' | 'table';
export type OrderLineType = 'product' | 'combo';
export declare class PaymentInput {
    method: PaymentMethod;
    changeFor?: number | null;
    cardToken?: string;
    paymentMethodId?: string;
    issuerId?: string;
    installments?: number;
}
export declare const ORDER_STATUS_TRANSITIONS: Record<OrderStatus, OrderStatus[]>;
export declare class DeliveryAddressDTO {
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
export declare class CreateOrderItemComplementDTO {
    groupId: string;
    itemId: string;
}
export declare class CreateOrderItemComboSelectionDTO {
    blockId: string;
    blockItemId: string;
}
export declare class CreateOrderItemSelectionItemDTO {
    optionItemId: string;
    qty?: number;
}
export declare class CreateOrderItemSelectionGroupDTO {
    optionGroupId: string;
    items: CreateOrderItemSelectionItemDTO[];
}
export declare class CreateOrderItemComboSlotSelectionItemDTO {
    productId: string;
    qty?: number;
}
export declare class CreateOrderItemComboSlotSelectionDTO {
    comboSlotId: string;
    items: CreateOrderItemComboSlotSelectionItemDTO[];
}
export declare class PizzaCompositionFlavorDTO {
    productId: string;
    fraction: number;
}
export declare class PizzaCompositionDTO {
    sizeId: string;
    flavors: PizzaCompositionFlavorDTO[];
}
export declare class CreateOrderItemDTO {
    lineType: OrderLineType;
    productId?: string;
    comboId?: string;
    quantity: number;
    notes?: string;
    complements?: CreateOrderItemComplementDTO[];
    comboSelections?: CreateOrderItemComboSelectionDTO[];
    selections?: CreateOrderItemSelectionGroupDTO[];
    pizzaComposition?: PizzaCompositionDTO;
    slots?: CreateOrderItemComboSlotSelectionDTO[];
    sourceUpsellId?: string;
}
export declare class CreateOrderDTO {
    idempotencyKey: string;
    items: CreateOrderItemDTO[];
    customerName: string;
    customerPhone: string;
    customerEmail?: string;
    fulfillmentType: FulfillmentType;
    deliveryAddress?: DeliveryAddressDTO;
    tableId?: string;
    notes?: string;
    couponCode?: string;
    useCashbackAmount?: number;
    payment: PaymentInput;
    returnUrl?: string;
    scheduledFor?: string;
    timeSlotId?: string;
    estimatedDuration?: number;
}
export interface OrderItemComplementResponseDTO {
    id: string;
    complementItemId: string;
    snapshotName: string;
    snapshotPrice: number;
}
export interface OrderItemComboSelectionResponseDTO {
    id: string;
    comboBlockItemId: string;
    productId?: string;
    snapshotBlockName: string;
    snapshotProductName: string;
    snapshotAdditionalPrice: number;
}
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
    complements: OrderItemComplementResponseDTO[];
    comboSelections: OrderItemComboSelectionResponseDTO[];
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
    serviceFee: number;
    total: number;
    sourceChannel: string;
    notes?: string | null;
    items: OrderItemResponseDTO[];
    deliveryAddress?: DeliveryAddressDTO | null;
    tableNumber?: string | null;
    timeline: OrderTimelineEntryDTO[];
    paymentMethod: PaymentMethod;
    changeFor?: number | null;
    customerId?: string | null;
    waiterId?: string | null;
    couponId?: string | null;
    cashbackUsed?: number | null;
    pixPayment?: PixPaymentDTO;
    preferencePayment?: PreferencePaymentDTO;
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
    paymentMethod: PaymentMethod;
    waiterId?: string | null;
    createdAt: string;
}
export interface UpdateOrderStatusDTO {
    status: OrderStatus;
    note?: string;
}
export interface OrderBoardItemDTO {
    id: string;
    orderNumber: string;
    status: OrderStatus;
    fulfillmentType: FulfillmentType;
    customerName: string;
    total: number;
    itemCount: number;
    itemsSummary: string;
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
    }[];
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
    deliveryLat?: number | null;
    deliveryLng?: number | null;
    deliveryDriverId?: string;
    deliveryDriverName?: string;
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
    complements: Array<{
        complementItemId: string;
        snapshotName: string;
        snapshotPrice: number;
    }>;
    snapshotCatalogV2Json?: any;
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
    comboSelections: Array<{
        comboBlockItemId: string;
        snapshotBlockName: string;
        snapshotProductName: string;
        snapshotAdditionalPrice: number;
    }>;
    snapshotCatalogV2Json?: any;
}
export type ValidatedLine = ValidatedProductLine | ValidatedComboLine;
export interface CheckoutValidationResult {
    tenantId: string;
    lines: ValidatedLine[];
    itemsSubtotal: number;
    discountTotal: number;
    deliveryFee: number;
    total: number;
    couponId: string | null;
    cashbackUsed: number | null;
}
//# sourceMappingURL=order.d.ts.map