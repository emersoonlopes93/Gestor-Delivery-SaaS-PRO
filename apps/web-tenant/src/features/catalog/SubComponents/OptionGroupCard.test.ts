import { describe, expect, it } from 'vitest';
import type { OptionItem } from '@gestor/types';
import { splitOptionGroupItems } from './option-group-card-items';

const item = (id: string, deletedAt: Date | null): OptionItem => ({
  id,
  tenantId: 'tenant-a',
  optionGroupId: 'group-a',
  name: id,
  isActive: true,
  deletedAt,
  order: 0,
  priceImpactType: 'none',
  priceImpactValue: 0,
  allowQuantity: false,
  createdAt: new Date(),
  updatedAt: new Date(),
});

describe('OptionGroupCard item presentation', () => {
  it('keeps archived items in the administrative response without counting them as active', () => {
    const result = splitOptionGroupItems([
      item('active-item', null),
      item('archived-item', new Date('2026-09-27T00:00:00.000Z')),
    ]);

    expect(result.activeItems.map((entry) => entry.id)).toEqual(['active-item']);
    expect(result.archivedItems.map((entry) => entry.id)).toEqual(['archived-item']);
  });
});
