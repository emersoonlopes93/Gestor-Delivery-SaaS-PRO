import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { SupplierDTO, CreateSupplierDTO, UpdateSupplierDTO } from '@gestor/types';

@Injectable()
export class SuppliersService {
  constructor(private prisma: PrismaService) {}

  async findAll(tenantId: string): Promise<SupplierDTO[]> {
    return this.prisma.supplier.findMany({
      where: { tenantId },
      orderBy: { name: 'asc' },
    });
  }

  async findOne(tenantId: string, id: string): Promise<SupplierDTO> {
    const supplier = await this.prisma.supplier.findFirst({
      where: { id, tenantId },
    });

    if (!supplier) {
      throw new NotFoundException('Fornecedor não encontrado');
    }

    return supplier;
  }

  async create(tenantId: string, dto: CreateSupplierDTO): Promise<SupplierDTO> {
    if (dto.cnpj) {
      const existing = await this.prisma.supplier.findFirst({
        where: { tenantId, cnpj: dto.cnpj },
      });

      if (existing) {
        throw new ConflictException('Fornecedor com este CNPJ já existe');
      }
    }

    return this.prisma.supplier.create({
      data: {
        ...dto,
        tenantId,
      },
    });
  }

  async update(tenantId: string, id: string, dto: UpdateSupplierDTO): Promise<SupplierDTO> {
    const supplier = await this.findOne(tenantId, id);

    if (dto.cnpj && dto.cnpj !== supplier.cnpj) {
      const existing = await this.prisma.supplier.findFirst({
        where: { tenantId, cnpj: dto.cnpj },
      });

      if (existing) {
        throw new ConflictException('Fornecedor com este CNPJ já existe');
      }
    }

    return this.prisma.supplier.update({
      where: { id },
      data: dto,
    });
  }

  async remove(tenantId: string, id: string): Promise<void> {
    const supplier = await this.findOne(tenantId, id);
    
    // Check if supplier has purchases before deleting? 
    // Usually we prefer soft delete or active/inactive, which we have.
    await this.prisma.supplier.delete({
      where: { id },
    });
  }
}
