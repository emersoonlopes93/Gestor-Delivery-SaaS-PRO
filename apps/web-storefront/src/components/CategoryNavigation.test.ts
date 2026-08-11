import { describe, expect, it } from 'vitest';
import { isOutsideHorizontalViewport } from '@gestor/storefront-ui';

describe('CategoryNavigation horizontal visibility', () => {
  it('requests menu scrolling when the active item is outside the viewport', () => {
    expect(isOutsideHorizontalViewport(
      { left: 0, right: 320 },
      { left: 360, right: 440 },
    )).toBe(true);
  });

  it('does not move the menu when the active item is already visible', () => {
    expect(isOutsideHorizontalViewport(
      { left: 0, right: 320 },
      { left: 120, right: 220 },
    )).toBe(false);
  });
});
