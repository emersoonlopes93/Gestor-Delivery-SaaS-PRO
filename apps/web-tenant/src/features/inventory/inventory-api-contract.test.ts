import { describe, expect, it } from 'vitest';
import {
  createInventoryCountClosure,
  createInventoryCountOpening,
  INVENTORY_API_PATHS,
} from './inventory-api-contract';

describe('inventory API contract', () => {
  it('uses the API routes exposed by the inventory and losses controllers', () => {
    expect(INVENTORY_API_PATHS.counts).toBe('/inventory-counts');
    expect(INVENTORY_API_PATHS.openCount).toBe('/inventory-counts/open');
    expect(INVENTORY_API_PATHS.closeCount('count-1')).toBe('/inventory-counts/count-1/close');
    expect(INVENTORY_API_PATHS.cancelCount('count-1')).toBe('/inventory-counts/count-1/cancel');
    expect(INVENTORY_API_PATHS.losses).toBe('/losses');
  });

  it('opens from ingredient identifiers and closes without trusting client theoretical stock', () => {
    expect(createInventoryCountOpening(['ingredient-1'])).toEqual({ ingredientIds: ['ingredient-1'] });
    expect(createInventoryCountClosure([{
      ingredientId: 'ingredient-1',
      physicalStock: 6.5,
    }])).toEqual({
      items: [{ ingredientId: 'ingredient-1', physicalStock: 6.5 }],
    });
  });
});
