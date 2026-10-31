import { DriverSettlementMethod, type DriverSettlementShiftDTO } from '@gestor/types';

export function settlementMethodLabel(method: DriverSettlementMethod): string {
  return {
    [DriverSettlementMethod.PIX]: 'PIX',
    [DriverSettlementMethod.CASH]: 'Dinheiro',
    [DriverSettlementMethod.BANK_TRANSFER]: 'Transferência bancária',
    [DriverSettlementMethod.OTHER]: 'Outro',
  }[method];
}

export function selectedSettlementTotal(shifts: DriverSettlementShiftDTO[], selectedIds: ReadonlySet<string>): number {
  return shifts.reduce((total, shift) => total + (selectedIds.has(shift.shiftId) ? shift.amountDue : 0), 0);
}

export function settlementAttemptKey(driverId: string, currentKey: string | null, createUuid: () => string): string {
  return currentKey ?? `driver-settlement:${driverId}:${createUuid()}`;
}

export function shouldBlockSettlementSubmit(isSubmitting: boolean, isMutationPending: boolean, selectedCount: number): boolean {
  return isSubmitting || isMutationPending || selectedCount === 0;
}
