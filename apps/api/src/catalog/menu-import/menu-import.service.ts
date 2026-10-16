import { ConflictException, Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { TenantContextService } from '../../common/context/tenant-context.service';
import { ProductsService } from '../products/products.service';
import { runSerializableTransactionWithRetry } from '../../database/serializable-transaction';
import { slugify } from '@gestor/utils';
import {
  ParsedBaseMenuOptionGroup,
  normalizeBaseMenuOptionSlug,
  parseBaseMenuProductOptionGroups,
} from './base-menu-options.parser';

type ProductTemplate = {
  name: string;
  shortDescription: string;
  basePrice: number;
  searchTags: string[];
  mediaLookupKey?: string;
  metadataJson?: unknown;
  order: number;
};

type CategoryTemplate = {
  name: string;
  order: number;
  metadataJson?: unknown;
  products: ProductTemplate[];
};

type MenuTemplate = {
  id: string;
  name: string;
  description: string;
  businessSegment: string;
  businessSegments?: string[];
  emoji: string;
  categories: CategoryTemplate[];
};

type MenuTemplateSummary = {
  id: string;
  slug: string;
  name: string;
  description: string;
  businessSegment: string;
  businessSegments?: string[];
  segment: string;
  emoji: string;
  icon: string;
  totalCategories: number;
  totalProducts: number;
};

type LoadedBaseMenuTemplate = MenuTemplate & {
  templateDbId: string;
  versionDbId: string;
  versionNumber: number;
};

const mediaAssetImportSelection = {
  id: true,
  title: true,
  altText: true,
  originalName: true,
  filename: true,
  publicUrl: true,
  tagsJson: true,
  category: true,
} satisfies Prisma.MediaAssetSelect;

type ImportMediaAsset = Prisma.MediaAssetGetPayload<{
  select: typeof mediaAssetImportSelection;
}>;

export interface MenuImportOptions {
  /** Se true, pula produtos/categorias já existentes. Se false, retorna erro de conflito. Padrão: true */
  skipExisting?: boolean;
}

export interface MenuImportResult {
  success: boolean;
  templateId: string;
  categoriesCreated: number;
  categoriesSkipped: number;
  productsCreated: number;
  productsSkipped: number;
  imagesLinked: number;
  durationMs: number;
  errors: string[];
  optionGroupsCreated: number;
  optionGroupsReused: number;
  optionItemsCreated: number;
  optionItemsReused: number;
  productOptionLinksCreated: number;
  productOptionLinksSkipped: number;
  optionImportWarnings: string[];
  optionImportErrors: string[];
  productMatches: Array<{
    baseProductName: string;
    mediaLookupKey?: string;
    matchedMediaAssetId?: string;
    matchStrategy: 'exact_lookup' | 'lookup_tag' | 'specific_tag' | 'category_fallback' | 'tenant_library_fallback' | 'none';
    matchConfidence: 'high' | 'medium' | 'low' | 'none';
  }>;
}

export interface MenuImportCategoryResult {
  categoryId: string;
  categoryName: string;
  created: boolean;
}

@Injectable()
export class MenuImportService {
  private readonly logger = new Logger(MenuImportService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContextService,
    private readonly productsService: ProductsService,
  ) {}

  // ─── Public API ─────────────────────────────────────────────────────────────

  /**
   * Lista todos os templates disponíveis com metadados (sem produtos detalhados).
   */
  async listTemplates(): Promise<MenuTemplateSummary[]> {
    const templates = await this.prisma.baseMenuTemplate.findMany({
      where: {
        status: 'published',
        currentPublishedVersionId: { not: null },
      },
      include: {
        currentPublishedVersion: {
          include: {
            categories: {
              include: { products: true },
            },
          },
        },
      },
      orderBy: { name: 'asc' },
    });

    return templates
      .filter((template) => template.currentPublishedVersion?.status === 'published')
      .map((template) => {
        const categories = template.currentPublishedVersion?.categories ?? [];
        return {
          id: template.slug,
          slug: template.slug,
          name: template.name,
          description: template.description ?? '',
          businessSegment: template.segment,
          businessSegments: extractBusinessSegments(template.metadataJson, template.segment),
          segment: template.segment,
          emoji: template.icon ?? '',
          icon: template.icon ?? '',
          totalCategories: categories.length,
          totalProducts: categories.reduce((sum, category) => sum + category.products.length, 0),
        };
      });
  }

  /**
   * Retorna um template completo por ID.
   */
  async getTemplate(id: string): Promise<MenuTemplate | null> {
    const template = await this.loadPublishedTemplate(id);
    return template ? stripInternalTemplateFields(template) : null;
  }

  /**
   * Detecta o template recomendado para o tenant atual
   * com base em tenant.settings.businessSegment.
   */
  async detectRecommendedTemplate(): Promise<MenuTemplateSummary | null> {
    const tenantId = this.tenantContext.getTenantId();
    if (!tenantId) return null;

    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { settings: true },
    });

    const segment = extractBusinessCategory(tenant?.settings);

    if (!segment) return null;

    const normalized = segment.toLowerCase().trim();
    const summaries = await this.listTemplates();
    return summaries.find((summary) => (
      summary.businessSegment.toLowerCase() === normalized ||
      summary.id.toLowerCase() === normalized ||
      summary.slug.toLowerCase() === normalized ||
      (summary.businessSegments ?? []).some((segment) => segment.toLowerCase() === normalized)
    )) ?? null;
  }

  /**
   * Executes one durable tenant + template-version operation.
   * Catalog writes and the operation log share the same Serializable transaction.
   */
  async importTemplate(
    templateId: string,
    options: MenuImportOptions = {},
  ): Promise<MenuImportResult> {
    const tenantId = this.tenantContext.getTenantId();
    if (!tenantId) {
      throw new Error('Tenant context nao encontrado');
    }

    const template = await this.loadPublishedTemplate(templateId);
    if (!template) {
      throw new Error(`Template "${templateId}" nao encontrado`);
    }

    void options;
    const operationKey = `${tenantId}:${template.versionDbId}`;
    const persisted = await this.prisma.baseMenuImportLog.findUnique({ where: { operationKey } });
    if (persisted?.status === 'success') {
      return this.restorePersistedResult(persisted, template.id);
    }

    try {
      const result = await runSerializableTransactionWithRetry(
        this.prisma,
        async (tx) => this.executeNewImport(tx, tenantId, template, operationKey),
        { timeout: 60_000, maxWait: 10_000 },
      );
      await this.productsService.invalidateStorefrontCacheForTenant(tenantId);
      return result;
    } catch (error) {
      if (!isOperationKeyConflict(error)) {
        throw error;
      }

      const canonical = await this.prisma.baseMenuImportLog.findUnique({ where: { operationKey } });
      if (canonical?.status === 'success') {
        return this.restorePersistedResult(canonical, template.id);
      }
      throw new ConflictException({
        code: 'BASE_MENU_IMPORT_OPERATION_CONFLICT',
        message: 'A operacao equivalente de importacao ainda nao foi concluida.',
      });
    }
  }

  private async executeNewImport(
    tx: Prisma.TransactionClient,
    tenantId: string,
    template: LoadedBaseMenuTemplate,
    operationKey: string,
  ): Promise<MenuImportResult> {
    const canonical = await tx.baseMenuImportLog.findUnique({ where: { operationKey } });
    if (canonical?.status === 'success') {
      return this.restorePersistedResult(canonical, template.id);
    }

    await tx.baseMenuImportLog.create({
      data: {
        operationKey,
        tenantId,
        templateId: template.templateDbId,
        versionId: template.versionDbId,
        status: 'failed',
      },
    });

    const [categoriesInCatalog, productsInCatalog] = await Promise.all([
      tx.productCategory.count({ where: { tenantId, deletedAt: null } }),
      tx.product.count({ where: { tenantId, deletedAt: null } }),
    ]);
    if (categoriesInCatalog > 0 || productsInCatalog > 0) {
      throw new ConflictException({
        code: 'BASE_MENU_IMPORT_REQUIRES_EMPTY_CATALOG',
        message: 'A importacao de cardapio base exige um catalogo vazio.',
      });
    }

    const startTime = Date.now();
    const result = createEmptyImportResult(template.id);
    const [systemAssets, tenantAssets] = await Promise.all([
      tx.mediaAsset.findMany({
        where: {
          scope: 'system_gallery',
          isSystem: true,
          isActive: true,
          status: 'active',
          publicationStatus: 'published',
          deletedAt: null,
        },
        select: mediaAssetImportSelection,
        orderBy: { createdAt: 'desc' },
      }),
      tx.mediaAsset.findMany({
        where: {
          tenantId,
          scope: 'tenant_library',
          isActive: true,
          status: 'active',
          deletedAt: null,
        },
        select: mediaAssetImportSelection,
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    for (const categoryTemplate of template.categories) {
      const category = await this.importCategoryTransactional(tx, tenantId, categoryTemplate, result);
      for (const productTemplate of categoryTemplate.products) {
        await this.importProductTransactional(
          tx,
          tenantId,
          productTemplate,
          category.categoryId,
          categoryTemplate.name,
          result,
          systemAssets,
          tenantAssets,
        );
      }
    }

    result.durationMs = Date.now() - startTime;
    result.success = true;
    const totalProducts = template.categories.reduce((sum, category) => sum + category.products.length, 0);
    await tx.baseMenuImportLog.update({
      where: { operationKey },
      data: {
        status: 'success',
        categoriesCreated: result.categoriesCreated,
        productsCreated: result.productsCreated,
        metadataJson: {
          templateSlug: template.id,
          versionNumber: template.versionNumber,
          totalProducts,
          imagesMissing: totalProducts - result.imagesLinked,
          result: serializeImportResult(result),
        },
      },
    });
    return result;
  }

  private restorePersistedResult(
    log: {
      categoriesCreated: number;
      productsCreated: number;
      categoriesSkipped: number;
      productsSkipped: number;
      metadataJson: Prisma.JsonValue | null;
    },
    templateId: string,
  ): MenuImportResult {
    const metadata = asRecordOrNull(log.metadataJson);
    const storedResult = asRecordOrNull(metadata?.result);
    return {
      ...createEmptyImportResult(templateId),
      success: true,
      categoriesCreated: readNumber(storedResult?.categoriesCreated, log.categoriesCreated),
      productsCreated: readNumber(storedResult?.productsCreated, log.productsCreated),
      categoriesSkipped: readNumber(storedResult?.categoriesSkipped, log.categoriesSkipped),
      productsSkipped: readNumber(storedResult?.productsSkipped, log.productsSkipped),
      imagesLinked: readNumber(storedResult?.imagesLinked, 0),
      durationMs: readNumber(storedResult?.durationMs, 0),
      optionGroupsCreated: readNumber(storedResult?.optionGroupsCreated, 0),
      optionGroupsReused: readNumber(storedResult?.optionGroupsReused, 0),
      optionItemsCreated: readNumber(storedResult?.optionItemsCreated, 0),
      optionItemsReused: readNumber(storedResult?.optionItemsReused, 0),
      productOptionLinksCreated: readNumber(storedResult?.productOptionLinksCreated, 0),
      productOptionLinksSkipped: readNumber(storedResult?.productOptionLinksSkipped, 0),
    };
  }

  private async importCategoryTransactional(
    tx: Prisma.TransactionClient,
    tenantId: string,
    categoryTemplate: CategoryTemplate,
    result: MenuImportResult,
  ): Promise<MenuImportCategoryResult> {
    const categoryMetadata = asRecordOrNull(categoryTemplate.metadataJson);
    const created = await tx.productCategory.create({
      data: {
        tenantId,
        slug: slugify(categoryTemplate.name),
        name: categoryTemplate.name,
        isActive: true,
        isFeatured: false,
        order: categoryTemplate.order,
        templateType: categoryMetadata?.templateType === 'pizza' ? 'pizza' : 'none',
        templateConfig: categoryMetadata?.templateType === 'pizza'
          ? { pricingStrategy: 'highest' }
          : Prisma.DbNull,
      },
      select: { id: true, name: true },
    });
    result.categoriesCreated += 1;
    return { categoryId: created.id, categoryName: created.name, created: true };
  }

  private async importProductTransactional(
    tx: Prisma.TransactionClient,
    tenantId: string,
    productTemplate: ProductTemplate,
    categoryId: string,
    categoryName: string,
    result: MenuImportResult,
    systemAssets: ImportMediaAsset[],
    tenantAssets: ImportMediaAsset[],
  ): Promise<void> {
    const optionGroups = this.parseProductOptionGroupsForImport(productTemplate, result);
    const matchResult = this.findBestMatchingImageInMemory(
      productTemplate.mediaLookupKey,
      productTemplate.searchTags,
      categoryName,
      systemAssets,
      tenantAssets,
    );
    if (matchResult.id) {
      result.imagesLinked += 1;
    }
    result.productMatches.push({
      baseProductName: productTemplate.name,
      mediaLookupKey: productTemplate.mediaLookupKey,
      matchedMediaAssetId: matchResult.id ?? undefined,
      matchStrategy: matchResult.strategy,
      matchConfidence: matchResult.confidence,
    });

    const product = await tx.product.create({
      data: {
        tenantId,
        categoryId,
        slug: slugify(productTemplate.name),
        name: productTemplate.name,
        shortDescription: productTemplate.shortDescription || null,
        basePrice: productTemplate.basePrice,
        image: matchResult.publicUrl,
        mediaAssetId: matchResult.id,
        isActive: true,
        isAvailable: true,
        sellableOnline: true,
        type: 'simple',
        order: productTemplate.order,
      },
      select: { id: true },
    });
    await tx.catalogPublication.create({
      data: {
        tenantId,
        productId: product.id,
        publicationStatus: 'published',
        operationalStatus: 'active',
      },
    });
    result.productsCreated += 1;
    await this.importProductOptionGroupsTransactional(tx, tenantId, product.id, optionGroups, result);
    await this.applyPizzaSizePricesTransactional(tx, tenantId, product.id, productTemplate);
  }

  private async importProductOptionGroupsTransactional(
    tx: Prisma.TransactionClient,
    tenantId: string,
    productId: string,
    optionGroups: ParsedBaseMenuOptionGroup[],
    result: MenuImportResult,
  ): Promise<void> {
    for (const group of optionGroups) {
      const groups = await tx.optionGroup.findMany({
        where: { tenantId },
        select: { id: true, name: true },
      });
      let optionGroup = groups.find((candidate) => normalizeBaseMenuOptionSlug(candidate.name) === group.slug);
      if (optionGroup) {
        result.optionGroupsReused += 1;
      } else {
        optionGroup = await tx.optionGroup.create({
          data: {
            tenantId,
            name: group.name,
            description: group.description,
            selectionType: group.selectionType,
            isRequired: group.isRequired,
            minSelect: group.minSelect,
            maxSelect: group.maxSelect,
            isActive: group.isActive,
            order: group.order,
          },
          select: { id: true, name: true },
        });
        result.optionGroupsCreated += 1;
      }

      for (const item of group.items) {
        const items = await tx.optionItem.findMany({
          where: { tenantId, optionGroupId: optionGroup.id },
          select: { id: true, name: true },
        });
        const existingItem = items.find((candidate) => normalizeBaseMenuOptionSlug(candidate.name) === item.slug);
        if (existingItem) {
          result.optionItemsReused += 1;
        } else {
          await tx.optionItem.create({
            data: {
              tenantId,
              optionGroupId: optionGroup.id,
              name: item.name,
              description: item.description,
              isActive: item.isActive,
              order: item.order,
              priceImpactType: item.priceImpactType,
              priceImpactValue: item.priceImpactValue,
              allowQuantity: item.allowQuantity,
              minQty: item.minQty,
              maxQty: item.maxQty,
            },
          });
          result.optionItemsCreated += 1;
        }
      }

      await tx.productOptionGroupLink.create({
        data: {
          tenantId,
          productId,
          optionGroupId: optionGroup.id,
          order: group.order,
          overrideName: group.overrideName,
          overrideDescription: group.overrideDescription,
          overrideIsRequired: group.overrideIsRequired,
          overrideMinSelect: group.overrideMinSelect,
          overrideMaxSelect: group.overrideMaxSelect,
          pricingAxis: group.pricingAxis,
        },
      });
      result.productOptionLinksCreated += 1;
    }
  }

  private async applyPizzaSizePricesTransactional(
    tx: Prisma.TransactionClient,
    tenantId: string,
    productId: string,
    productTemplate: ProductTemplate,
  ): Promise<void> {
    const metadata = asRecordOrNull(productTemplate.metadataJson);
    const sizePrices = asRecordOrNull(metadata?.sizePrices);
    if (!sizePrices) return;

    const sizesGroup = await tx.optionGroup.findFirst({
      where: { tenantId, name: 'Tamanhos [Pizza]' },
      include: { items: true },
    });
    if (!sizesGroup) return;

    const normalizedPrices = new Map<string, number>();
    for (const [key, value] of Object.entries(sizePrices)) {
      const price = typeof value === 'number' ? value : Number(value);
      if (Number.isFinite(price)) normalizedPrices.set(normalizeBaseMenuOptionSlug(key), price);
    }
    for (const item of sizesGroup.items) {
      const price = normalizedPrices.get(normalizeBaseMenuOptionSlug(item.name));
      if (price === undefined) continue;
      await tx.productOptionItemPrice.create({
        data: { tenantId, productId, optionItemId: item.id, price },
      });
    }
  }


  // ─── Private helpers ────────────────────────────────────────────────────────

  private async loadPublishedTemplate(identifier: string): Promise<LoadedBaseMenuTemplate | null> {
    const template = await this.prisma.baseMenuTemplate.findFirst({
      where: {
        status: 'published',
        OR: [{ id: identifier }, { slug: identifier }],
      },
      include: {
        currentPublishedVersion: {
          include: {
            categories: {
              include: { products: true },
              orderBy: { sortOrder: 'asc' },
            },
          },
        },
        versions: {
          where: { status: 'published' },
          include: {
            categories: {
              include: { products: true },
              orderBy: { sortOrder: 'asc' },
            },
          },
          orderBy: { versionNumber: 'desc' },
          take: 1,
        },
      },
    });

    if (!template) return null;

    const version = template.currentPublishedVersion?.status === 'published'
      ? template.currentPublishedVersion
      : template.versions[0];

    if (!version || version.status !== 'published') return null;

    return {
      templateDbId: template.id,
      versionDbId: version.id,
      versionNumber: version.versionNumber,
      id: template.slug,
      name: template.name,
      description: template.description ?? '',
      businessSegment: template.segment,
      businessSegments: extractBusinessSegments(template.metadataJson, template.segment),
      emoji: template.icon ?? '',
      categories: version.categories.map((category) => ({
        name: category.name,
        order: category.sortOrder,
        metadataJson: category.metadataJson,
        products: category.products
          .sort((left, right) => left.sortOrder - right.sortOrder)
          .map((product) => ({
            name: product.name,
            shortDescription: product.description ?? '',
            basePrice: Number(product.basePrice),
            searchTags: extractStringArray(product.searchTagsJson),
            mediaLookupKey: product.mediaLookupKey ?? undefined,
            metadataJson: product.metadataJson,
            order: product.sortOrder,
          })),
      })),
    };
  }

  private parseProductOptionGroupsForImport(
    productTemplate: ProductTemplate,
    result: MenuImportResult,
  ): ParsedBaseMenuOptionGroup[] {
    try {
      return parseBaseMenuProductOptionGroups(productTemplate.metadataJson);
    } catch (error) {
      const message = `Produto "${productTemplate.name}": ${error instanceof Error ? error.message : String(error)}`;
      result.optionImportErrors.push(message);
      throw new Error(`opcionais invalidos: ${message}`);
    }
  }

  private findBestMatchingImageInMemory(
    mediaLookupKey: string | undefined,
    searchTags: string[],
    categoryName: string,
    systemAssets: ImportMediaAsset[],
    tenantAssets: ImportMediaAsset[],
  ): {
    id: string | null;
    publicUrl: string | null;
    strategy: 'exact_lookup' | 'lookup_tag' | 'specific_tag' | 'category_fallback' | 'tenant_library_fallback' | 'none';
    confidence: 'high' | 'medium' | 'low' | 'none';
  } {
    const getTags = (asset: { tagsJson: unknown }) =>
      Array.isArray(asset.tagsJson) ? (asset.tagsJson as string[]) : [];

    const hasExactTag = (asset: { tagsJson: unknown }, expectedTag: string) =>
      getTags(asset).includes(expectedTag);

    // ── 1. BUSCA NA BIBLIOTECA GLOBAL (SYSTEM GALLERY) ──

    // Prioridade 1: exact_lookup via mediaLookupKey (Alta confiança)
    if (mediaLookupKey) {
      const match = systemAssets.find((asset) => hasExactTag(asset, mediaLookupKey));
      if (match) return { id: match.id, publicUrl: match.publicUrl, strategy: 'exact_lookup', confidence: 'high' };
    }

    // Prioridade 2: lookup_tag (Alta confiança)
    // Se alguma das searchTags começar com 'lookup:', tenta achar correspondência exata
    if (searchTags && searchTags.length > 0) {
      const lookupTags = searchTags.filter((t) => t.startsWith('lookup:'));
      for (const tag of lookupTags) {
        const match = systemAssets.find((asset) => hasExactTag(asset, tag));
        if (match) return { id: match.id, publicUrl: match.publicUrl, strategy: 'lookup_tag', confidence: 'high' };
      }
    }

    // Prioridade 3: specific_tag (Média confiança)
    // Se o asset tiver todas as tags requisitadas
    if (searchTags && searchTags.length > 0) {
      const match = systemAssets.find((asset) => {
        const assetTags = getTags(asset);
        // Exige que o asset possua TODAS as searchTags explicitamente (sem includes frouxo)
        return searchTags.every((t) => assetTags.includes(t));
      });
      if (match) return { id: match.id, publicUrl: match.publicUrl, strategy: 'specific_tag', confidence: 'medium' };
    }

    // Prioridade 4: category_fallback (Baixa confiança)
    // Pega qualquer imagem da system_gallery cuja category ou tag coincida estritamente com a categoria pedida
    if (categoryName) {
      const normalizedCat = categoryName.toLowerCase().trim();
      const match = systemAssets.find((asset) => {
        const assetCategory = asset.category?.toLowerCase() || '';
        if (assetCategory === normalizedCat) return true;
        const tagCategoryMatch = getTags(asset).some(t => t.toLowerCase().trim() === `category:${normalizedCat.replace(/ /g, '_')}`);
        return tagCategoryMatch;
      });
      if (match) return { id: match.id, publicUrl: match.publicUrl, strategy: 'category_fallback', confidence: 'low' };
    }

    // ── 2. FALLBACK NA BIBLIOTECA DO TENANT (TENANT LIBRARY) ──

    // Na library do tenant, repetimos a busca restrita
    if (mediaLookupKey) {
      const match = tenantAssets.find((asset) => hasExactTag(asset, mediaLookupKey));
      if (match) return { id: match.id, publicUrl: match.publicUrl, strategy: 'tenant_library_fallback', confidence: 'medium' };
    }

    if (searchTags && searchTags.length > 0) {
      const match = tenantAssets.find((asset) => {
        const assetTags = getTags(asset);
        return searchTags.every((t) => assetTags.includes(t));
      });
      if (match) return { id: match.id, publicUrl: match.publicUrl, strategy: 'tenant_library_fallback', confidence: 'medium' };
    }

    if (categoryName) {
      const normalizedCat = categoryName.toLowerCase().trim();
      const match = tenantAssets.find((asset) => {
        const assetCategory = asset.category?.toLowerCase() || '';
        return assetCategory === normalizedCat;
      });
      if (match) return { id: match.id, publicUrl: match.publicUrl, strategy: 'tenant_library_fallback', confidence: 'low' };
    }

    return { id: null, publicUrl: null, strategy: 'none', confidence: 'none' };
  }
}

function stripInternalTemplateFields(template: LoadedBaseMenuTemplate): MenuTemplate {
  return {
    id: template.id,
    name: template.name,
    description: template.description,
    businessSegment: template.businessSegment,
    businessSegments: template.businessSegments,
    emoji: template.emoji,
    categories: template.categories,
  };
}

function createEmptyImportResult(templateId: string): MenuImportResult {
  return {
    success: false,
    templateId,
    categoriesCreated: 0,
    categoriesSkipped: 0,
    productsCreated: 0,
    productsSkipped: 0,
    imagesLinked: 0,
    durationMs: 0,
    errors: [],
    optionGroupsCreated: 0,
    optionGroupsReused: 0,
    optionItemsCreated: 0,
    optionItemsReused: 0,
    productOptionLinksCreated: 0,
    productOptionLinksSkipped: 0,
    optionImportWarnings: [],
    optionImportErrors: [],
    productMatches: [],
  };
}

function serializeImportResult(result: MenuImportResult): Prisma.InputJsonObject {
  return {
    success: result.success,
    templateId: result.templateId,
    categoriesCreated: result.categoriesCreated,
    categoriesSkipped: result.categoriesSkipped,
    productsCreated: result.productsCreated,
    productsSkipped: result.productsSkipped,
    imagesLinked: result.imagesLinked,
    durationMs: result.durationMs,
    errors: result.errors,
    optionGroupsCreated: result.optionGroupsCreated,
    optionGroupsReused: result.optionGroupsReused,
    optionItemsCreated: result.optionItemsCreated,
    optionItemsReused: result.optionItemsReused,
    productOptionLinksCreated: result.productOptionLinksCreated,
    productOptionLinksSkipped: result.productOptionLinksSkipped,
    optionImportWarnings: result.optionImportWarnings,
    optionImportErrors: result.optionImportErrors,
    productMatches: result.productMatches.map((match) => ({
      baseProductName: match.baseProductName,
      ...(match.mediaLookupKey ? { mediaLookupKey: match.mediaLookupKey } : {}),
      ...(match.matchedMediaAssetId ? { matchedMediaAssetId: match.matchedMediaAssetId } : {}),
      matchStrategy: match.matchStrategy,
      matchConfidence: match.matchConfidence,
    })),
  };
}

function readNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function isOperationKeyConflict(error: unknown): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') {
    return false;
  }
  const target = error.meta?.target;
  const targets = Array.isArray(target) ? target : [target];
  return targets.some((item) => (
    typeof item === 'string'
    && (item.toLowerCase().includes('operation_key') || item.toLowerCase().includes('operationkey'))
  ));
}

function extractStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string');
}

function extractBusinessSegments(metadata: unknown, fallback: string): string[] {
  if (!metadata || typeof metadata !== 'object') return [fallback];
  const candidate = (metadata as Record<string, unknown>).businessSegments;
  const segments = extractStringArray(candidate);
  return segments.length > 0 ? segments : [fallback];
}

function asRecordOrNull(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function extractBusinessCategory(settings: unknown): string | undefined {
  if (!settings || typeof settings !== 'object') return undefined;
  const candidate = (settings as Record<string, unknown>).businessSegment;
  return typeof candidate === 'string' && candidate.trim()
    ? candidate.trim().toLowerCase()
    : undefined;
}
