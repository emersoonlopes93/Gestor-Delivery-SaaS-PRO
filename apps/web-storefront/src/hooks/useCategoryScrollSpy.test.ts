import { describe, expect, it } from 'vitest';
import {
  collectCategorySections,
  resolveActiveCategoryId,
  shouldHoldPendingSelection,
} from './useCategoryScrollSpy';

const page = { scrollY: 300, viewportHeight: 700, documentHeight: 2_000 };

describe('resolveActiveCategoryId', () => {
  it('keeps the initial category active before the next section reaches the active line', () => {
    expect(resolveActiveCategoryId([
      { id: 'pizzas', top: 20, bottom: 420 },
      { id: 'burgers', top: 420, bottom: 820 },
    ], page)).toBe('pizzas');
  });

  it('updates the active category as the user manually scrolls', () => {
    expect(resolveActiveCategoryId([
      { id: 'pizzas', top: -500, bottom: -100 },
      { id: 'burgers', top: -100, bottom: 300 },
      { id: 'drinks', top: 300, bottom: 700 },
    ], page)).toBe('burgers');
  });

  it('activates the last category at the bottom of the page', () => {
    expect(resolveActiveCategoryId([
      { id: 'pizzas', top: -900, bottom: -500 },
      { id: 'drinks', top: 250, bottom: 600 },
    ], { scrollY: 1_300, viewportHeight: 700, documentHeight: 2_000 })).toBe('drinks');
  });

  it('uses only the current sections after the category list changes', () => {
    const firstRender = collectCategorySections([
      { id: 'old', slug: 'old' },
    ], (slug) => slug);
    const secondRender = collectCategorySections([
      { id: 'new-first', slug: 'new-first' },
      { id: 'new-last', slug: 'new-last' },
    ], (slug) => slug);

    expect(firstRender.map(({ id }) => id)).toEqual(['old']);
    expect(secondRender.map(({ id }) => id)).toEqual(['new-first', 'new-last']);
  });

  it('handles an empty category list', () => {
    expect(resolveActiveCategoryId([], page)).toBeUndefined();
  });

  it('keeps a clicked category active while smooth scrolling crosses other sections', () => {
    expect(shouldHoldPendingSelection('drinks', [
      { id: 'burgers', top: -20, bottom: 380 },
      { id: 'drinks', top: 380, bottom: 780 },
    ], 'burgers')).toBe(true);
  });

  it('releases the click lock when the requested section reaches the active line', () => {
    expect(shouldHoldPendingSelection('drinks', [
      { id: 'burgers', top: -400, bottom: -20 },
      { id: 'drinks', top: 20, bottom: 420 },
    ], 'drinks')).toBe(false);
  });
});
