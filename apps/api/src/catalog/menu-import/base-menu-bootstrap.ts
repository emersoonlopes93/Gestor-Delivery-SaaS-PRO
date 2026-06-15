import { Prisma, PrismaClient } from '@prisma/client';
import { slugify } from '@gestor/utils';
import { MENU_TEMPLATES, type MenuTemplate } from './menu-templates.data';

const BOOTSTRAP_VERSION = 1;

export type BaseMenuSeedSummary = {
  templates: number;
  versions: number;
  categories: number;
  products: number;
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
  };

  for (const template of templates) {
    const seededTemplate = await prisma.baseMenuTemplate.upsert({
      where: { slug: template.id },
      update: {
        name: template.name,
        description: template.description,
        segment: template.businessSegment,
        icon: template.emoji,
        status: 'published',
        metadataJson: templateMetadata(template),
      },
      create: {
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

    const version = await prisma.baseMenuTemplateVersion.upsert({
      where: {
        templateId_versionNumber: {
          templateId: seededTemplate.id,
          versionNumber: BOOTSTRAP_VERSION,
        },
      },
      update: {
        status: 'published',
        publishedAt: new Date(),
        metadataJson: versionMetadata(template),
      },
      create: {
        templateId: seededTemplate.id,
        versionNumber: BOOTSTRAP_VERSION,
        status: 'published',
        publishedAt: new Date(),
        metadataJson: versionMetadata(template),
      },
    });
    summary.versions++;

    for (const category of template.categories) {
      const categorySlug = slugify(category.name);
      const seededCategory = await prisma.baseMenuCategory.upsert({
        where: {
          versionId_slug: {
            versionId: version.id,
            slug: categorySlug,
          },
        },
        update: {
          name: category.name,
          sortOrder: category.order,
          metadataJson: {
            source: 'menu-templates.data.ts',
            bootstrap: true,
          },
        },
        create: {
          versionId: version.id,
          slug: categorySlug,
          name: category.name,
          sortOrder: category.order,
          metadataJson: {
            source: 'menu-templates.data.ts',
            bootstrap: true,
          },
        },
      });
      summary.categories++;

      for (const [index, product] of category.products.entries()) {
        await prisma.baseMenuProduct.upsert({
          where: {
            categoryId_slug: {
              categoryId: seededCategory.id,
              slug: slugify(product.name),
            },
          },
          update: {
            name: product.name,
            description: product.shortDescription,
            basePrice: product.basePrice,
            sortOrder: index + 1,
            mediaLookupKey: product.mediaLookupKey ?? null,
            searchTagsJson: product.searchTags,
            metadataJson: productMetadata(product),
          },
          create: {
            categoryId: seededCategory.id,
            slug: slugify(product.name),
            name: product.name,
            description: product.shortDescription,
            basePrice: product.basePrice,
            sortOrder: index + 1,
            mediaLookupKey: product.mediaLookupKey ?? null,
            searchTagsJson: product.searchTags,
            metadataJson: productMetadata(product),
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
