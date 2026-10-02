import { BadRequestException } from '@nestjs/common';
import { OptionGroupsService } from './option-groups.service';

describe('OptionGroupsService pricing invariants', () => {
  const tenantId = 'tenant-a';
  const groupId = 'group-a';
  const itemId = 'item-a';

  function makeService(options: {
    secondaryLink?: boolean;
    groupIsActive?: boolean;
    item?: Record<string, unknown>;
    replaceItems?: Array<Record<string, unknown>>;
  } = {}) {
    const groupIsActive = options.groupIsActive ?? true;
    const tx = {
      optionGroup: {
        findFirst: jest.fn().mockResolvedValue({
          id: groupId,
          selectionType: 'single',
          isRequired: false,
          minSelect: 0,
          maxSelect: 1,
          isActive: groupIsActive,
        }),
        update: jest.fn().mockResolvedValue({ id: groupId }),
      },
      optionItem: {
        findFirst: jest.fn().mockResolvedValue({
          id: itemId,
          tenantId,
          optionGroupId: groupId,
          isActive: true,
          priceImpactType: 'fixed',
          priceImpactValue: 2,
          allowQuantity: false,
          minQty: null,
          maxQty: null,
          optionGroup: { id: groupId, isActive: groupIsActive },
          ...options.item,
        }),
        findMany: jest.fn().mockResolvedValue(options.replaceItems ?? []),
        create: jest.fn().mockResolvedValue({ id: 'created-item' }),
        update: jest.fn().mockResolvedValue({ id: itemId }),
      },
      productOptionGroupLink: {
        findFirst: jest.fn().mockResolvedValue(options.secondaryLink ? { id: 'link-secondary' } : null),
      },
    };
    const prisma = {
      $transaction: jest.fn(async (operation: (client: typeof tx) => Promise<unknown>) => operation(tx)),
      tenant: { findUnique: jest.fn().mockResolvedValue({ slug: 'tenant-store' }) },
      auditLog: { create: jest.fn().mockResolvedValue(undefined) },
    };
    const cacheManager = { del: jest.fn().mockResolvedValue(undefined) };
    const tenantContext = { getTenantId: jest.fn().mockReturnValue(tenantId) };
    const service = Reflect.construct(OptionGroupsService, [prisma, tenantContext, cacheManager]) as OptionGroupsService;
    return { prisma, tx, cacheManager, service };
  }

  it('rejects creating an active replace item in a group linked as secondary', async () => {
    const { tx, service } = makeService({ secondaryLink: true });

    await expect(service.createItem({
      optionGroupId: groupId,
      name: 'Tamanho',
      priceImpactType: 'replace',
      priceImpactValue: 15,
      allowQuantity: false,
      minQty: 1,
      maxQty: 1,
    })).rejects.toBeInstanceOf(BadRequestException);

    expect(tx.optionItem.create).not.toHaveBeenCalled();
  });

  it('rejects changing an item to replace in a group linked as secondary', async () => {
    const { tx, service } = makeService({ secondaryLink: true });

    await expect(service.updateItem(itemId, {
      priceImpactType: 'replace',
      priceImpactValue: 15,
      allowQuantity: false,
      minQty: 1,
      maxQty: 1,
    })).rejects.toBeInstanceOf(BadRequestException);

    expect(tx.optionItem.update).not.toHaveBeenCalled();
  });

  it.each([
    { allowQuantity: true },
    { minQty: null, maxQty: 1 },
    { minQty: 1, maxQty: null },
    { minQty: 2 },
    { maxQty: 2 },
  ])('rejects replace quantity configuration %o', async (invalidQuantity) => {
    const { tx, service } = makeService();

    await expect(service.createItem({
      optionGroupId: groupId,
      name: 'Tamanho',
      priceImpactType: 'replace',
      priceImpactValue: 15,
      ...invalidQuantity,
    })).rejects.toBeInstanceOf(BadRequestException);

    expect(tx.optionItem.create).not.toHaveBeenCalled();
  });

  it('accepts a valid replace item in an unlinked group', async () => {
    const { tx, service } = makeService();

    await service.createItem({
      optionGroupId: groupId,
      name: 'Tamanho',
      priceImpactType: 'replace',
      priceImpactValue: 15,
      allowQuantity: false,
      minQty: 1,
      maxQty: 1,
    });

    expect(tx.optionItem.create).toHaveBeenCalled();
  });

  it('allows a valid edit in a linked group without changing replace semantics', async () => {
    const { tx, service } = makeService({ secondaryLink: true });

    await service.updateItem(itemId, { name: 'Fixo atualizado', priceImpactValue: 3 });

    expect(tx.optionItem.update).toHaveBeenCalled();
  });

  it('allows a valid replace edit when the group is not linked', async () => {
    const { tx, service } = makeService();

    await service.updateItem(itemId, {
      priceImpactType: 'replace',
      priceImpactValue: 15,
      allowQuantity: false,
      minQty: 1,
      maxQty: 1,
    });

    expect(tx.optionItem.update).toHaveBeenCalled();
  });

  it('rolls back group activation when its linked active replace item is secondary', async () => {
    const { tx, service } = makeService({
      groupIsActive: false,
      secondaryLink: true,
      replaceItems: [{ isActive: true, priceImpactType: 'replace', allowQuantity: false, minQty: 1, maxQty: 1 }],
    });

    await expect(service.updateGroup(groupId, { isActive: true })).rejects.toBeInstanceOf(BadRequestException);

    expect(tx.optionGroup.update).not.toHaveBeenCalled();
  });
});
