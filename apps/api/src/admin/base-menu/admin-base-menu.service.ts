import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

type ImageCoverageStatus = 'linked_exact' | 'linked_tag' | 'linked_fallback' | 'missing_lookup' | 'no_published_asset' | 'draft_only';

type BaseMenuMediaMatch = {
  id: string;
  title: string | null;
  publicUrl: string;
  altText: string | null;
  filename: string;
  publicationStatus: string;
  tagsJson: unknown;
  metadataJson: unknown;
  category: string | null;
  createdAt: Date;
};

type BaseMenuProductForCoverage = {
  id: string;
  mediaLookupKey: string | null;
  searchTagsJson: unknown;
  metadataJson: unknown;
};

type ProductImageCoverage = {
  status: ImageCoverageStatus;
  asset: BaseMenuMediaMatch | null;
};

@Injectable()
export class AdminBaseMenuService {
  constructor(private readonly prisma: PrismaService) {}

  async list() {
    const templates = await this.prisma.baseMenuTemplate.findMany({
      include: {
        currentPublishedVersion: {
          include: {
            categories: {
              include: { products: true },
            },
          },
        },
        versions: {
          select: {
            id: true,
            versionNumber: true,
            status: true,
            publishedAt: true,
            createdAt: true,
          },
          orderBy: { versionNumber: 'desc' },
        },
      },
      orderBy: { name: 'asc' },
    });

    const products = templates.flatMap((template) =>
      (template.currentPublishedVersion?.categories ?? []).flatMap((category) => category.products),
    );
    const coverage = await this.resolveImageCoverage(products);

    return templates.map((template) => {
      const categories = template.currentPublishedVersion?.categories ?? [];
      const templateProducts = categories.flatMap((category) => category.products);
      const totalProductsWithMediaLookupKey = templateProducts.filter((product) => Boolean(product.mediaLookupKey)).length;
      const totalProductsWithPublishedGlobalImage = templateProducts.filter((product) => ['linked_exact', 'linked_tag', 'linked_fallback'].includes(coverage.get(product.id)?.status ?? '')).length;
      const totalProductsWithoutImage = templateProducts.length - totalProductsWithPublishedGlobalImage;
      return {
        id: template.id,
        slug: template.slug,
        name: template.name,
        description: template.description,
        segment: template.segment,
        icon: template.icon,
        status: template.status,
        currentPublishedVersion: template.currentPublishedVersion
          ? {
              id: template.currentPublishedVersion.id,
              versionNumber: template.currentPublishedVersion.versionNumber,
              status: template.currentPublishedVersion.status,
              publishedAt: template.currentPublishedVersion.publishedAt,
            }
          : null,
        currentPublishedVersionId: template.currentPublishedVersionId,
        totalCategories: categories.length,
        totalProducts: templateProducts.length,
        totalProductsWithMediaLookupKey,
        totalProductsWithPublishedGlobalImage,
        totalProductsWithoutImage,
        lastPublishedAt: template.currentPublishedVersion?.publishedAt ?? null,
        versions: template.versions,
        createdAt: template.createdAt,
        updatedAt: template.updatedAt,
      };
    });
  }

  async get(idOrSlug: string) {
    const template = await this.prisma.baseMenuTemplate.findFirst({
      where: {
        OR: [{ id: idOrSlug }, { slug: idOrSlug }],
      },
      include: {
        currentPublishedVersion: {
          include: {
            categories: {
              include: {
                products: {
                  orderBy: { sortOrder: 'asc' },
                },
              },
              orderBy: { sortOrder: 'asc' },
            },
          },
        },
        versions: {
          orderBy: { versionNumber: 'desc' },
        },
      },
    });

    if (!template) {
      throw new NotFoundException('Template base nao encontrado.');
    }

    const version = template.currentPublishedVersion;
    const categories = version?.categories ?? [];
    const products = categories.flatMap((category) => category.products);
    const coverage = await this.resolveImageCoverage(products);
    const totalProductsWithPublishedGlobalImage = products.filter((product) => ['linked_exact', 'linked_tag', 'linked_fallback'].includes(coverage.get(product.id)?.status ?? '')).length;

    return {
      template: {
        id: template.id,
        slug: template.slug,
        name: template.name,
        description: template.description,
        segment: template.segment,
        icon: template.icon,
        status: template.status,
        metadataJson: template.metadataJson,
        createdAt: template.createdAt,
        updatedAt: template.updatedAt,
      },
      currentPublishedVersion: version
        ? {
            id: version.id,
            versionNumber: version.versionNumber,
            status: version.status,
            publishedAt: version.publishedAt,
            metadataJson: version.metadataJson,
            createdAt: version.createdAt,
            updatedAt: version.updatedAt,
          }
        : null,
      totals: {
        totalCategories: categories.length,
        totalProducts: products.length,
        totalProductsWithMediaLookupKey: products.filter((product) => Boolean(product.mediaLookupKey)).length,
        totalProductsWithPublishedGlobalImage,
        totalProductsWithoutImage: products.length - totalProductsWithPublishedGlobalImage,
      },
      categories: categories.map((category) => ({
        id: category.id,
        slug: category.slug,
        name: category.name,
        description: category.description,
        sortOrder: category.sortOrder,
        metadataJson: category.metadataJson,
        products: category.products.map((product) => {
          const image = coverage.get(product.id) ?? { status: 'missing_lookup' as const, asset: null };
          return {
            id: product.id,
            slug: product.slug,
            name: product.name,
            description: product.description,
            basePrice: Number(product.basePrice),
            compareAtPrice: product.compareAtPrice === null ? null : Number(product.compareAtPrice),
            sortOrder: product.sortOrder,
            mediaLookupKey: product.mediaLookupKey,
            searchTagsJson: extractStringArray(product.searchTagsJson),
            metadataJson: product.metadataJson,
            imageStatus: image.status,
            publishedGlobalImage: image.asset ? formatMediaAsset(image.asset) : null,
          };
        }),
      })),
      versions: template.versions,
    };
  }

