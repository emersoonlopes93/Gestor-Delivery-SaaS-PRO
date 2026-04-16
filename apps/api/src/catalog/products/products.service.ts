import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { TenantContextService } from '../../common/context/tenant-context.service';
import type { Prisma } from '@prisma/client';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { slugify } from '@gestor/utils';

@Injectable()
export class ProductsService {
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

  async create(createProductDto: CreateProductDto) {
    const tenantId = this.getRequiredTenantId();
    const slug = slugify(createProductDto.name);

    return this.prisma.tenantClient.product.create({
      data: {
        tenantId,
        slug,
        name: createProductDto.name,
        type: (createProductDto as unknown as { type?: 'simple' | 'configurable' | 'combo' }).type ?? 'simple',
        categoryId: createProductDto.categoryId ?? null,
        shortDescription: createProductDto.shortDescription ?? null,
        longDescription: createProductDto.longDescription ?? null,
        basePrice: createProductDto.basePrice,
        image: createProductDto.image ?? null,
        isActive: createProductDto.isActive ?? true,
        isFeatured: createProductDto.isFeatured ?? false,
        isAvailable: createProductDto.isAvailable ?? true,
        sellableOnline: createProductDto.sellableOnline ?? true,
        sku: createProductDto.sku ?? null,
        order: createProductDto.order ?? 0,
      },
    });
  }

  async findAll() {
    return this.prisma.tenantClient.product.findMany({
      where: { deletedAt: null },
      orderBy: { order: 'asc' },
      include: { category: true, publication: true }
    });
  }

  async findOne(id: string) {
    const product = await this.prisma.tenantClient.product.findFirst({
      where: { id, deletedAt: null },
      include: {
        category: true,
        complementGroups: { include: { group: true } },
        optionGroupLinks: { include: { optionGroup: { include: { items: { orderBy: { order: 'asc' } } } } }, orderBy: { order: 'asc' } },
        comboSlots: { include: { allowedItems: { include: { product: true }, orderBy: { order: 'asc' } } }, orderBy: { order: 'asc' } },
        publication: { include: { rules: { orderBy: { createdAt: 'asc' } } } },
      }
    });

    if (!product) {
      throw new NotFoundException(`Produto não encontrado.`);
    }

    return product;
  }

  async update(id: string, updateProductDto: UpdateProductDto) {
    // Check if exists
    await this.findOne(id);

    const slug = updateProductDto.name ? slugify(updateProductDto.name) : undefined;

    return this.prisma.tenantClient.product.update({
      where: { id },
      data: {
        name: updateProductDto.name,
        type: (updateProductDto as unknown as { type?: 'simple' | 'configurable' | 'combo' }).type,
        categoryId: updateProductDto.categoryId ?? undefined,
        shortDescription: updateProductDto.shortDescription ?? undefined,
        longDescription: updateProductDto.longDescription ?? undefined,
        basePrice: updateProductDto.basePrice,
        image: updateProductDto.image ?? undefined,
        isActive: updateProductDto.isActive,
        isFeatured: updateProductDto.isFeatured,
        isAvailable: updateProductDto.isAvailable,
        sellableOnline: updateProductDto.sellableOnline,
        sku: updateProductDto.sku ?? undefined,
        order: updateProductDto.order,
        ...(slug ? { slug } : {}),
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
