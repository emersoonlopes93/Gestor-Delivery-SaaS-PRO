import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { MediaLibraryService, MediaUploadFile } from '../../upload/media-library.service';

type BaseMediaStatus = 'draft' | 'published' | 'archived';
type BaseMediaAction =
  | 'media.base.publish'
  | 'media.base.unpublish'
  | 'media.base.archive'
  | 'media.base.restore'
  | 'media.base.delete'
  | 'media.base.replace'
  | 'media.base.bulk_publish'
  | 'media.base.bulk_unpublish'
  | 'media.base.bulk_archive';

export type BaseMediaListFilters = {
  page?: string;
  pageSize?: string;
  search?: string;
  category?: string;
  status?: string;
  product?: string;
  tag?: string;
};

type AdminActor = {
  id: string;
  ip?: string | null;
};

const BASE_MEDIA_TAG = 'source:menu_import_base';
const PLATFORM_AUDIT_TENANT_SLUG = '__platform_audit__';

@Injectable()
export class AdminBaseMediaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly media: MediaLibraryService,
  ) {}

  async list(filters: BaseMediaListFilters) {
    const page = positiveInt(filters.page, 1);
    const pageSize = Math.min(positiveInt(filters.pageSize, 24), 100);
    const where = this.baseWhere(filters);

    const [items, total] = await Promise.all([
      this.prisma.mediaAsset.findMany({
        where,
        include: { categoryRel: true, _count: { select: { products: true } } },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.mediaAsset.count({ where }),
    ]);

    return {
      items: items.map((asset) => this.toBaseMediaItem(asset)),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
      hasNext: page * pageSize < total,
      hasPrevious: page > 1,
    };
  }

  async get(id: string) {
    const asset = await this.prisma.mediaAsset.findFirst({
      where: { id, ...this.baseWhere({}) },
      include: { categoryRel: true, _count: { select: { products: true } } },
    });
    if (!asset) throw new NotFoundException('Midia base nao encontrada.');

    const history = await this.prisma.auditLog.findMany({
      where: {
        resource: 'base_media',
        details: { path: ['assetId'], equals: id },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: { tenant: { select: { id: true, name: true, slug: true } } },
    });
    const adminIds = Array.from(new Set(history.map((log) => log.userId).filter((userId): userId is string => Boolean(userId))));
    const admins = adminIds.length > 0
      ? await this.prisma.adminUser.findMany({
        where: { id: { in: adminIds } },
        select: { id: true, name: true, email: true },
      })
      : [];
    const adminById = new Map(admins.map((admin) => [admin.id, admin]));

    return {
      ...this.toBaseMediaItem(asset),
      history: history.map((log) => ({
        id: log.id,
        action: log.action,
        userId: log.userId,
        userName: log.userId ? adminById.get(log.userId)?.name ?? null : null,
        userEmail: log.userId ? adminById.get(log.userId)?.email ?? null : null,
        userType: log.userType,
        ip: log.ip,
        createdAt: log.createdAt,
        details: log.details,
      })),
    };
  }

  async publish(id: string, actor: AdminActor) {
    return this.changeStatus(id, 'published', 'media.base.publish', actor);
  }

  async unpublish(id: string, actor: AdminActor) {
    return this.changeStatus(id, 'draft', 'media.base.unpublish', actor);
  }

  async archive(id: string, actor: AdminActor) {
    return this.changeStatus(id, 'archived', 'media.base.archive', actor);
  }

  async restore(id: string, actor: AdminActor) {
    return this.changeStatus(id, 'draft', 'media.base.restore', actor);
  }

  async delete(id: string, actor: AdminActor) {
    const asset = await this.prisma.mediaAsset.findFirst({
      where: { id, ...this.baseWhere({}) },
      select: { id: true, publicationStatus: true, metadataJson: true, tagsJson: true },
    });
    if (!asset) throw new NotFoundException('Midia base nao encontrada.');

    const updated = await this.prisma.mediaAsset.update({
      where: { id },
      data: {
        status: 'deleted',
        isActive: false,
        publicationStatus: 'archived',
        deletedAt: new Date(),
      },
    });

    await this.audit('media.base.delete', actor, {
      assetId: id,
      previousStatus: asset.publicationStatus,
      productName: metadataString(metadataObject(asset.metadataJson), 'productName'),
      mediaLookupKey: lookupKeyFromTags(asset.tagsJson),
    });

    return updated;
  }

  async bulk(ids: string[], status: BaseMediaStatus, action: BaseMediaAction, actor: AdminActor) {
    const uniqueIds = Array.from(new Set(ids.filter((id) => id.trim().length > 0)));
    if (uniqueIds.length === 0) throw new BadRequestException('Nenhum asset selecionado.');

    const assets = await this.prisma.mediaAsset.findMany({
      where: { id: { in: uniqueIds }, ...this.baseWhere({}) },
      select: { id: true, publicationStatus: true, title: true },
    });

    await this.prisma.mediaAsset.updateMany({
      where: { id: { in: assets.map((asset) => asset.id) } },
      data: { publicationStatus: status },
    });

    await this.audit(action, actor, {
      assetIds: assets.map((asset) => asset.id),
      count: assets.length,
      nextStatus: status,
    });

    return { updated: assets.length, requested: uniqueIds.length };
  }

  async replace(id: string, file: MediaUploadFile, actor: AdminActor) {
    const asset = await this.prisma.mediaAsset.findFirst({
      where: { id, ...this.baseWhere({}) },
    });
    if (!asset) throw new NotFoundException('Midia base nao encontrada.');

    const metadata = metadataObject(asset.metadataJson);
    const category = await this.media.upsertCategory('system_gallery', null, {
      name: asset.category ?? metadataString(metadata, 'category') ?? 'Cardapio Base',
      isActive: true,
    });

    const replacement = await this.media.uploadSystemAsset(
      file,
      {
        title: asset.title ?? asset.originalName ?? file.originalname,
        description: asset.description,
        altText: asset.altText ?? asset.title ?? file.originalname,
        categoryId: category.id,
        publicationStatus: 'draft',
        tags: tagsArray(asset.tagsJson),
        metadata: {
          ...metadata,
          replacedFromAssetId: asset.id,
          replacedAt: new Date().toISOString(),
        },
      },
      actor.id,
    );

    await this.prisma.mediaAsset.update({
      where: { id: asset.id },
      data: {
        publicationStatus: 'archived',
        isActive: false,
      },
    });

    await this.audit('media.base.replace', actor, {
      assetId: asset.id,
      replacementAssetId: replacement.id,
      productName: metadataString(metadata, 'productName'),
      mediaLookupKey: lookupKeyFromTags(asset.tagsJson),
    });

    return {
      previous: { id: asset.id, publicationStatus: 'archived' },
      replacement,
    };
  }

  private async changeStatus(id: string, status: BaseMediaStatus, action: BaseMediaAction, actor: AdminActor) {
    const asset = await this.prisma.mediaAsset.findFirst({
      where: { id, ...this.baseWhere({}) },
      select: { id: true, publicationStatus: true, metadataJson: true, tagsJson: true },
    });
    if (!asset) throw new NotFoundException('Midia base nao encontrada.');

    const updated = await this.prisma.mediaAsset.update({
      where: { id },
      data: { publicationStatus: status },
    });

    await this.audit(action, actor, {
      assetId: id,
      previousStatus: asset.publicationStatus,
      nextStatus: status,
      productName: metadataString(metadataObject(asset.metadataJson), 'productName'),
      mediaLookupKey: lookupKeyFromTags(asset.tagsJson),
    });

    return updated;
  }

  private baseWhere(filters: BaseMediaListFilters): Prisma.MediaAssetWhereInput {
    const and: Prisma.MediaAssetWhereInput[] = [
      {
        tenantId: null,
        scope: 'system_gallery',
        isSystem: true,
        deletedAt: null,
        tagsJson: { array_contains: [BASE_MEDIA_TAG] },
      },
    ];

    if (filters.status) and.push({ publicationStatus: filters.status });
    if (filters.category) and.push({ category: filters.category });
    if (filters.tag) and.push({ tagsJson: { array_contains: [filters.tag] } });
    if (filters.product) {
      and.push({ metadataJson: { path: ['productName'], string_contains: filters.product } });
    }
    if (filters.search) {
      const search = filters.search;
      and.push({
        OR: [
          { title: { contains: search, mode: 'insensitive' } },
          { originalName: { contains: search, mode: 'insensitive' } },
          { altText: { contains: search, mode: 'insensitive' } },
          { category: { contains: search, mode: 'insensitive' } },
          { tagsJson: { array_contains: [search] } },
          { metadataJson: { path: ['productName'], string_contains: search } },
          { metadataJson: { path: ['mediaLookupKey'], string_contains: search } },
        ],
      });
    }

    return { AND: and };
  }

  private toBaseMediaItem(asset: {
    id: string;
    title: string | null;
    description: string | null;
    category: string | null;
    categoryId: string | null;
    filename: string;
    originalName: string | null;
    mimeType: string;
    sizeBytes: number;
    publicUrl: string;
    altText: string | null;
    metadataJson: Prisma.JsonValue | null;
    tagsJson: Prisma.JsonValue | null;
    publicationStatus: string;
    createdByUserId: string | null;
    createdAt: Date;
    updatedAt: Date;
    categoryRel?: { id: string; name: string; slug: string } | null;
    _count?: { products: number };
  }) {
    const metadata = metadataObject(asset.metadataJson);
    return {
      id: asset.id,
      title: asset.title,
      description: asset.description,
      category: asset.category,
      categoryId: asset.categoryId,
      categoryName: asset.categoryRel?.name ?? asset.category,
      filename: asset.filename,
      originalName: asset.originalName,
      mimeType: asset.mimeType,
      sizeBytes: asset.sizeBytes,
      publicUrl: asset.publicUrl,
      altText: asset.altText,
      tagsJson: tagsArray(asset.tagsJson),
      metadataJson: metadata,
      publicationStatus: asset.publicationStatus,
      createdByUserId: asset.createdByUserId,
      createdAt: asset.createdAt,
      updatedAt: asset.updatedAt,
      productName: metadataString(metadata, 'productName') ?? asset.title,
      prompt: metadataString(metadata, 'prompt'),
      negativePrompt: metadataString(metadata, 'negativePrompt'),
      mediaLookupKey: lookupKeyFromTags(asset.tagsJson) ?? metadataString(metadata, 'mediaLookupKey'),
      usage_count: asset._count?.products ?? 0,
    };
  }

  private async audit(action: BaseMediaAction, actor: AdminActor, details: Prisma.InputJsonObject) {
    const tenantId = await this.platformAuditTenantId();
    await this.prisma.auditLog.create({
      data: {
        tenantId,
        userId: actor.id,
        userType: 'admin',
        action,
        resource: 'base_media',
        details,
        ip: actor.ip ?? null,
      },
    });
  }

  private async platformAuditTenantId(): Promise<string> {
    const tenant = await this.prisma.tenant.upsert({
      where: { slug: PLATFORM_AUDIT_TENANT_SLUG },
      update: {},
      create: {
        name: 'Platform Audit',
        slug: PLATFORM_AUDIT_TENANT_SLUG,
        status: 'active',
      },
      select: { id: true },
    });
    return tenant.id;
  }
}

function positiveInt(raw: string | undefined, fallback: number): number {
  const value = raw ? Number.parseInt(raw, 10) : Number.NaN;
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function tagsArray(value: Prisma.JsonValue | null): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function metadataObject(value: Prisma.JsonValue | null): Prisma.InputJsonObject {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const source = value as Record<string, unknown>;
  const result: Record<string, Prisma.InputJsonValue> = {};
  for (const [key, item] of Object.entries(source)) {
    if (isJsonValue(item)) result[key] = item;
  }
  return result as Prisma.InputJsonObject;
}

function metadataString(metadata: Prisma.InputJsonObject, key: string): string | null {
  const value = metadata[key];
  return typeof value === 'string' ? value : null;
}

function lookupKeyFromTags(value: Prisma.JsonValue | null): string | null {
  return tagsArray(value).find((tag) => tag.startsWith('lookup:')) ?? null;
}

function isJsonValue(value: unknown): value is Prisma.InputJsonValue {
  if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return true;
  if (Array.isArray(value)) return value.every(isJsonValue);
  if (typeof value === 'object') {
    return Object.values(value as Record<string, unknown>).every(isJsonValue);
  }
  return false;
}
