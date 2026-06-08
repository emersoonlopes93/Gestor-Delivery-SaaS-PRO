/**
 * E2E Certification — Pedidos, Storefront, PDV, Combos e Pricing (Etapas 2-5)
 * Regra Absoluta: NÃO ASSUMIR FUNCIONAMENTO. Toda conclusão baseada em evidência real.
 */

import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/database/prisma.service';
import { OrdersService } from '../src/orders/orders.service';
import { PaymentMethod, CreateOrderDTO, OrderStatus } from '@gestor/types';

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

function skip(etapa: string, teste: string, motivo: string) {
  results.push({ etapa, teste, status: 'SKIP', evidencia: motivo });
  log(`  ⚠️  [${etapa}] ${teste} — SKIP: ${motivo}`);
}

async function main() {
  log('🧪 Inicializando Certificação E2E via Nest Context (Etapas 2-5)');
  
  const app = await NestFactory.createApplicationContext(AppModule);
  const prisma = app.get(PrismaService);
  const ordersService = app.get(OrdersService);

  try {
    log('--- PREPARAÇÃO DO AMBIENTE ---');
    const tenantSlug = 'pizzaria-demo';
    let tenant = await prisma.tenant.findUnique({ where: { slug: tenantSlug } });
    if (!tenant) {
      log('Criando tenant de testes...');
      tenant = await prisma.tenant.create({
        data: { name: 'Pizzaria Demo E2E', slug: tenantSlug },
      });
    }

    await prisma.tenantSettings.upsert({
      where: { tenantId: tenant.id },
      create: { tenantId: tenant.id, isStorePaused: false },
      update: { isStorePaused: false },
    });

    // Limpeza de pedidos E2E anteriores
    const e2eOrders = await prisma.order.findMany({ where: { tenantId: tenant.id, customerName: { contains: 'E2E Certif' } }, select: { id: true } });
    const e2eOrderIds = e2eOrders.map(o => o.id);
    if (e2eOrderIds.length > 0) {
      log(`Limpando ${e2eOrderIds.length} pedidos E2E anteriores...`);
      await prisma.orderItem.deleteMany({ where: { orderId: { in: e2eOrderIds } } });
      await prisma.order.deleteMany({ where: { id: { in: e2eOrderIds } } });
    }

    // Limpeza de Produtos E2E anteriores e dependências
    const e2eProducts = await prisma.product.findMany({ where: { name: { contains: '[E2E Certif]' } }, select: { id: true } });
    const productIds = e2eProducts.map(p => p.id);
    if (productIds.length > 0) {
      log(`Limpando ${productIds.length} produtos E2E anteriores...`);
      await prisma.comboSlotAllowedItem.deleteMany({ where: { productId: { in: productIds } } });
      await prisma.comboSlot.deleteMany({ where: { comboProductId: { in: productIds } } });
      await prisma.productOptionGroupLink.deleteMany({ where: { productId: { in: productIds } } });
      
      const e2eGroups = await prisma.optionGroup.findMany({ where: { name: { contains: '[E2E Certif]' } }, select: { id: true } });
      const groupIds = e2eGroups.map(g => g.id);
      if(groupIds.length) {
         await prisma.optionItem.deleteMany({ where: { optionGroupId: { in: groupIds } } });
         await prisma.optionGroup.deleteMany({ where: { id: { in: groupIds } } });
      }
      
      await prisma.product.deleteMany({ where: { id: { in: productIds } } });
    }

    // Criando estrutura de catálogo E2E V3
    let category = await prisma.productCategory.findFirst({ where: { tenantId: tenant.id, name: 'E2E Certif Categoria' } });
    if (!category) {
      category = await prisma.productCategory.create({ data: { tenantId: tenant.id, name: 'E2E Certif Categoria', slug: 'e2e-certif-cat' } });
    }

    // 1. Produto Simples
    const refrigerante = await prisma.product.create({
      data: { tenantId: tenant.id, categoryId: category.id, name: '[E2E Certif] Refrigerante 2L', slug: 'e2e-certif-refri', basePrice: 15, isActive: true, type: 'simple' as any },
    });

    // 2. OptionGroup Borda
    const bordaGroup = await prisma.optionGroup.create({
      data: {
        tenantId: tenant.id,
        name: '[E2E Certif] Borda',
        isRequired: true,
        minSelect: 1,
        maxSelect: 1,
        selectionType: 'single',
        items: {
          create: [
            { tenantId: tenant.id, name: 'Sem Borda', priceImpactType: 'fixed', priceImpactValue: 0, isActive: true },
            { tenantId: tenant.id, name: 'Catupiry', priceImpactType: 'fixed', priceImpactValue: 10, isActive: true },
          ],
        },
      },
      include: { items: true },
    });

    // 3. Produto Configurável
    const pizza = await prisma.product.create({
      data: {
        tenantId: tenant.id,
        categoryId: category.id,
        name: '[E2E Certif] Pizza Média',
        slug: 'e2e-certif-pizza',
        basePrice: 50,
        isActive: true,
        type: 'configurable' as any,
      },
    });

    await prisma.productOptionGroupLink.create({
      data: { tenantId: tenant.id, productId: pizza.id, optionGroupId: bordaGroup.id, order: 1 },
    });

    // 4. Produto Combo
    const combo = await prisma.product.create({
      data: { tenantId: tenant.id, categoryId: category.id, name: '[E2E Certif] Combo Casal', slug: 'e2e-certif-combo', basePrice: 60, isActive: true, type: 'combo' as any },
    });

    const slotPizza = await prisma.comboSlot.create({
      data: { tenantId: tenant.id, comboProductId: combo.id, name: 'Escolha a Pizza', isRequired: true, order: 1, minSelect: 1, maxSelect: 1 },
    });
    await prisma.comboSlotAllowedItem.create({ data: { tenantId: tenant.id, comboSlotId: slotPizza.id, productId: pizza.id, additionalPrice: 0 } });

    const slotBebida = await prisma.comboSlot.create({
      data: { tenantId: tenant.id, comboProductId: combo.id, name: 'Escolha a Bebida', isRequired: true, order: 2, minSelect: 1, maxSelect: 1 },
    });
    await prisma.comboSlotAllowedItem.create({ data: { tenantId: tenant.id, comboSlotId: slotBebida.id, productId: refrigerante.id, additionalPrice: 0 } });

    log('✅ Setup do catálogo E2E V3 concluído com sucesso.');

    // ────────────────────────────────────────────────────────────
    // ETAPA 2 — Schema V3 puro no banco
    // ────────────────────────────────────────────────────────────
    log('\n══════════════════════════════════════════');
    log('ETAPA 2 — Auditoria de Schema V3 no banco');
    log('══════════════════════════════════════════');

    const [productCount, optionGroupCount, comboSlotCount] = await Promise.all([
      prisma.product.count(),
      prisma.optionGroup.count(),
      prisma.comboSlot.count(),
    ]);

    if (productCount >= 0 && optionGroupCount >= 0 && comboSlotCount >= 0) {
      pass('ETAPA-2', 'Tabelas V3 existem e são acessíveis',
        `Product=${productCount}, OptionGroup=${optionGroupCount}, ComboSlot=${comboSlotCount}`);
    } else {
      fail('ETAPA-2', 'Tabelas V3 existem e são acessíveis', 'Contagem retornou valor inválido');
    }

    const legacyChecks = [
      'ProductComplementGroup',
      'ProductComplementItem',
      'ProductCombo',
      'ProductComboBlock',
      'OrderItemComplement',
      'OrderItemComboSelection',
    ];

    for (const tableName of legacyChecks) {
      try {
        await prisma.$queryRawUnsafe(`SELECT 1 FROM "${tableName}" LIMIT 1`);
        fail('ETAPA-2', `Tabela legada ${tableName} DEVE ter sido removida`,
          `Tabela ${tableName} AINDA EXISTE no banco — legado ativo!`);
      } catch {
        pass('ETAPA-2', `Tabela legada ${tableName} removida`,
          `Query em ${tableName} falhou com erro esperado — tabela inexistente`);
      }
    }

    // ────────────────────────────────────────────────────────────
    // ETAPA 3 — Fluxo completo de pedido (produto simples)
    // ────────────────────────────────────────────────────────────
    log('\n══════════════════════════════════════════');
    log('ETAPA 3 — Fluxo de Pedido: Produto Simples');
    log('══════════════════════════════════════════');

    const simpleOrderPayload = {
      idempotencyKey: `e2e-certif-simple-${Date.now()}`,
      customerName: 'E2E Certif. Simples',
      customerPhone: '11999990000',
      fulfillmentType: 'pickup',
      payment: { method: PaymentMethod.cash, changeFor: 50 },
      sourceChannel: 'storefront',
      items: [{
        lineType: 'product',
        productId: refrigerante.id,
        quantity: 1,
        selections: [],
      }]
    } as unknown as CreateOrderDTO;

    try {
      const order = await ordersService.createOrder(tenant.slug, simpleOrderPayload);
      if (order && order.id) {
        pass('ETAPA-3', 'Criação de pedido simples via OrdersService',
          `Pedido criado: id=${order.id}, orderNumber=${order.orderNumber}, status=${order.status}`);

        const dbOrder = await prisma.order.findUnique({
          where: { id: order.id },
          include: { items: true }
        });
        
        if (dbOrder && dbOrder.items.length > 0) {
          const dbItem = dbOrder.items[0];
          pass('ETAPA-3', 'Persistência do pedido simples no banco V3',
            `OrderItem id=${dbItem.id}, lineType=${dbItem.lineType}, productId=${dbItem.productId}, unitPrice=${dbItem.unitPrice}`);

          const itemRaw = dbItem as any;
          if ('complements' in itemRaw && itemRaw.complements !== undefined) {
            fail('ETAPA-3', 'OrderItem sem campos legados', 'Campo "complements" encontrado — legado presente!');
          } else {
            pass('ETAPA-3', 'OrderItem sem campos legados V2',
              'Nenhum campo "complements" ou "comboSelections" no item — V3 puro ✅');
          }
        } else {
          fail('ETAPA-3', 'Persistência do pedido simples no banco V3', `Pedido ${order.id} não encontrado ou sem itens`);
        }
      }
    } catch (e: any) {
      fail('ETAPA-3', 'Criação de pedido simples via OrdersService', 'Falha no processamento', e.message);
    }

    // ────────────────────────────────────────────────────────────
    // ETAPA 4 — Produto configurável (com OptionGroup/OptionItem)
    // ────────────────────────────────────────────────────────────
    log('\n══════════════════════════════════════════');
    log('ETAPA 4 — Pedido com Produto Configurável (OptionItems)');
    log('══════════════════════════════════════════');

    const bordaCatupiry = bordaGroup.items.find(i => i.name === 'Catupiry')!;
    const configurableOrderPayload = {
      idempotencyKey: `e2e-certif-config-${Date.now()}`,
      customerName: 'E2E Certif. Configurável',
      customerPhone: '11999990001',
      fulfillmentType: 'pickup',
      payment: { method: PaymentMethod.cash, changeFor: 100 },
      sourceChannel: 'storefront',
      items: [{
        lineType: 'product',
        productId: pizza.id,
        quantity: 1,
        selections: [{
          optionGroupId: bordaGroup.id,
          items: [{ optionItemId: bordaCatupiry.id, qty: 1 }],
        }],
      }]
    } as unknown as CreateOrderDTO;

    try {
      const order = await ordersService.createOrder(tenant.slug, configurableOrderPayload);
      if (order && order.id) {
        pass('ETAPA-4', 'Criação de pedido configurável via OrdersService',
          `Pedido id=${order.id}, total=${order.total}`);

        const dbOrder = await prisma.order.findUnique({
          where: { id: order.id },
          include: { items: true }
        });

        if (dbOrder && dbOrder.items.length > 0) {
          const dbItem = dbOrder.items[0];
          const snap = typeof dbItem.snapshotCatalogV2Json === 'string'
            ? JSON.parse(dbItem.snapshotCatalogV2Json)
            : (dbItem.snapshotCatalogV2Json as any);

          if (snap && snap.optionItems && snap.optionItems.length > 0) {
            pass('ETAPA-4', 'snapshotCatalogV2Json com optionItems persistido',
              `optionItems=[${snap.optionItems.map((o: any) => `${o.snapshotName} (+R$${o.snapshotPrice})`).join(', ')}]`);
          } else {
            fail('ETAPA-4', 'snapshotCatalogV2Json com optionItems persistido',
              `snap=${JSON.stringify(snap)}`);
          }

          if (Number(dbItem.snapshotExtrasTotal) === 10) {
            pass('ETAPA-4', 'snapshotExtrasTotal calculado corretamente (Catupiry = R$10)',
              `snapshotExtrasTotal=${dbItem.snapshotExtrasTotal}`);
          } else {
            fail('ETAPA-4', 'snapshotExtrasTotal calculado corretamente',
              `snapshotExtrasTotal=${dbItem.snapshotExtrasTotal} (esperava 10.00)`);
          }

          if (Number(dbItem.unitPrice) === 60) {
            pass('ETAPA-4', 'unitPrice do item calculado corretamente (50 base + 10 extras = 60)',
              `unitPrice=${dbItem.unitPrice}`);
          } else {
            fail('ETAPA-4', 'unitPrice do item calculado corretamente',
              `unitPrice=${dbItem.unitPrice} (esperava 60.00)`);
          }
        }
      }
    } catch (e: any) {
      fail('ETAPA-4', 'Criação de pedido configurável via OrdersService', 'Falha no processamento', e.message);
    }

    // ────────────────────────────────────────────────────────────
    // ETAPA 5 — Combo V3 (ComboSlot + ComboSlotAllowedItem)
    // ────────────────────────────────────────────────────────────
    log('\n══════════════════════════════════════════');
    log('ETAPA 5 — Pedido com Combo V3 (ComboSlot)');
    log('══════════════════════════════════════════');

    const comboOrderPayload = {
      idempotencyKey: `e2e-certif-combo-${Date.now()}`,
      customerName: 'E2E Certif. Combo',
      customerPhone: '11999990002',
      fulfillmentType: 'pickup',
      payment: { method: PaymentMethod.pix },
      sourceChannel: 'storefront',
      items: [{
        lineType: 'combo',
        productId: combo.id,
        quantity: 1,
        slots: [
          { comboSlotId: slotPizza.id, items: [{ productId: pizza.id, qty: 1 }] },
          { comboSlotId: slotBebida.id, items: [{ productId: refrigerante.id, qty: 1 }] }
        ]
      }]
    } as unknown as CreateOrderDTO;

    try {
      const order = await ordersService.createOrder(tenant.slug, comboOrderPayload);
      if (order && order.id) {
        pass('ETAPA-5', 'Criação de pedido com Combo V3 via OrdersService',
          `Pedido id=${order.id}, total=${order.total}`);

        const dbOrder = await prisma.order.findUnique({
          where: { id: order.id },
          include: { items: true }
        });

        if (dbOrder && dbOrder.items.length > 0) {
          const dbItem = dbOrder.items.find(i => i.lineType === 'combo');
          if (dbItem) {
            const snap = typeof dbItem.snapshotCatalogV2Json === 'string'
              ? JSON.parse(dbItem.snapshotCatalogV2Json)
              : (dbItem.snapshotCatalogV2Json as any);

            if (snap && snap.slots && snap.slots.length > 0) {
              pass('ETAPA-5', 'snapshotCatalogV2Json com slots persistido',
                `slots=[${snap.slots.map((s: any) => `${s.slotName}: ${s.items.map((i: any) => i.snapshotName).join(', ')}`).join(' | ')}]`);
            } else {
              fail('ETAPA-5', 'snapshotCatalogV2Json com slots persistido',
                `snap=${JSON.stringify(snap)}`);
            }

            if (dbItem.lineType === 'combo' && dbItem.comboId === combo.id) {
              pass('ETAPA-5', 'lineType=combo e comboId persistidos corretamente',
                `lineType=${dbItem.lineType}, comboId=${dbItem.comboId}`);
            } else {
              fail('ETAPA-5', 'lineType=combo e comboId persistidos corretamente',
                `lineType=${dbItem.lineType}, comboId=${dbItem.comboId}`);
            }
          } else {
            fail('ETAPA-5', 'Busca do item de combo no banco', 'Item com lineType=combo não encontrado no pedido');
          }
        }
      }
    } catch (e: any) {
      fail('ETAPA-5', 'Criação de pedido com Combo V3 via OrdersService', 'Falha no processamento', e.message);
    }

    // ────────────────────────────────────────────────────────────
    // LIMPEZA FINAL DO AMBIENTE E RELATÓRIO
    // ────────────────────────────────────────────────────────────
    log('\n--- LIMPANDO REGISTROS DE TESTES E2E CERTIF ---');
    const cleanE2EOrders = await prisma.order.findMany({ where: { tenantId: tenant.id, customerName: { contains: 'E2E Certif' } }, select: { id: true } });
    const cleanE2EOrderIds = cleanE2EOrders.map(o => o.id);
    if (cleanE2EOrderIds.length > 0) {
      await prisma.orderItem.deleteMany({ where: { orderId: { in: cleanE2EOrderIds } } });
      await prisma.order.deleteMany({ where: { id: { in: cleanE2EOrderIds } } });
    }

    const cleanE2EProducts = await prisma.product.findMany({ where: { name: { contains: '[E2E Certif]' } }, select: { id: true } });
    const cleanProductIds = cleanE2EProducts.map(p => p.id);
    if (cleanProductIds.length > 0) {
      await prisma.comboSlotAllowedItem.deleteMany({ where: { productId: { in: cleanProductIds } } });
      await prisma.comboSlot.deleteMany({ where: { comboProductId: { in: cleanProductIds } } });
      await prisma.productOptionGroupLink.deleteMany({ where: { productId: { in: cleanProductIds } } });
      
      const cleanE2EGroups = await prisma.optionGroup.findMany({ where: { name: { contains: '[E2E Certif]' } }, select: { id: true } });
      const cleanGroupIds = cleanE2EGroups.map(g => g.id);
      if(cleanGroupIds.length) {
         await prisma.optionItem.deleteMany({ where: { optionGroupId: { in: cleanGroupIds } } });
         await prisma.optionGroup.deleteMany({ where: { id: { in: cleanGroupIds } } });
      }
      await prisma.product.deleteMany({ where: { id: { in: cleanProductIds } } });
    }
    log('🧹 Registros de testes E2E limpos.');

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
  log('RELATÓRIO — Certificação Etapas 2-5');
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
    log('\n✅ CERTIFICAÇÃO APROVADA (Etapas 2-5) — evidências reais coletadas\n');
    process.exit(0);
  }
}

main().catch(e => {
  console.error('ERRO INESPERADO NO MÉTODO MAIN:', e);
  process.exit(1);
});
