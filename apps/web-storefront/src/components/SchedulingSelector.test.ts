import { describe, expect, it } from 'vitest';
import { dateInTimezone } from './scheduling-date';

describe('SchedulingSelector timezone dates', () => {
  it('uses the store timezone instead of the browser/UTC date', () => {
    const instant = new Date('2026-07-20T02:30:00.000Z');

    expect(dateInTimezone('America/Sao_Paulo', instant)).toBe('2026-07-19');
    expect(dateInTimezone('UTC', instant)).toBe('2026-07-20');
  });
});
