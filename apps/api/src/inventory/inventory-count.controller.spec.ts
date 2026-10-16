import { InventoryCountController } from './inventory-count.controller';

describe('InventoryCountController', () => {
  const inventoryCountService = {
    findAll: jest.fn(),
    create: jest.fn(),
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

  it('forwards the complete count payload within the authenticated tenant', async () => {
    const dto = {
      items: [{ ingredientId: 'ingredient-1', theoreticalStock: 8, physicalStock: 6.5 }],
    };
    inventoryCountService.create.mockResolvedValue({ id: 'count-1' });

    await expect(controller.create('tenant-a', dto)).resolves.toEqual({ id: 'count-1' });
    expect(inventoryCountService.create).toHaveBeenCalledWith('tenant-a', dto);
  });
});
