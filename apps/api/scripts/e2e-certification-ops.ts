/**
 * E2E Certification — Integrações Operacionais: Estoque, KDS e Impressão (Etapas 6-8)
 * Regra Absoluta: NÃO ASSUMIR FUNCIONAMENTO. Toda conclusão baseada em evidência real.
 */

import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/database/prisma.service';
import { OrdersService } from '../src/orders/orders.service';
import { TheoreticalStockService } from '../src/inventory/theoretical-stock.service';
import { KdsService } from '../src/kds/kds.service';
import { PrinterService } from '../src/pos/printer.service';
import { PaymentMethod, CreateOrderDTO } from '@gestor/types';

interface TestResult {
  etapa: string;
  teste: string;
  status: 'PASS' | 'FAIL' | 'SKIP';
  evidencia: string;
  detalhe?: string;
}

const results: TestResult[] = [];

function log(msg: string) { console.log(`[${new Date().toISOString()}] ${msg}`); }

function pass(etapa: string, teste: string, evidencia: string) {
  results.push({ etapa, teste, status: 'PASS', evidencia });
  log(`  ✅ [${etapa}] ${teste}`);
  log(`     EVIDÊNCIA: ${evidencia}`);
}

function fail(etapa: string, teste: string, evidencia: string, detalhe?: string) {
  results.push({ etapa, teste, status: 'FAIL', evidencia, detalhe });
  log(`  ❌ [${etapa}] ${teste}`);
  log(`     EVIDÊNCIA: ${evidencia}`);
  if (detalhe) log(`     DETALHE: ${detalhe}`);
}

