/* eslint-disable @typescript-eslint/no-unused-vars */
import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { parseBaseMenuProductOptionGroups } from '../../catalog/menu-import/base-menu-options.parser';

const PLATFORM_AUDIT_TENANT_SLUG = '__platform_audit__';

type ImageCoverageStatus = 'linked_exact' | 'linked_tag' | 'linked_fallback' | 'missing_lookup' | 'no_published_asset' | 'draft_only';
type BaseMenuAdminAction =
  | 'base_menu.draft.create'
  | 'base_menu.template.update'
  | 'base_menu.category.create'
  | 'base_menu.category.update'
  | 'base_menu.category.delete'
  | 'base_menu.product.create'
  | 'base_menu.product.update'
  | 'base_menu.product.delete'
  | 'base_menu.draft.publish'
  | 'base_menu.draft.publish_blocked'
  | 'base_menu.draft.discard'
  | 'base_menu.template.create'
  | 'base_menu.template.duplicate'
  | 'base_menu.template.archive'
  | 'base_menu.template.restore';

type AdminActor = {
  id: string | null;
  ip?: string;
};

export type CreateTemplateBody = {
  name: unknown;
  slug?: unknown;
  description?: unknown;
  segment?: unknown;
  icon?: unknown;
  metadataJson?: unknown;
};

export type DuplicateTemplateBody = {
  name: unknown;
  slug?: unknown;
  description?: unknown;
};

export type UpdateTemplateBody = {
  name?: unknown;
  description?: unknown;
  segment?: unknown;
  icon?: unknown;
  metadataJson?: unknown;
};

export type CategoryBody = {
  slug?: unknown;
  name?: unknown;
  description?: unknown;
  sortOrder?: unknown;
  metadataJson?: unknown;
};

export type ProductBody = {
  slug?: unknown;
  name?: unknown;
  description?: unknown;
  basePrice?: unknown;
  compareAtPrice?: unknown;
  sortOrder?: unknown;
  categoryId?: unknown;
  mediaLookupKey?: unknown;
  searchTagsJson?: unknown;
  metadataJson?: unknown;
};

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

