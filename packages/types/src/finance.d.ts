import { FinancialAccountType, FinancialTransactionType, FinancialStatus } from './enums';
export interface FinancialAccountDTO {
    id: string;
    tenantId: string;
    name: string;
    type: FinancialAccountType;
    balance: number;
    active: boolean;
    createdAt: Date;
    updatedAt: Date;
}
export interface CreateFinancialAccountDTO {
    name: string;
    type: FinancialAccountType;
    initialBalance?: number;
}
export interface UpdateFinancialAccountDTO {
    name?: string;
    active?: boolean;
}
export interface FinancialTransactionDTO {
    id: string;
    tenantId: string;
    accountId?: string;
    type: FinancialTransactionType;
    category: string;
    amount: number;
    status: FinancialStatus;
    dueDate?: Date;
    paymentDate?: Date;
    description?: string;
    referenceId?: string;
    referenceType?: string;
    createdAt: Date;
    updatedAt: Date;
    accountName?: string;
}
export interface CreateFinancialTransactionDTO {
    accountId?: string;
    type: FinancialTransactionType;
    category: string;
    amount: number;
    status?: FinancialStatus;
    dueDate?: Date;
    paymentDate?: Date;
    description?: string;
    referenceId?: string;
    referenceType?: string;
}
export interface UpdateFinancialTransactionDTO {
    status?: FinancialStatus;
    paymentDate?: Date;
    description?: string;
    amount?: number;
}
//# sourceMappingURL=finance.d.ts.map