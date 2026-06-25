import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function run() {
  const assets = await prisma.mediaAsset.updateMany({
    where: {
      scope: 'system_gallery',
      publicationStatus: 'draft',
      originalName: {
        in: ['acai_300ml.webp', 'acai_700ml.webp', 'acai_completo.webp']
      }
    },
    data: {
      publicationStatus: 'published'
    }
  });
  console.log(`Published ${assets.count} assets.`);
}

run().catch(console.error).finally(() => prisma.$disconnect());
