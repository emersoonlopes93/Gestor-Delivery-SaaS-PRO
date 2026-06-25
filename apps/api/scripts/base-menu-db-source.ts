import { PrismaClient } from '@prisma/client';

export type BaseMenuMediaItem = {
  templateId: string;
  templateName: string;
  categoryName: string;
  productName: string;
  shortDescription: string;
  mediaLookupKey: string;
  mediaCategory: string;
  mediaPrompt: string | null;
  searchTags: string[];
};

export async function loadPublishedBaseMenuMediaItems(
  prisma: Pick<PrismaClient, 'baseMenuTemplate'>,
  templateIds: Set<string>,
): Promise<BaseMenuMediaItem[]> {
  const templates = await prisma.baseMenuTemplate.findMany({
    where: {
      status: 'published',
      slug: { in: Array.from(templateIds) },
      currentPublishedVersionId: { not: null },
    },
    include: {
      currentPublishedVersion: {
        include: {
          categories: {
            include: {
              products: true,
            },
            orderBy: { sortOrder: 'asc' },
          },
        },
      },
    },
    orderBy: { slug: 'asc' },
  });

  const items: BaseMenuMediaItem[] = [];

  for (const template of templates) {
    const version = template.currentPublishedVersion;
    if (!version || version.status !== 'published') continue;

    for (const category of version.categories) {
      const products = [...category.products].sort((left, right) => left.sortOrder - right.sortOrder);
      for (const product of products) {
        if (!product.mediaLookupKey) continue;
        const metadata = asRecord(product.metadataJson);
        const mediaPrompt = typeof metadata.mediaPrompt === 'string' ? metadata.mediaPrompt : null;
        const mediaCategory = typeof metadata.mediaCategory === 'string' && metadata.mediaCategory.trim()
          ? metadata.mediaCategory
          : category.name;

        items.push({
          templateId: template.slug,
          templateName: template.name,
          categoryName: category.name,
          productName: product.name,
          shortDescription: product.description ?? '',
          mediaLookupKey: product.mediaLookupKey,
          mediaCategory,
          mediaPrompt,
          searchTags: extractStringArray(product.searchTagsJson),
        });
      }
    }
  }

  return items;
}

function extractStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string');
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
