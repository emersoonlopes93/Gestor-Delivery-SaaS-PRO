import { describe, expect, it } from 'vitest';
import { getPosFinishBlocker, type PosFinishBlockerState } from './pos-finish-state';

const ready: PosFinishBlockerState = {
  hasActiveSession: true,
  hasItems: true,
  customerMissingRequiredData: false,
  isDelivery: false,
  deliveryMissingRequiredData: false,
  deliveryFeeCalculated: false,
};

describe('getPosFinishBlocker', () => {
  it('explains the first known blocker without inventing requirements', () => {
    expect(getPosFinishBlocker({ ...ready, hasActiveSession: false })).toBe('Abra o caixa para iniciar vendas no PDV.');
    expect(getPosFinishBlocker({ ...ready, hasItems: false })).toBe('Adicione itens para iniciar a venda.');
    expect(getPosFinishBlocker({ ...ready, customerMissingRequiredData: true })).toBe('Informe nome e telefone para fechar a conta.');
  });

  it('uses delivery-specific guidance only in delivery mode', () => {
    expect(getPosFinishBlocker({ ...ready, isDelivery: true, deliveryMissingRequiredData: true })).toBe('Delivery exige cliente, telefone, rua, número e bairro.');
    expect(getPosFinishBlocker({ ...ready, isDelivery: true })).toBe('Calcule o frete antes de finalizar a venda delivery.');
  });

  it('keeps a generic fallback for existing validations not described by the current state', () => {
    expect(getPosFinishBlocker(ready)).toBe('Complete os dados obrigatórios para continuar.');
  });
});
