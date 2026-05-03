export type CouponType = 'percentage' | 'fixed';
export interface CouponDTO {
    id: string;
    tenantId: string;
    code: string;
    type: CouponType;
    value: number;
    minOrderValue?: number | null;
    usageLimit?: number | null;
    usedCount: number;
    expiresAt?: string | null;
    isActive: boolean;
    createdAt: string;
    updatedAt: string;
}
export type CashbackTransactionType = 'earned' | 'used' | 'expired' | 'refunded';
export interface CashbackTransactionDTO {
    id: string;
    tenantId: string;
    customerId: string;
    orderId?: string | null;
    type: CashbackTransactionType;
    amount: number;
    description?: string | null;
    createdAt: string;
}
export declare class CreateCouponDTO {
    code: string;
    type: CouponType;
    value: number;
    minOrderValue?: number;
    usageLimit?: number;
    expiresAt?: string;
    isActive?: boolean;
}
export declare class UpdateCouponDTO {
    minOrderValue?: number;
    usageLimit?: number;
    expiresAt?: string;
    isActive?: boolean;
}
//# sourceMappingURL=promotions.d.ts.map