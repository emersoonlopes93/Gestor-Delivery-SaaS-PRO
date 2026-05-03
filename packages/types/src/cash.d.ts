import { CashSessionStatus, CashMovementType } from './enums';
export declare class OpenCashSessionDTO {
    openingAmount: number;
}
export declare class CloseCashSessionDTO {
    closingAmountDeclared: number;
    notes?: string;
}
export declare class CreateCashMovementDTO {
    type: CashMovementType;
    amount: number;
    description?: string;
}
export interface CashMovementDTO {
    id: string;
    type: CashMovementType;
    amount: number;
    paymentMethod?: string | null;
    orderId?: string | null;
    orderNumber?: string | null;
    description?: string | null;
    createdAt: string;
}
export interface CashSessionDTO {
    id: string;
    tenantId: string;
    operatorId: string;
    operatorName: string;
    status: CashSessionStatus;
    openingAmount: number;
    openedAt: string;
    closedAt?: string | null;
    closingAmountDeclared?: number | null;
    closingAmountCalculated?: number | null;
    closingDifference?: number | null;
    notes?: string | null;
}
export interface CashSessionDetailDTO extends CashSessionDTO {
    movements: CashMovementDTO[];
    totalSales: number;
    totalWithdrawals: number;
    totalSupplies: number;
    totalRefunds: number;
}
//# sourceMappingURL=cash.d.ts.map