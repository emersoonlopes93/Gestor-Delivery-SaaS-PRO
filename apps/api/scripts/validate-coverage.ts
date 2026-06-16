import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function run() {
  const acaiTemplate = await prisma.baseMenuTemplate.findFirst({
    where: { name: 'Açaí' },
    include: {
      versions: {
        where: { status: 'published' },
        include: {
          categories: {
            include: {
              products: true
            }
          }
        }
      }
    }
  });

  if (!acaiTemplate || acaiTemplate.versions.length === 0) {
    console.log('No Açaí template or published version found.');
    return;
  }

  const version = acaiTemplate.versions[0];
  let totalProducts = 0;
  let withImage = 0;
  
  for (const category of version.categories) {
    for (const product of category.products) {
      totalProducts++;
      if (product.mediaLookupKey) {
        // check if it's published in system_gallery
        const asset = await prisma.mediaAsset.findFirst({
          where: {
            scope: 'system_gallery',
            publicationStatus: 'published',
            tagsJson: {
              array_contains: [product.mediaLookupKey]
            }
          }
        });
        if (asset) {
          withImage++;
          console.log(`Product ${product.name} is linked to ${asset.originalName}`);
        }
      }
    }
  }

  console.log(`\n=> Açaí coverage: ${withImage}/${totalProducts}`);
}

run().catch(console.error).finally(() => prisma.$disconnect());
