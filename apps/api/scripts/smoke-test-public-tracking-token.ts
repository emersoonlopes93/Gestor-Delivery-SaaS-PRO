import { PrismaClient } from '@prisma/client';
import { generatePublicTrackingToken } from '../src/common/utils/tracking-token.util';

const prisma = new PrismaClient();

async function smokeTest() {
  console.log('=== Smoke Test: Public Tracking Token ===\n');

  try {
    // 1. Criar pedido de teste com token
    console.log('1. Criando pedido de teste com publicTrackingToken...');
    const testOrder = await prisma.order.create({
      data: {
        tenantId: 'demo-tenant-id',
        orderNumber: '#TEST01',
        status: 'pending',
        fulfillmentType: 'delivery',
        customerName: 'Cliente Teste',
        customerPhone: '11999999999',
        itemsSubtotal: 100,
        discountTotal: 0,
        deliveryFee: 10,
        serviceFee: 0,
        total: 110,
        sourceChannel: 'storefront',
        idempotencyKey: 'test-' + Date.now(),
        publicTrackingToken: generatePublicTrackingToken(),
      },
    });
    console.log('   Pedido criado:', { id: testOrder.id, token: testOrder.publicTrackingToken });

    // 2. Buscar pelo token (endpoint público)
    console.log('\n2. Testando busca por token...');
    const foundByToken = await prisma.order.findUnique({
      where: { publicTrackingToken: testOrder.publicTrackingToken! },
      select: {
        id: true,
        status: true,
        publicTrackingToken: true,
        customerPhone: false, // Não expor PII
      },
    });
    console.log('   Encontrado por token:', foundByToken ? 'SIM' : 'NÃO');

    // 3. Tentativa com token inválido
    console.log('\n3. Testando token inválido...');
    const invalidToken = await prisma.order.findUnique({
      where: { publicTrackingToken: 'TOKEN_INVALIDO' },
    });
    console.log('   Token inválido encontrado:', invalidToken ? 'SIM' : 'NÃO');

    // 4. Verificar unicidade
    console.log('\n4. Testando unicidade do token...');
    try {
      const duplicateOrder = await prisma.order.create({
        data: {
          tenantId: 'demo-tenant-id',
          orderNumber: '#TEST02',
          status: 'pending',
          fulfillmentType: 'delivery',
          customerName: 'Cliente Teste 2',
          customerPhone: '11888888888',
          itemsSubtotal: 50,
          discountTotal: 0,
          deliveryFee: 5,
          serviceFee: 0,
          total: 55,
          sourceChannel: 'storefront',
          idempotencyKey: 'test-' + Date.now() + '-dup',
          publicTrackingToken: testOrder.publicTrackingToken!, // Mesmo token
        },
      });
      console.log('   ERRO: Token duplicado aceito!');
    } catch (error: any) {
      console.log('   Unicidade mantida:', error.code === 'P2002' ? 'SIM' : 'NÃO');
    }

    // 5. Limpeza
    console.log('\n5. Limpando dados de teste...');
    await prisma.order.deleteMany({
      where: { orderNumber: { startsWith: '#TEST' } },
    });
    console.log('   Limpeza concluída.');

    console.log('\n=== Smoke Test concluído com sucesso! ===');

  } catch (error) {
    console.error('Erro no smoke test:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Executar smoke test
smokeTest().catch(console.error);
