import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { FinancialAccountDTO, CreateFinancialAccountDTO, UpdateFinancialAccountDTO, FinancialAccountType } from '@gestor/types';
import { FinancialAccountType as PrismaFinancialAccountType, Prisma } from '@prisma/client';

@Injectable()
export class FinancialAccountsService {
  constructor(private prisma: PrismaService) {}

  private toPrismaType(type: FinancialAccountType): PrismaFinancialAccountType {
    switch (type) {
      case FinancialAccountType.CASH:
        return PrismaFinancialAccountType.cash;
      case FinancialAccountType.BANK:
        return PrismaFinancialAccountType.bank;
      case FinancialAccountType.DIGITAL_WALLET:
        return PrismaFinancialAccountType.digital_wallet;
    }
  }

  private toDtoType(type: PrismaFinancialAccountType): FinancialAccountType {
    switch (type) {
      case PrismaFinancialAccountType.cash:
        return FinancialAccountType.CASH;
      case PrismaFinancialAccountType.bank:
        return FinancialAccountType.BANK;
      case PrismaFinancialAccountType.digital_wallet:
        return FinancialAccountType.DIGITAL_WALLET;
    }
  }

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
        type: this.toPrismaType(dto.type),
        balance: dto.initialBalance ?? 0,
      },
    });

    return this.mapToDTO(account);
  }

  private mapToDTO(acc: Prisma.FinancialAccountGetPayload<{}>): FinancialAccountDTO {
    return {
      ...acc,
      type: this.toDtoType(acc.type),
      balance: Number(acc.balance),
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
