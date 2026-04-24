import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { FinancialAccountDTO, CreateFinancialAccountDTO, UpdateFinancialAccountDTO } from '@gestor/types';

@Injectable()
export class FinancialAccountsService {
  constructor(private prisma: PrismaService) {}

  async findAll(tenantId: string): Promise<FinancialAccountDTO[]> {
    const accounts = await this.prisma.financialAccount.findMany({
      where: { tenantId },
      orderBy: { name: 'asc' },
    });

    return accounts.map(acc => this.mapToDTO(acc));
  }

  async findOne(tenantId: string, id: string): Promise<FinancialAccountDTO> {
    const account = await this.prisma.financialAccount.findFirst({
      where: { id, tenantId },
    });

    if (!account) {
      throw new NotFoundException('Conta financeira não encontrada');
    }

    return this.mapToDTO(account);
  }

  async create(tenantId: string, dto: CreateFinancialAccountDTO): Promise<FinancialAccountDTO> {
    const account = await this.prisma.financialAccount.create({
      data: {
        tenantId,
        name: dto.name,
        type: dto.type as any, // Cast para Prisma enum
        balance: dto.initialBalance || 0,
      },
    });

    return this.mapToDTO(account);
  }

  private mapToDTO(acc: any): FinancialAccountDTO {
    return {
      ...acc,
      type: acc.type as any, // Cast para DTO enum (mesmos valores string)
      balance: Number(acc.balance)
    };
  }

  async update(tenantId: string, id: string, dto: UpdateFinancialAccountDTO): Promise<FinancialAccountDTO> {
    await this.findOne(tenantId, id);

    const updated = await this.prisma.financialAccount.update({
      where: { id },
      data: {
        ...(dto.name && { name: dto.name }),
        ...(dto.active !== undefined && { active: dto.active }),
      },
    });

    return this.mapToDTO(updated);
  }
}
