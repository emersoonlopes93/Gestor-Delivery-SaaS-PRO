import { describe, expect, it } from 'vitest';
import { createInventoryCountSubmission, INVENTORY_API_PATHS } from './inventory-api-contract';

describe('inventory API contract', () => {
  it('uses the API routes exposed by the inventory and losses controllers', () => {
    expect(INVENTORY_API_PATHS.counts).toBe('/inventory-counts');
    expect(INVENTORY_API_PATHS.losses).toBe('/losses');
  });

  it('sends only the physical count because the API snapshots theoretical stock authoritatively', () => {
    expect(createInventoryCountSubmission([{
      ingredientId: 'ingredient-1',
      physicalStock: 6.5,
    }])).toEqual({
      items: [{ ingredientId: 'ingredient-1', physicalStock: 6.5 }],
    });
  });
});
