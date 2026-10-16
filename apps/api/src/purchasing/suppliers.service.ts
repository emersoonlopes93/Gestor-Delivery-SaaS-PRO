import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { SupplierDTO, CreateSupplierDTO, UpdateSupplierDTO } from '@gestor/types';
import { Prisma } from '@prisma/client';

@Injectable()
export class SuppliersService {
  constructor(private prisma: PrismaService) {}

  private normalizeOptionalCnpj(cnpj: string | undefined): string | null {
    const normalized = cnpj?.trim();
    return normalized ? normalized : null;
  }

  async findAll(tenantId: string): Promise<SupplierDTO[]> {
    const suppliers = await this.prisma.supplier.findMany({
      where: { tenantId },
      orderBy: { name: 'asc' },
    });
    return suppliers.map(s => this.mapToDTO(s));
  }

  async findOne(tenantId: string, id: string): Promise<SupplierDTO> {
    const supplier = await this.prisma.supplier.findFirst({
      where: { id, tenantId },
    });

    if (!supplier) {
      throw new NotFoundException('Fornecedor não encontrado');
    }

    return this.mapToDTO(supplier);
  }

  async create(tenantId: string, dto: CreateSupplierDTO): Promise<SupplierDTO> {
    const cnpj = this.normalizeOptionalCnpj(dto.cnpj);
    if (cnpj) {
      const existing = await this.prisma.supplier.findFirst({
        where: { tenantId, cnpj },
      });

      if (existing) {
        throw new ConflictException('Fornecedor com este CNPJ já existe');
      }
    }

    const supplier = await this.prisma.supplier.create({
      data: {
        name: dto.name,
        cnpj,
        email: dto.email,
        phone: dto.phone,
        contactName: dto.contactName,
        category: dto.category,
        isActive: dto.isActive ?? true,
        tenantId,
      },
    });
    return this.mapToDTO(supplier);
  }

  async update(tenantId: string, id: string, dto: UpdateSupplierDTO): Promise<SupplierDTO> {
    const supplier = await this.findOne(tenantId, id);
    const cnpj = dto.cnpj === undefined ? undefined : this.normalizeOptionalCnpj(dto.cnpj);

    if (cnpj && cnpj !== supplier.cnpj) {
      const existing = await this.prisma.supplier.findFirst({
        where: { tenantId, cnpj },
      });

      if (existing) {
        throw new ConflictException('Fornecedor com este CNPJ já existe');
      }
    }

    const updated = await this.prisma.supplier.update({
      where: { id },
      data: {
        name: dto.name,
        cnpj,
        email: dto.email,
        phone: dto.phone,
        contactName: dto.contactName,
        category: dto.category,
        isActive: dto.isActive,
      },
    });
    return this.mapToDTO(updated);
  }

  private mapToDTO(s: Prisma.SupplierGetPayload<Record<string, never>>): SupplierDTO {
    return {
      id: s.id,
      tenantId: s.tenantId,
      name: s.name,
      cnpj: s.cnpj ?? undefined,
      email: s.email ?? undefined,
      phone: s.phone ?? undefined,
      contactName: s.contactName ?? undefined,
      category: s.category ?? undefined,
      isActive: s.isActive,
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
    };
  }

  async remove(tenantId: string, id: string): Promise<void> {
    await this.findOne(tenantId, id);
    
    await this.prisma.supplier.update({
      where: { id },
      data: { isActive: false },
    });
  }
}
