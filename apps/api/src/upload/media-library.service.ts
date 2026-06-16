import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma, MediaAsset } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { UploadService } from './upload.service';
import { StorageService } from './storage.service';
import { slugify } from '@gestor/utils';

export type MediaScope = 'tenant_library' | 'system_gallery';

export interface MediaUploadFile {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
  size: number;
}

export interface MediaListFilters {
  search?: string;
  categoryId?: string;
  category?: string;
  tag?: string;
  status?: string;
  publicationStatus?: string;
  origin?: 'tenant' | 'system' | 'all';
}

export interface MediaMetadataInput {
  title?: string;
  description?: string | null;
  altText?: string | null;
  categoryId?: string | null;
  category?: string | null;
  tags?: string[];
  status?: 'active' | 'inactive';
  publicationStatus?: 'draft' | 'published' | 'unpublished';
  metadata?: Prisma.InputJsonValue;
}

@Injectable()
export class MediaLibraryService {
  private readonly logger = new Logger(MediaLibraryService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly uploadService: UploadService,
    private readonly storage: StorageService,
  ) {}

  async uploadSystemAsset(file: MediaUploadFile, input: MediaMetadataInput, adminUserId: string) {
    const category = await this.resolveCategory(null, 'system_gallery', input.categoryId ?? null);
    return this.uploadService.createMediaAsset({
      tenantId: null,
      scope: 'system_gallery',
      file,
      title: input.title,
      description: input.description ?? undefined,
      altText: input.altText ?? undefined,
      categoryId: category?.id ?? null,
      category: category?.name ?? input.category ?? undefined,
      tagsJson: normalizeTags(input.tags),
      metadataJson: input.metadata,
      publicationStatus: input.publicationStatus ?? 'draft',
      createdByUserId: adminUserId,
    });
  }

  async uploadTenantAsset(tenantId: string, file: MediaUploadFile, input: MediaMetadataInput, userId: string) {
    const category = await this.resolveCategory(tenantId, 'tenant_library', input.categoryId ?? null);
    return this.uploadService.createMediaAsset({
      tenantId,
      scope: 'tenant_library',
      file,
      title: input.title,
      description: input.description ?? undefined,
      altText: input.altText ?? undefined,
      categoryId: category?.id ?? null,
      category: category?.name ?? input.category ?? undefined,
      tagsJson: normalizeTags(input.tags),
      metadataJson: input.metadata,
      publicationStatus: 'published',
      createdByUserId: userId,
    });
  }

