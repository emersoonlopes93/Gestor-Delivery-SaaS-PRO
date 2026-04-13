import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { TenantContextService } from '../../common/context/tenant-context.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { slugify } from '@gestor/utils';

@Injectable()
export class CategoriesService {
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

  async create(createCategoryDto: CreateCategoryDto) {
    const tenantId = this.getRequiredTenantId();
    const slug = slugify(createCategoryDto.name);

    return this.prisma.tenantClient.productCategory.create({
      data: {
        tenantId,
        slug,
        name: createCategoryDto.name,
        description: createCategoryDto.description ?? null,
        image: createCategoryDto.image ?? null,
        isActive: createCategoryDto.isActive ?? true,
        isFeatured: createCategoryDto.isFeatured ?? false,
        order: createCategoryDto.order ?? 0,
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

    const slug = updateCategoryDto.name ? slugify(updateCategoryDto.name) : undefined;

    return this.prisma.tenantClient.productCategory.update({
      where: { id },
      data: {
        name: updateCategoryDto.name,
        description: updateCategoryDto.description ?? undefined,
        image: updateCategoryDto.image ?? undefined,
        isActive: updateCategoryDto.isActive,
        isFeatured: updateCategoryDto.isFeatured,
        order: updateCategoryDto.order,
        ...(slug ? { slug } : {}),
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
