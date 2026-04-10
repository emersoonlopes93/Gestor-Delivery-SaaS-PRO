import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { slugify } from '@gestor/utils';

@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(createProductDto: CreateProductDto) {
    const slug = slugify(createProductDto.name);

    return this.prisma.tenantClient.product.create({
      data: {
        ...createProductDto,
        slug,
      },
    });
  }

  async findAll() {
    return this.prisma.tenantClient.product.findMany({
      where: { deletedAt: null },
      orderBy: { order: 'asc' },
      include: { category: true }
    });
  }

  async findOne(id: string) {
    const product = await this.prisma.tenantClient.product.findFirst({
      where: { id, deletedAt: null },
      include: { category: true, complementGroups: { include: { group: true } } }
    });

    if (!product) {
      throw new NotFoundException(`Produto não encontrado.`);
    }

    return product;
  }

  async update(id: string, updateProductDto: UpdateProductDto) {
    // Check if exists
    await this.findOne(id);

    let slug: string | undefined;
    if ((updateProductDto as any).name) {
      slug = slugify((updateProductDto as any).name);
    }

    return this.prisma.tenantClient.product.update({
      where: { id },
      data: {
        ...updateProductDto,
        ...(slug && { slug }),
      },
    });
  }

  async remove(id: string) {
    await this.findOne(id);

    // Soft delete
    return this.prisma.tenantClient.product.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }
}
