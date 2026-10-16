import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaService } from '../database/prisma.service';
import { SuppliersService } from './suppliers.service';

const supplier = {
  id: 'supplier-1',
  tenantId: 'tenant-1',
  name: 'Fornecedor de teste',
  cnpj: null,
  email: null,
  phone: null,
  contactName: null,
  category: null,
  isActive: true,
  createdAt: new Date('2026-09-07T00:00:00.000Z'),
  updatedAt: new Date('2026-09-07T00:00:00.000Z'),
};

async function setup() {
  const prisma = {
    supplier: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
  };
  const module = await Test.createTestingModule({
    providers: [
      SuppliersService,
      { provide: PrismaService, useValue: prisma },
    ],
  }).compile();
  return { service: module.get(SuppliersService), prisma };
}

describe('SuppliersService', () => {
  it('persists an omitted or blank CNPJ as null', async () => {
    const { service, prisma } = await setup();
    prisma.supplier.create.mockResolvedValue(supplier);

    await service.create('tenant-1', { name: 'Fornecedor de teste', cnpj: '   ' });

    expect(prisma.supplier.findFirst).not.toHaveBeenCalled();
    expect(prisma.supplier.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ tenantId: 'tenant-1', cnpj: null }),
    }));
  });

  it('keeps the CNPJ duplicate lookup tenant-scoped when a document is supplied', async () => {
    const { service, prisma } = await setup();
    prisma.supplier.findFirst.mockResolvedValue(null);
    prisma.supplier.create.mockResolvedValue({ ...supplier, cnpj: '12345678000190' });

    await service.create('tenant-1', { name: 'Fornecedor de teste', cnpj: ' 12345678000190 ' });

    expect(prisma.supplier.findFirst).toHaveBeenCalledWith({
      where: { tenantId: 'tenant-1', cnpj: '12345678000190' },
    });
    expect(prisma.supplier.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ cnpj: '12345678000190' }),
    }));
  });

  it('clears an existing CNPJ to null on update', async () => {
    const { service, prisma } = await setup();
    prisma.supplier.findFirst.mockResolvedValue({ ...supplier, cnpj: '12345678000190' });
    prisma.supplier.update.mockResolvedValue(supplier);

    await service.update('tenant-1', 'supplier-1', { cnpj: '' });

    expect(prisma.supplier.update).toHaveBeenCalledWith({
      where: { id: 'supplier-1' },
      data: expect.objectContaining({ cnpj: null }),
    });
  });

  it('deactivates instead of deleting a supplier with historical purchases', async () => {
    const { service, prisma } = await setup();
    prisma.supplier.findFirst.mockResolvedValue(supplier);
    prisma.supplier.update.mockResolvedValue({ ...supplier, isActive: false });

    await service.remove('tenant-1', 'supplier-1');

    expect(prisma.supplier.update).toHaveBeenCalledWith({
      where: { id: 'supplier-1' },
      data: { isActive: false },
    });
  });

  it('does not deactivate a supplier from another tenant', async () => {
    const { service, prisma } = await setup();
    prisma.supplier.findFirst.mockResolvedValue(null);

    await expect(service.remove('tenant-1', 'supplier-from-tenant-2')).rejects.toBeInstanceOf(NotFoundException);

    expect(prisma.supplier.update).not.toHaveBeenCalled();
  });
});
