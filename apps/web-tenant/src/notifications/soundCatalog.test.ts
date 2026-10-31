import { describe, expect, it } from 'vitest';
import { NOTIFICATION_CANONICAL_EVENTS } from '../../../../packages/types/src/notifications';
import { SOUND_CATALOG } from './soundCatalog';

describe('soundCatalog', () => {
  it('contains every canonical notification event', () => {
    expect(Object.keys(SOUND_CATALOG).sort()).toEqual([...NOTIFICATION_CANONICAL_EVENTS].sort());
  });

  it('uses an audible generated order chime and keeps connectivity silent', () => {
    const orderDuration = SOUND_CATALOG['order.created'].pattern.steps
      .reduce((total, step) => total + step.durationMs, 0);
    expect(orderDuration).toBeGreaterThanOrEqual(1_000);
    expect(SOUND_CATALOG['connection.lost'].silent).toBe(true);
    expect(SOUND_CATALOG['connection.restored'].silent).toBe(true);
    expect(SOUND_CATALOG['connection.lost'].pattern.steps).toHaveLength(0);
    expect(SOUND_CATALOG['order.auto_accepted'].pattern.steps.every((step) => typeof step.durationMs === 'number')).toBe(true);
  });
});
