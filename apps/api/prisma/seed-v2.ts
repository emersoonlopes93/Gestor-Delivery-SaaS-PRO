import 'reflect-metadata';
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function seedCatalogV2() {
  console.log('   ? Seeding Catalog V2 demo data...');

  const TENANT_SLUG = 'pizzaria-demo';
  const tenant = await prisma.tenant.findUnique({ where: { slug: TENANT_SLUG } });
  if (!tenant) {
    console.error('   ? Demo tenant not found. Run main seed first.');
    return;
  }

  const category = await prisma.productCategory.findFirst({
    where: { tenantId: tenant.id, slug: 'pizzas' },
  });
  if (!category) {
    console.error('   ? Pizzas category not found. Run main seed first.');
    return;
  }

  // V2 Option Groups
  const ogMassas = await prisma.optionGroup.upsert({
    where: { tenantId_slug: { tenantId: tenant.id, slug: 'massas' } },
    update: {},
    create: {
      tenantId: tenant.id,
      name: 'Massas',
      slug: 'massas',
      isRequired: true,
      minSelect: 1,
      maxSelect: 1,
      order: 0,
    },
  });

  const ogSabores = await prisma.optionGroup.upsert({
    where: { tenantId_slug: { tenantId: tenant.id, slug: 'sabores-adicionais' } },
    update: {},
    create: {
      tenantId: tenant.id,
      name: 'Sabores Adicionais',
      slug: 'sabores-adicionais',
      isRequired: false,
      minSelect: 0,
      maxSelect: 3,
      order: 1,
    },
  });

  // V2 Option Items
  await prisma.optionItem.createMany({
    data: [
      {
        tenantId: tenant.id,
        optionGroupId: ogMassas.id,
        name: 'Massa Tradicional',
        slug: 'massa-tradicional',
        priceImpact: 'none',
        priceDelta: 0,
        qty: 1,
        order: 0,
      },
      {
        tenantId: tenant.id,
        optionGroupId: ogMassas.id,
        name: 'Massa Fina',
        slug: 'massa-fina',
        priceImpact: 'fixed',
        priceDelta: 3.0,
        qty: 1,
        order: 1,
      },
      {
        tenantId: tenant.id,
        optionGroupId: ogSabores.id,
        name: 'Cheddar',
        slug: 'cheddar',
        priceImpact: 'fixed',
        priceDelta: 5.0,
        qty: 1,
        order: 0,
      },
      {
        tenantId: tenant.id,
        optionGroupId: ogSabores.id,
        name: 'Catupiry',
        slug: 'catupiry',
        priceImpact: 'fixed',
        priceDelta: 4.0,
        qty: 1,
        order: 1,
      },
      {
        tenantId: tenant.id,
        optionGroupId: ogSabores.id,
        name: 'Parmesão',
        slug: 'parmesao',
        priceImpact: 'none',
        priceDelta: 0,
        qty: 1,
        order: 2,
      },
    ],
    skipDuplicates: true,
  });

  // V2 Products
  const simpleProduct = await prisma.product.upsert({
    where: { tenantId_slug: { tenantId: tenant.id, slug: 'refrigerante-lata' } },
    update: {},
    create: {
      tenantId: tenant.id,
      categoryId: category.id,
      name: 'Refrigerante Lata',
      slug: 'refrigerante-lata',
      type: 'simple',
      basePrice: 8.0,
      isAvailable: true,
      sellableOnline: true,
      isActive: true,
      order: 100,
    },
  });

  const configurableProduct = await prisma.product.upsert({
    where: { tenantId_slug: { tenantId: tenant.id, slug: 'pizza-personalizada' } },
    update: {},
    create: {
      tenantId: tenant.id,
      categoryId: category.id,
      name: 'Pizza Personalizada',
      slug: 'pizza-personalizada',
      type: 'configurable',
      basePrice: 35.0,
      isAvailable: true,
      sellableOnline: true,
      isActive: true,
      order: 101,
    },
  });

  const comboProduct = await prisma.product.upsert({
    where: { tenantId_slug: { tenantId: tenant.id, slug: 'combo-familia' } },
    update: {},
    create: {
      tenantId: tenant.id,
      categoryId: category.id,
      name: 'Combo Família',
      slug: 'combo-familia',
      type: 'combo',
      basePrice: 120.0,
      isAvailable: true,
      sellableOnline: true,
      isActive: true,
      order: 102,
    },
  });

  // V2 Product-OptionGroup Links
  await prisma.productOptionGroupLink.createMany({
    data: [
      {
        tenantId: tenant.id,
        productId: configurableProduct.id,
        optionGroupId: ogMassas.id,
        order: 0,
        pricingAxis: 'primary',
      },
      {
        tenantId: tenant.id,
        productId: configurableProduct.id,
        optionGroupId: ogSabores.id,
        order: 1,
        pricingAxis: 'secondary',
        overrideIsRequired: false,
        overrideMinSelect: 0,
        overrideMaxSelect: 2,
      },
    ],
    skipDuplicates: true,
  });

  // V2 Combo Slots
  const slotPizza = await prisma.comboSlot.upsert({
    where: { tenantId_slug: { tenantId: tenant.id, slug: 'pizza-grande' } },
    update: {},
    create: {
      tenantId: tenant.id,
      comboProductId: comboProduct.id,
      name: 'Pizza Grande',
      slug: 'pizza-grande',
      isRequired: true,
      minSelect: 1,
      maxSelect: 1,
      order: 0,
    },
  });

  const slotBebida = await prisma.comboSlot.upsert({
    where: { tenantId_slug: { tenantId: tenant.id, slug: 'bebidas' } },
    update: {},
    create: {
      tenantId: tenant.id,
      comboProductId: comboProduct.id,
      name: 'Bebidas (2 unidades)',
      slug: 'bebidas',
      isRequired: true,
      minSelect: 2,
      maxSelect: 2,
      order: 1,
    },
  });

  // V2 Combo Slot Allowed Items
  await prisma.comboSlotAllowedItem.createMany({
    data: [
      // Itens permitidos no slot de pizza
      {
        tenantId: tenant.id,
        comboSlotId: slotPizza.id,
        productId: 'pizza-de-calabresa', // Pizza de Calabresa (legado)
        additionalPrice: 0,
        order: 0,
      },
      {
        tenantId: tenant.id,
        comboSlotId: slotPizza.id,
        productId: configurableProduct.id, // Pizza Personalizada (V2)
        additionalPrice: 10.0,
        order: 1,
      },
      // Itens permitidos no slot de bebidas
      {
        tenantId: tenant.id,
        comboSlotId: slotBebida.id,
        productId: simpleProduct.id, // Refrigerante Lata
        additionalPrice: 0,
        order: 0,
      },
    ],
    skipDuplicates: true,
  });

  // V2 Publication e Availability
  await prisma.catalogPublication.upsert({
    where: { tenantId_productId: { tenantId: tenant.id, productId: configurableProduct.id } },
    update: {},
    create: {
      tenantId: tenant.id,
      productId: configurableProduct.id,
      publicationStatus: 'published',
      operationalStatus: 'active',
    },
  });

  await prisma.catalogPublication.upsert({
    where: { tenantId_productId: { tenantId: tenant.id, productId: comboProduct.id } },
    update: {},
    create: {
      tenantId: tenant.id,
      productId: comboProduct.id,
      publicationStatus: 'published',
      operationalStatus: 'active',
    },
  });

  // Availability Rules (ex: combo disponível apenas fins de semana)
  await prisma.catalogAvailabilityRule.createMany({
    data: [
      {
        tenantId: tenant.id,
        productId: comboProduct.id,
        channel: 'storefront_delivery',
        daysOfWeek: [5, 6], // Sexta e Sábado
        startTime: '18:00',
        endTime: '23:00',
        isActive: true,
      },
      {
        tenantId: tenant.id,
        productId: configurableProduct.id,
        channel: 'storefront_delivery',
        daysOfWeek: [0, 1, 2, 3, 4, 5, 6], // Todos os dias
        startTime: '18:00',
        endTime: '23:59',
        isActive: true,
      },
    ],
    skipDuplicates: true,
  });

  console.log(`   ? Catalog V2 data seeded for ${TENANT_SLUG}`);
  console.log(`   ? Products: simple (1), configurable (1), combo (1)`);
  console.log(`   ? Option Groups: 2 with 5 items total`);
  console.log(`   ? Combo Slots: 2 with 3 allowed items total`);
  console.log(`   ? Publication & Availability rules configured`);
}

async function main() {
  await seedCatalogV2();
}

main()
  .catch((e) => {
    console.error('   ? V2 Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
