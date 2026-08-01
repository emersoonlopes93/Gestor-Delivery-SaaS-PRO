import { describe, expect, it } from 'vitest';
import {
  canApplyAddressLookup,
  getDeliveryAddressKey,
  mergeAddressAutofill,
  type AddressLookupSnapshot,
} from './address-autofill';

const request: AddressLookupSnapshot = { cep: '01001000', editRevision: 2, requestId: 4 };

describe('progressive address autofill', () => {
  it('accepts the latest response when the address was not edited', () => {
    expect(canApplyAddressLookup(request, { ...request, editedFields: new Set() })).toBe(true);
  });

  it('rejects a late response after a manual edit', () => {
    expect(canApplyAddressLookup(request, {
      ...request,
      editRevision: 3,
      editedFields: new Set(['street']),
    })).toBe(false);
  });

  it('rejects a response for an earlier CEP request', () => {
    expect(canApplyAddressLookup(request, {
      ...request,
      cep: '01310100',
      requestId: 5,
      editedFields: new Set(),
    })).toBe(false);
  });

  it('fills reliable empty fields without touching number or complement', () => {
    expect(mergeAddressAutofill(
      { street: '', neighborhood: '', city: '', state: '' },
      { street: 'Praça da Sé', neighborhood: 'Sé', city: 'São Paulo', state: 'SP' },
      new Set(),
    )).toEqual({ street: 'Praça da Sé', neighborhood: 'Sé', city: 'São Paulo', state: 'SP' });
  });

  it('does not overwrite fields explicitly edited by the customer', () => {
    expect(mergeAddressAutofill(
      { street: 'Rua escolhida', neighborhood: 'Centro', city: '', state: '' },
      { street: 'Praça da Sé', neighborhood: 'Sé', city: 'São Paulo', state: 'SP' },
      new Set(['street', 'neighborhood']),
    )).toEqual({ street: 'Rua escolhida', neighborhood: 'Centro', city: 'São Paulo', state: 'SP' });
  });

  it('changes the coverage key whenever a material address field changes', () => {
    const base = { street: 'Rua A', number: '10', neighborhood: 'Centro', city: 'Cidade', state: 'SP', zipCode: '01001000' };
    expect(getDeliveryAddressKey(base)).not.toBe(getDeliveryAddressKey({ ...base, number: '11' }));
  });
});
