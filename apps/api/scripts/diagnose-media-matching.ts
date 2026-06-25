import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function run() {
  const args = process.argv.slice(2);
  const templateArg = args.find(a => a.startsWith('--template='))?.split('=')[1];

  if (!templateArg) {
    console.error('Usage: pnpm -C apps/api exec ts-node scripts/diagnose-media-matching.ts --template=<slug>');
    process.exit(1);
  }

  const template = await prisma.baseMenuTemplate.findFirst({
    where: { slug: templateArg },
    include: {
      currentPublishedVersion: {
        include: {
          categories: {
            include: { products: true }
          }
        }
      }
    }
  });

  if (!template || !template.currentPublishedVersion) {
    console.error(`Template ${templateArg} not found or not published.`);
    process.exit(1);
  }

  const products = template.currentPublishedVersion.categories.flatMap(c => c.products);

  const assets = await prisma.mediaAsset.findMany({
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
      filename: true,
      tagsJson: true,
      metadataJson: true,
      category: true,
      publicationStatus: true,
    }
  });

  const extractStringArray = (value: unknown): string[] => {
    if (!Array.isArray(value)) return [];
    return value.filter((item): item is string => typeof item === 'string');
  };

  const asRecord = (value: unknown): Record<string, unknown> => {
    return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {};
  };

  const getAssetMatchStrategy = (asset: any, product: any): 'exact_lookup' | 'lookup_tag' | 'specific_tag' | 'category_fallback' | 'none' => {
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
  };

  const priority = { exact_lookup: 4, lookup_tag: 3, specific_tag: 2, category_fallback: 1, none: 0 };
  
  let exact = 0;
  let tagMatch = 0;
  let fallback = 0;
  let missing = 0;
  let draftOnly = 0;

  console.log(`\n=== DIAGNÓSTICO DE MATCHING DE IMAGENS: ${template.name} ===`);
  console.log(`Produtos totais: ${products.length}\n`);

  for (const product of products) {
    let bestMatch = null;
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

    const name = product.name.padEnd(30, ' ');
    const lookupStr = (product.mediaLookupKey || '').padEnd(25, ' ');
    
    if (bestMatch) {
      if (bestMatch.publicationStatus === 'published') {
        if (bestStrategy === 'exact_lookup') {
          exact++;
          console.log(`✅ [EXACT]   ${name} | ${lookupStr} => ${bestMatch.filename}`);
        } else if (bestStrategy === 'lookup_tag' || bestStrategy === 'specific_tag') {
          tagMatch++;
          console.log(`✅ [TAG]     ${name} | ${lookupStr} => ${bestMatch.filename}`);
        } else if (bestStrategy === 'category_fallback') {
          fallback++;
          console.log(`⚠️ [FALLBK]  ${name} | ${lookupStr} => ${bestMatch.filename}`);
        }
      } else {
        draftOnly++;
        console.log(`❌ [DRAFT]   ${name} | ${lookupStr} => ${bestMatch.filename} (Não publicado)`);
      }
    } else {
      missing++;
      console.log(`❌ [MISSING] ${name} | ${lookupStr} => Nenhuma imagem`);
    }
  }

  console.log(`\n=== RESUMO ===`);
  console.log(`Exatos: ${exact}`);
  console.log(`Tags: ${tagMatch}`);
  console.log(`Fallbacks: ${fallback}`);
  console.log(`Draft Only: ${draftOnly}`);
  console.log(`Sem Imagem: ${missing}`);
  console.log(`===============`);
}

run().catch(console.error).finally(() => prisma.$disconnect());
