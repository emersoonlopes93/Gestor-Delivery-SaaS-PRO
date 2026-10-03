import { describe, expect, it } from 'vitest';
import { isSupportedSchedulingWindow } from './scheduling-window-validation';

describe('SchedulingSettingsPage window validation', () => {
  it('accepts a same-day window', () => {
    expect(isSupportedSchedulingWindow('08:00', '18:00')).toBe(true);
  });

  it('rejects invalid and cross-midnight windows', () => {
    expect(isSupportedSchedulingWindow('22:00', '02:00')).toBe(false);
    expect(isSupportedSchedulingWindow('25:00', '26:00')).toBe(false);
  });
});
