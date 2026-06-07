import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/database/prisma.service';
import { MenuImportService } from '../src/catalog/menu-import/menu-import.service';
import { TenantContextService } from '../src/common/context/tenant-context.service';

async function main() {
  console.log('🧪 Iniciando teste de fumaça da importação de cardápios com imagens...\n');
  const app = await NestFactory.createApplicationContext(AppModule);
  const prisma = app.get(PrismaService);
  const importService = app.get(MenuImportService);
  const tenantContext = app.get(TenantContextService);

  const testTenantSlug = 'smoke-test-import-tenant';
  let createdTenantId: string | null = null;
  const createdGlobalAssetIds: string[] = [];

  try {
    // 1. Limpeza de possíveis restos de execuções anteriores
    const existingTenant = await prisma.tenant.findUnique({ where: { slug: testTenantSlug } });
    if (existingTenant) {
      console.log('🧹 Removendo dados do tenant de teste anterior...');
      await prisma.product.deleteMany({ where: { tenantId: existingTenant.id } });
      await prisma.productCategory.deleteMany({ where: { tenantId: existingTenant.id } });
      await prisma.tenantSettings.deleteMany({ where: { tenantId: existingTenant.id } });
      await prisma.tenantRole.deleteMany({ where: { tenantId: existingTenant.id } });
      await prisma.tenant.delete({ where: { id: existingTenant.id } });
    }

    // 2. Criar Tenant de Teste
    console.log('🏪 Criando tenant de teste...');
    const tenant = await prisma.tenant.create({
      data: {
        name: 'Smoke Test Menu Import',
        slug: testTenantSlug,
        status: 'active',
      },
    });
    createdTenantId = tenant.id;

    // Configurar configurações para o tenant
    await prisma.tenantSettings.create({
      data: {
        tenantId: tenant.id,
        businessEmail: 'smoke-import@saas.com',
      },
    });

    // 3. Cadastrar Imagens de Teste na Biblioteca Global (system_gallery)
    console.log('🖼️ Criando imagens de teste na Biblioteca Global (system_gallery)...');

    // Imagem A: específica para Pizza Calabresa via mediaLookupKey (ou título)
    const imageCalabresa = await prisma.mediaAsset.create({
      data: {
        scope: 'system_gallery',
        source: 'url',
        title: 'Pizza de Calabresa Especial',
        filename: 'pizza-calabresa.png',
        path: 'images/pizza-calabresa.png',
        publicUrl: 'http://cdn.com/pizza-calabresa.png',
        mimeType: 'image/png',
        sizeBytes: 1024,
        isSystem: true,
        isActive: true,
        status: 'active',
        publicationStatus: 'published',
        tagsJson: ['pizza', 'calabresa'],
      },
    });
    createdGlobalAssetIds.push(imageCalabresa.id);

    // Imagem B: correspondência por tags para Pizza Margherita (pizza, margherita, tradicional)
    const imageMargherita = await prisma.mediaAsset.create({
      data: {
        scope: 'system_gallery',
        source: 'url',
        title: 'Deliciosa Margherita',
        filename: 'margherita.png',
        path: 'images/margherita.png',
        publicUrl: 'http://cdn.com/margherita.png',
        mimeType: 'image/png',
        sizeBytes: 1024,
        isSystem: true,
        isActive: true,
        status: 'active',
        publicationStatus: 'published',
        tagsJson: ['pizza', 'margherita', 'tradicional'],
      },
    });
    createdGlobalAssetIds.push(imageMargherita.id);

    // Imagem C: correspondência por Categoria para Bebidas
    const imageBebida = await prisma.mediaAsset.create({
      data: {
        scope: 'system_gallery',
        source: 'url',
        title: 'Refrigerantes e Sucos',
        filename: 'bebida-generic.png',
        path: 'images/bebida-generic.png',
        publicUrl: 'http://cdn.com/bebida-generic.png',
        mimeType: 'image/png',
        sizeBytes: 1024,
        isSystem: true,
        isActive: true,
        status: 'active',
        publicationStatus: 'published',
        category: 'Bebidas',
        tagsJson: ['bebida'],
      },
    });
    createdGlobalAssetIds.push(imageBebida.id);

    console.log(`✅ ${createdGlobalAssetIds.length} imagens globais de teste inseridas.`);

    // 4. Executar importação simulando o contexto do tenant
    console.log('🔄 Executando importação automática do template "pizzaria"...');
    // Executar a importação sob o escopo do contexto de tenant correto
    let importResult: any;
    await new Promise<void>((resolve, reject) => {
      tenantContext.run(tenant.id, () => {
        importService.importTemplate('pizzaria')
          .then((res) => {
            importResult = res;
            resolve();
          })
          .catch(reject);
      });
    });
    console.log('📊 Resultado da importação:', importResult);

    // 5. Validar Resultados
    console.log('\n🔍 Validando se os produtos criados possuem as imagens corretas...');

    const products = await prisma.product.findMany({
      where: { tenantId: tenant.id },
      include: { category: true },
    });

    let failed = false;

    // Pizza Calabresa -> deve estar vinculada à imagem de calabresa (por lookupKey/título)
    const pCalabresa = products.find((p) => p.name === 'Pizza Calabresa');
    if (!pCalabresa) {
      console.error('❌ ERRO: Pizza Calabresa não foi criada.');
      failed = true;
    } else {
      const match = pCalabresa.mediaAssetId === imageCalabresa.id;
      console.log(
        `   - Pizza Calabresa associada com imagem de Calabresa: ${
          match ? 'SIM ✅' : `NÃO ❌ (mediaAssetId=${pCalabresa.mediaAssetId})`
        }`,
      );
      if (!match) failed = true;
    }

    // Pizza Margherita -> deve estar vinculada à imagem de Margherita (por searchTags)
    const pMargherita = products.find((p) => p.name === 'Pizza Margherita');
    if (!pMargherita) {
      console.error('❌ ERRO: Pizza Margherita não foi criada.');
      failed = true;
    } else {
      const match = pMargherita.mediaAssetId === imageMargherita.id;
      console.log(
        `   - Pizza Margherita associada com imagem de Margherita: ${
          match ? 'SIM ✅' : `NÃO ❌ (mediaAssetId=${pMargherita.mediaAssetId})`
        }`,
      );
      if (!match) failed = true;
    }

    // Refrigerante Lata -> deve estar vinculado à imagem de Bebida (por categoria Bebidas)
    const pRefrigerante = products.find((p) => p.name === 'Refrigerante Lata');
    if (!pRefrigerante) {
      console.error('❌ ERRO: Refrigerante Lata não foi criado.');
      failed = true;
    } else {
      const match = pRefrigerante.mediaAssetId === imageBebida.id;
      console.log(
        `   - Refrigerante Lata associado com imagem de Bebida (Categoria): ${
          match ? 'SIM ✅' : `NÃO ❌ (mediaAssetId=${pRefrigerante.mediaAssetId})`
        }`,
      );
      if (!match) failed = true;
    }

    // Pudim -> não tem tags ou chaves correspondentes às imagens, deve ter nascido sem imagem (null)
    const pPudim = products.find((p) => p.name === 'Pudim');
    if (!pPudim) {
      console.error('❌ ERRO: Pudim não foi criado.');
      failed = true;
    } else {
      const match = pPudim.mediaAssetId === null;
      console.log(
        `   - Pudim nasceu sem imagem (fallback vazio): ${
          match ? 'SIM ✅' : `NÃO ❌ (mediaAssetId=${pPudim.mediaAssetId})`
        }`,
      );
      if (!match) failed = true;
    }

    // Verificar se as categorias globais de mídia foram criadas com sucesso no banco de dados
    const globalMediaCategories = await prisma.mediaCategory.findMany({
      where: { scope: 'system_gallery', tenantId: null, deletedAt: null },
    });
    console.log(`   - Categorias globais de mídia criadas no banco: ${globalMediaCategories.length}`);
    const expectedCategories = ['Pizzas', 'Hambúrgueres', 'Bebidas', 'Sobremesas', 'Massas'];
    const allCreated = expectedCategories.every((catName) =>
      globalMediaCategories.some((mc) => mc.name === catName),
    );
    console.log(`   - Todas as categorias obrigatórias de mídia foram criadas: ${allCreated ? 'SIM ✅' : 'NÃO ❌'}`);
    if (!allCreated) failed = true;

    if (failed) {
      console.error('\n💥 TESTE DE FUMAÇA: FALHOU');
      process.exitCode = 1;
    } else {
      console.log('\n🎉 TESTE DE FUMAÇA: PASSOU COM SUCESSO!');
      process.exitCode = 0;
    }
  } catch (error) {
    console.error('\n💥 Erro durante a execução do teste de fumaça:', error);
    process.exitCode = 1;
  } finally {
    // 6. Cleanup de tudo que criamos no teste
    console.log('\n🧹 Limpando dados criados para o teste...');
    if (createdTenantId) {
      await prisma.product.deleteMany({ where: { tenantId: createdTenantId } });
      await prisma.productCategory.deleteMany({ where: { tenantId: createdTenantId } });
      await prisma.tenantSettings.deleteMany({ where: { tenantId: createdTenantId } });
      await prisma.tenantRole.deleteMany({ where: { tenantId: createdTenantId } });
      await prisma.tenant.delete({ where: { id: createdTenantId } });
    }

    if (createdGlobalAssetIds.length > 0) {
      await prisma.mediaAsset.deleteMany({ where: { id: { in: createdGlobalAssetIds } } });
    }

    // Remove as categorias de mídia globais que criamos para o teste
    const categoriesToRemove = [
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
    await prisma.mediaCategory.deleteMany({
      where: {
        tenantId: null,
        scope: 'system_gallery',
        name: { in: categoriesToRemove },
      },
    });

    await prisma.$disconnect();
    await app.close();
    console.log('👋 Conectores fechados e banco desconectado.');
  }
}

main();
