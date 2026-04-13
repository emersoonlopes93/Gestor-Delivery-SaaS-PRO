import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { TenantContextService } from '../../common/context/tenant-context.service';
import type { Prisma } from '@prisma/client';
import { CreateComplementGroupDto } from './dto/create-complement-group.dto';
import { UpdateComplementGroupDto } from './dto/update-complement-group.dto';
import { CreateComplementItemDto } from './dto/create-complement-item.dto';
import { UpdateComplementItemDto } from './dto/update-complement-item.dto';

@Injectable()
export class ComplementsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContextService,
  ) {}

  private getRequiredTenantId(): string {
    const tenantId = this.tenantContext.getTenantId();
    if (!tenantId) {
      throw new NotFoundException('Tenant context não encontrado');
    }
    return tenantId;
  }

  async createGroup(createGroupDto: CreateComplementGroupDto) {
    const tenantId = this.getRequiredTenantId();

    return this.prisma.tenantClient.productComplementGroup.create({
      data: {
        tenantId,
        name: createGroupDto.name,
        description: createGroupDto.description ?? null,
        minSelect: createGroupDto.minSelect ?? 0,
        maxSelect: createGroupDto.maxSelect ?? 1,
        isRequired: createGroupDto.isRequired ?? false,
        isActive: createGroupDto.isActive ?? true,
        order: createGroupDto.order ?? 0,
      } satisfies Prisma.ProductComplementGroupUncheckedCreateInput,
    });
  }

  async findAllGroups() {
    return this.prisma.tenantClient.productComplementGroup.findMany({
      orderBy: { order: 'asc' },
      include: { items: true },
    });
  }

  async findOneGroup(id: string) {
    const group = await this.prisma.tenantClient.productComplementGroup.findUnique({
      where: { id },
      include: { items: true },
    });

    if (!group) {
      throw new NotFoundException(`Grupo de complementos não encontrado.`);
    }

    return group;
  }

  async updateGroup(id: string, updateGroupDto: UpdateComplementGroupDto) {
    await this.findOneGroup(id);

    return this.prisma.tenantClient.productComplementGroup.update({
      where: { id },
      data: {
        ...updateGroupDto,
        description: updateGroupDto.description ?? undefined,
      },
    });
  }

  async removeGroup(id: string) {
    await this.findOneGroup(id);
    return this.prisma.tenantClient.productComplementGroup.delete({
      where: { id },
    });
  }

  // ITEM METHODS

  async createItem(dto: CreateComplementItemDto) {
    const tenantId = this.getRequiredTenantId();

    return this.prisma.tenantClient.productComplementItem.create({
      data: {
        tenantId,
        groupId: dto.groupId,
        name: dto.name,
        description: dto.description ?? null,
        additionalPrice: dto.additionalPrice ?? 0,
        sku: dto.sku ?? null,
        isActive: dto.isActive ?? true,
        order: dto.order ?? 0,
      } satisfies Prisma.ProductComplementItemUncheckedCreateInput,
    });
  }

  async findAllItems() {
    return this.prisma.tenantClient.productComplementItem.findMany({
      orderBy: { order: 'asc' },
    });
  }

  async findOneItem(id: string) {
    const item = await this.prisma.tenantClient.productComplementItem.findUnique({
      where: { id },
    });
    if (!item) throw new NotFoundException('Complemento não encontrado.');
    return item;
  }

  async updateItem(id: string, dto: UpdateComplementItemDto) {
    await this.findOneItem(id);
    return this.prisma.tenantClient.productComplementItem.update({
      where: { id },
      data: {
        ...dto,
        description: dto.description ?? undefined,
      },
    });
  }

  async removeItem(id: string) {
    await this.findOneItem(id);
    return this.prisma.tenantClient.productComplementItem.delete({
      where: { id },
    });
  }
}
