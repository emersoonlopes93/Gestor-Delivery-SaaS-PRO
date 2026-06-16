import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { TenantContextService } from '../../common/context/tenant-context.service';
import { ProductsService } from '../products/products.service';
import { CategoriesService } from '../categories/categories.service';
import { MediaLibraryService } from '../../upload/media-library.service';
import {
  ParsedBaseMenuOptionGroup,
  ParsedBaseMenuOptionItem,
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
};

type CategoryTemplate = {
  name: string;
  order: number;
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
    private readonly categoriesService: CategoriesService,
    private readonly mediaLibrary: MediaLibraryService,
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
   * com base em tenant.settings.businessCategory.
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
   * Executa a importação do template para o tenant atual.
   * Reutiliza ProductsService e CategoriesService sem criar fluxos paralelos.
   */
  async importTemplate(
    templateId: string,
    options: MenuImportOptions = {},
  ): Promise<MenuImportResult> {
    const startTime = Date.now();
    const tenantId = this.tenantContext.getTenantId();
    if (!tenantId) {
      throw new Error('Tenant context não encontrado');
    }

    const skipExisting = options.skipExisting ?? true;
    const template = await this.loadPublishedTemplate(templateId);

    if (!template) {
      throw new Error(`Template "${templateId}" não encontrado`);
    }

    const result: MenuImportResult = {
      success: false,
      templateId: template.id,
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

    this.logger.log(`menu_import_start tenantId=${tenantId} templateId=${template.id} version=${template.versionNumber}`);

    // Garantir que as categorias de mídia globais existam
    await this.ensureGlobalCategoriesExist();

    // Carregar todas as imagens publicadas do sistema e imagens do próprio tenant uma única vez
    const systemAssets = await this.prisma.mediaAsset.findMany({
      where: {
        scope: 'system_gallery',
        isSystem: true,
        isActive: true,
        status: 'active',
        publicationStatus: 'published',
        deletedAt: null,
      },
      select: {
        id: true,
        title: true,
        altText: true,
        originalName: true,
        filename: true,
        tagsJson: true,
        category: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    const tenantAssets = await this.prisma.mediaAsset.findMany({
      where: {
        tenantId,
        scope: 'tenant_library',
        isActive: true,
        status: 'active',
        deletedAt: null,
      },
      select: {
        id: true,
        title: true,
        altText: true,
        originalName: true,
        filename: true,
        tagsJson: true,
        category: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    // Contar total de produtos no template para a telemetria
    const totalProducts = template.categories.reduce(
      (sum, cat) => sum + cat.products.length,
      0,
    );

    for (const categoryTemplate of template.categories) {
      try {
        const catResult = await this.importCategory(tenantId, categoryTemplate, skipExisting, result);

        for (const productTemplate of categoryTemplate.products) {
          try {
            await this.importProduct(
              tenantId,
              productTemplate,
              catResult.categoryId,
              categoryTemplate.name,
              skipExisting,
              result,
              systemAssets,
              tenantAssets,
            );
          } catch (err) {
            const msg = `Produto "${productTemplate.name}": ${String(err instanceof Error ? err.message : err)}`;
            this.logger.warn(`menu_import_product_error tenantId=${tenantId} ${msg}`);
            result.errors.push(msg);
          }
        }
      } catch (err) {
        const msg = `Categoria "${categoryTemplate.name}": ${String(err instanceof Error ? err.message : err)}`;
        this.logger.warn(`menu_import_category_error tenantId=${tenantId} ${msg}`);
        result.errors.push(msg);
      }
    }

    result.durationMs = Date.now() - startTime;
    result.success = result.errors.length === 0 || result.productsCreated > 0;

    // Telemetria exigida pela especificação
    const imagesMissing = totalProducts - result.imagesLinked;
    this.logger.log(
      `menu_import_images_found tenantId=${tenantId} templateId=${template.id} count=${result.imagesLinked}`,
    );
    this.logger.log(
      `menu_import_images_missing tenantId=${tenantId} templateId=${template.id} count=${imagesMissing}`,
    );
    this.logger.log(
      `menu_import_telemetry ` +
        JSON.stringify({
          tenantId,
          template: template.id,
          version: template.versionNumber,
          products: totalProducts,
          imagesMatched: result.imagesLinked,
          imagesMissing,
        }),
    );

    this.logger.log(
      `menu_import_completed tenantId=${tenantId} templateId=${template.id} version=${template.versionNumber} ` +
        `categories=${result.categoriesCreated} products=${result.productsCreated} ` +
        `images=${result.imagesLinked} durationMs=${result.durationMs}`,
    );

    await this.createImportLog(tenantId, template, result, totalProducts, imagesMissing);

    return result;
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
        products: category.products
          .sort((left, right) => left.sortOrder - right.sortOrder)
          .map((product) => ({
            name: product.name,
            shortDescription: product.description ?? '',
            basePrice: Number(product.basePrice),
            searchTags: extractStringArray(product.searchTagsJson),
            mediaLookupKey: product.mediaLookupKey ?? undefined,
            metadataJson: product.metadataJson,
          })),
      })),
    };
  }

  private async createImportLog(
    tenantId: string,
    template: LoadedBaseMenuTemplate,
    result: MenuImportResult,
    totalProducts: number,
    imagesMissing: number,
  ): Promise<void> {
    const status = result.errors.length === 0
      ? 'success'
      : (result.productsCreated > 0 || result.categoriesCreated > 0 ? 'partial' : 'failed');

    await this.prisma.baseMenuImportLog.create({
      data: {
        tenantId,
        templateId: template.templateDbId,
        versionId: template.versionDbId,
        status,
        categoriesCreated: result.categoriesCreated,
        productsCreated: result.productsCreated,
        categoriesSkipped: result.categoriesSkipped,
        productsSkipped: result.productsSkipped,
        metadataJson: {
          templateSlug: template.id,
          versionNumber: template.versionNumber,
          durationMs: result.durationMs,
          imagesLinked: result.imagesLinked,
          imagesMissing,
          totalProducts,
          errors: result.errors,
          productMatches: result.productMatches,
          optionGroupsCreated: result.optionGroupsCreated,
          optionGroupsReused: result.optionGroupsReused,
          optionItemsCreated: result.optionItemsCreated,
          optionItemsReused: result.optionItemsReused,
          productOptionLinksCreated: result.productOptionLinksCreated,
          productOptionLinksSkipped: result.productOptionLinksSkipped,
          optionImportWarnings: result.optionImportWarnings,
          optionImportErrors: result.optionImportErrors,
        },
      },
    });
  }

  private async importCategory(
    tenantId: string,
    categoryTemplate: CategoryTemplate,
    skipExisting: boolean,
    result: MenuImportResult,
  ): Promise<MenuImportCategoryResult> {
    // Verificar se a categoria já existe pelo nome
    const existing = await this.prisma.tenantClient.productCategory.findFirst({
      where: {
        tenantId,
        name: categoryTemplate.name,
        deletedAt: null,
      },
    });

    if (existing) {
      if (skipExisting) {
        result.categoriesSkipped++;
        return { categoryId: existing.id, categoryName: existing.name, created: false };
      }
      // Se não for skip, retorna o existente igualmente (comportamento de merge)
      return { categoryId: existing.id, categoryName: existing.name, created: false };
    }

    // Criar via CategoriesService oficial
    const created = await this.categoriesService.create({
      name: categoryTemplate.name,
      isActive: true,
      isFeatured: false,
      order: categoryTemplate.order,
    });

    result.categoriesCreated++;
    return { categoryId: created.id, categoryName: created.name, created: true };
  }

  private async importProduct(
    tenantId: string,
    productTemplate: ProductTemplate,
    categoryId: string,
    categoryName: string,
    skipExisting: boolean,
    result: MenuImportResult,
    systemAssets: Array<{
      id: string;
      title: string | null;
      altText: string | null;
      originalName: string | null;
      filename: string;
      tagsJson: unknown;
      category: string | null;
    }>,
    tenantAssets: Array<{
      id: string;
      title: string | null;
      altText: string | null;
      originalName: string | null;
      filename: string;
      tagsJson: unknown;
      category: string | null;
    }>,
  ): Promise<void> {
    const { slugify } = await import('@gestor/utils');
    const slug = slugify(productTemplate.name);

    // Verificar se produto já existe
    const existing = await this.prisma.tenantClient.product.findFirst({
      where: {
        tenantId,
        slug,
        deletedAt: null,
      },
    });

    if (existing) {
      result.productsSkipped++;
      if (!skipExisting) {
        throw new Error(`Produto ja existe no tenant: ${productTemplate.name}`);
      }
      return;
    }

    const optionGroups = this.parseProductOptionGroupsForImport(productTemplate, result);

    // Buscar imagem na biblioteca global ou do tenant indexados em memória
    const matchResult = this.findBestMatchingImageInMemory(
      productTemplate.mediaLookupKey,
      productTemplate.searchTags,
      categoryName,
      systemAssets,
      tenantAssets,
    );

    if (matchResult.id) {
      result.imagesLinked++;
    }

    result.productMatches.push({
      baseProductName: productTemplate.name,
      mediaLookupKey: productTemplate.mediaLookupKey,
      matchedMediaAssetId: matchResult.id || undefined,
      matchStrategy: matchResult.strategy,
      matchConfidence: matchResult.confidence,
    });

    // Criar produto via ProductsService oficial
    const product = await this.productsService.create({
      name: productTemplate.name,
      shortDescription: productTemplate.shortDescription,
      basePrice: productTemplate.basePrice,
      categoryId,
      isActive: true,
      isAvailable: true,
      sellableOnline: true,
      type: 'simple',
      ...(matchResult.id ? { mediaAssetId: matchResult.id } : {}),
    });

    result.productsCreated++;
    await this.importProductOptionGroups(
      tenantId,
      product.id,
      optionGroups,
      result,
    );
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

  private async importProductOptionGroups(
    tenantId: string,
    productId: string,
    optionGroups: ParsedBaseMenuOptionGroup[],
    result: MenuImportResult,
  ): Promise<void> {
    for (const group of optionGroups) {
      const optionGroup = await this.createOrReuseOptionGroup(tenantId, group, result);
      for (const item of group.items) {
        await this.createOrReuseOptionItem(tenantId, optionGroup.id, item, result);
      }
      await this.createOrSkipProductOptionLink(tenantId, productId, optionGroup.id, group, result);
    }
  }

  private async createOrReuseOptionGroup(
    tenantId: string,
    group: ParsedBaseMenuOptionGroup,
    result: MenuImportResult,
  ): Promise<{ id: string }> {
    const existingGroups = await this.prisma.tenantClient.optionGroup.findMany({
      where: { tenantId },
      select: { id: true, name: true },
    });
    const existing = existingGroups.find((item) => normalizeBaseMenuOptionSlug(item.name) === group.slug);
    if (existing) {
      result.optionGroupsReused++;
      return { id: existing.id };
    }

    const created = await this.prisma.tenantClient.optionGroup.create({
      data: {
        tenantId,
        name: group.name,
        description: group.description,
        selectionType: group.selectionType,
        isRequired: group.isRequired,
        minSelect: group.minSelect,
        maxSelect: group.maxSelect,
        isActive: true,
        order: group.order,
      } satisfies Prisma.OptionGroupUncheckedCreateInput,
      select: { id: true },
    });
    result.optionGroupsCreated++;
    this.logger.log(`menu_import_option_group_created tenantId=${tenantId} name="${group.name}"`);
    return created;
  }

  private async createOrReuseOptionItem(
    tenantId: string,
    optionGroupId: string,
    item: ParsedBaseMenuOptionItem,
    result: MenuImportResult,
  ): Promise<{ id: string }> {
    const existingItems = await this.prisma.tenantClient.optionItem.findMany({
      where: { tenantId, optionGroupId },
      select: { id: true, name: true },
    });
    const existing = existingItems.find((candidate) => normalizeBaseMenuOptionSlug(candidate.name) === item.slug);
    if (existing) {
      result.optionItemsReused++;
      return { id: existing.id };
    }

    const created = await this.prisma.tenantClient.optionItem.create({
      data: {
        tenantId,
        optionGroupId,
        name: item.name,
        description: item.description,
        isActive: true,
        order: item.order,
        priceImpactType: item.priceImpactType,
        priceImpactValue: item.priceImpactValue,
        allowQuantity: item.allowQuantity,
        minQty: item.minQty,
        maxQty: item.maxQty,
      } satisfies Prisma.OptionItemUncheckedCreateInput,
      select: { id: true },
    });
    result.optionItemsCreated++;
    this.logger.log(`menu_import_option_item_created tenantId=${tenantId} optionGroupId=${optionGroupId} name="${item.name}"`);
    return created;
  }

  private async createOrSkipProductOptionLink(
    tenantId: string,
    productId: string,
    optionGroupId: string,
    group: ParsedBaseMenuOptionGroup,
    result: MenuImportResult,
  ): Promise<void> {
    const existing = await this.prisma.tenantClient.productOptionGroupLink.findUnique({
      where: { productId_optionGroupId: { productId, optionGroupId } },
      select: { id: true },
    });
    if (existing) {
      result.productOptionLinksSkipped++;
      return;
    }

    await this.prisma.tenantClient.productOptionGroupLink.create({
      data: {
        tenantId,
        productId,
        optionGroupId,
        order: group.order,
        overrideName: group.overrideName,
        overrideDescription: group.overrideDescription,
        overrideIsRequired: group.overrideIsRequired,
        overrideMinSelect: group.overrideMinSelect,
        overrideMaxSelect: group.overrideMaxSelect,
        pricingAxis: group.pricingAxis,
      } satisfies Prisma.ProductOptionGroupLinkUncheckedCreateInput,
    });
    result.productOptionLinksCreated++;
  }

  /**
   * Garante a existência das categorias globais de mídia.
   */
  private async ensureGlobalCategoriesExist(): Promise<void> {
    const categoriesToCreate = [
      'Pizzas',
      'Hambúrgueres',
      'Bebidas',
      'Sobremesas',
      'Massas',
      'Porções',
      'Mercado',
      'Açaí',
      'Padaria',
      'Cafés',
      'Salgados',
      'Doces e Bolos',
      'Complementos',
      'Combos',
      'Japonesa',
      'Lanches',
    ];

    const { slugify } = await import('@gestor/utils');

    for (const name of categoriesToCreate) {
      const slug = slugify(name);
      
      const existing = await this.prisma.mediaCategory.findFirst({
        where: {
          tenantId: null,
          scope: 'system_gallery',
          slug,
          deletedAt: null,
        },
      });

      if (!existing) {
        await this.prisma.mediaCategory.create({
          data: {
            tenantId: null,
            scope: 'system_gallery',
            name,
            slug,
            isActive: true,
          },
        });
      }
    }
  }

  private findBestMatchingImageInMemory(
    mediaLookupKey: string | undefined,
    searchTags: string[],
    categoryName: string,
    systemAssets: Array<{
      id: string;
      title: string | null;
      altText: string | null;
      originalName: string | null;
      filename: string;
      tagsJson: unknown;
      category: string | null;
    }>,
    tenantAssets: Array<{
      id: string;
      title: string | null;
      altText: string | null;
      originalName: string | null;
      filename: string;
      tagsJson: unknown;
      category: string | null;
    }>,
  ): {
    id: string | null;
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
      if (match) return { id: match.id, strategy: 'exact_lookup', confidence: 'high' };
    }

    // Prioridade 2: lookup_tag (Alta confiança)
    // Se alguma das searchTags começar com 'lookup:', tenta achar correspondência exata
    if (searchTags && searchTags.length > 0) {
      const lookupTags = searchTags.filter((t) => t.startsWith('lookup:'));
      for (const tag of lookupTags) {
        const match = systemAssets.find((asset) => hasExactTag(asset, tag));
        if (match) return { id: match.id, strategy: 'lookup_tag', confidence: 'high' };
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
      if (match) return { id: match.id, strategy: 'specific_tag', confidence: 'medium' };
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
      if (match) return { id: match.id, strategy: 'category_fallback', confidence: 'low' };
    }

    // ── 2. FALLBACK NA BIBLIOTECA DO TENANT (TENANT LIBRARY) ──

    // Na library do tenant, repetimos a busca restrita
    if (mediaLookupKey) {
      const match = tenantAssets.find((asset) => hasExactTag(asset, mediaLookupKey));
      if (match) return { id: match.id, strategy: 'tenant_library_fallback', confidence: 'medium' };
    }

    if (searchTags && searchTags.length > 0) {
      const match = tenantAssets.find((asset) => {
        const assetTags = getTags(asset);
        return searchTags.every((t) => assetTags.includes(t));
      });
      if (match) return { id: match.id, strategy: 'tenant_library_fallback', confidence: 'medium' };
    }

    if (categoryName) {
      const normalizedCat = categoryName.toLowerCase().trim();
      const match = tenantAssets.find((asset) => {
        const assetCategory = asset.category?.toLowerCase() || '';
        return assetCategory === normalizedCat;
      });
      if (match) return { id: match.id, strategy: 'tenant_library_fallback', confidence: 'low' };
    }

    return { id: null, strategy: 'none', confidence: 'none' };
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

function extractBusinessCategory(settings: unknown): string | undefined {
  if (!settings || typeof settings !== 'object') return undefined;
  const candidate = (settings as Record<string, unknown>).businessCategory;
  return typeof candidate === 'string' && candidate.trim() ? candidate : undefined;
}
