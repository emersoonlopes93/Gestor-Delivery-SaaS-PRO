import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function runSeed() {
  console.log('Starting simple seed...');
  
  const TENANT_SLUG = 'pizzaria-demo';
  
  // Create demo tenant
  const tenant = await prisma.tenant.upsert({
    where: { slug: TENANT_SLUG },
    update: {},
    create: {
      name: 'Pizzaria Demo',
      slug: TENANT_SLUG,
      status: 'active',
    },
  });
  console.log(`Tenant created: ${tenant.id}`);

  // Create tenant settings
  await prisma.tenantSettings.upsert({
    where: { tenantId: tenant.id },
    update: {},
    create: {
      tenantId: tenant.id,
      timezone: 'America/Sao_Paulo',
      currency: 'BRL',
      language: 'pt-BR',
      businessPhone: '(11) 99999-0000',
      businessEmail: 'contato@pizzariademo.com',
    },
  });

  await prisma.schedulingSettings.upsert({
    where: { tenantId: tenant.id },
    update: {},
    create: {
      tenantId: tenant.id,
      enabled: true,
      acceptScheduledOrders: true,
      minimumAdvanceMinutes: 60,
      maximumAdvanceDays: 7,
      slotIntervalMinutes: 30,
      maxOrdersPerSlot: 4,
      timezone: 'America/Sao_Paulo',
    },
  });

  await prisma.schedulingWindow.createMany({
    data: [
      { tenantId: tenant.id, dayOfWeek: 0, startTime: '10:00', endTime: '18:00', active: true },
      { tenantId: tenant.id, dayOfWeek: 1, startTime: '10:00', endTime: '22:00', active: true },
      { tenantId: tenant.id, dayOfWeek: 2, startTime: '10:00', endTime: '22:00', active: true },
      { tenantId: tenant.id, dayOfWeek: 3, startTime: '10:00', endTime: '22:00', active: true },
      { tenantId: tenant.id, dayOfWeek: 4, startTime: '10:00', endTime: '22:00', active: true },
      { tenantId: tenant.id, dayOfWeek: 5, startTime: '10:00', endTime: '22:00', active: true },
      { tenantId: tenant.id, dayOfWeek: 6, startTime: '10:00', endTime: '18:00', active: true },
    ],
    skipDuplicates: true,
  });

  // Create demo category
  const category = await prisma.productCategory.upsert({
    where: { tenantId_slug: { tenantId: tenant.id, slug: 'pizzas' } },
    update: {},
    create: {
      tenantId: tenant.id,
      name: 'Pizzas',
      slug: 'pizzas',
    },
  });

  // === CATALOG V2 SEED ===
  console.log('Seeding Catalog V2 demo data...');

  // V2 Option Groups
  const ogMassas = await prisma.optionGroup.create({
    data: {
      tenantId: tenant.id,
      name: 'Massas',
      selectionType: 'single',
      isRequired: true,
      minSelect: 1,
      maxSelect: 1,
      order: 0,
    },
  });

  const ogSabores = await prisma.optionGroup.create({
    data: {
      tenantId: tenant.id,
      name: 'Sabores Adicionais',
      selectionType: 'multiple',
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
        priceImpactType: 'none',
        priceImpactValue: 0,
        allowQuantity: false,
        order: 0,
      },
      {
        tenantId: tenant.id,
        optionGroupId: ogMassas.id,
        name: 'Massa Fina',
        priceImpactType: 'fixed',
        priceImpactValue: 3.0,
        allowQuantity: false,
        order: 1,
      },
      {
        tenantId: tenant.id,
        optionGroupId: ogSabores.id,
        name: 'Cheddar',
        priceImpactType: 'fixed',
        priceImpactValue: 5.0,
        allowQuantity: false,
        order: 0,
      },
      {
        tenantId: tenant.id,
        optionGroupId: ogSabores.id,
        name: 'Catupiry',
        priceImpactType: 'fixed',
        priceImpactValue: 4.0,
        allowQuantity: false,
        order: 1,
      },
      {
        tenantId: tenant.id,
        optionGroupId: ogSabores.id,
        name: 'Parmesão',
        priceImpactType: 'none',
        priceImpactValue: 0,
        allowQuantity: false,
        order: 2,
      },
    ],
    skipDuplicates: true,
  });

  // V2 Products
  const simpleProduct = await prisma.product.create({
    data: {
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

  const configurableProduct = await prisma.product.create({
    data: {
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

  const comboProduct = await prisma.product.create({
    data: {
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
  const slotPizza = await prisma.comboSlot.create({
    data: {
      tenantId: tenant.id,
      comboProductId: comboProduct.id,
      name: 'Pizza Grande',
      isRequired: true,
      minSelect: 1,
      maxSelect: 1,
      order: 0,
    },
  });

  const slotBebida = await prisma.comboSlot.create({
    data: {
      tenantId: tenant.id,
      comboProductId: comboProduct.id,
      name: 'Bebidas (2 unidades)',
      isRequired: true,
      minSelect: 2,
      maxSelect: 2,
      order: 1,
    },
  });

  // V2 Combo Slot Allowed Items
  await prisma.comboSlotAllowedItem.createMany({
    data: [
      {
        tenantId: tenant.id,
        comboSlotId: slotPizza.id,
        productId: configurableProduct.id,
        additionalPrice: 0,
        order: 0,
      },
      {
        tenantId: tenant.id,
        comboSlotId: slotBebida.id,
        productId: simpleProduct.id,
        additionalPrice: 0,
        order: 0,
      },
    ],
    skipDuplicates: true,
  });

  // V2 Publication
  const configurablePub = await prisma.catalogPublication.create({
    data: {
      tenantId: tenant.id,
      productId: configurableProduct.id,
      publicationStatus: 'published',
      operationalStatus: 'active',
    },
  });

  const comboPub = await prisma.catalogPublication.create({
    data: {
      tenantId: tenant.id,
      productId: comboProduct.id,
      publicationStatus: 'published',
      operationalStatus: 'active',
    },
  });

  // Availability Rules
  await prisma.catalogAvailabilityRule.createMany({
    data: [
      {
        tenantId: tenant.id,
        publicationId: comboPub.id,
        channel: 'storefront_delivery',
        daysOfWeek: [5, 6], // Sexta e Sábado
        startTime: '18:00',
        endTime: '23:00',
        isActive: true,
      },
      {
        tenantId: tenant.id,
        publicationId: configurablePub.id,
        channel: 'storefront_delivery',
        daysOfWeek: [0, 1, 2, 3, 4, 5, 6], // Todos os dias
        startTime: '18:00',
        endTime: '23:59',
        isActive: true,
      },
    ],
    skipDuplicates: true,
  });

  console.log(`Catalog V2 data seeded for ${TENANT_SLUG}`);
  console.log(`Products: simple (1), configurable (1), combo (1)`);
  console.log(`Option Groups: 2 with 5 items total`);
  console.log(`Combo Slots: 2 with 2 allowed items total`);
  console.log(`Publication & Availability rules configured`);
  
  console.log('Simple seed completed successfully!');
}

runSeed()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
