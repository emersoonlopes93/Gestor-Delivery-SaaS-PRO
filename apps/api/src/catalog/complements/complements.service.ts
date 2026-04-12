import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CreateComplementGroupDto } from './dto/create-complement-group.dto';
import { UpdateComplementGroupDto } from './dto/update-complement-group.dto';
import { CreateComplementItemDto } from './dto/create-complement-item.dto';
import { UpdateComplementItemDto } from './dto/update-complement-item.dto';

@Injectable()
export class ComplementsService {
  constructor(private readonly prisma: PrismaService) {}

  async createGroup(createGroupDto: CreateComplementGroupDto) {
    return this.prisma.tenantClient.productComplementGroup.create({
      data: createGroupDto,
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
      data: updateGroupDto,
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
    return this.prisma.tenantClient.productComplementItem.create({
      data: dto,
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
      data: dto,
    });
  }

  async removeItem(id: string) {
    await this.findOneItem(id);
    return this.prisma.tenantClient.productComplementItem.delete({
      where: { id },
    });
  }
}