  async listVersions(idOrSlug: string) {
    const template = await this.prisma.baseMenuTemplate.findFirst({
      where: {
        OR: [{ id: idOrSlug }, { slug: idOrSlug }],
      },
      select: { id: true },
    });

    if (!template) {
      throw new NotFoundException('Template base nao encontrado.');
    }

    return this.prisma.baseMenuTemplateVersion.findMany({
      where: { templateId: template.id },
      orderBy: { versionNumber: 'desc' },
    });
  }

  async listImportLogs(idOrSlug: string) {
    const template = await this.prisma.baseMenuTemplate.findFirst({
      where: {
        OR: [{ id: idOrSlug }, { slug: idOrSlug }],
      },
      select: { id: true },
    });

    if (!template) {
      throw new NotFoundException('Template base nao encontrado.');
    }

    const logs = await this.prisma.baseMenuImportLog.findMany({
      where: { templateId: template.id },
      include: {
        tenant: {
          select: { id: true, name: true, slug: true },
        },
        version: {
          select: { id: true, versionNumber: true, status: true },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    return logs.map((log) => ({
      id: log.id,
      tenant: log.tenant,
      templateId: log.templateId,
      versionId: log.versionId,
      version: log.version,
      status: log.status,
      categoriesCreated: log.categoriesCreated,
      productsCreated: log.productsCreated,
      categoriesSkipped: log.categoriesSkipped,
      productsSkipped: log.productsSkipped,
      metadataJson: log.metadataJson,
      createdAt: log.createdAt,
    }));
  }

  private async resolveImageCoverage(products: BaseMenuProductForCoverage[]): Promise<Map<string, ProductImageCoverage>> {
    const coverage = new Map<string, ProductImageCoverage>();

    for (const product of products) {
      const productTags = extractStringArray(product.searchTagsJson);
      if (!product.mediaLookupKey && productTags.length === 0) {
        coverage.set(product.id, { status: 'missing_lookup', asset: null });
      }
    }

    const assets = await this.prisma.mediaAsset.findMany({
      where: {
        tenantId: null,
        scope: 'system_gallery',
        isSystem: true,
        isActive: true,
        status: 'active',
        deletedAt: null,
      },
      select: {
        id: true,
        title: true,
        publicUrl: true,
        altText: true,
        filename: true,
        publicationStatus: true,
        tagsJson: true,
        metadataJson: true,
        category: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    const priority = { exact_lookup: 4, lookup_tag: 3, specific_tag: 2, category_fallback: 1, none: 0 };

    for (const product of products) {
      if (coverage.has(product.id)) continue;

      let bestMatch: BaseMenuMediaMatch | null = null;
      let bestStrategy: keyof typeof priority = 'none';

      for (const asset of assets) {
         const strategy = getAssetMatchStrategy(asset, product);
         if (strategy !== 'none') {
             if (priority[strategy] > priority[bestStrategy]) {
                bestStrategy = strategy;
                bestMatch = asset;
             }
         }
      }

      if (bestMatch) {
         if (bestMatch.publicationStatus === 'published') {
            let status: ImageCoverageStatus = 'linked_fallback';
            if (bestStrategy === 'exact_lookup') status = 'linked_exact';
            if (bestStrategy === 'lookup_tag' || bestStrategy === 'specific_tag') status = 'linked_tag';
            coverage.set(product.id, { status, asset: bestMatch });
         } else {
            coverage.set(product.id, { status: 'draft_only', asset: null });
         }
      } else {
         coverage.set(product.id, { status: 'no_published_asset', asset: null });
      }
    }

    return coverage;
  }
}

function getAssetMatchStrategy(asset: BaseMenuMediaMatch, product: BaseMenuProductForCoverage): 'exact_lookup' | 'lookup_tag' | 'specific_tag' | 'category_fallback' | 'none' {
  const tags = extractStringArray(asset.tagsJson);
  
  // 1. exact_lookup
  const lookup = product.mediaLookupKey;
  if (lookup && tags.includes(lookup)) return 'exact_lookup';

  // 2. lookup_tag
  const productTags = extractStringArray(product.searchTagsJson);
  const lookupTags = productTags.filter(t => t.startsWith('lookup:'));
  for (const tag of lookupTags) {
    if (tags.includes(tag)) return 'lookup_tag';
  }

  // 3. specific_tag
  if (productTags.length > 0 && productTags.every((tag) => tags.includes(tag))) return 'specific_tag';

  // 4. category_fallback
  const productMetadata = asRecord(product.metadataJson);
  const mediaCategory = productMetadata.mediaCategory;
  if (typeof mediaCategory === 'string') {
     if (asset.category?.toLowerCase() === mediaCategory.toLowerCase()) return 'category_fallback';
     if (tags.some(t => t.toLowerCase() === `category:${mediaCategory.toLowerCase().replace(/ /g, '_')}`)) return 'category_fallback';
  }

  return 'none';
}

function formatMediaAsset(asset: BaseMenuMediaMatch) {
  return {
    id: asset.id,
    title: asset.title,
    publicUrl: asset.publicUrl,
    altText: asset.altText,
    filename: asset.filename,
    publicationStatus: asset.publicationStatus,
    category: asset.category,
    createdAt: asset.createdAt,
  };
}

function extractStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string');
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
