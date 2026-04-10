import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CreateComboDto } from './dto/create-combo.dto';
import { UpdateComboDto } from './dto/update-combo.dto';
import { slugify } from '@gestor/utils';

@Injectable()
export class CombosService {
  constructor(private readonly prisma: PrismaService) {}

  async create(createComboDto: CreateComboDto) {
    const slug = slugify(createComboDto.name);

    return this.prisma.tenantClient.productCombo.create({
      data: {
        ...createComboDto,
        slug,
      },
    });
  }

  async findAll() {
    return this.prisma.tenantClient.productCombo.findMany({
      where: { deletedAt: null },
      orderBy: { order: 'asc' },
      include: { blocks: { include: { items: true } } },
    });
  }

  async findOne(id: string) {
    const combo = await this.prisma.tenantClient.productCombo.findFirst({
      where: { id, deletedAt: null },
      include: { blocks: { include: { items: { include: { product: true } } } } },
    });

    if (!combo) {
      throw new NotFoundException(`Combo não encontrado.`);
    }

    return combo;
  }

  async update(id: string, updateComboDto: UpdateComboDto) {
    await this.findOne(id);

    let slug: string | undefined;
    if ((updateComboDto as any).name) {
      slug = slugify((updateComboDto as any).name);
    }

    return this.prisma.tenantClient.productCombo.update({
      where: { id },
      data: {
        ...updateComboDto,
        ...(slug && { slug }),
      },
    });
  }

  async remove(id: string) {
    await this.findOne(id);

    // Soft delete
    return this.prisma.tenantClient.productCombo.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }
}
