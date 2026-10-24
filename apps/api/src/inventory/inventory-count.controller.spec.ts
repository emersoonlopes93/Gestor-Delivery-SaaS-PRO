import { InventoryCountController } from './inventory-count.controller';

describe('InventoryCountController', () => {
  const inventoryCountService = {
    findAll: jest.fn(),
    open: jest.fn(),
    close: jest.fn(),
    cancel: jest.fn(),
  };
  const controller = new InventoryCountController(inventoryCountService as never);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('lists inventory counts within the authenticated tenant', async () => {
    inventoryCountService.findAll.mockResolvedValue([]);

    await expect(controller.findAll('tenant-a')).resolves.toEqual([]);
    expect(inventoryCountService.findAll).toHaveBeenCalledWith('tenant-a');
  });

  it('opens a server-side stock snapshot within the authenticated tenant', async () => {
    const dto = { ingredientIds: ['ingredient-1'] };
    inventoryCountService.open.mockResolvedValue({ id: 'count-1' });

    await expect(controller.open('tenant-a', dto)).resolves.toEqual({ id: 'count-1' });
    expect(inventoryCountService.open).toHaveBeenCalledWith('tenant-a', dto);
  });

  it('closes a count without accepting client theoretical stock', async () => {
    const dto = { items: [{ ingredientId: 'ingredient-1', physicalStock: 6.5 }] };
    inventoryCountService.close.mockResolvedValue({ id: 'count-1', status: 'closed' });

    await expect(controller.close('tenant-a', 'count-1', dto)).resolves.toEqual({ id: 'count-1', status: 'closed' });
    expect(inventoryCountService.close).toHaveBeenCalledWith('tenant-a', 'count-1', dto);
  });

  it('cancels an OPEN count within the authenticated tenant', async () => {
    inventoryCountService.cancel.mockResolvedValue({ id: 'count-1', status: 'cancelled' });

    await expect(controller.cancel('tenant-a', 'count-1')).resolves.toEqual({ id: 'count-1', status: 'cancelled' });
    expect(inventoryCountService.cancel).toHaveBeenCalledWith('tenant-a', 'count-1');
  });
});
