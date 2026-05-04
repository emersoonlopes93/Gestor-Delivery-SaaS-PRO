export interface CustomerDTO {
    id: string;
    tenantId: string;
    name: string;
    phone: string;
    email?: string | null;
    notes?: string | null;
    totalOrders: number;
    totalSpent: number;
    lastOrderDate?: string | null;
    loyaltyPoints: number;
    cashbackBalance: number;
    createdAt: string;
    updatedAt: string;
}
export type CustomerListItemDTO = Omit<CustomerDTO, 'notes'>;
export declare class UpdateCustomerDTO {
    name?: string;
    email?: string;
    notes?: string;
}
