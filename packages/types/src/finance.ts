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
  /** Identifica uma tentativa de envio manual. Repetir a mesma chave não cria outro lançamento. */
  idempotencyKey?: string;
}

export interface UpdateFinancialTransactionDTO {
  accountId?: string;
  status?: FinancialStatus;
  paymentDate?: Date;
  description?: string;
  amount?: number;
}

export type MarketplaceSettlementPostingStatus =
  | 'LIQUIDATED_UNPOSTED'
  | 'POSTED'
  | 'RECONCILIATION_DISCREPANCY';

export interface Food99FinancialSyncDTO {
  connectionId: string;
  startDate: string;
  endDate: string;
}

export interface Food99SettlementAccountDTO {
  accountId: string | null;
}

export interface Food99BillEntryDTO {
  id: string;
  orderId: string;
  orderType: 1 | 2 | 3 | 4 | 5 | 8 | 9;
  orderIndex: string | null;
  deliveryType: number | null;
  businessTs: string;
  businessAt: string | null;
  dayPaymentId: string;
  commissionAmountCents: string;
  settlementAmountCents: string;
  orderAmountCents: string;
  shopActivityOutcomeCents: string;
  shopActivitySubsidyCents: string;
  mealLossDeductAmountCents: string | null;
  vatAmountCents: string | null;
  merchantAppealAmountCents: string | null;
  expectSettleDate: string | null;
}

export interface Food99SettlementDTO {
  id: string;
  connectionId: string;
  connectionName: string | null;
  weekPaymentId: string;
  withdrawAmountCents: string;
  withdrawDate: string;
  liability: string | null;
  shopId: string;
  settleStartDate: string;
  settleEndDate: string;
  currency: string;
  payeeCnpj: string | null;
  payerCnpj: string | null;
  cnpjWithdrawAmountCents: string | null;
  cercAmountCents: string | null;
  status: MarketplaceSettlementPostingStatus;
  financialTransactionId: string | null;
  postedAt: string | null;
  dayPaymentIds: string[];
  linkedBillEntryCount: number;
  linkedSettlementAmountCents: string;
  compositionDifferenceCents: string;
  hasCompositionDiscrepancy: boolean;
}

export interface Food99ReconciliationConnectionDTO {
  id: string;
  displayName: string | null;
  appShopId: string | null;
  status: 'CONNECTED' | 'DISCONNECTED' | 'TOKEN_EXPIRED' | 'ERROR' | 'PAUSED';
  settlementFinancialAccountId: string | null;
}

export interface Food99ReconciliationDTO {
  connections: Food99ReconciliationConnectionDTO[];
  settlements: Food99SettlementDTO[];
  billEntries: Food99BillEntryDTO[];
}

export interface Food99FinancialSyncResultDTO {
  billEntriesReceived: number;
  billEntriesCreated: number;
  settlementsReceived: number;
  settlementsCreated: number;
  settlementsUpdated: number;
  discrepanciesDetected: number;
}
