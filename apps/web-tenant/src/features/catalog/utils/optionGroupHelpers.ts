import { OptionSelectionType, PriceImpactType } from '@gestor/types';

export function formatCurrency(value?: number | string | null): string {
  const num = Number(value ?? 0);
  if (isNaN(num)) return 'R$ 0,00';
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(num);
}

export function formatUsageCount(count?: number | null): string {
  const c = count ?? 0;
  if (c === 0) return 'Ainda não utilizado';
  if (c === 1) return 'Usado em 1 produto';
  return `Usado em ${c} produtos`;
}

export function formatSelectionType(selectionType?: OptionSelectionType | string | null): string {
  switch (selectionType) {
    case 'single':
      return 'Seleção única';
    case 'multiple':
      return 'Seleção múltipla';
    case 'quantity':
      return 'Permite quantidade';
    default:
      return selectionType ?? 'Seleção';
  }
}

export function formatSelectionRules(params: {
  isRequired?: boolean | null;
  minSelect?: number | null;
  maxSelect?: number | null;
  selectionType?: OptionSelectionType | string | null;
}): string {
  const min = params.minSelect ?? 0;
  const max = params.maxSelect ?? 1;

  if (min === 1 && max === 1) {
    return 'Escolha 1';
  }
  if (min === 0 && max === 1) {
    return 'Escolha até 1';
  }
  if (min === 0 && max > 1) {
    return `Escolha até ${max}`;
  }
  if (min > 0 && max > min) {
    return `Escolha de ${min} a ${max}`;
  }
  if (min > 0 && min === max) {
    return `Escolha ${max}`;
  }
  return `Até ${max} opções`;
}

export function formatPriceImpact(
  priceImpactType?: PriceImpactType | string | null,
  priceImpactValue?: number | string | null,
): string {
  const val = Number(priceImpactValue ?? 0);
  switch (priceImpactType) {
    case 'none':
      return 'Sem alteração';
    case 'fixed':
      return val > 0 ? `+ ${formatCurrency(val)}` : 'Adicional fixo';
    case 'replace':
      return val > 0 ? formatCurrency(val) : 'Substituir preço';
    case 'percentage':
      return val > 0 ? `+ ${val}%` : 'Porcentagem';
    default:
      return 'Sem alteração';
  }
}
