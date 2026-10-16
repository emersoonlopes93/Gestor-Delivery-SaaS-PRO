import { describe, expect, it } from 'vitest';
import { createInventoryCountSubmission, INVENTORY_API_PATHS } from './inventory-api-contract';

describe('inventory API contract', () => {
  it('uses the API routes exposed by the inventory and losses controllers', () => {
    expect(INVENTORY_API_PATHS.counts).toBe('/inventory-counts');
    expect(INVENTORY_API_PATHS.losses).toBe('/losses');
  });

  it('sends both stock values required by an inventory count', () => {
    expect(createInventoryCountSubmission([{
      ingredientId: 'ingredient-1',
      theoreticalStock: 8,
      physicalStock: 6.5,
    }])).toEqual({
      items: [{ ingredientId: 'ingredient-1', theoreticalStock: 8, physicalStock: 6.5 }],
    });
  });
});
