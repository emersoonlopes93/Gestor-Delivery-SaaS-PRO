import { HistoricalCmvCoverage, HistoricalCostEvidence, Prisma } from '@prisma/client';
import { HistoricalCmvService } from './historical-cmv.service';

const decimal = (value: string) => new Prisma.Decimal(value);

function createService(movements: Array<Record<string, unknown>>) {
  const prisma = {
    order: { findFirst: jest.fn().mockResolvedValue({ id: 'order-a' }) },
    stockMovement: { findMany: jest.fn().mockResolvedValue(movements) },
  };
  return { service: new HistoricalCmvService(prisma as never), prisma };
}

describe('HistoricalCmvService', () => {
  it('uses only the persisted depletion snapshot, not a later ingredient current cost', async () => {
    const { service } = createService([{
      id: 'movement-a', ingredientId: 'ingredient-a', quantity: decimal('2'), unitCost: decimal('3.125'),
      costEvidence: HistoricalCostEvidence.known, orderCmvCoverage: HistoricalCmvCoverage.known, reversal: null,
    }]);

    await expect(service.getOrderCmv('tenant-a', 'order-a')).resolves.toEqual({
      orderId: 'order-a', coverageStatus: 'KNOWN', knownSubtotal: '6.25', totalCmv: '6.25', coverageReasons: [],
      ingredients: [{
        ingredientId: 'ingredient-a', quantity: '2', unitCost: '3.125', lineCost: '6.25', movementId: 'movement-a', isActive: true, costEvidence: 'KNOWN',
      }],
    });
  });

  it('does not turn a legacy null cost or numeric zero without provenance into known zero', async () => {
    const { service } = createService([{
      id: 'legacy-movement', ingredientId: 'ingredient-a', quantity: decimal('1'), unitCost: decimal('0'),
      costEvidence: null, orderCmvCoverage: null, reversal: null,
    }]);

    const result = await service.getOrderCmv('tenant-a', 'order-a');
    expect(result.coverageStatus).toBe('UNKNOWN');
    expect(result.totalCmv).toBeNull();
    expect(result.coverageReasons).toEqual(expect.arrayContaining(['MISSING_COST_PROVENANCE']));
  });

  it('returns known net zero after a fully known and fully reversed depletion', async () => {
    const { service } = createService([{
      id: 'movement-a', ingredientId: 'ingredient-a', quantity: decimal('2'), unitCost: decimal('3'),
      costEvidence: HistoricalCostEvidence.known, orderCmvCoverage: HistoricalCmvCoverage.known, reversal: { id: 'reversal-a' },
    }]);

    await expect(service.getOrderCmv('tenant-a', 'order-a')).resolves.toMatchObject({
      coverageStatus: 'KNOWN', knownSubtotal: '0.00', totalCmv: '0.00', coverageReasons: ['FULLY_REVERSED'],
    });
  });

  it('returns partial without promoting its known subtotal to a total', async () => {
    const { service } = createService([
      {
        id: 'known', ingredientId: 'ingredient-a', quantity: decimal('1'), unitCost: decimal('2'),
        costEvidence: HistoricalCostEvidence.known, orderCmvCoverage: HistoricalCmvCoverage.partial, reversal: null,
      },
      {
        id: 'unknown', ingredientId: 'ingredient-b', quantity: decimal('1'), unitCost: null,
        costEvidence: HistoricalCostEvidence.unknown, orderCmvCoverage: HistoricalCmvCoverage.partial, reversal: null,
      },
    ]);

    await expect(service.getOrderCmv('tenant-a', 'order-a')).resolves.toMatchObject({
      coverageStatus: 'PARTIAL', knownSubtotal: '2.00', totalCmv: null,
      coverageReasons: expect.arrayContaining(['INCOMPLETE_ORDER_COVERAGE', 'MISSING_COST_PROVENANCE']),
    });
  });
});