type AuditClient = Pick<Prisma.TransactionClient, 'tenant' | 'auditLog'>;

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
      const draftVersion = template.versions.find((version) => version.status === 'draft') ?? null;
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
        draftVersion,
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
    const draftVersion = template.versions.find((item) => item.status === 'draft') ?? null;
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
      draftVersion: draftVersion
        ? {
            id: draftVersion.id,
            versionNumber: draftVersion.versionNumber,
            status: draftVersion.status,
            publishedAt: draftVersion.publishedAt,
            metadataJson: draftVersion.metadataJson,
            createdAt: draftVersion.createdAt,
            updatedAt: draftVersion.updatedAt,
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
      select: { id: true, currentPublishedVersionId: true },
    });

    if (!template) {
      throw new NotFoundException('Template base nao encontrado.');
    }

    const versions = await this.prisma.baseMenuTemplateVersion.findMany({
      where: { templateId: template.id },
      include: {
        categories: {
          include: { products: true },
          orderBy: { sortOrder: 'asc' },
        },
      },
      orderBy: { versionNumber: 'desc' },
    });

    const products = versions.flatMap((version) => version.categories.flatMap((category) => category.products));
    const coverage = await this.resolveImageCoverage(products);

    return versions.map((version) => {
      const versionProducts = version.categories.flatMap((category) => category.products);
      const linkedImages = versionProducts.filter((product) => ['linked_exact', 'linked_tag', 'linked_fallback'].includes(coverage.get(product.id)?.status ?? '')).length;
      const fallbackImages = versionProducts.filter((product) => coverage.get(product.id)?.status === 'linked_fallback').length;
      return {
        id: version.id,
        templateId: version.templateId,
        versionNumber: version.versionNumber,
        status: version.status,
        publishedAt: version.publishedAt,
        metadataJson: version.metadataJson,
        createdAt: version.createdAt,
        updatedAt: version.updatedAt,
        isCurrentPublished: version.id === template.currentPublishedVersionId,
        totals: {
          categories: version.categories.length,
          products: versionProducts.length,
          linkedImages,
          missingImages: versionProducts.length - linkedImages,
          fallbackImages,
        },
      };
    });
  }

  async getDraft(idOrSlug: string) {
    const template = await this.findTemplateOrThrow(idOrSlug);
    const draft = await this.prisma.baseMenuTemplateVersion.findFirst({
      where: { templateId: template.id, status: 'draft' },
      include: {
        categories: {
          include: { products: { orderBy: { sortOrder: 'asc' } } },
          orderBy: { sortOrder: 'asc' },
        },
      },
      orderBy: { versionNumber: 'desc' },
    });

    if (!draft) {
      throw new NotFoundException('Draft aberto nao encontrado para este template.');
    }

    return this.formatEditableVersion(template, draft);
  }

  async createDraftVersion(idOrSlug: string, actor: AdminActor) {
    const template = await this.prisma.baseMenuTemplate.findFirst({
      where: { OR: [{ id: idOrSlug }, { slug: idOrSlug }] },
      include: {
        currentPublishedVersion: {
          include: {
            categories: {
              include: { products: true },
              orderBy: { sortOrder: 'asc' },
            },
          },
        },
        versions: { orderBy: { versionNumber: 'desc' } },
      },
    });

    if (!template) {
      throw new NotFoundException('Template base nao encontrado.');
    }

    const existingDraft = template.versions.find((version) => version.status === 'draft');
    if (existingDraft) {
      return this.getDraft(template.id);
    }

    const published = template.currentPublishedVersion;
    if (!published || published.status !== 'published') {
      throw new BadRequestException('Template precisa ter uma versao publicada antes de criar draft.');
    }

    const nextVersionNumber = Math.max(...template.versions.map((version) => version.versionNumber), 0) + 1;

    try {
      const draft = await this.prisma.$transaction(async (tx) => {
        const created = await tx.baseMenuTemplateVersion.create({
          data: {
            templateId: template.id,
            versionNumber: nextVersionNumber,
            status: 'draft',
            metadataJson: published.metadataJson === null ? Prisma.JsonNull : published.metadataJson,
          },
        });

        for (const category of published.categories) {
          const createdCategory = await tx.baseMenuCategory.create({
            data: {
              versionId: created.id,
              slug: category.slug,
              name: category.name,
              description: category.description,
              sortOrder: category.sortOrder,
              metadataJson: category.metadataJson === null ? Prisma.JsonNull : category.metadataJson,
            },
          });

          for (const product of category.products) {
            await tx.baseMenuProduct.create({
              data: {
                categoryId: createdCategory.id,
                slug: product.slug,
                name: product.name,
                description: product.description,
                basePrice: product.basePrice,
                compareAtPrice: product.compareAtPrice,
                sortOrder: product.sortOrder,
                mediaLookupKey: product.mediaLookupKey,
                searchTagsJson: product.searchTagsJson,
                metadataJson: product.metadataJson === null ? Prisma.JsonNull : product.metadataJson,
              },
            });
          }
        }

        return created;
      }, {
        maxWait: Number(process.env.PRISMA_TX_MAX_WAIT_MS ?? 5000),
        timeout: Number(process.env.PRISMA_BASE_MENU_DRAFT_TX_TIMEOUT_MS ?? 20000),
      });

      await this.audit(this.prisma, 'base_menu.draft.create', actor, {
        templateId: template.id,
        versionId: draft.id,
        fromVersionId: published.id,
        fromVersionNumber: published.versionNumber,
        versionNumber: draft.versionNumber,
      });

      return this.getDraft(draft.templateId);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        try {
          return await this.getDraft(template.id);
        } catch (getDraftError) {
          throw error;
        }
      }
      throw error;
    }
  }

  async createTemplate(body: CreateTemplateBody, actor: AdminActor) {
    const name = requiredString(body.name, 'name', 140);
    const slug = normalizeSlug(typeof body.slug === 'string' && body.slug.trim() ? body.slug : name);
    const segment = typeof body.segment === 'string' && body.segment.trim() ? normalizeSlug(body.segment) : 'geral';

    const existing = await this.prisma.baseMenuTemplate.findFirst({ where: { slug } });
    if (existing) {
      throw new ConflictException('Já existe um Cardápio Base com este slug.');
    }

    const created = await this.prisma.$transaction(async (tx) => {
      const template = await tx.baseMenuTemplate.create({
        data: {
          slug,
          name,
          description: optionalString(body.description, 'description'),
          segment,
          icon: optionalString(body.icon, 'icon', 20),
          status: 'draft',
          metadataJson: jsonObjectOrNull(body.metadataJson),
        },
      });

      const draft = await tx.baseMenuTemplateVersion.create({
        data: {
          templateId: template.id,
          versionNumber: 1,
          status: 'draft',
          metadataJson: template.metadataJson,
        },
      });

      await this.audit(tx, 'base_menu.template.create', actor, {
        templateId: template.id,
        versionId: draft.id,
        after: template,
      });

      return template;
    });

    return this.getDraft(created.id);
  }

  async duplicateTemplate(idOrSlug: string, body: DuplicateTemplateBody, actor: AdminActor) {
    const sourceTemplate = await this.findTemplateOrThrow(idOrSlug);
    const sourceVersion = await this.prisma.baseMenuTemplateVersion.findFirst({
      where: {
        templateId: sourceTemplate.id,
        status: sourceTemplate.currentPublishedVersionId ? 'published' : 'draft',
      },
      include: {
        categories: {
          include: { products: true },
        },
      },
      orderBy: { versionNumber: 'desc' },
    });

    if (!sourceVersion) {
      throw new BadRequestException('Template origem não possui uma versão válida para duplicar.');
    }

    const name = requiredString(body.name, 'name', 140);
    const slug = normalizeSlug(typeof body.slug === 'string' && body.slug.trim() ? body.slug : name);

    const existing = await this.prisma.baseMenuTemplate.findFirst({ where: { slug } });
    if (existing) {
      throw new ConflictException('Já existe um Cardápio Base com este slug.');
    }

    const duplicated = await this.prisma.$transaction(async (tx) => {
      const template = await tx.baseMenuTemplate.create({
        data: {
          slug,
          name,
          description: optionalString(body.description, 'description') ?? sourceTemplate.description,
          segment: sourceTemplate.segment,
          icon: sourceTemplate.icon,
          status: 'draft',
          metadataJson: sourceTemplate.metadataJson === null ? Prisma.JsonNull : sourceTemplate.metadataJson,
        },
      });

      const draft = await tx.baseMenuTemplateVersion.create({
        data: {
          templateId: template.id,
          versionNumber: 1,
          status: 'draft',
          metadataJson: sourceVersion.metadataJson === null ? Prisma.JsonNull : sourceVersion.metadataJson,
        },
      });

      for (const category of sourceVersion.categories) {
        const createdCategory = await tx.baseMenuCategory.create({
          data: {
            versionId: draft.id,
            slug: category.slug,
            name: category.name,
            description: category.description,
            sortOrder: category.sortOrder,
            metadataJson: category.metadataJson === null ? Prisma.JsonNull : category.metadataJson,
          },
        });

        for (const product of category.products) {
          await tx.baseMenuProduct.create({
            data: {
              categoryId: createdCategory.id,
              slug: product.slug,
              name: product.name,
              description: product.description,
              basePrice: product.basePrice,
              compareAtPrice: product.compareAtPrice,
              sortOrder: product.sortOrder,
              mediaLookupKey: product.mediaLookupKey,
              searchTagsJson: product.searchTagsJson === null ? Prisma.JsonNull : product.searchTagsJson,
              metadataJson: product.metadataJson === null ? Prisma.JsonNull : product.metadataJson,
            },
          });
        }
      }

      await this.audit(tx, 'base_menu.template.duplicate', actor, {
        templateId: template.id,
        versionId: draft.id,
        sourceTemplateId: sourceTemplate.id,
        sourceVersionId: sourceVersion.id,
      });

      return template;
    });

    return this.getDraft(duplicated.id);
  }

  async archiveTemplate(idOrSlug: string, actor: AdminActor) {
    const template = await this.findTemplateOrThrow(idOrSlug);
    
    if (template.status === 'archived') {
      return { archived: true, status: 'archived' };
    }

    const archived = await this.prisma.$transaction(async (tx) => {
      const result = await tx.baseMenuTemplate.update({
        where: { id: template.id },
        data: { status: 'archived' },
      });
      await this.audit(tx, 'base_menu.template.archive', actor, {
        templateId: template.id,
        beforeStatus: template.status,
      });
      return result;
    });

    return archived;
  }

  async restoreTemplate(idOrSlug: string, actor: AdminActor) {
    const template = await this.findTemplateOrThrow(idOrSlug);
    
    if (template.status !== 'archived') {
      throw new BadRequestException('Apenas templates arquivados podem ser restaurados.');
    }

    const nextStatus = template.currentPublishedVersionId ? 'published' : 'draft';

    const restored = await this.prisma.$transaction(async (tx) => {
      const result = await tx.baseMenuTemplate.update({
        where: { id: template.id },
        data: { status: nextStatus },
      });
      await this.audit(tx, 'base_menu.template.restore', actor, {
        templateId: template.id,
        beforeStatus: template.status,
        afterStatus: nextStatus,
      });
      return result;
    });

    return restored;
  }

  async updateTemplate(idOrSlug: string, body: UpdateTemplateBody, actor: AdminActor) {
    const template = await this.findTemplateOrThrow(idOrSlug);
    const data: Prisma.BaseMenuTemplateUpdateInput = {};

    if ('name' in body) data.name = requiredString(body.name, 'name', 140);
    if ('description' in body) data.description = optionalString(body.description, 'description');
    if ('segment' in body) data.segment = requiredString(body.segment, 'segment', 80);
    if ('icon' in body) data.icon = optionalString(body.icon, 'icon', 20);
    if ('metadataJson' in body) data.metadataJson = mergeJsonObject(template.metadataJson, body.metadataJson);

    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.baseMenuTemplate.update({
        where: { id: template.id },
        data,
      });
      await this.audit(tx, 'base_menu.template.update', actor, {
        templateId: template.id,
        before: pickTemplateAudit(template),
        after: pickTemplateAudit(result),
      });
      return result;
    });

    return updated;
  }

  async createCategory(idOrSlug: string, versionId: string, body: CategoryBody, actor: AdminActor) {
    const { template, version } = await this.requireDraftVersion(idOrSlug, versionId);
    const name = requiredString(body.name, 'name', 140);
    const slug = normalizeSlug(typeof body.slug === 'string' && body.slug.trim() ? body.slug : name);
    const created = await this.prisma.$transaction(async (tx) => {
      await this.ensureCategorySlugAvailable(tx, version.id, slug);
      const result = await tx.baseMenuCategory.create({
        data: {
          versionId: version.id,
          slug,
          name,
          description: optionalString(body.description, 'description'),
          sortOrder: optionalNumber(body.sortOrder, 'sortOrder') ?? 0,
          metadataJson: jsonObjectOrNull(body.metadataJson),
        },
      });
      await this.audit(tx, 'base_menu.category.create', actor, { templateId: template.id, versionId: version.id, entityId: result.id, after: result });
      return result;
    });
    return created;
  }

  async updateCategory(idOrSlug: string, versionId: string, categoryId: string, body: CategoryBody, actor: AdminActor) {
    const { template, version } = await this.requireDraftVersion(idOrSlug, versionId);
    const category = await this.findCategoryInVersion(categoryId, version.id);
    const data: Prisma.BaseMenuCategoryUpdateInput = {};
    if ('name' in body) data.name = requiredString(body.name, 'name', 140);
    if ('slug' in body) {
      const slug = normalizeSlug(requiredString(body.slug, 'slug', 100));
      await this.ensureCategorySlugAvailable(this.prisma, version.id, slug, category.id);
      data.slug = slug;
    }
    if ('description' in body) data.description = optionalString(body.description, 'description');
    if ('sortOrder' in body) data.sortOrder = requiredNumber(body.sortOrder, 'sortOrder');
    if ('metadataJson' in body) data.metadataJson = mergeJsonObject(category.metadataJson, body.metadataJson);

    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.baseMenuCategory.update({ where: { id: category.id }, data });
      await this.audit(tx, 'base_menu.category.update', actor, { templateId: template.id, versionId: version.id, entityId: category.id, before: category, after: result });
      return result;
    });
    return updated;
  }

  async deleteCategory(idOrSlug: string, versionId: string, categoryId: string, actor: AdminActor, force: boolean) {
    const { template, version } = await this.requireDraftVersion(idOrSlug, versionId);
    const category = await this.findCategoryInVersion(categoryId, version.id);
    const productCount = await this.prisma.baseMenuProduct.count({ where: { categoryId: category.id } });
    if (productCount > 0 && !force) {
      throw new BadRequestException('Categoria possui produtos. Reenvie com force=true para remover do draft.');
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.baseMenuCategory.delete({ where: { id: category.id } });
      await this.audit(tx, 'base_menu.category.delete', actor, { templateId: template.id, versionId: version.id, entityId: category.id, before: category, metadata: { productsRemoved: productCount } });
    });
    return { deleted: true };
  }

  async createProduct(idOrSlug: string, versionId: string, categoryId: string, body: ProductBody, actor: AdminActor) {
    const { template, version } = await this.requireDraftVersion(idOrSlug, versionId);
    const category = await this.findCategoryInVersion(categoryId, version.id);
    const name = requiredString(body.name, 'name', 180);
    const slug = normalizeSlug(typeof body.slug === 'string' && body.slug.trim() ? body.slug : name);
    const price = requiredMoney(body.basePrice ?? 0, 'basePrice');
    const compareAtPrice = optionalMoney(body.compareAtPrice, 'compareAtPrice');
    validateCompareAtPrice(price, compareAtPrice);
    validateBaseMenuProductMetadata(body.metadataJson);
    const created = await this.prisma.$transaction(async (tx) => {
      await this.ensureProductSlugAvailable(tx, category.id, slug);
      const result = await tx.baseMenuProduct.create({
        data: {
          categoryId: category.id,
          slug,
          name,
          description: optionalString(body.description, 'description'),
          basePrice: price,
          compareAtPrice,
          sortOrder: optionalNumber(body.sortOrder, 'sortOrder') ?? 0,
          mediaLookupKey: normalizeOptionalLookup(body.mediaLookupKey),
          searchTagsJson: stringArrayJson(body.searchTagsJson),
          metadataJson: jsonObjectOrNull(body.metadataJson),
        },
      });
      await this.audit(tx, 'base_menu.product.create', actor, { templateId: template.id, versionId: version.id, entityId: result.id, after: result });
      return result;
    });
    return created;
  }

  async updateProduct(idOrSlug: string, versionId: string, productId: string, body: ProductBody, actor: AdminActor) {
    const { template, version } = await this.requireDraftVersion(idOrSlug, versionId);
    const product = await this.findProductInVersion(productId, version.id);
    const nextCategory = 'categoryId' in body && typeof body.categoryId === 'string' && body.categoryId.trim()
      ? await this.findCategoryInVersion(body.categoryId, version.id)
      : null;
    const data: Prisma.BaseMenuProductUpdateInput = {};

    if ('name' in body) data.name = requiredString(body.name, 'name', 180);
    if ('slug' in body) {
      const slug = normalizeSlug(requiredString(body.slug, 'slug', 120));
      await this.ensureProductSlugAvailable(this.prisma, nextCategory?.id ?? product.categoryId, slug, product.id);
      data.slug = slug;
    }
    if ('description' in body) data.description = optionalString(body.description, 'description');
    let nextBase = product.basePrice;
    let nextCompare = product.compareAtPrice;
    if ('basePrice' in body) {
      nextBase = requiredMoney(body.basePrice, 'basePrice');
      data.basePrice = nextBase;
    }
    if ('compareAtPrice' in body) {
      nextCompare = optionalMoney(body.compareAtPrice, 'compareAtPrice');
      data.compareAtPrice = nextCompare;
    }
    if ('sortOrder' in body) data.sortOrder = requiredNumber(body.sortOrder, 'sortOrder');
    if (nextCategory) data.category = { connect: { id: nextCategory.id } };
    if ('mediaLookupKey' in body) data.mediaLookupKey = normalizeOptionalLookup(body.mediaLookupKey);
    if ('searchTagsJson' in body) data.searchTagsJson = stringArrayJson(body.searchTagsJson);
    if ('metadataJson' in body) {
      validateBaseMenuProductMetadata(body.metadataJson);
      data.metadataJson = mergeJsonObject(product.metadataJson, body.metadataJson);
    }

    validateCompareAtPrice(nextBase, nextCompare);

    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.baseMenuProduct.update({ where: { id: product.id }, data });
      await this.audit(tx, 'base_menu.product.update', actor, { templateId: template.id, versionId: version.id, entityId: product.id, before: product, after: result });
      return result;
    });
    return updated;
  }

  async deleteProduct(idOrSlug: string, versionId: string, productId: string, actor: AdminActor) {
    const { template, version } = await this.requireDraftVersion(idOrSlug, versionId);
    const product = await this.findProductInVersion(productId, version.id);
    await this.prisma.$transaction(async (tx) => {
      await tx.baseMenuProduct.delete({ where: { id: product.id } });
      await this.audit(tx, 'base_menu.product.delete', actor, { templateId: template.id, versionId: version.id, entityId: product.id, before: product });
    });
    return { deleted: true };
  }

  async validateDraft(idOrSlug: string) {
    const template = await this.findTemplateOrThrow(idOrSlug);
    const draft = await this.prisma.baseMenuTemplateVersion.findFirst({
      where: { templateId: template.id, status: 'draft' },
      include: {
        categories: {
          include: { products: true },
          orderBy: { sortOrder: 'asc' },
        },
      },
      orderBy: { versionNumber: 'desc' },
    });
    if (!draft) throw new NotFoundException('Draft aberto nao encontrado para este template.');
    return this.validateDraftVersion(template, draft);
  }

  async publishDraft(idOrSlug: string, actor: AdminActor) {
    const template = await this.findTemplateOrThrow(idOrSlug);
    const draft = await this.prisma.baseMenuTemplateVersion.findFirst({
      where: { templateId: template.id, status: 'draft' },
      include: {
        categories: {
          include: { products: true },
          orderBy: { sortOrder: 'asc' },
        },
      },
      orderBy: { versionNumber: 'desc' },
    });
    if (!draft) throw new NotFoundException('Draft aberto nao encontrado para este template.');

    const validation = await this.validateDraftVersion(template, draft);
    if (validation.errors.length > 0) {
      await this.prisma.$transaction(async (tx) => {
        await this.audit(tx, 'base_menu.draft.publish_blocked', actor, {
          templateId: template.id,
          versionId: draft.id,
          versionNumber: draft.versionNumber,
          validation,
        });
      });
      throw new BadRequestException({ message: 'Draft possui erros bloqueantes.', validation });
    }

    const previousVersionId = template.currentPublishedVersionId;
    const published = await this.prisma.$transaction(async (tx) => {
      const now = new Date();
      await tx.baseMenuTemplateVersion.updateMany({
        where: { templateId: template.id, status: 'published', id: { not: draft.id } },
        data: { status: 'archived' },
      });
      const result = await tx.baseMenuTemplateVersion.update({
        where: { id: draft.id },
        data: { status: 'published', publishedAt: now },
      });
      await tx.baseMenuTemplate.update({
        where: { id: template.id },
        data: { status: 'published', currentPublishedVersionId: draft.id },
      });
      await this.audit(tx, 'base_menu.draft.publish', actor, {
        templateId: template.id,
        versionId: draft.id,
        previousVersionId,
        versionNumber: draft.versionNumber,
        validation,
      });
      return result;
    });

    return { published, validation };
  }

  async discardDraft(idOrSlug: string, actor: AdminActor) {
    const template = await this.findTemplateOrThrow(idOrSlug);
    const draft = await this.prisma.baseMenuTemplateVersion.findFirst({
      where: { templateId: template.id, status: 'draft' },
      include: {
        categories: {
          include: { products: true },
        },
      },
      orderBy: { versionNumber: 'desc' },
    });
    if (!draft) throw new NotFoundException('Draft aberto nao encontrado para este template.');

    const result = await this.prisma.$transaction(async (tx) => {
      const archived = await tx.baseMenuTemplateVersion.update({
        where: { id: draft.id },
        data: {
          status: 'archived',
          metadataJson: mergeJsonObject(draft.metadataJson, {
            discardedAt: new Date().toISOString(),
            discardedByAdminId: actor.id,
          }),
        },
      });
      await this.audit(tx, 'base_menu.draft.discard', actor, {
        templateId: template.id,
        versionId: draft.id,
        versionNumber: draft.versionNumber,
        currentPublishedVersionId: template.currentPublishedVersionId,
        totals: {
          categories: draft.categories.length,
          products: draft.categories.reduce((sum, category) => sum + category.products.length, 0),
        },
      });
      return archived;
    });

    return {
      discarded: true,
      version: result,
      currentPublishedVersionId: template.currentPublishedVersionId,
    };
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

  private async findTemplateOrThrow(idOrSlug: string) {
    const template = await this.prisma.baseMenuTemplate.findFirst({
      where: { OR: [{ id: idOrSlug }, { slug: idOrSlug }] },
    });
    if (!template) throw new NotFoundException('Template base nao encontrado.');
    return template;
  }

  private async requireDraftVersion(idOrSlug: string, versionId: string) {
    const template = await this.findTemplateOrThrow(idOrSlug);
    const version = await this.prisma.baseMenuTemplateVersion.findFirst({
      where: { id: versionId, templateId: template.id },
    });
    if (!version) throw new NotFoundException('Versao do template nao encontrada.');
    if (version.status !== 'draft') throw new ForbiddenException('Somente versoes draft podem ser editadas.');
    return { template, version };
  }

  private async findCategoryInVersion(categoryId: string, versionId: string) {
    const category = await this.prisma.baseMenuCategory.findFirst({ where: { id: categoryId, versionId } });
    if (!category) throw new NotFoundException('Categoria draft nao encontrada.');
    return category;
  }

  private async findProductInVersion(productId: string, versionId: string) {
    const product = await this.prisma.baseMenuProduct.findFirst({
      where: { id: productId, category: { versionId } },
    });
    if (!product) throw new NotFoundException('Produto draft nao encontrado.');
    return product;
  }

  private async ensureCategorySlugAvailable(client: SlugCheckClient, versionId: string, slug: string, ignoreId?: string) {
    const existing = await client.baseMenuCategory.findFirst({ where: { versionId, slug, ...(ignoreId ? { id: { not: ignoreId } } : {}) } });
    if (existing) throw new ConflictException('Slug de categoria ja existe nesta versao.');
  }

  private async ensureProductSlugAvailable(client: SlugCheckClient, categoryId: string, slug: string, ignoreId?: string) {
    const existing = await client.baseMenuProduct.findFirst({ where: { categoryId, slug, ...(ignoreId ? { id: { not: ignoreId } } : {}) } });
    if (existing) throw new ConflictException('Slug de produto ja existe nesta categoria.');
  }

  private async formatEditableVersion(template: { id: string; slug: string; name: string; description: string | null; segment: string; icon: string | null; status: string; metadataJson: Prisma.JsonValue | null; currentPublishedVersionId: string | null }, version: EditableVersion) {
    const products = version.categories.flatMap((category) => category.products);
    const coverage = await this.resolveImageCoverage(products);
    const validation = await this.validateDraftVersion(template, version);

    return {
      template,
      version: {
        id: version.id,
        templateId: version.templateId,
        versionNumber: version.versionNumber,
        status: version.status,
        publishedAt: version.publishedAt,
        metadataJson: version.metadataJson,
        createdAt: version.createdAt,
        updatedAt: version.updatedAt,
      },
      validation,
      categories: version.categories.map((category) => ({
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
            categoryId: product.categoryId,
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
    };
  }

  private async validateDraftVersion(template: { currentPublishedVersionId: string | null }, version: EditableVersion) {
    const errors: string[] = [];
    const warnings: string[] = [];
    if (version.categories.length === 0) errors.push('Template sem categorias.');

    const categorySlugs = new Set<string>();
    for (const category of version.categories) {
      if (!category.name.trim()) errors.push(`Categoria ${category.id} sem nome.`);
      if (!isNormalizedSlug(category.slug)) errors.push(`Categoria "${category.name}" possui slug invalido.`);
      if (categorySlugs.has(category.slug)) errors.push(`Slug de categoria duplicado: ${category.slug}.`);
      categorySlugs.add(category.slug);
      if (category.products.length === 0) warnings.push(`Categoria "${category.name}" sem produtos.`);

      const productSlugs = new Set<string>();
      for (const product of category.products) {
        if (!product.name.trim()) errors.push(`Produto ${product.id} sem nome.`);
        if (!isNormalizedSlug(product.slug)) errors.push(`Produto "${product.name}" possui slug invalido.`);
        if (productSlugs.has(product.slug)) errors.push(`Slug de produto duplicado na categoria "${category.name}": ${product.slug}.`);
        productSlugs.add(product.slug);
        if (product.basePrice.lessThan(0)) errors.push(`Produto "${product.name}" com preco invalido.`);
        if (product.compareAtPrice && product.compareAtPrice.lessThan(product.basePrice)) errors.push(`Produto "${product.name}" com preco comparativo menor que preco base.`);
        if (product.basePrice.equals(0)) warnings.push(`Produto "${product.name}" com preco sugerido zero.`);
        if (!product.description?.trim()) warnings.push(`Produto "${product.name}" sem descricao.`);
        if (!product.mediaLookupKey?.trim()) warnings.push(`Produto "${product.name}" sem mediaLookupKey.`);
        if (extractStringArray(product.searchTagsJson).length === 0) warnings.push(`Produto "${product.name}" sem tags de busca.`);
        try {
          validateBaseMenuProductMetadata(product.metadataJson);
        } catch (error) {
          errors.push(error instanceof Error ? error.message : `Produto "${product.name}" com metadata invalido.`);
        }
      }
    }

    const products = version.categories.flatMap((category) => category.products);
    if (products.length === 0) errors.push('Template sem produtos.');
    const coverage = await this.resolveImageCoverage(products);
    const imageSummary = {
      linkedExact: 0,
      linkedTag: 0,
      linkedFallback: 0,
      missingLookup: 0,
      noPublishedAsset: 0,
      draftOnly: 0,
    };
    for (const product of products) {
      const image = coverage.get(product.id);
      if (image?.status === 'linked_exact') imageSummary.linkedExact++;
      if (image?.status === 'linked_tag') imageSummary.linkedTag++;
      if (image?.status === 'linked_fallback') {
        imageSummary.linkedFallback++;
        warnings.push(`Produto "${product.name}" usa fallback generico de imagem.`);
      }
      if (image?.status === 'missing_lookup') {
        imageSummary.missingLookup++;
        warnings.push(`Produto "${product.name}" sem lookup/tags de imagem.`);
      }
      if (image?.status === 'no_published_asset') {
        imageSummary.noPublishedAsset++;
        warnings.push(`Produto "${product.name}" sem imagem publicada.`);
      }
      if (image?.status === 'draft_only') {
        imageSummary.draftOnly++;
        warnings.push(`Produto "${product.name}" possui apenas imagem draft/arquivada.`);
      }
    }

    return {
      errors: unique(errors),
      warnings: unique(warnings),
      totals: { categories: version.categories.length, products: products.length },
      imageSummary,
      replacingVersionId: template.currentPublishedVersionId,
      publishingVersionId: version.id,
      publishingVersionNumber: version.versionNumber,
    };
  }

  private async audit(client: AuditClient, action: BaseMenuAdminAction, actor: AdminActor, details: Prisma.InputJsonObject) {
    const tenantId = await this.platformAuditTenantId(client);
    await client.auditLog.create({
      data: {
        tenantId,
        userId: actor.id,
        userType: actor.id ? 'admin' : 'system',
        action,
        resource: 'base_menu',
        details: sanitizeJsonObject(details),
        ip: actor.ip ?? null,
      },
    });
  }

  private async platformAuditTenantId(client: AuditClient): Promise<string> {
    const tenant = await client.tenant.upsert({
      where: { slug: PLATFORM_AUDIT_TENANT_SLUG },
      update: {},
      create: { name: 'Platform Audit', slug: PLATFORM_AUDIT_TENANT_SLUG, status: 'active' },
      select: { id: true },
    });
    return tenant.id;
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

type SlugCheckClient = PrismaService | Prisma.TransactionClient;
type EditableVersion = Prisma.BaseMenuTemplateVersionGetPayload<{
  include: {
    categories: {
      include: { products: true };
    };
  };
}>;

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

function requiredString(value: unknown, field: string, maxLength: number): string {
  if (typeof value !== 'string' || !value.trim()) throw new BadRequestException(`${field} obrigatorio.`);
  const text = value.trim();
  if (text.length > maxLength) throw new BadRequestException(`${field} excede ${maxLength} caracteres.`);
  return text;
}

function optionalString(value: unknown, field: string, maxLength = 1000): string | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value !== 'string') throw new BadRequestException(`${field} deve ser texto.`);
  if (value.length > maxLength) throw new BadRequestException(`${field} excede ${maxLength} caracteres.`);
  return value.trim();
}

function requiredNumber(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new BadRequestException(`${field} deve ser numerico.`);
  return value;
}

function optionalNumber(value: unknown, field: string): number | null {
  if (value === undefined || value === null || value === '') return null;
  return requiredNumber(value, field);
}

function requiredMoney(value: unknown, field: string): Prisma.Decimal {
  if (typeof value !== 'number' && typeof value !== 'string') throw new BadRequestException(`${field} deve ser numerico.`);
  const decimal = new Prisma.Decimal(value);
  if (decimal.lessThan(0)) throw new BadRequestException(`${field} deve ser maior ou igual a zero.`);
  return decimal;
}

function optionalMoney(value: unknown, field: string): Prisma.Decimal | null {
  if (value === undefined || value === null || value === '') return null;
  return requiredMoney(value, field);
}

function validateCompareAtPrice(basePrice: Prisma.Decimal, compareAtPrice: Prisma.Decimal | null) {
  if (compareAtPrice && compareAtPrice.lessThan(basePrice)) {
    throw new BadRequestException('compareAtPrice deve ser maior ou igual ao basePrice.');
  }
}

function normalizeSlug(value: string): string {
  const slug = value.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  if (!slug || !isNormalizedSlug(slug)) throw new BadRequestException('slug invalido.');
  return slug;
}

function isNormalizedSlug(value: string): boolean {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);
}

function normalizeOptionalLookup(value: unknown): string | null {
  if (value === undefined || value === null || value === '') return null;
  const raw = requiredString(value, 'mediaLookupKey', 160).toLowerCase();
  if (!/^[a-z0-9:_-]+$/.test(raw)) throw new BadRequestException('mediaLookupKey deve ser normalizado.');
  return raw;
}

function stringArrayJson(value: unknown): Prisma.InputJsonValue {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || !value.every((item) => typeof item === 'string')) {
    throw new BadRequestException('searchTagsJson deve ser array de strings.');
  }
  return value.map((item) => item.trim()).filter(Boolean);
}

function jsonObjectOrNull(value: unknown): Prisma.InputJsonValue | typeof Prisma.JsonNull {
  if (value === undefined || value === null || value === '') return Prisma.JsonNull;
  if (typeof value !== 'object' || Array.isArray(value)) throw new BadRequestException('metadataJson deve ser objeto JSON.');
  return value as Prisma.InputJsonObject;
}

function mergeJsonObject(current: Prisma.JsonValue | null, patch: unknown): Prisma.InputJsonValue | typeof Prisma.JsonNull {
  if (patch === null) return Prisma.JsonNull;
  if (typeof patch !== 'object' || Array.isArray(patch)) throw new BadRequestException('metadataJson deve ser objeto JSON.');
  return { ...asRecord(current), ...(patch as Prisma.InputJsonObject) } as Prisma.InputJsonObject;
}

function validateBaseMenuProductMetadata(metadataJson: unknown) {
  if (metadataJson === undefined || metadataJson === null) return;
  try {
    parseBaseMenuProductOptionGroups(metadataJson);
  } catch (error) {
    throw new BadRequestException(error instanceof Error ? error.message : 'metadataJson de complementos invalido.');
  }
}

function pickTemplateAudit(template: { name: string; description: string | null; segment: string; icon: string | null; metadataJson: Prisma.JsonValue | null }) {
  return {
    name: template.name,
    description: template.description,
    segment: template.segment,
    icon: template.icon,
    metadataJson: template.metadataJson,
  };
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values));
}

function sanitizeJsonObject(value: Prisma.InputJsonObject): Prisma.InputJsonObject {
  return sanitizeJsonValue(value) as Prisma.InputJsonObject;
}

type JsonSafe = string | number | boolean | null | JsonSafe[] | { [key: string]: JsonSafe };

function sanitizeJsonValue(value: unknown): JsonSafe {
  if (value === null) return null;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;
  if (value instanceof Date) return value.toISOString();
  if (value instanceof Prisma.Decimal) return value.toNumber();
  if (Array.isArray(value)) {
    const items: JsonSafe[] = value.map((item) => sanitizeJsonValue(item));
    return items;
  }
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const sanitized: { [key: string]: JsonSafe } = {};
    for (const [key, item] of Object.entries(record)) {
      sanitized[key] = sanitizeJsonValue(item);
    }
    return sanitized;
  }
  return String(value);
}
