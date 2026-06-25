import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { HealthService } from '../src/health/health.service';
import { StorefrontService } from '../src/storefront/storefront.service';
import { OrdersService } from '../src/orders/orders.service';
import { PrismaClient } from '@prisma/client';
import { CreateOrderDTO, PaymentMethod } from '@gestor/types';

async function main() {
  console.log('🔍 INICIANDO DIAGNÓSTICO OPERACIONAL (P10) - GESTOR DELIVERY PRO\n');
  
  const prisma = new PrismaClient();
  const app = await NestFactory.createApplicationContext(AppModule);
  
  const healthService = app.get(HealthService);
  const storefrontService = app.get(StorefrontService);
  const ordersService = app.get(OrdersService);

  const createOrderFlag = process.argv.includes('--create-test-order');
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
    // 1. Diagnóstico do Banco de Dados
    console.log('--- DIAGNÓSTICO: BANCO DE DADOS (POSTGRESQL) ---');
    try {
      const dbStart = Date.now();
      await prisma.$queryRawUnsafe('SELECT 1');
      assert('PostgreSQL', true, `Conexão ativa e respondendo em ${Date.now() - dbStart}ms`);
    } catch (err: any) {
      assert('PostgreSQL', false, `Falha de conexão: ${err.message}`);
    }

    // 2. Diagnóstico do Redis
    console.log('\n--- DIAGNÓSTICO: CACHE & REDIS ---');
    const redisEnabled = process.env.REDIS_ENABLED !== 'false';
    if (!redisEnabled) {
      console.log(' ℹ️ INFO : Redis está desativado nas variáveis de ambiente (fallback local ativo)');
    }
    const redisPing = await healthService.pingRedis();
    assert(
      'Redis Connection',
      redisPing.connected || !redisEnabled,
      redisPing.connected 
        ? `Redis conectado com sucesso em ${redisPing.latencyMs}ms` 
        : `Redis indisponível. Reason: ${redisPing.reason || 'Not configured'}`
    );

    // 3. Diagnóstico do BullMQ
    console.log('\n--- DIAGNÓSTICO: BULLMQ (FILAS) ---');
    const bullmqEnabled = redisEnabled && process.env.BULLMQ_ENABLED === 'true';
    if (bullmqEnabled) {
      const qHealth = await healthService.checkQueueHealth('campaign-dispatch', true);
      assert(
        'BullMQ Queue (campaign-dispatch)',
        qHealth.status === 'ok',
        qHealth.status === 'ok' 
          ? `Fila ativa. Waiting: ${qHealth.waiting}, Active: ${qHealth.active}, Failed: ${qHealth.failed}`
          : `Fila inativa/degradada. Error: ${qHealth.error}`
      );
    } else {
      console.log(' ℹ️ INFO : BullMQ está desativado (Requer REDIS_ENABLED=true e BULLMQ_ENABLED=true)');
    }

    // 4. Diagnóstico de Storefront & Cache Payload
    console.log('\n--- DIAGNÓSTICO: STOREFRONT & PAYLOAD ---');
    const tenant = await prisma.tenant.findFirst({
      select: { id: true, slug: true, name: true }
    });

    if (tenant) {
      try {
        const payloadStart = Date.now();
        const payload = await storefrontService.getStorefrontPayload(tenant.slug, 'delivery');
        assert(
          'Storefront Payload',
          !!payload,
          `Cardápio do tenant "${tenant.name}" (${tenant.slug}) obtido em ${Date.now() - payloadStart}ms`
        );
      } catch (err: any) {
        assert('Storefront Payload', false, `Falha ao carregar payload do storefront: ${err.message}`);
      }
    } else {
      assert('Storefront Payload', false, 'Nenhum tenant cadastrado no banco de dados para testar payload');
    }

    // 5. Criação de Pedido Teste (OPCIONAL via Flag)
    if (createOrderFlag) {
      console.log('\n--- DIAGNÓSTICO OPCIONAL: CRIAÇÃO DE PEDIDO TESTE ---');
      if (!tenant) {
        assert('Pedido Teste', false, 'Impossível criar pedido sem tenants cadastrados');
      } else {
        try {
          const payload = await storefrontService.getStorefrontPayload(tenant.slug, 'delivery');
          const firstCategory = payload.categories.find(c => c.products && c.products.length > 0);
          const product = firstCategory?.products[0];
          
          if (!product) {
            throw new Error('Nenhum produto cadastrado no tenant para efetuar o pedido teste');
          }

          const idempotencyKey = `diagnose-test-${Date.now()}`;
          const checkoutDto: CreateOrderDTO = {
            idempotencyKey,
            items: [
              {
                lineType: 'product',
                productId: product.id,
                quantity: 1,
              }
            ],
            customerName: 'Cliente Teste Diagnóstico',
            customerPhone: '11900000000',
            customerEmail: 'test.diagnose@gestor.delivery',
            fulfillmentType: 'delivery',
            deliveryAddress: {
              street: 'Rua Diagnóstico',
              number: '100',
              neighborhood: 'Centro',
              city: 'São Paulo',
              state: 'SP',
              zipCode: '01000-000'
            },
            payment: {
              method: PaymentMethod.pix
            }
          };

          const orderResponse = await ordersService.createOrder(tenant.slug, checkoutDto);
          assert('Pedido Teste', !!orderResponse.id, `Pedido criado com sucesso ID: ${orderResponse.id}`);
          
          // Limpeza do pedido teste para evitar lixo acumulado no banco
          await prisma.orderItem.deleteMany({ where: { orderId: orderResponse.id } });
          await prisma.orderDeliveryAddress.deleteMany({ where: { orderId: orderResponse.id } });
          await prisma.order.delete({ where: { id: orderResponse.id } });
          console.log(' ℹ️ CLEANUP : Pedido teste removido do banco com sucesso após a validação.');
        } catch (err: any) {
          assert('Pedido Teste', false, `Falha na criação do pedido teste: ${err.message}`);
        }
      }
    } else {
      console.log('\n💡 DICA : Use a flag --create-test-order para testar a criação e limpeza de pedidos.');
    }

  } catch (error: any) {
    console.error('\n❌ ERRO CRÍTICO NO SCRIPT DE DIAGNÓSTICO:', error);
    failed++;
  } finally {
    await app.close();
    await prisma.$disconnect();
    console.log(`\n==========================================`);
    console.log(`📊 DIAGNÓSTICO FINAL: ✅ ${passed} passed | ❌ ${failed} failed`);
    console.log(`==========================================`);
    process.exit(failed > 0 ? 1 : 0);
  }
}

main();
