import { PaymentMethod, OrderSplitStatus } from './enums';

export interface OrderSplitDTO {
  id: string;
  tenantId: string;
  orderId: string;
  splitType: 'items' | 'people' | 'custom';
  description?: string;
  subtotalAmount: number;
  discountAmount: number;
  serviceFeeAmount: number;
  deliveryFeeAmount: number;
  totalAmount: number;
  status: OrderSplitStatus;
  responsiblePerson?: string;
  responsiblePhone?: string;
  notes?: string;
  confirmedAt?: Date;
  cancelledAt?: Date;
  createdAt: Date;
  updatedAt: Date;
  payments?: SplitPaymentDTO[];
}

export interface SplitPaymentDTO {
  id: string;
  tenantId: string;
  orderSplitId: string;
  paymentMethod: PaymentMethod;
  amount: number;
  changeFor?: number;
  isPaid: boolean;
  paidAt?: Date;
  notes?: string;
  paymentTxId?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateOrderSplitDTO {
  orderId: string;
  splitType: 'items' | 'people' | 'custom';
  description?: string;
  subtotalAmount: number;
  discountAmount?: number;
  serviceFeeAmount?: number;
  deliveryFeeAmount?: number;
  totalAmount: number;
  responsiblePerson?: string;
  responsiblePhone?: string;
  notes?: string;
}

export interface AddPaymentToSplitDTO {
  orderSplitId: string;
  paymentMethod: PaymentMethod;
  amount: number;
  changeFor?: number;
  notes?: string;
}

export interface SplitByItemsDTO {
  orderId: string;
  items: Array<{
    orderItemId: string;
    quantity: number;
  }>;
}

export interface SplitByPeopleDTO {
  orderId: string;
  numberOfPeople: number;
}
