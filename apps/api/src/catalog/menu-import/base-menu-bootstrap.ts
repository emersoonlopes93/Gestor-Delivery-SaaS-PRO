import { Prisma, PrismaClient } from '@prisma/client';
import { slugify } from '@gestor/utils';
import { MENU_TEMPLATES, type MenuTemplate } from './menu-templates.data';

const BOOTSTRAP_VERSION = 1;

export type BaseMenuSeedSummary = {
  templates: number;
  versions: number;
  categories: number;
  products: number;
  templatesCreated: number;
  templatesPreserved: number;
  versionsCreated: number;
  versionsOverwritten: number;
  productsOverwritten: number;
  warnings: string[];
  messages: string[];
};

type BaseMenuBootstrapClient = Pick<
  PrismaClient,
  'baseMenuTemplate' | 'baseMenuTemplateVersion' | 'baseMenuCategory' | 'baseMenuProduct'
>;

export async function seedBaseMenuTemplates(
  prisma: BaseMenuBootstrapClient,
  templates: MenuTemplate[] = MENU_TEMPLATES,
): Promise<BaseMenuSeedSummary> {
  const summary: BaseMenuSeedSummary = {
    templates: 0,
    versions: 0,
    categories: 0,
    products: 0,
    templatesCreated: 0,
    templatesPreserved: 0,
    versionsCreated: 0,
    versionsOverwritten: 0,
    productsOverwritten: 0,
    warnings: [],
    messages: [],
  };

  for (const template of templates) {
    const existingTemplate = await prisma.baseMenuTemplate.findUnique({
      where: { slug: template.id },
      include: {
        currentPublishedVersion: {
          include: {
            categories: {
              include: { products: true },
            },
          },
        },
      },
    });

    if (existingTemplate) {
      summary.templatesPreserved++;
      summary.messages.push(`Template ${template.id} ja existe. Pulando bootstrap para evitar sobrescrever fonte oficial do banco.`);
      const warning = divergenceWarning(template, existingTemplate);
      if (warning) summary.warnings.push(warning);
      continue;
    }

    const seededTemplate = await prisma.baseMenuTemplate.create({
      data: {
        slug: template.id,
        name: template.name,
        description: template.description,
        segment: template.businessSegment,
        icon: template.emoji,
        status: 'published',
        metadataJson: templateMetadata(template),
      },
    });
    summary.templates++;
    summary.templatesCreated++;

    const version = await prisma.baseMenuTemplateVersion.create({
      data: {
        templateId: seededTemplate.id,
        versionNumber: BOOTSTRAP_VERSION,
        status: 'published',
        publishedAt: new Date(),
        metadataJson: versionMetadata(template),
      },
    });
    summary.versions++;
    summary.versionsCreated++;

    for (const category of template.categories) {
      const categorySlug = slugify(category.name);
      const seededCategory = await prisma.baseMenuCategory.create({
        data: {
          versionId: version.id,
          slug: categorySlug,
          name: category.name,
          sortOrder: category.order,
          metadataJson: {
            source: 'menu-templates.data.ts',
            bootstrap: true,
            ...(category.metadataJson ?? {}),
          },
        },
      });
      summary.categories++;

      for (const [index, product] of category.products.entries()) {
        await prisma.baseMenuProduct.create({
          data: {
            categoryId: seededCategory.id,
          slug: slugify(product.name),
          name: product.name,
          description: product.shortDescription,
          basePrice: product.basePrice,
          sortOrder: index + 1,
          mediaLookupKey: product.mediaLookupKey ?? null,
          searchTagsJson: product.searchTags,
          metadataJson: mergeJsonObjects(productMetadata(product), product.metadataJson),
        },
      });
        summary.products++;
      }
    }

    await prisma.baseMenuTemplate.update({
      where: { id: seededTemplate.id },
      data: { currentPublishedVersionId: version.id },
    });
  }

  return summary;
}

type ExistingTemplateWithCurrent = {
  name: string;
  description: string | null;
  segment: string;
  icon: string | null;
  currentPublishedVersion: {
    categories: Array<{
      name: string;
      products: Array<{
        name: string;
        description: string | null;
        basePrice: Prisma.Decimal;
      }>;
    }>;
  } | null;
};

function divergenceWarning(template: MenuTemplate, existing: ExistingTemplateWithCurrent): string | null {
  const differences: string[] = [];
  if (existing.name !== template.name) differences.push('template.name');
  if ((existing.description ?? '') !== template.description) differences.push('template.description');
  if (existing.segment !== template.businessSegment) differences.push('template.segment');
  if ((existing.icon ?? '') !== template.emoji) differences.push('template.icon');

  const currentCategories = existing.currentPublishedVersion?.categories ?? [];
  const bootstrapProducts = template.categories.flatMap((category) => category.products);
  const currentProducts = currentCategories.flatMap((category) => category.products);
  if (currentCategories.length !== template.categories.length) differences.push('categorias');
  if (currentProducts.length !== bootstrapProducts.length) differences.push('produtos');

  const productDifferences = bootstrapProducts.filter((product) => {
    const current = currentProducts.find((item) => slugify(item.name) === slugify(product.name));
    if (!current) return true;
    return current.name !== product.name ||
      (current.description ?? '') !== product.shortDescription ||
      !current.basePrice.equals(product.basePrice);
  }).length;

  if (productDifferences > 0) differences.push(`${productDifferences} produtos`);
  if (differences.length === 0) return null;
  return `WARNING: template ${template.id} difere do bootstrap em ${differences.join(', ')}. Nenhuma alteracao aplicada. Use o editor SaaS Admin ou um fluxo futuro explicito de sync/force.`;
}

function templateMetadata(template: MenuTemplate): Prisma.InputJsonObject {
  return {
    source: 'menu-templates.data.ts',
    bootstrap: true,
    businessSegments: template.businessSegments ?? [template.businessSegment],
  };
}

function versionMetadata(template: MenuTemplate): Prisma.InputJsonObject {
  return {
    source: 'menu-templates.data.ts',
    bootstrap: true,
    sourceTemplateId: template.id,
    totalCategories: template.categories.length,
    totalProducts: template.categories.reduce((sum, category) => sum + category.products.length, 0),
  };
}

function productMetadata(product: MenuTemplate['categories'][number]['products'][number]): Prisma.InputJsonObject {
  return {
    source: 'menu-templates.data.ts',
    bootstrap: true,
    mediaCategory: product.mediaCategory ?? null,
    mediaPrompt: product.mediaPrompt ?? null,
  };
}

function mergeJsonObjects(
  base: Prisma.InputJsonObject,
  extra?: Record<string, unknown>,
): Prisma.InputJsonValue {
  return (extra ? { ...base, ...extra } : base) as Prisma.InputJsonValue;
}
