import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { PrismaService } from '../../database/prisma.service';
import { TenantContextService } from '../../common/context/tenant-context.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { slugify } from '@gestor/utils';
import { CategoryActiveDay, Prisma } from '@prisma/client';
import { BulkSetCategoryActiveDto } from './dto/bulk-set-category-active.dto';

@Injectable()
export class CategoriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContextService,
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
  ) {}

  private getRequiredTenantId(): string {
    const tenantId = this.tenantContext.getTenantId();
    if (!tenantId) {
      throw new NotFoundException('Tenant context não encontrado');
    }
    return tenantId;
  }

  private normalizeActiveDays(activeDays: string[] | undefined) {
    if (activeDays === undefined) return undefined;
    const ordered = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'];
    return ordered.filter((day) => activeDays.includes(day)) as CategoryActiveDay[];
  }

  private async invalidateStorefrontCache(tenantId: string): Promise<void> {
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId }, select: { slug: true } });
    if (!tenant?.slug) return;
    await Promise.all([
      this.cacheManager.del(`storefront:${tenant.slug}:delivery`),
      this.cacheManager.del(`storefront:${tenant.slug}:pickup`),
    ]);
  }

  async create(createCategoryDto: CreateCategoryDto) {
    const tenantId = this.getRequiredTenantId();
    const slug = slugify(createCategoryDto.name);

    // Check if there is an active category with the same slug.
    const categoryExists = await this.prisma.tenantClient.productCategory.findFirst({
      where: {
        tenantId,
        slug,
        deletedAt: null,
      },
    });

    if (categoryExists) {
      throw new Error(`Já existe uma categoria com o nome "${createCategoryDto.name}".`);
    }

    // Check if there is a soft-deleted category with the same slug.
    const deletedCategoryConflict = await this.prisma.tenantClient.productCategory.findFirst({
      where: {
        tenantId,
        slug,
        NOT: { deletedAt: null },
      },
    });

    if (deletedCategoryConflict) {
      // Free up the slug
      await this.prisma.tenantClient.productCategory.update({
        where: { id: deletedCategoryConflict.id },
        data: { slug: `${slug}-deleted-${Date.now()}` },
      });
    }

    return this.prisma.tenantClient.productCategory.create({
      data: {
        tenantId,
        slug,
        name: createCategoryDto.name,
        description: createCategoryDto.description ?? null,
        image: createCategoryDto.image ?? null,
        isActive: createCategoryDto.isActive ?? true,
        activeDays: this.normalizeActiveDays(createCategoryDto.activeDays) ?? [],
        isFeatured: createCategoryDto.isFeatured ?? false,
        order: createCategoryDto.order ?? 0,
        templateType: createCategoryDto.templateType ?? 'none',
        templateConfig: createCategoryDto.templateConfig as Prisma.InputJsonValue ?? null,
      },
    });
  }

  async findAll() {
    const tenantId = this.getRequiredTenantId();
    return this.prisma.tenantClient.productCategory.findMany({
      where: { tenantId, deletedAt: null },
      orderBy: { order: 'asc' },
    });
  }

  async findAllWithProductCount() {
    const categories = await this.prisma.tenantClient.productCategory.findMany({
      where: { deletedAt: null },
      orderBy: { order: 'asc' },
    });

    const counts = await this.prisma.tenantClient.product.groupBy({
      by: ['categoryId'],
      where: {
        deletedAt: null,
        categoryId: { not: null },
      },
      _count: { _all: true },
    });

    const countMap = new Map<string, number>();
    for (const row of counts) {
      if (row.categoryId) {
        countMap.set(row.categoryId, row._count._all);
      }
    }

    return categories.map((c) => ({
      ...c,
      productCount: countMap.get(c.id) ?? 0,
    }));
  }

  async findOne(id: string) {
    const tenantId = this.getRequiredTenantId();
    const category = await this.prisma.tenantClient.productCategory.findFirst({
      where: { id, tenantId, deletedAt: null },
    });

    if (!category) {
      throw new NotFoundException(`Categoria não encontrada.`);
    }

    return category;
  }

  async listProductsByCategory(categoryId: string) {
    await this.findOne(categoryId);

    return this.prisma.tenantClient.product.findMany({
      where: {
        categoryId,
        deletedAt: null,
      },
      orderBy: { order: 'asc' },
      include: { category: true },
    });
  }

  async update(id: string, updateCategoryDto: UpdateCategoryDto) {
    // Check if exists
    await this.findOne(id);

    const slug = updateCategoryDto.name ? slugify(updateCategoryDto.name) : undefined;

    const category = await this.prisma.tenantClient.productCategory.update({
      where: { id },
      data: {
        name: updateCategoryDto.name,
        description: updateCategoryDto.description ?? undefined,
        image: updateCategoryDto.image ?? undefined,
        isActive: updateCategoryDto.isActive,
        activeDays: this.normalizeActiveDays(updateCategoryDto.activeDays),
        isFeatured: updateCategoryDto.isFeatured,
        order: updateCategoryDto.order,
        templateType: updateCategoryDto.templateType,
        templateConfig: updateCategoryDto.templateConfig as Prisma.InputJsonValue,
        ...(slug ? { slug } : {}),
      },
    });
    await this.invalidateStorefrontCache(this.getRequiredTenantId());
    return category;
  }

  async bulkSetActive(dto: BulkSetCategoryActiveDto) {
    const tenantId = this.getRequiredTenantId();
    const updated = await this.prisma.$transaction(async (tx) => {
      const categories = await tx.productCategory.findMany({
        where: { tenantId, id: { in: dto.ids }, deletedAt: null },
        select: { id: true },
      });
      if (categories.length !== dto.ids.length) {
        throw new BadRequestException('Uma ou mais categorias não pertencem a esta loja ou não estão disponíveis.');
      }
      return tx.productCategory.updateMany({
        where: { tenantId, id: { in: dto.ids }, deletedAt: null },
        data: { isActive: dto.isActive },
      });
    });
    await this.invalidateStorefrontCache(tenantId);
    return { updated: updated.count, isActive: dto.isActive };
  }

  async remove(id: string) {
    const category = await this.findOne(id);

    // Soft delete
    const timestamp = Date.now();
    return this.prisma.tenantClient.productCategory.update({
      where: { id },
      data: {
        deletedAt: new Date(),
        slug: `${category.slug}-deleted-${timestamp}`,
      },
    });
  }
}
