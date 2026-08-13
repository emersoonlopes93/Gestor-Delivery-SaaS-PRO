import { describe, expect, it } from 'vitest';
import { DriverPayMode } from '@gestor/types';
import { DEFAULT_DRIVER_PAY_VALUE, driverPayOverridePayload, validateDriverPay } from './driver-pay-form';

describe('driver pay form validation', () => {
  it('requires the rate table to end with an open distance tier', () => {
    expect(validateDriverPay({
      ...DEFAULT_DRIVER_PAY_VALUE,
      mode: DriverPayMode.DRIVER_RATE_TABLE,
      rateTable: [{ upToKm: 5, amount: 8 }],
    })).toBe('A última faixa deve cobrir as distâncias restantes.');

    expect(validateDriverPay({
      ...DEFAULT_DRIVER_PAY_VALUE,
      mode: DriverPayMode.DRIVER_RATE_TABLE,
      rateTable: [{ upToKm: 5, amount: 8 }, { upToKm: null, amount: 12 }],
    })).toBeNull();
  });

  it('rejects percentages above one hundred', () => {
    expect(validateDriverPay({
      ...DEFAULT_DRIVER_PAY_VALUE,
      mode: DriverPayMode.PERCENTAGE_NORMAL_FEE,
      percentage: 101,
    })).toBe('O percentual deve ficar entre 0% e 100%.');
  });

  it('sends either store inheritance or the complete custom override', () => {
    expect(driverPayOverridePayload(false, DEFAULT_DRIVER_PAY_VALUE)).toEqual({ payOverrideEnabled: false });
    expect(driverPayOverridePayload(true, {
      ...DEFAULT_DRIVER_PAY_VALUE,
      mode: DriverPayMode.PERCENTAGE_NORMAL_FEE,
      dailyRate: 35,
      percentage: 40,
      payFailedAttempt: true,
    })).toEqual(expect.objectContaining({
      payOverrideEnabled: true,
      payMode: DriverPayMode.PERCENTAGE_NORMAL_FEE,
      dailyRate: 35,
      payPercentage: 40,
      payFailedAttempt: true,
    }));
  });
});
