import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/database/prisma.service';
import { StorefrontService } from '../src/storefront/storefront.service';
import { OrdersService } from '../src/orders/orders.service';
import { PizzaEngineService } from '../src/catalog/pizza-engine.service';
import { PaymentMethod } from '@gestor/types';
import type { CreateOrderDTO, PizzaCompositionDTO } from '@gestor/types';

type TestResult = { name: string; ok: boolean; detail: string };

function money(value: number) {
  return Number(value.toFixed(2));
}

async function main() {
  console.log('🧪 Iniciando validação E2E da pizza pública...\n');

  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  const prisma = app.get(PrismaService);
  const storefrontService = app.get(StorefrontService);
  const ordersService = app.get(OrdersService);
  const pizzaEngine = app.get(PizzaEngineService);

  const results: TestResult[] = [];
  const assert = (name: string, ok: boolean, detail: string) => {
    results.push({ name, ok, detail });
    console.log(`${ok ? '✅' : '❌'} ${name} - ${detail}`);
  };

  try {
    const tenantSlug = process.env.E2E_TENANT_SLUG ?? 'pizzaria-demo';
    let tenant = await prisma.tenant.findUnique({ where: { slug: tenantSlug } });
    if (!tenant) {
      tenant = await prisma.tenant.create({ data: { name: 'Pizzaria Demo E2E', slug: tenantSlug, status: 'active' } });
    }

    await prisma.tenantSettings.upsert({
      where: { tenantId: tenant.id },
      create: { tenantId: tenant.id, isStorePaused: false },
      update: { isStorePaused: false },
    });

    const category = await prisma.productCategory.upsert({
      where: { tenantId_slug: { tenantId: tenant.id, slug: 'pizzas-e2e' } },
      create: {
        tenantId: tenant.id,
        name: 'Pizzas',
        slug: 'pizzas-e2e',
        templateType: 'pizza',
        templateConfig: { pricingStrategy: 'highest', allowHalfHalf: true },
      },
      update: {
        name: 'Pizzas',
        templateType: 'pizza',
        templateConfig: { pricingStrategy: 'highest', allowHalfHalf: true },
      },
    });

    const sizeGroup = await prisma.optionGroup.upsert({
      where: { tenantId_name: { tenantId: tenant.id, name: 'Tamanhos [Pizza]' } },
      create: {
        tenantId: tenant.id,
        name: 'Tamanhos [Pizza]',
        selectionType: 'single',
        isRequired: true,
        minSelect: 1,
        maxSelect: 1,
        isActive: true,
      },
      update: {
        selectionType: 'single',
        isRequired: true,
        minSelect: 1,
        maxSelect: 1,
        isActive: true,
      },
    });

    const mountingGroup = await prisma.optionGroup.upsert({
      where: { tenantId_name: { tenantId: tenant.id, name: 'Montagem [Pizza]' } },
      create: {
        tenantId: tenant.id,
        name: 'Montagem [Pizza]',
        selectionType: 'single',
        isRequired: true,
        minSelect: 1,
        maxSelect: 1,
        isActive: true,
      },
      update: {
        selectionType: 'single',
        isRequired: true,
        minSelect: 1,
        maxSelect: 1,
        isActive: true,
      },
    });

    const ensureSize = async (name: string, order: number) => prisma.optionItem.upsert({
      where: { tenantId_optionGroupId_name: { tenantId: tenant.id, optionGroupId: sizeGroup.id, name } },
      create: { tenantId: tenant.id, optionGroupId: sizeGroup.id, name, isActive: true, order },
      update: { isActive: true, order },
    });

    const ensureMounting = async (name: string, order: number) => prisma.optionItem.upsert({
      where: { tenantId_optionGroupId_name: { tenantId: tenant.id, optionGroupId: mountingGroup.id, name } },
      create: { tenantId: tenant.id, optionGroupId: mountingGroup.id, name, isActive: true, order },
      update: { isActive: true, order },
    });

    const small = await ensureSize('Pequena', 1);
    const medium = await ensureSize('Média', 2);
    const large = await ensureSize('Grande', 3);
    const inteira = await ensureMounting('Inteira', 1);
    const meio = await ensureMounting('Meio a Meio', 2);

    const flavorData = [
      { name: 'Calabresa', prices: [30, 36, 45] },
      { name: 'Mussarela', prices: [28, 34, 42] },
      { name: 'Portuguesa', prices: [32, 40, 48] },
    ] as const;

    const flavors: Array<{ id: string; name: string }> = [];
    for (const flavor of flavorData) {
      const product = await prisma.product.upsert({
        where: { tenantId_slug: { tenantId: tenant.id, slug: `pizza-${flavor.name.toLowerCase()}` } },
        create: {
          tenantId: tenant.id,
          categoryId: category.id,
          name: flavor.name,
          slug: `pizza-${flavor.name.toLowerCase()}`,
          basePrice: flavor.prices[0],
          isActive: true,
          isAvailable: true,
          sellableOnline: true,
          type: 'simple',
        },
        update: {
          categoryId: category.id,
          basePrice: flavor.prices[0],
          isActive: true,
          isAvailable: true,
          sellableOnline: true,
          type: 'simple',
        },
      });
      flavors.push({ id: product.id, name: product.name });

      await prisma.productOptionItemPrice.upsert({
        where: { productId_optionItemId: { productId: product.id, optionItemId: small.id } },
        create: { tenantId: tenant.id, productId: product.id, optionItemId: small.id, price: flavor.prices[0] },
        update: { price: flavor.prices[0] },
      });
      await prisma.productOptionItemPrice.upsert({
        where: { productId_optionItemId: { productId: product.id, optionItemId: medium.id } },
        create: { tenantId: tenant.id, productId: product.id, optionItemId: medium.id, price: flavor.prices[1] },
        update: { price: flavor.prices[1] },
      });
      await prisma.productOptionItemPrice.upsert({
        where: { productId_optionItemId: { productId: product.id, optionItemId: large.id } },
        create: { tenantId: tenant.id, productId: product.id, optionItemId: large.id, price: flavor.prices[2] },
        update: { price: flavor.prices[2] },
      });
    }

    const storefront = await storefrontService.getStorefrontPayload(tenant.slug, 'delivery');
    const pizzaCategory = storefront.categories.find((c) => c.templateType === 'pizza' && c.slug === category.slug);
    assert('Storefront expõe categoria pizza', !!pizzaCategory, `Categorias pizza: ${storefront.categories.filter((c) => c.templateType === 'pizza').length}`);

    const calabresa = flavors.find((f) => f.name === 'Calabresa')!;
    const mussarela = flavors.find((f) => f.name === 'Mussarela')!;
    const portuguesa = flavors.find((f) => f.name === 'Portuguesa')!;

    const simulateHighest = await pizzaEngine.calculatePrice(category.id, large.id, [{ productId: calabresa.id, fraction: 1 }]);
    assert('Simulação 1 sabor highest', money(simulateHighest.calculatedPrice) === 45, `Preço: ${simulateHighest.calculatedPrice}`);

    const simulateHalfHalf = await pizzaEngine.calculatePrice(category.id, large.id, [
      { productId: calabresa.id, fraction: 0.5 },
      { productId: mussarela.id, fraction: 0.5 },
    ]);
    assert('Simulação meio a meio highest', money(simulateHalfHalf.calculatedPrice) === 45, `Preço: ${simulateHalfHalf.calculatedPrice}`);

    const simulateExpensiveHalfHalf = await pizzaEngine.calculatePrice(category.id, large.id, [
      { productId: calabresa.id, fraction: 0.5 },
      { productId: portuguesa.id, fraction: 0.5 },
    ]);
    assert('Simulação meio a meio com sabor mais caro', money(simulateExpensiveHalfHalf.calculatedPrice) === 48, `Preço: ${simulateExpensiveHalfHalf.calculatedPrice}`);

    const pizzaComposition: PizzaCompositionDTO = {
      sizeId: large.id,
      sizeName: large.name,
      pricingStrategy: 'highest',
      calculatedPrice: simulateHalfHalf.calculatedPrice,
      flavors: [
        { productId: calabresa.id, fraction: 0.5, name: calabresa.name },
        { productId: mussarela.id, fraction: 0.5, name: mussarela.name },
      ],
    };

    const baseOrder: CreateOrderDTO = {
      idempotencyKey: `pizza-e2e-${Date.now()}`,
      customerName: 'Cliente Pizza E2E',
      customerPhone: '11999999999',
      fulfillmentType: 'pickup',
      payment: { method: PaymentMethod.cash, changeFor: 100 },
      sourceChannel: 'storefront',
      items: [
        {
          lineType: 'product',
          productId: calabresa.id,
          quantity: 1,
          pizzaComposition,
          selections: [
            {
              optionGroupId: sizeGroup.id,
              items: [{ optionItemId: large.id, qty: 1 }],
            },
            {
              optionGroupId: mountingGroup.id,
              items: [{ optionItemId: meio.id, qty: 1 }],
            },
          ],
        },
      ],
    };

    const created = await ordersService.createOrder(tenant.slug, baseOrder);
    assert('Pedido pizza criado', !!created.id, `Pedido ${created.orderNumber}`);

    const saved = await prisma.order.findUnique({
      where: { id: created.id },
      include: { items: true },
    });

    const savedItem = saved?.items[0];
    const snapshot = savedItem?.snapshotCatalogV2Json as any;
    assert('Snapshot contém pizzaComposition', !!snapshot?.pizzaComposition, `snapshotCatalogV2Json: ${Boolean(snapshot)}`);
    assert('Snapshot contém tamanho', snapshot?.pizzaComposition?.sizeId === large.id, `sizeId: ${snapshot?.pizzaComposition?.sizeId}`);
    assert('Snapshot contém sabores', Array.isArray(snapshot?.pizzaComposition?.flavors) && snapshot.pizzaComposition.flavors.length === 2, `flavors: ${snapshot?.pizzaComposition?.flavors?.length ?? 0}`);

    const invalidPayloads: Array<{ name: string; item: any }> = [
      {
        name: 'Sem tamanho',
        item: { lineType: 'product', productId: calabresa.id, quantity: 1, pizzaComposition: { flavors: [{ productId: calabresa.id, fraction: 1 }] } },
      },
      {
        name: 'Frações inválidas',
        item: { lineType: 'product', productId: calabresa.id, quantity: 1, pizzaComposition: { sizeId: large.id, flavors: [{ productId: calabresa.id, fraction: 0.7 }, { productId: mussarela.id, fraction: 0.7 }] } },
      },
      {
        name: 'Sabor inexistente',
        item: { lineType: 'product', productId: calabresa.id, quantity: 1, pizzaComposition: { sizeId: large.id, flavors: [{ productId: 'missing', fraction: 1 }] } },
      },
      {
        name: 'Mais de 2 sabores',
        item: { lineType: 'product', productId: calabresa.id, quantity: 1, pizzaComposition: { sizeId: large.id, flavors: [{ productId: calabresa.id, fraction: 1 / 3 }, { productId: mussarela.id, fraction: 1 / 3 }, { productId: portuguesa.id, fraction: 1 / 3 }] } },
      },
    ];

    for (const invalid of invalidPayloads) {
      try {
        await ordersService.createOrder(tenant.slug, {
          idempotencyKey: `pizza-invalid-${invalid.name}-${Date.now()}`,
          customerName: 'Cliente Inválido',
          customerPhone: '11999999999',
          fulfillmentType: 'pickup',
          payment: { method: PaymentMethod.cash, changeFor: 100 },
          sourceChannel: 'storefront',
          items: [invalid.item],
        } as CreateOrderDTO);
        assert(`Payload inválido rejeitado: ${invalid.name}`, false, 'Pedido foi aceito indevidamente');
      } catch {
        assert(`Payload inválido rejeitado: ${invalid.name}`, true, 'Backend rejeitou como esperado');
      }
    }

    console.log('\nResumo:');
    const passed = results.filter((r) => r.ok).length;
    const failed = results.length - passed;
    console.log(`- Passou: ${passed}`);
    console.log(`- Falhou: ${failed}`);

    process.exit(failed > 0 ? 1 : 0);
  } finally {
    await app.close();
  }
}

main().catch((error) => {
  console.error('Falha crítica na validação E2E de pizza pública:', error);
  process.exit(1);
});
