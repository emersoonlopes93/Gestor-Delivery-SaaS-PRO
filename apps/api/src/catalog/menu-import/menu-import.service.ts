import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { TenantContextService } from '../../common/context/tenant-context.service';
import { ProductsService } from '../products/products.service';
import { CategoriesService } from '../categories/categories.service';
import { MediaLibraryService } from '../../upload/media-library.service';
import {
  MENU_TEMPLATES,
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

    for (const categoryTemplate of template.categories) {
      try {
        const catResult = await this.importCategory(tenantId, categoryTemplate, skipExisting, result);

        for (const productTemplate of categoryTemplate.products) {
          try {
            await this.importProduct(
              tenantId,
              productTemplate,
              catResult.categoryId,
              skipExisting,
              result,
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
    skipExisting: boolean,
    result: MenuImportResult,
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

    // Buscar imagem na media library (prioridade: system_gallery → tenant_library)
    const mediaAssetId = await this.findBestMatchingImage(tenantId, productTemplate.searchTags);
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
   * Busca a melhor imagem correspondente ao produto.
   * Prioridade 1: system_gallery publicada
   * Prioridade 2: tenant_library
   * Prioridade 3: null (sem imagem — nenhum URL hardcoded)
   */
  private async findBestMatchingImage(
    tenantId: string,
    searchTags: string[],
  ): Promise<string | null> {
    if (!searchTags.length) return null;

    // Construir condições de busca por título ou altText
    const searchConditions = searchTags.map((tag) => ({
      OR: [
        { title: { contains: tag, mode: 'insensitive' as const } },
        { altText: { contains: tag, mode: 'insensitive' as const } },
        { originalName: { contains: tag, mode: 'insensitive' as const } },
      ],
    }));

    // Prioridade 1: system_gallery
    const systemAsset = await this.prisma.mediaAsset.findFirst({
      where: {
        scope: 'system_gallery',
        isSystem: true,
        isActive: true,
        status: 'active',
        publicationStatus: 'published',
        deletedAt: null,
        AND: searchConditions,
      },
      select: { id: true },
      orderBy: { createdAt: 'desc' },
    });

    if (systemAsset) return systemAsset.id;

    // Prioridade 2: tenant_library
    const tenantAsset = await this.prisma.mediaAsset.findFirst({
      where: {
        tenantId,
        scope: 'tenant_library',
        isActive: true,
        status: 'active',
        deletedAt: null,
        AND: searchConditions,
      },
      select: { id: true },
      orderBy: { createdAt: 'desc' },
    });

    return tenantAsset?.id ?? null;
  }
}
