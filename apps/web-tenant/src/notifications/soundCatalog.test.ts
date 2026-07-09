import { describe, expect, it } from 'vitest';
import { SOUND_CATALOG } from './soundCatalog';

describe('soundCatalog', () => {
  it('contains the required MVP events', () => {
    expect(SOUND_CATALOG).toMatchObject({
      'order.new': expect.any(Object),
      'order.cancelled': expect.any(Object),
      'order.accepted': expect.any(Object),
      'order.auto_accepted': expect.any(Object),
      'order.kds_ready': expect.any(Object),
      'order.out_for_delivery': expect.any(Object),
      'store.closed': expect.any(Object),
      'store.opened': expect.any(Object),
      'connection.lost': expect.any(Object),
      'connection.restored': expect.any(Object),
      'error.critical': expect.any(Object),
      'whatsapp.handoff': expect.any(Object),
    });
  });

  it('uses generated sound patterns instead of legacy audio assets', () => {
    expect(SOUND_CATALOG['order.new'].pattern.steps.length).toBeGreaterThan(0);
    expect(SOUND_CATALOG['connection.lost'].pattern.steps.some((step) => step.noise)).toBe(true);
    expect(SOUND_CATALOG['order.auto_accepted'].pattern.steps.every((step) => typeof step.durationMs === 'number')).toBe(true);
  });
});
