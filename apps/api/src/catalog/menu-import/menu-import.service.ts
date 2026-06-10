import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { TenantContextService } from '../../common/context/tenant-context.service';
import { ProductsService } from '../products/products.service';
import { CategoriesService } from '../categories/categories.service';
import { MediaLibraryService } from '../../upload/media-library.service';
import {
  getTemplateById,
  getTemplateBySegment,
  listTemplatesSummary,
  type MenuTemplate,
  type CategoryTemplate,
  type ProductTemplate,
} from './menu-templates.data';

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
  listTemplates() {
    return listTemplatesSummary();
  }

  /**
   * Retorna um template completo por ID.
   */
  getTemplate(id: string): MenuTemplate | null {
    return getTemplateById(id) ?? null;
  }

  /**
   * Detecta o template recomendado para o tenant atual
   * com base em tenant.settings.businessCategory.
   */
  async detectRecommendedTemplate(): Promise<ReturnType<typeof listTemplatesSummary>[number] | null> {
    const tenantId = this.tenantContext.getTenantId();
    if (!tenantId) return null;

    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { settings: true },
    });

    const settings = tenant?.settings as Record<string, unknown> | null;
    const segment = settings?.businessCategory as string | undefined;

    if (!segment) return null;

    const template = getTemplateBySegment(segment);
    if (!template) return null;

    const summaries = listTemplatesSummary();
    return summaries.find((s) => s.id === template.id) ?? null;
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
    const template = getTemplateById(templateId);

    if (!template) {
      throw new Error(`Template "${templateId}" não encontrado`);
    }

    const result: MenuImportResult = {
      success: false,
      templateId,
      categoriesCreated: 0,
      categoriesSkipped: 0,
      productsCreated: 0,
      productsSkipped: 0,
      imagesLinked: 0,
      durationMs: 0,
      errors: [],
    };

    this.logger.log(`menu_import_start tenantId=${tenantId} templateId=${templateId}`);

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
      `menu_import_images_found tenantId=${tenantId} templateId=${templateId} count=${result.imagesLinked}`,
    );
    this.logger.log(
      `menu_import_images_missing tenantId=${tenantId} templateId=${templateId} count=${imagesMissing}`,
    );
    this.logger.log(
      `menu_import_telemetry ` +
        JSON.stringify({
          tenantId,
          template: templateId,
          products: totalProducts,
          imagesMatched: result.imagesLinked,
          imagesMissing,
        }),
    );

    this.logger.log(
      `menu_import_completed tenantId=${tenantId} templateId=${templateId} ` +
        `categories=${result.categoriesCreated} products=${result.productsCreated} ` +
        `images=${result.imagesLinked} durationMs=${result.durationMs}`,
    );

    return result;
  }

  // ─── Private helpers ────────────────────────────────────────────────────────

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
      return;
    }

    // Buscar imagem na biblioteca global ou do tenant indexados em memória
    const mediaAssetId = this.findBestMatchingImageInMemory(
      productTemplate.mediaLookupKey,
      productTemplate.searchTags,
      categoryName,
      systemAssets,
      tenantAssets,
    );

    if (mediaAssetId) {
      result.imagesLinked++;
    }

    // Criar produto via ProductsService oficial
    await this.productsService.create({
      name: productTemplate.name,
      shortDescription: productTemplate.shortDescription,
      basePrice: productTemplate.basePrice,
      categoryId,
      isActive: true,
      isAvailable: true,
      sellableOnline: true,
      type: 'simple',
      ...(mediaAssetId ? { mediaAssetId } : {}),
    });

    result.productsCreated++;
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

  /**
   * Realiza a busca em memória da melhor imagem correspondente usando a precedência:
   * 1. mediaLookupKey
   * 2. searchTags (todas devem corresponder)
   * 3. categoria (nome da categoria da mídia ou correspondência de termo no asset)
   */
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
  ): string | null {
    // Helper para verificar correspondência com uma chave/tag individual
    const matchesKey = (
      asset: {
        title: string | null;
        altText: string | null;
        originalName: string | null;
        filename: string;
        tagsJson: unknown;
      },
      key: string,
    ) => {
      const normalizedKey = key.toLowerCase().trim();
      const normalizedKeyWithSpaces = normalizedKey.replace(/[-_]/g, ' ');

      const title = asset.title?.toLowerCase() || '';
      const altText = asset.altText?.toLowerCase() || '';
      const originalName = asset.originalName?.toLowerCase() || '';
      const filename = asset.filename?.toLowerCase() || '';
      const tags = Array.isArray(asset.tagsJson)
        ? (asset.tagsJson as string[]).map((t) => String(t).toLowerCase())
        : [];

      return (
        title.includes(normalizedKey) ||
        title.includes(normalizedKeyWithSpaces) ||
        altText.includes(normalizedKey) ||
        altText.includes(normalizedKeyWithSpaces) ||
        originalName.includes(normalizedKey) ||
        originalName.includes(normalizedKeyWithSpaces) ||
        filename.includes(normalizedKey) ||
        filename.includes(normalizedKeyWithSpaces) ||
        tags.includes(normalizedKey) ||
        tags.includes(normalizedKeyWithSpaces)
      );
    };

    // Helper para verificar se o asset tem todas as tags requisitadas
    const matchesAllTags = (
      asset: {
        title: string | null;
        altText: string | null;
        originalName: string | null;
        filename: string;
        tagsJson: unknown;
      },
      tags: string[],
    ) => {
      if (!tags.length) return false;
      return tags.every((tag) => matchesKey(asset, tag));
    };

    // Helper para correspondência por categoria
    const matchesCategory = (
      asset: {
        title: string | null;
        altText: string | null;
        originalName: string | null;
        filename: string;
        tagsJson: unknown;
        category: string | null;
      },
      catName: string,
    ) => {
      const normalizedCat = catName.toLowerCase().trim();
      const assetCategory = asset.category?.toLowerCase() || '';
      if (assetCategory === normalizedCat) return true;
      return matchesKey(asset, catName);
    };

    // ── 1. BUSCA NA BIBLIOTECA GLOBAL (SYSTEM GALLERY) ──
    // Prioridade 1.1: mediaLookupKey
    if (mediaLookupKey) {
      const match = systemAssets.find((asset) => matchesKey(asset, mediaLookupKey));
      if (match) return match.id;
    }

    // Prioridade 1.2: searchTags
    if (searchTags && searchTags.length > 0) {
      const match = systemAssets.find((asset) => matchesAllTags(asset, searchTags));
      if (match) return match.id;
    }

    // Prioridade 1.3: Categoria
    if (categoryName) {
      const match = systemAssets.find((asset) => matchesCategory(asset, categoryName));
      if (match) return match.id;
    }

    // ── 2. FALLBACK NA BIBLIOTECA DO TENANT (TENANT LIBRARY) ──
    // Prioridade 2.1: mediaLookupKey
    if (mediaLookupKey) {
      const match = tenantAssets.find((asset) => matchesKey(asset, mediaLookupKey));
      if (match) return match.id;
    }

    // Prioridade 2.2: searchTags
    if (searchTags && searchTags.length > 0) {
      const match = tenantAssets.find((asset) => matchesAllTags(asset, searchTags));
      if (match) return match.id;
    }

    // Prioridade 2.3: Categoria
    if (categoryName) {
      const match = tenantAssets.find((asset) => matchesCategory(asset, categoryName));
      if (match) return match.id;
    }

    return null;
  }
}
