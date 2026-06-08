import { NestFactory } from '@nestjs/core';
import { AppModule } from './src/app.module';
import { PosService } from './src/pos/pos.service';
import { PrismaService } from './src/database/prisma.service';
import { TenantContextService } from './src/common/context/tenant-context.service';

async function runAudit() {
  console.log('🚀 Iniciando Auditoria E2E (Fase 5.2)...');
  
  const app = await NestFactory.createApplicationContext(AppModule);
  const prisma = app.get(PrismaService);
  const posService = app.get(PosService);
  const tenantContext = app.get(TenantContextService);

  try {
    const order = await prisma.order.findFirst({
        include: { items: true, tenant: true },
        orderBy: { createdAt: 'desc' }
    });

    if (!order) {
        console.log('Nenhum pedido encontrado no banco de dados. Crie um pedido antes de rodar o script!');
        return;
    }

    const tenant = order.tenant;
    tenantContext['tenantId'] = tenant.id;
    (tenantContext as Record<string, unknown>).getTenantId = () => tenant.id;
    console.log(`✅ Tenant carregado a partir do pedido: ${tenant.slug} (${tenant.id})`);

    console.log(`\n📦 Analisando pedido mais recente: ${order.orderNumber} (${order.id})`);

    console.log('🔄 Executando posService.getOrderDetail...');
    const orderDetail = await posService.getOrderDetail(order.id, tenant.id);
    
    console.log('\n========================================');
    console.log('EVIDÊNCIA 1: Payload de Resposta POS');
    console.log('========================================');
    
    const firstItem = orderDetail.items[0];
    
    // Mostramos apenas os arrays legados para evidenciar a ausencia/presenca, ou snapshot.
    console.log(JSON.stringify({
        id: firstItem.id,
        lineType: firstItem.lineType,
        snapshotName: firstItem.snapshotName,
        snapshotCatalogV2Json: firstItem.snapshotCatalogV2Json ? '✅ PRESENTE' : '❌ AUSENTE',
        complements: (firstItem as Record<string, unknown>).complements,
        comboSelections: (firstItem as Record<string, unknown>).comboSelections
    }, null, 2));
    
    const hasLegacyComplements = 'complements' in firstItem && (firstItem as Record<string, unknown>).complements?.length > 0;
    const hasLegacyCombos = 'comboSelections' in firstItem && (firstItem as Record<string, unknown>).comboSelections?.length > 0;

    console.log(`\n🕵️‍♂️ Verificação de Legado no Payload:`);
    console.log(`   - Contém complements legados? ${hasLegacyComplements ? '❌ SIM' : '✅ NÃO'}`);
    console.log(`   - Contém comboSelections legados? ${hasLegacyCombos ? '❌ SIM' : '✅ NÃO'}`);

    console.log('\n========================================');
    console.log('EVIDÊNCIA 2: Banco de Dados');
    console.log('========================================');
    const orderItemDB = await prisma.orderItem.findUnique({
        where: { id: orderDetail.items[0].id },
        include: { complements: true, comboSelections: true }
    });
    
    console.log(`Registros atrelados na tabela OrderItemComplement: ${orderItemDB?.complements.length}`);
    console.log(`Registros atrelados na tabela OrderItemComboSelection: ${orderItemDB?.comboSelections.length}`);

    console.log('\n✅ Auditoria finalizada com sucesso!');

  } catch (error) {
    console.error('❌ Erro durante a auditoria:', error);
  } finally {
    await app.close();
  }
}

runAudit();
