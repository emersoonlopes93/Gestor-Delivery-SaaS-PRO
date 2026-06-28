import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/database/prisma.service';
import { StorefrontService } from '../src/storefront/storefront.service';
import { OrdersService } from '../src/orders/orders.service';
import { PizzaEngineService } from '../src/catalog/pizza-engine.service';
import { PaymentMethod } from '@gestor/types';
import type { CreateOrderDTO, PizzaCompositionDTO, DeliveryAddressDTO } from '@gestor/types';

type TestResult = { name: string; ok: boolean; detail: string };

function money(value: number) {
  return Number(value.toFixed(2));
}

async function main() {
  console.log('Starting public pizza E2E validation...\n');

  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  const prisma = app.get(PrismaService);
  const storefrontService = app.get(StorefrontService);
  const ordersService = app.get(OrdersService);
  const pizzaEngine = app.get(PizzaEngineService);

  const results: TestResult[] = [];
  const assert = (name: string, ok: boolean, detail: string) => {
    results.push({ name, ok, detail });
    console.log(`${ok ? 'PASS' : 'FAIL'} ${name} - ${detail}`);
  };

  try {
    const tenantSlug = process.env.E2E_TENANT_SLUG ?? 'pizzaria-demo';
    let tenant = await prisma.tenant.findUnique({ where: { slug: tenantSlug } });
    if (!tenant) {
      tenant = await prisma.tenant.create({
        data: { name: 'Pizzaria Demo E2E', slug: tenantSlug, status: 'active' },
      });
    }

    await prisma.tenantSettings.upsert({
      where: { tenantId: tenant.id },
      create: {
        tenantId: tenant.id,
        isStorePaused: false,
        timezone: 'America/Sao_Paulo',
        street: 'Rua Teste',
        number: '100',
        neighborhood: 'Centro',
        city: 'Sao Paulo',
        state: 'SP',
        zipCode: '01000-000',
        pixKey: 'pizza-e2e@teste.com',
        paymentMethods: ['cash', 'pix'],
      },
      update: {
        isStorePaused: false,
        timezone: 'America/Sao_Paulo',
        street: 'Rua Teste',
        number: '100',
        neighborhood: 'Centro',
        city: 'Sao Paulo',
        state: 'SP',
        zipCode: '01000-000',
        pixKey: 'pizza-e2e@teste.com',
        paymentMethods: ['cash', 'pix'],
      },
    });

    await prisma.deliveryCoverageConfig.upsert({
      where: { tenantId: tenant.id },
      create: {
        tenantId: tenant.id,
        storeLat: -23.5505,
        storeLng: -46.6333,
        maxRadiusKm: 50,
        defaultPricePerKm: 1,
        isDeliveryEnabled: true,
      },
      update: {
        storeLat: -23.5505,
        storeLng: -46.6333,
        maxRadiusKm: 50,
        defaultPricePerKm: 1,
        isDeliveryEnabled: true,
      },
    });

    for (let dayOfWeek = 0; dayOfWeek < 7; dayOfWeek++) {
      await prisma.tenantOperatingHours.upsert({
        where: { tenantId_dayOfWeek: { tenantId: tenant.id, dayOfWeek } },
        create: {
          tenantId: tenant.id,
          dayOfWeek,
          isOpen: true,
          openTime: '00:00',
          closeTime: '23:59',
        },
        update: {
          isOpen: true,
          openTime: '00:00',
          closeTime: '23:59',
        },
      });
    }

    const category = await prisma.productCategory.upsert({
      where: { tenantId_slug: { tenantId: tenant.id, slug: 'pizzas-e2e' } },
      create: {
        tenantId: tenant.id,
        name: 'Pizzas',
        slug: 'pizzas-e2e',
        templateType: 'pizza',
        templateConfig: { pricingStrategy: 'highest' },
      },
      update: {
        name: 'Pizzas',
        templateType: 'pizza',
        templateConfig: { pricingStrategy: 'highest' },
      },
    });

    const ensureOptionGroup = async (name: string) => {
      const existing = await prisma.optionGroup.findFirst({ where: { tenantId: tenant.id, name } });
      if (existing) {
        return prisma.optionGroup.update({
          where: { id: existing.id },
          data: {
            selectionType: 'single',
            isRequired: true,
            minSelect: 1,
            maxSelect: 1,
            isActive: true,
          },
        });
      }

      return prisma.optionGroup.create({
        data: {
          tenantId: tenant.id,
          name,
          selectionType: 'single',
          isRequired: true,
          minSelect: 1,
          maxSelect: 1,
          isActive: true,
        },
      });
    };

    const sizeGroup = await ensureOptionGroup('Tamanhos [Pizza]');
    const mountingGroup = await ensureOptionGroup('Montagem [Pizza]');

    const ensureOptionItem = async (groupId: string, name: string, order: number) => {
      const existing = await prisma.optionItem.findFirst({
        where: { tenantId: tenant.id, optionGroupId: groupId, name },
      });
      if (existing) {
        return prisma.optionItem.update({
          where: { id: existing.id },
          data: { isActive: true, order },
        });
      }

      return prisma.optionItem.create({
        data: {
          tenantId: tenant.id,
          optionGroupId: groupId,
          name,
          isActive: true,
          order,
        },
      });
    };

    const small = await ensureOptionItem(sizeGroup.id, 'Pequena', 1);
    const medium = await ensureOptionItem(sizeGroup.id, 'Media', 2);
    const large = await ensureOptionItem(sizeGroup.id, 'Grande', 3);
    const inteira = await ensureOptionItem(mountingGroup.id, 'Inteira', 1);
    const meio = await ensureOptionItem(mountingGroup.id, 'Meio a Meio', 2);

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

      await prisma.productOptionGroupLink.upsert({
        where: { productId_optionGroupId: { productId: product.id, optionGroupId: sizeGroup.id } },
        create: {
          tenantId: tenant.id,
          productId: product.id,
          optionGroupId: sizeGroup.id,
          order: 0,
          pricingAxis: 'primary',
        },
        update: {
          order: 0,
          pricingAxis: 'primary',
        },
      });

      await prisma.productOptionGroupLink.upsert({
        where: { productId_optionGroupId: { productId: product.id, optionGroupId: mountingGroup.id } },
        create: {
          tenantId: tenant.id,
          productId: product.id,
          optionGroupId: mountingGroup.id,
          order: 1,
          pricingAxis: 'secondary',
        },
        update: {
          order: 1,
          pricingAxis: 'secondary',
        },
      });

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
    assert(
      'Storefront exposes pizza category',
      !!pizzaCategory,
      `pizza categories: ${storefront.categories.filter((c) => c.templateType === 'pizza').length}`,
    );

    const storefrontProduct = pizzaCategory?.products.find((p) => p.id === flavors[0].id);
    assert(
      'Storefront product includes pizza option groups',
      Boolean(storefrontProduct?.optionGroupLinks?.length),
      `optionGroupLinks: ${storefrontProduct?.optionGroupLinks?.length ?? 0}`,
    );

    const [calabresa, mussarela, portuguesa] = flavors;

    const simulateHighest = await pizzaEngine.calculatePrice(category.id, large.id, [
      { productId: calabresa.id, fraction: 1 },
    ]);
    assert('Simulation single flavor uses highest price', money(simulateHighest.calculatedPrice) === 45, `price: ${simulateHighest.calculatedPrice}`);

    const simulateHalfHalf = await pizzaEngine.calculatePrice(category.id, large.id, [
      { productId: calabresa.id, fraction: 0.5 },
      { productId: mussarela.id, fraction: 0.5 },
    ]);
    assert('Simulation half-half uses highest price', money(simulateHalfHalf.calculatedPrice) === 45, `price: ${simulateHalfHalf.calculatedPrice}`);

    const simulateExpensiveHalfHalf = await pizzaEngine.calculatePrice(category.id, large.id, [
      { productId: calabresa.id, fraction: 0.5 },
      { productId: portuguesa.id, fraction: 0.5 },
    ]);
    assert('Simulation half-half uses most expensive flavor', money(simulateExpensiveHalfHalf.calculatedPrice) === 48, `price: ${simulateExpensiveHalfHalf.calculatedPrice}`);

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

    const deliveryAddress: DeliveryAddressDTO = {
      street: 'Rua Teste',
      number: '100',
      neighborhood: 'Centro',
      city: 'Sao Paulo',
      state: 'SP',
      zipCode: '01000-000',
      lat: -23.5505,
      lng: -46.6333,
    };

    const baseOrder: CreateOrderDTO = {
      idempotencyKey: `pizza-e2e-${Date.now()}`,
      customerName: 'Cliente Pizza E2E',
      customerPhone: '11999999999',
      fulfillmentType: 'delivery',
      deliveryAddress,
      payment: { method: PaymentMethod.cash, changeFor: 100 },
      sourceChannel: 'storefront_delivery',
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
    assert('Pizza order is created', !!created.id, `order: ${created.orderNumber}`);

    const saved = await prisma.order.findUnique({
      where: { id: created.id },
      include: { items: true },
    });

    const savedItem = saved?.items[0];
    const snapshot = savedItem?.snapshotCatalogV2Json as Record<string, unknown> | undefined;
    const pizzaSnapshot = snapshot?.pizzaComposition as Record<string, unknown> | undefined;

    assert('Snapshot contains pizzaComposition', Boolean(pizzaSnapshot), `snapshot: ${Boolean(snapshot)}`);
    assert('Snapshot contains sizeId', pizzaSnapshot?.sizeId === large.id, `sizeId: ${String(pizzaSnapshot?.sizeId ?? '')}`);
    assert(
      'Snapshot contains two flavors',
      Array.isArray(pizzaSnapshot?.flavors) && (pizzaSnapshot.flavors as unknown[]).length === 2,
      `flavors: ${Array.isArray(pizzaSnapshot?.flavors) ? (pizzaSnapshot.flavors as unknown[]).length : 0}`,
    );

    const invalidPayloads: Array<{ name: string; item: CreateOrderDTO['items'][number] }> = [
      {
        name: 'Missing size',
        item: {
          lineType: 'product',
          productId: calabresa.id,
          quantity: 1,
          pizzaComposition: {
            flavors: [{ productId: calabresa.id, fraction: 1 }],
          } as PizzaCompositionDTO,
        },
      },
      {
        name: 'Invalid fractions',
        item: {
          lineType: 'product',
          productId: calabresa.id,
          quantity: 1,
          pizzaComposition: {
            sizeId: large.id,
            flavors: [
              { productId: calabresa.id, fraction: 0.7 },
              { productId: mussarela.id, fraction: 0.7 },
            ],
          } as PizzaCompositionDTO,
        },
      },
      {
        name: 'Nonexistent flavor',
        item: {
          lineType: 'product',
          productId: calabresa.id,
          quantity: 1,
          pizzaComposition: {
            sizeId: large.id,
            flavors: [{ productId: 'missing', fraction: 1 }],
          } as PizzaCompositionDTO,
        },
      },
      {
        name: 'More than 2 flavors',
        item: {
          lineType: 'product',
          productId: calabresa.id,
          quantity: 1,
          pizzaComposition: {
            sizeId: large.id,
            flavors: [
              { productId: calabresa.id, fraction: 1 / 3 },
              { productId: mussarela.id, fraction: 1 / 3 },
              { productId: portuguesa.id, fraction: 1 / 3 },
            ],
          } as PizzaCompositionDTO,
        },
      },
    ];

    for (const invalid of invalidPayloads) {
      try {
        await ordersService.createOrder(tenant.slug, {
          idempotencyKey: `pizza-invalid-${invalid.name}-${Date.now()}`,
          customerName: 'Cliente Invalido',
          customerPhone: '11999999999',
          fulfillmentType: 'delivery',
          deliveryAddress,
          payment: { method: PaymentMethod.cash, changeFor: 100 },
          sourceChannel: 'storefront_delivery',
          items: [invalid.item],
        } as CreateOrderDTO);
        assert(`Invalid payload rejected: ${invalid.name}`, false, 'order was accepted unexpectedly');
      } catch (error) {
        assert(`Invalid payload rejected: ${invalid.name}`, true, `rejected as expected`);
      }
    }

    console.log('\nSummary:');
    const passed = results.filter((r) => r.ok).length;
    const failed = results.length - passed;
    console.log(`Passed: ${passed}`);
    console.log(`Failed: ${failed}`);

    process.exit(failed > 0 ? 1 : 0);
  } finally {
    await app.close();
  }
}

main().catch((error) => {
  console.error('Critical failure during public pizza validation:', error);
  process.exit(1);
});