  async listAdminAssets(filters: MediaListFilters) {
    return this.prisma.mediaAsset.findMany({
      where: {
        scope: 'system_gallery',
        isSystem: true,
        deletedAt: null,
        ...this.assetFilterWhere(filters),
      },
      include: { categoryRel: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async listTenantAssets(tenantId: string, filters: MediaListFilters) {
    const origin = filters.origin ?? 'all';
    return this.prisma.mediaAsset.findMany({
      where: {
        deletedAt: null,
        OR: [
          ...(origin === 'system' ? [] : [{ tenantId, scope: 'tenant_library' }]),
          ...(origin === 'tenant' ? [] : [{
            tenantId: null,
            scope: 'system_gallery',
            isSystem: true,
            isActive: true,
            status: 'active',
            publicationStatus: 'published',
          }]),
        ],
        ...this.assetFilterWhere(filters),
      },
      include: { categoryRel: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getTenantAsset(tenantId: string, id: string) {
    const asset = await this.prisma.mediaAsset.findFirst({
      where: {
        id,
        deletedAt: null,
        OR: [
          { tenantId, scope: 'tenant_library' },
          {
            tenantId: null,
            scope: 'system_gallery',
            isSystem: true,
            isActive: true,
            status: 'active',
            publicationStatus: 'published',
          },
        ],
      },
      include: { categoryRel: true },
    });
    if (!asset) {
      this.logger.warn(`media_cross_tenant_blocked tenantId=${tenantId} assetId=${id}`);
      throw new NotFoundException('Midia nao encontrada.');
    }
    return asset;
  }

  async updateSystemAsset(id: string, input: MediaMetadataInput) {
    const asset = await this.prisma.mediaAsset.findFirst({
      where: { id, scope: 'system_gallery', isSystem: true, deletedAt: null },
    });
    if (!asset) throw new NotFoundException('Midia global nao encontrada.');

    const category = await this.resolveCategory(null, 'system_gallery', input.categoryId ?? undefined);
    const updated = await this.prisma.mediaAsset.update({
      where: { id },
      data: this.metadataUpdateData(input, category),
    });
    this.logger.log(`system_media_updated assetId=${id} publicationStatus=${updated.publicationStatus}`);
    return updated;
  }

  async updateTenantAsset(tenantId: string, id: string, input: MediaMetadataInput) {
    const asset = await this.prisma.mediaAsset.findFirst({
      where: { id, tenantId, scope: 'tenant_library', deletedAt: null },
    });
    if (!asset) {
      this.logger.warn(`media_cross_tenant_blocked tenantId=${tenantId} assetId=${id}`);
      throw new NotFoundException('Midia nao encontrada.');
    }

    const category = await this.resolveCategory(tenantId, 'tenant_library', input.categoryId ?? undefined);
    return this.prisma.mediaAsset.update({
      where: { id },
      data: this.metadataUpdateData(input, category),
    });
  }

  async deleteSystemAsset(id: string) {
    const asset = await this.prisma.mediaAsset.findFirst({
      where: { id, scope: 'system_gallery', isSystem: true, deletedAt: null },
    });
    if (!asset) throw new NotFoundException('Midia global nao encontrada.');

    const inUse = await this.prisma.product.count({ where: { mediaAssetId: id } });
    const shouldKeepFile = inUse > 0;
    if (!shouldKeepFile) {
      await this.storage.delete(asset.storageKey ?? asset.path);
    }

    const updated = await this.prisma.mediaAsset.update({
      where: { id },
      data: {
        status: 'deleted',
        isActive: false,
        publicationStatus: 'unpublished',
        deletedAt: new Date(),
      },
    });
    this.logger.log(`system_media_deleted assetId=${id} physicalDeleted=${String(!shouldKeepFile)}`);
    return updated;
  }

  async deleteTenantAsset(tenantId: string, id: string) {
    const asset = await this.prisma.mediaAsset.findFirst({
      where: { id, tenantId, scope: 'tenant_library', deletedAt: null },
    });
    if (!asset) {
      this.logger.warn(`media_cross_tenant_blocked tenantId=${tenantId} assetId=${id}`);
      throw new NotFoundException('Midia nao encontrada.');
    }

    const inUse = await this.prisma.product.count({ where: { tenantId, mediaAssetId: id } });
    if (inUse === 0) {
      await this.storage.delete(asset.storageKey ?? asset.path);
    }

    return this.prisma.mediaAsset.update({
      where: { id },
      data: {
        status: 'deleted',
        isActive: false,
        publicationStatus: 'unpublished',
        deletedAt: new Date(),
      },
    });
  }

  async listCategories(scope: MediaScope, tenantId: string | null) {
    return this.prisma.mediaCategory.findMany({
      where: { scope, tenantId, deletedAt: null },
      orderBy: { name: 'asc' },
    });
  }

  async upsertCategory(scope: MediaScope, tenantId: string | null, input: { id?: string; name: string; description?: string | null; isActive?: boolean }) {
    const slug = slugify(input.name);
    if (input.id) {
      const existing = await this.prisma.mediaCategory.findFirst({
        where: { id: input.id, scope, tenantId, deletedAt: null },
      });
      if (!existing) throw new NotFoundException('Categoria nao encontrada.');
      return this.prisma.mediaCategory.update({
        where: { id: input.id },
        data: {
          name: input.name,
          slug,
          description: input.description ?? undefined,
          isActive: input.isActive,
        },
      });
    }

    const existingBySlug = await this.prisma.mediaCategory.findFirst({
      where: { tenantId, scope, slug },
    });

    if (existingBySlug) {
      return this.prisma.mediaCategory.update({
        where: { id: existingBySlug.id },
        data: {
          name: input.name,
          description: input.description ?? undefined,
          isActive: input.isActive ?? true,
        },
      });
    }

    return this.prisma.mediaCategory.create({
      data: {
        tenantId,
        scope,
        name: input.name,
        slug,
        description: input.description ?? null,
        isActive: input.isActive ?? true,
      },
    });
  }

  async deleteCategory(scope: MediaScope, tenantId: string | null, id: string) {
    const existing = await this.prisma.mediaCategory.findFirst({
      where: { id, scope, tenantId, deletedAt: null },
    });
    if (!existing) throw new NotFoundException('Categoria nao encontrada.');

    await this.prisma.mediaAsset.updateMany({
      where: { categoryId: id },
      data: { categoryId: null },
    });

    return this.prisma.mediaCategory.update({
      where: { id },
      data: { isActive: false, deletedAt: new Date() },
    });
  }

  async assertProductCanUseAsset(tenantId: string, assetId: string): Promise<MediaAsset> {
    const asset = await this.prisma.mediaAsset.findFirst({
      where: {
        id: assetId,
        deletedAt: null,
        OR: [
          { tenantId, scope: 'tenant_library', isActive: true, status: 'active' },
          {
            tenantId: null,
            scope: 'system_gallery',
            isSystem: true,
            isActive: true,
            status: 'active',
            publicationStatus: 'published',
          },
        ],
      },
    });
    if (!asset) {
      this.logger.warn(`product_media_asset_blocked tenantId=${tenantId} assetId=${assetId}`);
      throw new BadRequestException('Imagem invalida, privada de outro tenant ou nao publicada.');
    }
    return asset;
  }

  resolveFinalImage(product: { image: string | null; mediaAsset?: { publicUrl: string; altText: string | null; scope: string; tenantId: string | null; isSystem: boolean; isActive: boolean; status: string; publicationStatus: string; deletedAt: Date | null } | null; name: string }) {
    const asset = product.mediaAsset;
    if (asset && asset.deletedAt === null && asset.isActive && asset.status === 'active') {
      const isSystemUsable = asset.scope !== 'system_gallery' || asset.publicationStatus === 'published';
      if (isSystemUsable) {
        return {
          imageUrl: asset.publicUrl,
          imageAltText: asset.altText ?? product.name,
          imageSource: asset.scope === 'system_gallery' ? 'SYSTEM_GALLERY' : 'TENANT_MEDIA',
        };
      }
    }
    if (product.image) {
      return {
        imageUrl: product.image,
        imageAltText: product.name,
        imageSource: 'EXTERNAL_URL',
      };
    }
    return {
      imageUrl: null,
      imageAltText: product.name,
      imageSource: 'PLACEHOLDER',
    };
  }

  private assetFilterWhere(filters: MediaListFilters): Prisma.MediaAssetWhereInput {
    const where: Prisma.MediaAssetWhereInput = {};
    if (filters.search) {
      where.OR = [
        { title: { contains: filters.search, mode: 'insensitive' } },
        { originalName: { contains: filters.search, mode: 'insensitive' } },
        { altText: { contains: filters.search, mode: 'insensitive' } },
      ];
    }
    if (filters.categoryId) where.categoryId = filters.categoryId;
    if (filters.category) where.category = filters.category;
    if (filters.status) where.status = filters.status;
    if (filters.publicationStatus) where.publicationStatus = filters.publicationStatus;
    if (filters.tag) {
      where.tagsJson = { array_contains: [filters.tag] };
    }
    return where;
  }

  private async resolveCategory(tenantId: string | null, scope: MediaScope, categoryId: string | null | undefined) {
    if (categoryId === undefined) return undefined;
    if (categoryId === null || categoryId === '') return null;
    const category = await this.prisma.mediaCategory.findFirst({
      where: { id: categoryId, tenantId, scope, deletedAt: null, isActive: true },
    });
    if (!category) throw new BadRequestException('Categoria de midia invalida.');
    return category;
  }

  private metadataUpdateData(input: MediaMetadataInput, category: { id: string; name: string } | null | undefined): Prisma.MediaAssetUpdateInput {
    const data: Prisma.MediaAssetUpdateInput = {};
    if (input.title !== undefined) data.title = input.title;
    if (input.description !== undefined) data.description = input.description;
    if (input.altText !== undefined) data.altText = input.altText;
    if (input.category !== undefined) data.category = input.category;
    if (category !== undefined) {
      data.categoryRel = category ? { connect: { id: category.id } } : { disconnect: true };
      data.category = category?.name ?? null;
    }
    if (input.tags !== undefined) data.tagsJson = normalizeTags(input.tags);
    if (input.metadata !== undefined) data.metadataJson = input.metadata;
    if (input.status !== undefined) {
      data.status = input.status;
      data.isActive = input.status === 'active';
    }
    if (input.publicationStatus !== undefined) data.publicationStatus = input.publicationStatus;
    return data;
  }
}

function normalizeTags(tags: string[] | undefined): Prisma.InputJsonValue {
  if (!tags) return [];
  return Array.from(new Set(tags.map((tag) => tag.trim().toLowerCase()).filter((tag) => tag.length > 0))).slice(0, 20);
}
