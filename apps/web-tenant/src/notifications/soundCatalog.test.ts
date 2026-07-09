import { describe, expect, it } from 'vitest';
import { NOTIFICATION_CANONICAL_EVENTS } from '../../../../packages/types/src/notifications';
import { SOUND_CATALOG } from './soundCatalog';

describe('soundCatalog', () => {
  it('contains every canonical notification event', () => {
    expect(Object.keys(SOUND_CATALOG).sort()).toEqual([...NOTIFICATION_CANONICAL_EVENTS].sort());
  });

  it('uses generated sound patterns instead of legacy audio assets', () => {
    expect(SOUND_CATALOG['order.created'].pattern.steps.length).toBeGreaterThan(0);
    expect(SOUND_CATALOG['connection.lost'].pattern.steps.some((step) => step.noise)).toBe(true);
    expect(SOUND_CATALOG['order.auto_accepted'].pattern.steps.every((step) => typeof step.durationMs === 'number')).toBe(true);
  });
});
