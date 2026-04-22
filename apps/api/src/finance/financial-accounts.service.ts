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

    return accounts.map(acc => ({
      ...acc,
      balance: Number(acc.balance)
    }));
  }

  async findOne(tenantId: string, id: string): Promise<FinancialAccountDTO> {
    const account = await this.prisma.financialAccount.findFirst({
      where: { id, tenantId },
    });

    if (!account) {
      throw new NotFoundException('Conta financeira não encontrada');
    }

    return {
      ...account,
      balance: Number(account.balance)
    };
  }

  async create(tenantId: string, dto: CreateFinancialAccountDTO): Promise<FinancialAccountDTO> {
    const account = await this.prisma.financialAccount.create({
      data: {
        tenantId,
        name: dto.name,
        type: dto.type,
        balance: dto.initialBalance || 0,
      },
    });

    return {
      ...account,
      balance: Number(account.balance)
    };
  }

  async update(tenantId: string, id: string, dto: UpdateFinancialAccountDTO): Promise<FinancialAccountDTO> {
    await this.findOne(tenantId, id);

    const updated = await this.prisma.financialAccount.update({
      where: { id },
      data: dto,
    });

    return {
      ...updated,
      balance: Number(updated.balance)
    };
  }
}
