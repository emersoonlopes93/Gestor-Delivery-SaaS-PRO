import { food99OrderStatus } from './food99-order-status';

describe('food99OrderStatus', () => {
  it.each([[100, 'CREATED'], [200, 'CONFIRMED'], [400, 'DISPATCHED'], [500, 'COURIER_AT_CUSTOMER'], [600, 'COMPLETED'], [901, 'CANCELLED']] as const)('normalizes documented native code %s', (code, expected) => {
    expect(food99OrderStatus(code)).toBe(expected);
  });

  it('fails closed for an undocumented numeric code', () => {
    expect(food99OrderStatus(777)).toBeNull();
  });
});
