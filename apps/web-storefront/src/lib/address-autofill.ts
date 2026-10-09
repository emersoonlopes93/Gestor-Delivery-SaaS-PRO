export type AddressAutofillField = 'street' | 'neighborhood' | 'city' | 'state';

export type AddressAutofillValues = Record<AddressAutofillField, string>;

export interface AddressLookupSnapshot {
  cep: string;
  editRevision: number;
  requestId: number;
}

export interface CurrentAddressLookupState extends AddressLookupSnapshot {
  editedFields: ReadonlySet<AddressAutofillField>;
}

export function canApplyAddressLookup(
  request: AddressLookupSnapshot,
  current: CurrentAddressLookupState,
): boolean {
  return request.requestId === current.requestId
    && request.cep === current.cep
    && request.editRevision === current.editRevision;
}

export function mergeAddressAutofill(
  current: AddressAutofillValues,
  incoming: Partial<AddressAutofillValues>,
  editedFields: ReadonlySet<AddressAutofillField>,
): AddressAutofillValues {
  const next = { ...current };
  for (const field of Object.keys(next) as AddressAutofillField[]) {
    const value = incoming[field]?.trim();
    if (value && !editedFields.has(field)) next[field] = value;
  }
  return next;
}

export function getDeliveryAddressKey(values: {
  street: string;
  number: string;
  neighborhood: string;
  city: string;
  state: string;
  zipCode: string;
  lat?: number;
  lng?: number;
}): string {
  return [
    values.street,
    values.number,
    values.neighborhood,
    values.city,
    values.state,
    values.zipCode.replace(/\D/g, ''),
    values.lat ?? '',
    values.lng ?? '',
  ].map((value) => String(value).trim().toLocaleLowerCase('pt-BR')).join('|');
}