async function main() {
  log('🧪 Inicializando Certificação E2E de Operações (Etapas 6-8)');
  
  const app = await NestFactory.createApplicationContext(AppModule);
  const prisma = app.get(PrismaService);
  const ordersService = app.get(OrdersService);
  const stockService = app.get(TheoreticalStockService);
  const kdsService = app.get(KdsService);
  const printerService = app.get(PrinterService);

  try {
    log('--- PREPARAÇÃO DO AMBIENTE ---');
    const tenantSlug = 'pizzaria-demo';
    let tenant = await prisma.tenant.findUnique({ where: { slug: tenantSlug } });
    if (!tenant) {
      tenant = await prisma.tenant.create({
        data: { name: 'Pizzaria Demo E2E', slug: tenantSlug },
      });
    }

    // Limpar dados residuais de execuções anteriores que falharam antes da limpeza
    log('🧹 Limpando dados residuais de execuções anteriores...');
    const residualOrders = await prisma.order.findMany({ where: { tenantId: tenant.id, customerName: { contains: 'E2E Ops' } }, select: { id: true } });
    const residualOrderIds = residualOrders.map(o => o.id);
    if (residualOrderIds.length > 0) {
      await prisma.printJob.deleteMany({ where: { orderId: { in: residualOrderIds } } });
      await prisma.stockMovement.deleteMany({ where: { orderId: { in: residualOrderIds } } });
      await prisma.orderTimeline.deleteMany({ where: { orderId: { in: residualOrderIds } } });
      await prisma.orderItem.deleteMany({ where: { orderId: { in: residualOrderIds } } });
      await prisma.order.deleteMany({ where: { id: { in: residualOrderIds } } });
    }
    await prisma.productRecipeIngredient.deleteMany({ where: { tenantId: tenant.id } });
    await prisma.ingredient.deleteMany({ where: { tenantId: tenant.id, name: { contains: '[E2E Ops]' } } });
    await prisma.product.deleteMany({ where: { tenantId: tenant.id, name: { contains: '[E2E Ops]' } } });
    log('🧹 Dados residuais limpos.');

    // Criar categoria e produtos de teste
    let category = await prisma.productCategory.findFirst({ where: { tenantId: tenant.id, name: 'E2E Ops Categoria' } });
    if (!category) {
      category = await prisma.productCategory.create({ data: { tenantId: tenant.id, name: 'E2E Ops Categoria', slug: 'e2e-ops-cat' } });
    }

    const refrigerante = await prisma.product.create({
      data: { tenantId: tenant.id, categoryId: category.id, name: '[E2E Ops] Refri', slug: `e2e-ops-refri-${Date.now()}`, basePrice: 10, isActive: true, type: 'simple' },
    });

    // Criar um ingrediente e associar ao refrigerante (Receita) para testar estoque
    const ingrediente = await prisma.ingredient.create({
      data: { tenantId: tenant.id, name: '[E2E Ops] Garrafa Pet', currentStock: 100, minStock: 20, unit: 'un' }
    });

    await prisma.productRecipeIngredient.create({
      data: { tenantId: tenant.id, productId: refrigerante.id, ingredientId: ingrediente.id, quantity: 1 }
    });

    log('✅ Catálogo e Ingredientes de teste criados.');

    // ────────────────────────────────────────────────────────────
    // ETAPA 6 — Estoque Teórico (Abatimento e Reversão)
    // ────────────────────────────────────────────────────────────
    log('\n══════════════════════════════════════════');
    log('ETAPA 6 — Estoque Teórico (Fórmula/Receita)');
    log('══════════════════════════════════════════');

    // Saldo inicial
    const stockBefore = await prisma.ingredient.findUnique({ where: { id: ingrediente.id } });
    const valBefore = Number(stockBefore?.currentStock ?? 0);

    // Colocar um pedido
    const orderPayload: CreateOrderDTO = {
      idempotencyKey: `e2e-ops-stock-${Date.now()}`,
      customerName: 'E2E Ops Estoque',
      customerPhone: '11999990010',
      fulfillmentType: 'pickup',
      payment: { method: PaymentMethod.cash, changeFor: 20 },
      sourceChannel: 'storefront',
      items: [{
        lineType: 'product',
        productId: refrigerante.id,
        quantity: 2, // Deve abater 2 garrafas
        selections: [],
      }]
    };

    const order = await ordersService.createOrder(tenant.slug, orderPayload);
    
    const stockAfterDeplete = await prisma.ingredient.findUnique({ where: { id: ingrediente.id } });
    const valAfterDeplete = Number(stockAfterDeplete?.currentStock ?? 0);

    if (valAfterDeplete === valBefore - 2) {
      pass('ETAPA-6', 'Abatimento de estoque teórico via receita',
        `Antes=${valBefore}, Depois=${valAfterDeplete} (Abateu 2 un de ${ingrediente.name})`);
    } else {
      fail('ETAPA-6', 'Abatimento de estoque teórico via receita',
        `Antes=${valBefore}, Depois=${valAfterDeplete} (Esperava ${valBefore - 2})`);
    }

    // Cancelar o pedido para ver a reversão
    await ordersService.updateOrderStatus(order.id, tenant.id, { status: 'cancelled', note: 'Cancelamento E2E' });

    const stockAfterCancel = await prisma.ingredient.findUnique({ where: { id: ingrediente.id } });
    const valAfterCancel = Number(stockAfterCancel?.currentStock ?? 0);

    if (valAfterCancel === valBefore) {
      pass('ETAPA-6', 'Reversão de estoque teórico ao cancelar pedido',
        `Antes=${valAfterDeplete}, Revertido=${valAfterCancel} (Retornou ao valor inicial de ${valBefore})`);
    } else {
      fail('ETAPA-6', 'Reversão de estoque teórico ao cancelar pedido',
        `Antes=${valAfterDeplete}, Revertido=${valAfterCancel} (Esperava ${valBefore})`);
    }

    // ────────────────────────────────────────────────────────────
    // ETAPA 7 — Kanban & KDS (Jobs de Produção)
    // ────────────────────────────────────────────────────────────
    log('\n══════════════════════════════════════════');
    log('ETAPA 7 — Kanban & KDS (Jobs de Produção)');
    log('══════════════════════════════════════════');

    // Criar outro pedido válido para testar o KDS
    const kdsOrderPayload: CreateOrderDTO = {
      idempotencyKey: `e2e-ops-kds-${Date.now()}`,
      customerName: 'E2E Ops KDS',
      customerPhone: '11999990011',
      fulfillmentType: 'pickup',
      payment: { method: PaymentMethod.pix },
      sourceChannel: 'storefront',
      items: [{
        lineType: 'product',
        productId: refrigerante.id,
        quantity: 1,
        selections: [],
      }]
    };

    const kdsOrder = await ordersService.createOrder(tenant.slug, kdsOrderPayload);

    // Mover para 'confirmed' (deve disparar os jobs do KDS/PrintJobs)
    await ordersService.updateOrderStatus(kdsOrder.id, tenant.id, { status: 'confirmed', note: 'Confirmando para KDS' });

    // Verificar no banco a existência do job
    const jobs = await prisma.printJob.findMany({
      where: { orderId: kdsOrder.id }
    });

    if (jobs.length > 0) {
      pass('ETAPA-7', 'Criação de jobs do KDS na confirmação do pedido',
        `Encontrados ${jobs.length} jobs para o pedido ${kdsOrder.orderNumber}. Status inicial: ${jobs[0].status}`);
    } else {
      fail('ETAPA-7', 'Criação de jobs do KDS na confirmação do pedido',
        `Nenhum job de produção/impressão encontrado para o pedido ${kdsOrder.id}`);
    }

    // ────────────────────────────────────────────────────────────
    // ETAPA 8 — Formatação de Impressão (Printer Service)
    // ────────────────────────────────────────────────────────────
    log('\n══════════════════════════════════════════');
    log('ETAPA 8 — Formatação de Impressão (Printer Service)');
    log('══════════════════════════════════════════');

    try {
      // Buscar o pedido completo como OrderResponseDTO para passar ao PrinterService
      const kdsOrderFull = await ordersService.getOrderDetail(kdsOrder.id, tenant.id);
      const ticket = await printerService.formatTicket(kdsOrderFull, 'kitchen', undefined, 'text');
      if (ticket && ticket.toUpperCase().includes('[E2E OPS]')) {
        pass('ETAPA-8', 'Formatação do ticket de cozinha via PrinterService',
          `Ticket gerado com sucesso. Contém o nome do produto: ${refrigerante.name}`);
      } else {
        fail('ETAPA-8', 'Formatação do ticket de cozinha via PrinterService',
          `Ticket gerado não contém o nome do produto. Conteúdo: ${ticket}`);
      }
    } catch (e: any) {
      fail('ETAPA-8', 'Formatação do ticket de cozinha via PrinterService', 'Erro ao invocar formatTicket', e.message);
    }

    // ────────────────────────────────────────────────────────────
    // LIMPEZA FINAL DO AMBIENTE E RELATÓRIO
    // ────────────────────────────────────────────────────────────
    log('\n--- LIMPANDO REGISTROS DE TESTES E2E OPS ---');
    await prisma.productRecipeIngredient.deleteMany({ where: { tenantId: tenant.id } });
    await prisma.ingredient.deleteMany({ where: { tenantId: tenant.id, name: { contains: '[E2E Ops]' } } });
    
    const cleanE2EOrders = await prisma.order.findMany({ where: { tenantId: tenant.id, customerName: { contains: 'E2E Ops' } }, select: { id: true } });
    const cleanE2EOrderIds = cleanE2EOrders.map(o => o.id);
    if (cleanE2EOrderIds.length > 0) {
      await prisma.printJob.deleteMany({ where: { orderId: { in: cleanE2EOrderIds } } });
      await prisma.orderTimeline.deleteMany({ where: { orderId: { in: cleanE2EOrderIds } } });
      await prisma.orderItem.deleteMany({ where: { orderId: { in: cleanE2EOrderIds } } });
      await prisma.order.deleteMany({ where: { id: { in: cleanE2EOrderIds } } });
    }

    const cleanE2EProducts = await prisma.product.findMany({ where: { name: { contains: '[E2E Ops]' } }, select: { id: true } });
    const cleanProductIds = cleanE2EProducts.map(p => p.id);
    if (cleanProductIds.length > 0) {
      await prisma.product.deleteMany({ where: { id: { in: cleanProductIds } } });
    }
    log('🧹 Registros de testes E2E Ops limpos.');

  } catch (error: any) {
    console.error('ERRO FATAL DURANTE OS TESTES:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
    await app.close();
    printReport();
  }
}

function printReport() {
  log('\n══════════════════════════════════════════');
  log('RELATÓRIO — Certificação Etapas 6-8');
  log('══════════════════════════════════════════\n');

  const passes = results.filter(r => r.status === 'PASS').length;
  const fails = results.filter(r => r.status === 'FAIL').length;
  const skips = results.filter(r => r.status === 'SKIP').length;
  const total = results.length;

  console.table(results.map(r => ({
    etapa: r.etapa,
    teste: r.teste.substring(0, 60),
    status: r.status,
    evidencia: r.evidencia.substring(0, 80),
  })));

  log(`\n TOTAL: ${total} | ✅ PASS: ${passes} | ❌ FAIL: ${fails} | ⚠️  SKIP: ${skips}`);
  log(` SCORE: ${Math.round((passes / (total - skips)) * 100)}% (desconsiderando skips)`);

  if (fails > 0) {
    log('\n❌ CERTIFICAÇÃO REPROVADA — existem falhas críticas\n');
    process.exit(1);
  } else {
    log('\n✅ CERTIFICAÇÃO APROVADA (Etapas 6-8) — evidências reais coletadas\n');
    process.exit(0);
  }
}

main().catch(e => {
  console.error('ERRO INESPERADO NO MÉTODO MAIN:', e);
  process.exit(1);
});
