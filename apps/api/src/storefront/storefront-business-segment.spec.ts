import { normalizeBusinessSegmentForStorefront } from './storefront-business-segment';

describe('normalizeBusinessSegmentForStorefront', () => {
  it('normalizes existing null values to OTHER for the visual payload', () => {
    expect(normalizeBusinessSegmentForStorefront(null)).toBe('OTHER');
    expect(normalizeBusinessSegmentForStorefront(undefined)).toBe('OTHER');
  });

  it('preserves a persisted canonical segment', () => {
    expect(normalizeBusinessSegmentForStorefront('PIZZARIA')).toBe('PIZZARIA');
  });
});
