import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CreateComplementGroupDto } from './dto/create-complement-group.dto';
import { UpdateComplementGroupDto } from './dto/update-complement-group.dto';

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

    // Hard delete for groups as they might not be part of orders explicitly, or a soft delete strategy can be adopted later
    return this.prisma.tenantClient.productComplementGroup.delete({
      where: { id },
    });
  }
}
