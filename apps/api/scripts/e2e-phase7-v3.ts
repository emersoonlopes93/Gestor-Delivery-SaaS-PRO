import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/database/prisma.service';
import { StorefrontService } from '../src/storefront/storefront.service';
import { OrdersService } from '../src/orders/orders.service';
import { AgentToolsService } from '../src/ai-agent/services/agent-tools.service';
import { CreatePosOrderDTO, PosFulfillmentType, PaymentMethod, CreateOrderDTO, OrderStatus, FractionalPricingRule } from '@gestor/types';

async function main() {
  console.log('🧪 Inicializando Homologação E2E da Fase 7.1 (Ecossistema V3)...\n');
  const app = await NestFactory.createApplicationContext(AppModule);
  const prisma = app.get(PrismaService);
  const storefrontService = app.get(StorefrontService);
  const ordersService = app.get(OrdersService);
  const agentToolsService = app.get(AgentToolsService);

  const logs: string[] = [];
  const log = (msg: string) => {
    console.log(msg);
    logs.push(msg);
  };

  try {
    log('--- PREPARAÇÃO DO AMBIENTE ---');
    const tenantSlug = process.env.E2E_TENANT_SLUG ?? 'pizzaria-demo';
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

    // Limpeza de pedidos E2E
    const e2eOrders = await prisma.order.findMany({ where: { tenantId: tenant.id, customerName: { contains: 'E2E' } }, select: { id: true } });
    const e2eOrderIds = e2eOrders.map(o => o.id);
    if (e2eOrderIds.length > 0) {
      await prisma.order.deleteMany({ where: { id: { in: e2eOrderIds } } });
    }

    // Limpeza de Produtos E2E e dependências
    const e2eProducts = await prisma.product.findMany({ where: { name: { contains: '[E2E]' } }, select: { id: true } });
    const productIds = e2eProducts.map(p => p.id);
    if (productIds.length > 0) {
      await prisma.comboSlotAllowedItem.deleteMany({ where: { productId: { in: productIds } } });
      await prisma.comboSlot.deleteMany({ where: { comboProductId: { in: productIds } } });
      await prisma.productOptionGroupLink.deleteMany({ where: { productId: { in: productIds } } });
      
      const e2eGroups = await prisma.optionGroup.findMany({ where: { name: { contains: '[E2E]' } }, select: { id: true } });
      const groupIds = e2eGroups.map(g => g.id);
      if(groupIds.length) {
         await prisma.optionItem.deleteMany({ where: { optionGroupId: { in: groupIds } } });
         await prisma.optionGroup.deleteMany({ where: { id: { in: groupIds } } });
      }
      
      await prisma.product.deleteMany({ where: { id: { in: productIds } } });
    }

    // Categoria
    let category = await prisma.productCategory.findFirst({ where: { tenantId: tenant.id, name: 'E2E Categoria' } });
    if (!category) {
      category = await prisma.productCategory.create({ data: { tenantId: tenant.id, name: 'E2E Categoria', slug: 'e2e-categoria' } });
    }

    // Criando Produtos
    const refrigerante = await prisma.product.create({
      data: { tenantId: tenant.id, categoryId: category.id, name: '[E2E] Refrigerante 2L', slug: 'e2e-refrigerante-2l', basePrice: 15, isActive: true, type: 'simple' as any },
    });

    // OptionGroup Borda
    const bordaGroup = await prisma.optionGroup.create({
      data: {
        tenantId: tenant.id,
        name: '[E2E] Borda',
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

    const pizza = await prisma.product.create({
      data: {
        tenantId: tenant.id,
        categoryId: category.id,
        name: '[E2E] Pizza Média',
        slug: 'e2e-pizza-media',
        basePrice: 50,
        isActive: true,
        type: 'configurable' as any,
      },
    });

    await prisma.productOptionGroupLink.create({
      data: { tenantId: tenant.id, productId: pizza.id, optionGroupId: bordaGroup.id, order: 1 },
    });

    // Combo
    const combo = await prisma.product.create({
      data: { tenantId: tenant.id, categoryId: category.id, name: '[E2E] Combo Casal', slug: 'e2e-combo-casal', basePrice: 60, isActive: true, type: 'combo' as any },
    });

    const slotPizza = await prisma.comboSlot.create({
      data: { tenantId: tenant.id, comboProductId: combo.id, name: 'Escolha a Pizza', isRequired: true, order: 1, minSelect: 1, maxSelect: 1 },
    });
    await prisma.comboSlotAllowedItem.create({ data: { tenantId: tenant.id, comboSlotId: slotPizza.id, productId: pizza.id, additionalPrice: 0 } });

    const slotBebida = await prisma.comboSlot.create({
      data: { tenantId: tenant.id, comboProductId: combo.id, name: 'Escolha a Bebida', isRequired: true, order: 2, minSelect: 1, maxSelect: 1 },
    });
    await prisma.comboSlotAllowedItem.create({ data: { tenantId: tenant.id, comboSlotId: slotBebida.id, productId: refrigerante.id, additionalPrice: 0 } });

    log(`✅ Setup concluído. Produtos criados. Id Pizza: ${pizza.id}`);

    // --- TESTES STOREFRONT / CHECKOUT ---
    log('\n--- ETAPA 1 & 2: Storefront e Checkout ---');
    
    // Tentativa inválida (Pizza sem borda, que é obrigatória)
    try {
      await ordersService.createOrder(tenant.slug, {
        idempotencyKey: 'fail123',
        customerName: 'E2E Inválido',
        customerPhone: '11999999999',
        fulfillmentType: 'pickup',
        payment: { method: PaymentMethod.cash },
        sourceChannel: 'storefront',
        items: [{
          lineType: 'product',
          productId: pizza.id,
          quantity: 1,
          selections: [], // Faltando a seleção obrigatória
        }],
      } as unknown as CreateOrderDTO);
      log('❌ FALHA: Deveria ter retornado HTTP 400 Bad Request por omissão de grupo obrigatório.');
    } catch (e: any) {
      log('✅ SUCESSO: A API bloqueou o pedido inválido como esperado.');
      log(`   > Erro recebido: ${e?.response?.message || e.message}`);
    }

    // Pedido Válido com selections
    const bordaCatupiry = bordaGroup.items.find(i => i.name === 'Catupiry')!;
    const validOrderPayload = {
      tenantId: tenant.id,
      customerName: 'Cliente E2E Válido',
      customerPhone: '11999999999',
      fulfillmentType: 'pickup',
      payment: { method: 'cash', changeFor: 200 },
      sourceChannel: 'storefront',
      idempotencyKey: `e2e-valid-${Date.now()}`,
      items: [
        {
          lineType: 'product',
          productId: pizza.id,
          quantity: 1,
          selections: [
            {
              optionGroupId: bordaGroup.id,
              items: [{ optionItemId: bordaCatupiry.id, qty: 1 }],
            }
          ]
        },
        {
          lineType: 'combo',
          productId: combo.id,
          quantity: 1,
          slots: [
            { comboSlotId: slotPizza.id, items: [{ productId: pizza.id, qty: 1 }] },
            { comboSlotId: slotBebida.id, items: [{ productId: refrigerante.id, qty: 1 }] }
          ]
        }
      ],
    } as unknown as CreateOrderDTO;

    const orderV3 = await ordersService.createOrder(tenant.slug, validOrderPayload);
    log(`✅ SUCESSO: Pedido criado na Storefront. Order ID: ${orderV3.id}`);

    // --- ETAPA 3, 4, 11: PEDIDOS, KANBAN, SNAPSHOT AUDIT ---
    log('\n--- ETAPA 3, 4 & 11: Pedidos, Kanban, Snapshot Audit ---');
    const orderDetails = await prisma.order.findUnique({
      where: { id: orderV3.id },
      include: { items: true },
    });
    
    log(`Status Kanban: ${orderDetails?.status}`);
    const pizzaItem = orderDetails?.items.find(i => i.snapshotName === '[E2E] Pizza Média');
    const comboItem = orderDetails?.items.find(i => i.snapshotName === '[E2E] Combo Casal');
    
    // Snapshot validation
    const parsedPizza = typeof pizzaItem?.snapshotCatalogV2Json === 'string' ? JSON.parse(pizzaItem.snapshotCatalogV2Json) : pizzaItem?.snapshotCatalogV2Json;
    if (parsedPizza?.selections?.[0]?.items?.[0]?.name === 'Catupiry' && Number(pizzaItem?.unitPrice) === 60) {
      log(`✅ SUCESSO: Snapshot e selections validados. Preço Calculado (50+10) = 60`);
    } else {
      log(`❌ ERRO no cálculo ou snapshot da pizza! Snapshot: ${JSON.stringify(parsedPizza)}`);
    }

    // --- ETAPA 7: PDV ---
    log('\\n--- ETAPA 7: PDV ---');
    const posDto: CreatePosOrderDTO = {
      customerName: 'E2E PDV',
      fulfillmentType: PosFulfillmentType.PICKUP,
      paymentMethod: PaymentMethod.cash,
      cartItems: [
        {
          cartLineId: 'line1',
          lineType: 'product',
          productId: refrigerante.id,
          name: refrigerante.name,
          basePrice: refrigerante.basePrice,
          quantity: 2,
          notes: ''
        }
      ]
    };
    const pdvOrder = await ordersService.createOrder(tenant.slug, {
      idempotencyKey: 'pdv123',
      sourceChannel: 'pos',
      customerName: posDto.customerName,
      customerPhone: '11999999999',
      fulfillmentType: posDto.fulfillmentType as any,
      payment: { method: posDto.paymentMethod as any, changeFor: 100 },
      items: posDto.cartItems.map(i => ({
        lineType: i.lineType,
        productId: i.productId,
        quantity: i.quantity,
        selections: (i as any).selections,
        slots: (i as any).slots
      }))
    } as unknown as CreateOrderDTO);
    log(`✅ SUCESSO: Pedido PDV criado (ID: ${pdvOrder.id})`);

    // --- ETAPA 8: IA ---
    log('\n--- ETAPA 8: IA Tool Calling ---');
    const agentCtx = { customerName: 'E2E AI', customerPhone: '5511999999999' };
    const agentArgs = {
      itens: [
        {
          productId: pizza.id,
          quantity: 1,
          selections: [
            { optionGroupId: bordaGroup.id, items: [{ optionItemId: bordaCatupiry.id }] }
          ]
        }
      ],
      fulfillmentType: 'delivery',
      endereco: { street: 'Rua X', number: '123', neighborhood: 'Centro', city: 'São Paulo' },
      formaPagamento: 'cash'
    } as any;
    
    try {
      const aiResponse = await agentToolsService.executeTool(tenant.id, 'criar_pedido', agentArgs, agentCtx);
      log(`✅ SUCESSO: A Tool "CriarPedido" foi invocada com sucesso. Resposta do sistema: ${JSON.stringify(aiResponse)}`);
    } catch (err: any) {
      log(`❌ ERRO no Agente IA: ${err.message}`);
    }

    log('\n🎉 TODOS OS TESTES E2E FORAM FINALIZADOS. Verifique os logs.');

    const fs = require('fs');
    fs.writeFileSync('C:/Users/Emerson/.gemini/antigravity-ide/brain/458dd859-c6ae-4a06-8b2b-c8419bd5d241/artifacts/auditoria-fase7.1-logs.json', JSON.stringify(logs, null, 2));

  } catch (err: any) {
    log(`\n💥 ERRO CRÍTICO NO SCRIPT E2E: ${err.message}`);
    if (err.stack) log(err.stack);
  } finally {
    await prisma.$disconnect();
    await app.close();
  }
}

main();
