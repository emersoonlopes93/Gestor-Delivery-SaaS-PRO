import { PrismaClient } from '@prisma/client';
import { slugify } from '@gestor/utils';
import { MENU_TEMPLATES } from '../src/catalog/menu-import/menu-templates.data';

const prisma = new PrismaClient();

async function main() {
  console.log('🚀 Iniciando P5 - Curadoria Comercial dos Cardápios Base...\n');

  for (const template of MENU_TEMPLATES) {
    console.log(`\n📦 Processando template: ${template.name} (${template.id})`);

    // Busca o template atual no banco de dados
    const existingTemplate = await prisma.baseMenuTemplate.findUnique({
      where: { slug: template.id },
      include: {
        versions: {
          orderBy: { versionNumber: 'desc' },
          take: 1
        }
      }
    });

    if (!existingTemplate) {
      console.log(`   ⏭️ Template não existe no banco. Será criado pelo bootstrap padrão. Pulando.`);
      continue;
    }

    // Calcula o próximo versionNumber
    const nextVersionNumber = (existingTemplate.versions[0]?.versionNumber || 0) + 1;

    console.log(`   📝 Criando nova versão (v${nextVersionNumber}) com conteúdo comercial curado...`);

    // Inicia a transação para criar a nova versão como draft e já publicar em seguida
    await prisma.$transaction(async (tx) => {
      // 1. Cria a nova versão (vamos criar como published diretamente para simplificar o script P5, 
      // ou criar como draft e publicar. Como é um script de manutenção raiz, fazemos direto).
      const version = await tx.baseMenuTemplateVersion.create({
        data: {
          templateId: existingTemplate.id,
          versionNumber: nextVersionNumber,
          status: 'published',
          publishedAt: new Date(),
          metadataJson: {
            source: 'p5-curation-script',
            curated: true,
            totalCategories: template.categories.length,
            totalProducts: template.categories.reduce((sum, cat) => sum + cat.products.length, 0),
          }
        }
      });

      // 2. Cria as categorias e produtos do JSON curado
      for (const category of template.categories) {
        const categorySlug = slugify(category.name);
        
        const createdCategory = await tx.baseMenuCategory.create({
          data: {
            versionId: version.id,
            slug: categorySlug,
            name: category.name,
            sortOrder: category.order,
            metadataJson: { curated: true }
          }
        });

        for (const [index, product] of category.products.entries()) {
          await tx.baseMenuProduct.create({
            data: {
              categoryId: createdCategory.id,
              slug: slugify(product.name),
              name: product.name,
              description: product.shortDescription,
              basePrice: product.basePrice,
              sortOrder: index + 1,
              mediaLookupKey: product.mediaLookupKey ?? null,
              searchTagsJson: product.searchTags,
              metadataJson: {
                curated: true,
                mediaCategory: product.mediaCategory ?? null,
                mediaPrompt: product.mediaPrompt ?? null,
              }
            }
          });
        }
      }

      // 3. Atualiza o template para apontar para a nova versão publicada
      await tx.baseMenuTemplate.update({
        where: { id: existingTemplate.id },
        data: {
          currentPublishedVersionId: version.id,
          // Atualiza dados básicos se tiverem mudado
          name: template.name,
          description: template.description,
          icon: template.emoji,
          segment: template.businessSegment,
        }
      });

      console.log(`   ✅ Versão v${nextVersionNumber} publicada com sucesso! (${template.categories.length} categorias)`);
    });
  }

  console.log('\n🎉 P5 Curadoria Concluída com Sucesso!');
}

main()
  .catch((e) => {
    console.error('❌ Erro no script P5:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
