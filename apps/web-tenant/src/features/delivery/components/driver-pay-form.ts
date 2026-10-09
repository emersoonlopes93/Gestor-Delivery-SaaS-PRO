import { DriverPayMode, type DriverPayRateTierDTO, type UpdateDriverDTO } from '@gestor/types';

export interface DriverPayFormValue {
  mode: DriverPayMode;
  dailyRate: number;
  fixedAmount: number;
  percentage: number;
  rateTable: DriverPayRateTierDTO[];
  payFailedAttempt: boolean;
}

export const DEFAULT_DRIVER_PAY_VALUE: DriverPayFormValue = {
  mode: DriverPayMode.FIXED,
  dailyRate: 0,
  fixedAmount: 0,
  percentage: 0,
  rateTable: [{ upToKm: null, amount: 0 }],
  payFailedAttempt: false,
};

export const DRIVER_PAY_MODE_OPTIONS: Array<{ value: DriverPayMode; label: string; helper: string }> = [
  { value: DriverPayMode.NORMAL_DELIVERY_FEE, label: 'Mesma taxa da entrega', helper: 'Repasse ao entregador o valor normal calculado para o pedido.' },
  { value: DriverPayMode.PERCENTAGE_NORMAL_FEE, label: 'Percentual da taxa', helper: 'Calcule o pagamento como uma porcentagem da taxa normal.' },
  { value: DriverPayMode.FIXED, label: 'Valor fixo', helper: 'Pague o mesmo valor por parada concluída.' },
  { value: DriverPayMode.DRIVER_RATE_TABLE, label: 'Tabela própria', helper: 'Use faixas de distância exclusivas para o entregador.' },
];

export function validateDriverPay(value: DriverPayFormValue): string | null {
  if ([value.dailyRate, value.fixedAmount, value.percentage].some((item) => !Number.isFinite(item) || item < 0)) return 'Informe somente valores iguais ou maiores que zero.';
  if (value.percentage > 100) return 'O percentual deve ficar entre 0% e 100%.';
  if (value.mode === DriverPayMode.DRIVER_RATE_TABLE) {
    if (value.rateTable.length === 0) return 'Adicione ao menos uma faixa de distância.';
    if (value.rateTable[value.rateTable.length - 1]?.upToKm !== null) return 'A última faixa deve cobrir as distâncias restantes.';
    for (let index = 0; index < value.rateTable.length; index += 1) {
      const tier = value.rateTable[index];
      if (!Number.isFinite(tier.amount) || tier.amount < 0) return 'Informe valores válidos em todas as faixas.';
      if (tier.upToKm !== null && (!Number.isFinite(tier.upToKm) || tier.upToKm <= 0)) return 'As distâncias das faixas devem ser maiores que zero.';
      const previous = value.rateTable[index - 1]?.upToKm;
      if (tier.upToKm !== null && previous != null && tier.upToKm <= previous) return 'Organize as faixas em ordem crescente de distância.';
      if (tier.upToKm === null && index !== value.rateTable.length - 1) return 'Somente a última faixa pode cobrir as distâncias restantes.';
    }
  }
  return null;
}

function money(value: number, currency: string): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency }).format(value || 0);
}

export function driverPaySummary(value: DriverPayFormValue, currency = 'BRL'): string {
  const mode = DRIVER_PAY_MODE_OPTIONS.find((option) => option.value === value.mode)?.label ?? 'Regra definida';
  if (value.mode === DriverPayMode.FIXED) return `${mode}: ${money(value.fixedAmount, currency)} por entrega`;
  if (value.mode === DriverPayMode.PERCENTAGE_NORMAL_FEE) return `${mode}: ${value.percentage || 0}% da taxa normal`;
  if (value.mode === DriverPayMode.DRIVER_RATE_TABLE) return `${mode}: ${value.rateTable.length} faixa(s) de distância`;
  return `${mode}: repasse integral da taxa normal`;
}

export function driverPayOverridePayload(enabled: boolean, value: DriverPayFormValue): UpdateDriverDTO {
  if (!enabled) return { payOverrideEnabled: false };
  return {
    payOverrideEnabled: true,
    payMode: value.mode,
    dailyRate: value.dailyRate,
    payFixedAmount: value.fixedAmount,
    payPercentage: value.percentage,
    payRateTable: value.rateTable,
    payFailedAttempt: value.payFailedAttempt,
  };
}
