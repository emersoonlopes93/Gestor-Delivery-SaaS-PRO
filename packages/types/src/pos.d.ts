import { CreateOrderItemDTO } from './order';
import { PaymentMethod } from './enums';
export declare enum PosFulfillmentType {
    DINE_IN = "dine_in",
    PICKUP = "pickup",
    DELIVERY = "delivery",
    TABLE = "table"
}
export declare class CreatePosOrderDTO {
    idempotencyKey: string;
    items: CreateOrderItemDTO[];
    customerName?: string;
    customerPhone?: string;
    fulfillmentType: PosFulfillmentType;
    tableNumber?: string;
    paymentMethod?: PaymentMethod;
    discountTotal?: number;
    notes?: string;
    couponCode?: string;
    useCashbackAmount?: number;
    deliveryFee?: number;
    deliveryAddress?: {
        street: string;
        number: string;
        neighborhood: string;
        complement?: string;
        reference?: string;
        zipCode?: string;
        city?: string;
        state?: string;
    };
    waiterId?: string;
}
export interface PosOrderListItemDTO {
    id: string;
    orderNumber: string;
    status: string;
    fulfillmentType: string;
    customerName: string;
    paymentMethod: string;
    total: number;
    discountTotal: number;
    sourceChannel: string;
    createdAt: string;
}
