import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { StorefrontService } from '../src/storefront/storefront.service';
import { OrdersService } from '../src/orders/orders.service';
import { PrismaClient } from '@prisma/client';
import { CreateOrderDTO, PaymentMethod } from '@gestor/types';

async function main() {
  console.log('🚀 INICIANDO SMOKE TEST E2E DO STOREFRONT CHECKOUT\n');
  const prisma = new PrismaClient();
  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  
  const storefrontService = app.get(StorefrontService);
  const ordersService = app.get(OrdersService);
  
  // Encontrar um tenant válido para o teste
  const tenant = await prisma.tenant.findFirst({ 
    where: { slug: 'pizzaria-demo' } 
  });
  
  if (!tenant) throw new Error('Tenant pizzaria-demo não encontrado.');

  let passed = 0;
  let failed = 0;
  
  const assert = (name: string, ok: boolean, detail: string) => {
    if (ok) {
      console.log(` ✅ PASS : ${name} | ${detail}`);
      passed++;
    } else {
      console.log(` ❌ FAIL : ${name} | ${detail}`);
      failed++;
    }
  };

  try {
    console.log('\n--- ETAPA 1: CARREGAMENTO DO CARDÁPIO (CACHE/DB) ---');
    const payload = await storefrontService.getStorefrontPayload(tenant.slug, 'delivery');
    
    assert('Payload carregado', !!payload, 'Payload do storefront foi obtido com sucesso');
    assert('Categorias disponíveis', payload.categories.length > 0, `Foram carregadas ${payload.categories.length} categorias`);

    const firstCategory = payload.categories.find(c => c.products && c.products.length > 0);
    if (!firstCategory) {
       throw new Error('Nenhum produto disponível no cardápio para teste.');
    }
    
    const productToBuy = firstCategory.products[0];
    assert('Produto selecionado', !!productToBuy, `Produto "${productToBuy.name}" escolhido para o carrinho`);

    console.log('\n--- ETAPA 2: CHECKOUT E CRIAÇÃO DO PEDIDO ---');
    
    const idempotencyKey = `e2e-smoke-${Date.now()}`;
    const checkoutDto: CreateOrderDTO = {
      idempotencyKey,
      items: [
        {
          lineType: 'product',
          productId: productToBuy.id,
          quantity: 2,
        }
      ],
      customerName: 'Cliente Smoke Test',
      customerPhone: '11988887777',
      customerEmail: 'smoke.test@gestor.delivery',
      fulfillmentType: 'delivery',
      deliveryAddress: {
        street: 'Avenida Paulista',
        number: '1500',
        neighborhood: 'Bela Vista',
        city: 'São Paulo',
        state: 'SP',
        zipCode: '01310-100'
      },
      payment: {
        method: PaymentMethod.pix
      }
    };

    const orderResponse = await ordersService.createOrder(tenant.slug, checkoutDto);
    
    assert('Pedido criado na API', !!orderResponse.id, `ID: ${orderResponse.id} gerado`);
    assert('Status inicial é pending', orderResponse.status === 'pending', 'Status validado');

    console.log('\n--- ETAPA 3: VALIDAÇÃO NO BANCO E KANBAN ---');
    
    const savedOrder = await prisma.order.findUnique({
      where: { id: orderResponse.id },
      include: { items: true, deliveryAddress: true }
    });

    assert('Persistência no banco', !!savedOrder, 'Registro de pedido encontrado no DB');
    assert('Subtotal calculado corretamente', Number(savedOrder?.itemsSubtotal) > 0, `Subtotal: ${savedOrder?.itemsSubtotal}`);
    assert('Endereço vinculado', !!savedOrder?.deliveryAddress, 'Endereço de entrega salvo com sucesso');

    // Validação pro Kanban (board)
    const boardOrders = await ordersService.getBoardOrders(tenant.id, 'delivery');
    const isNoBoard = boardOrders.some(o => o.id === orderResponse.id);
    assert('Listado no Kanban de Delivery', isNoBoard, 'O pedido aparece corretamente na tela operacional (KDS/Kanban)');

  } catch (error: any) {
    console.error('\n❌ FATAL ERROR DURING SMOKE TEST:', error);
    failed++;
  } finally {
    await app.close();
    await prisma.$disconnect();
    console.log(`\n==========================================`);
    console.log(`📊 FINAL RESULTS: ✅ ${passed} passed | ❌ ${failed} failed`);
    console.log(`==========================================`);
    process.exit(failed > 0 ? 1 : 0);
  }
}

main();
