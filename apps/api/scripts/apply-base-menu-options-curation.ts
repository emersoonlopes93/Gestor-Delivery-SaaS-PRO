import 'reflect-metadata';
import { Prisma, PrismaClient } from '@prisma/client';
import {
  getBaseMenuOptionsCuration,
  validateBaseMenuOptionsCuration,
} from '../src/catalog/menu-import/base-menu-options-curation';

const prisma = new PrismaClient();

type CliOptions = {
  template: string | null;
  dryRun: boolean;
  publish: boolean;
  useExistingDraft: boolean;
};

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (!options.template) {
    throw new Error('Informe --template=acai ou --template=hamburgueria.');
  }

  const curation = getBaseMenuOptionsCuration(options.template);
  if (!curation) {
    throw new Error(`Template sem curadoria de opcionais: ${options.template}`);
  }
  validateBaseMenuOptionsCuration(curation);

  const template = await prisma.baseMenuTemplate.findFirst({
    where: { slug: options.template },
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

  if (!template) throw new Error(`Cardapio Base nao encontrado: ${options.template}`);
  const published = template.currentPublishedVersion;
  if (!published || published.status !== 'published') {
    throw new Error(`Cardapio Base ${options.template} nao possui versao published atual.`);
  }

  const existingDraft = template.versions.find((version) => version.status === 'draft') ?? null;
  if (existingDraft && !options.useExistingDraft) {
    throw new Error('Ja existe draft aberto. Reexecute com --use-existing-draft para aplicar nele.');
  }

  const publishedProducts = published.categories.flatMap((category) => category.products);
  const targetSlugs = new Set(curation.products.map((product) => product.productSlug));
  const matchedProducts = publishedProducts.filter((product) => targetSlugs.has(product.slug));
  const missingSlugs = curation.products
    .filter((item) => !publishedProducts.some((product) => product.slug === item.productSlug))
    .map((item) => item.productSlug);

  console.log(`Template: ${template.slug}`);
  console.log(`Versao publicada atual: ${published.versionNumber}`);
  console.log(`Produtos alvo encontrados: ${matchedProducts.map((product) => product.name).join(', ') || '(nenhum)'}`);
  if (missingSlugs.length > 0) console.warn(`Produtos alvo ausentes: ${missingSlugs.join(', ')}`);
  console.log(`Modo: ${options.dryRun ? 'dry-run' : 'write'}${options.publish ? ' + publish' : ''}`);

  if (options.dryRun) {
    for (const product of curation.products) {
      console.log(`- ${product.productSlug}: ${product.optionGroups.length} grupos`);
    }
    return;
  }

  const result = await prisma.$transaction(async (tx) => {
    const draft = existingDraft
      ? existingDraft
      : await createDraftFromPublished(tx, template.id, published, nextVersionNumber(template.versions));

    const draftProducts = await tx.baseMenuProduct.findMany({
      where: { category: { versionId: draft.id } },
      select: { id: true, slug: true, name: true, metadataJson: true },
    });

    const updatedProducts: string[] = [];
    for (const target of curation.products) {
      const draftProduct = draftProducts.find((product) => product.slug === target.productSlug);
      if (!draftProduct) continue;
      await tx.baseMenuProduct.update({
        where: { id: draftProduct.id },
        data: {
          metadataJson: mergeOptionGroups(draftProduct.metadataJson, target.optionGroups),
        },
      });
      updatedProducts.push(draftProduct.name);
    }

    let publishedVersionId: string | null = null;
    if (options.publish) {
      await tx.baseMenuTemplateVersion.updateMany({
        where: { templateId: template.id, status: 'published', id: { not: draft.id } },
        data: { status: 'archived' },
      });
      const publishedDraft = await tx.baseMenuTemplateVersion.update({
        where: { id: draft.id },
        data: { status: 'published', publishedAt: new Date() },
        select: { id: true },
      });
      await tx.baseMenuTemplate.update({
        where: { id: template.id },
        data: { status: 'published', currentPublishedVersionId: draft.id },
      });
      publishedVersionId = publishedDraft.id;
    }

    return {
      draftVersionId: draft.id,
      updatedProducts,
      publishedVersionId,
    };
  });

  console.log(`Draft atualizado: ${result.draftVersionId}`);
  console.log(`Produtos atualizados: ${result.updatedProducts.join(', ') || '(nenhum)'}`);
  if (result.publishedVersionId) console.log(`Nova versao publicada: ${result.publishedVersionId}`);
}

function parseArgs(args: string[]): CliOptions {
  const options: CliOptions = {
    template: null,
    dryRun: false,
    publish: false,
    useExistingDraft: false,
  };

  for (const arg of args) {
    if (arg.startsWith('--template=')) options.template = arg.slice('--template='.length);
    if (arg === '--dry-run') options.dryRun = true;
    if (arg === '--publish') options.publish = true;
    if (arg === '--use-existing-draft') options.useExistingDraft = true;
  }

  return options;
}

function nextVersionNumber(versions: Array<{ versionNumber: number }>): number {
  return Math.max(...versions.map((version) => version.versionNumber), 0) + 1;
}

async function createDraftFromPublished(
  tx: Prisma.TransactionClient,
  templateId: string,
  published: Prisma.BaseMenuTemplateVersionGetPayload<{
    include: {
      categories: {
        include: { products: true };
      };
    };
  }>,
  versionNumber: number,
) {
  const draft = await tx.baseMenuTemplateVersion.create({
    data: {
      templateId,
      versionNumber,
      status: 'draft',
      metadataJson: published.metadataJson === null ? Prisma.JsonNull : published.metadataJson,
    },
  });

  for (const category of published.categories) {
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
          searchTagsJson: product.searchTagsJson,
          metadataJson: product.metadataJson === null ? Prisma.JsonNull : product.metadataJson,
        },
      });
    }
  }

  return draft;
}

function mergeOptionGroups(current: Prisma.JsonValue | null, optionGroups: Prisma.InputJsonArray): Prisma.InputJsonObject {
  const base = asJsonObject(current);
  return {
    ...base,
    optionGroups,
    optionGroupsSchemaVersion: 1,
    optionGroupsCuratedAt: new Date().toISOString(),
  };
}

function asJsonObject(value: Prisma.JsonValue | null): Prisma.InputJsonObject {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as Prisma.InputJsonObject;
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
