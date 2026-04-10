import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { slugify } from '@gestor/utils';

@Injectable()
export class CategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(createCategoryDto: CreateCategoryDto) {
    const slug = slugify(createCategoryDto.name);

    return this.prisma.tenantClient.productCategory.create({
      data: {
        ...createCategoryDto,
        slug,
      },
    });
  }

  async findAll() {
    return this.prisma.tenantClient.productCategory.findMany({
      where: { deletedAt: null },
      orderBy: { order: 'asc' },
    });
  }

  async findOne(id: string) {
    const category = await this.prisma.tenantClient.productCategory.findFirst({
      where: { id, deletedAt: null },
    });

    if (!category) {
      throw new NotFoundException(`Categoria não encontrada.`);
    }

    return category;
  }

  async update(id: string, updateCategoryDto: UpdateCategoryDto) {
    // Check if exists
    await this.findOne(id);

    let slug: string | undefined;
    if ((updateCategoryDto as any).name) {
      slug = slugify((updateCategoryDto as any).name);
    }

    return this.prisma.tenantClient.productCategory.update({
      where: { id },
      data: {
        ...updateCategoryDto,
        ...(slug && { slug }),
      },
    });
  }

  async remove(id: string) {
    // Check if exists
    await this.findOne(id);

    // Soft delete
    return this.prisma.tenantClient.productCategory.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }
}
