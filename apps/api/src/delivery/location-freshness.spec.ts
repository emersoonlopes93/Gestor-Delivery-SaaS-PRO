import { getLocationFreshness } from '@gestor/types';

describe('getLocationFreshness', () => {
  const now = new Date('2026-08-12T12:02:00.000Z');

  it('distinguishes fresh, stale and unavailable positions', () => {
    expect(getLocationFreshness('2026-08-12T12:01:45.000Z', now).status).toBe('fresh');
    expect(getLocationFreshness('2026-08-12T11:59:00.000Z', now).status).toBe('stale');
    expect(getLocationFreshness(null, now)).toEqual(expect.objectContaining({
      status: 'unavailable', ageSeconds: null,
    }));
  });
});
