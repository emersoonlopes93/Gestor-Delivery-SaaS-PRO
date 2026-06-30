import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import * as bcrypt from 'bcryptjs';
import {
  TENANT_PERMISSIONS,
  ADMIN_PERMISSIONS,
  TENANT_ROLE_PERMISSIONS,
  ADMIN_ROLE_PERMISSIONS,
} from '@gestor/core';
import { TenantDefaultRole, AdminDefaultRole } from '@gestor/core';
import { seedDemoAiAgentAccess } from './demo-ai-agent.seed';
import { CatalogTemplatesService } from '../catalog/catalog-templates.service';

@Injectable()
export class SeedService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly catalogTemplates: CatalogTemplatesService,
  ) {}

  async runSeed() {
    console.log('Starting seed...');
    
    await this.seedTenantPermissions();
    await this.seedAdminPermissions();
    await this.seedAdminRoles();
    await this.seedSuperAdmin();
    await this.seedDemoTenant();
    
    console.log('Seed completed successfully!');
  }

  private async seedTenantPermissions() {
    console.log('Seeding tenant permissions...');
    const entries = Object.entries(TENANT_PERMISSIONS) as [string, string][];

    for (const [slug, description] of entries) {
      const [module, action] = slug.split('.');
      await this.prisma.tenantPermission.upsert({
        where: { slug },
        update: { description },
        create: { module, action, slug, description },
      });
    }
    console.log(`   ${entries.length} tenant permissions seeded`);
  }

  private async seedAdminPermissions() {
    console.log('Seeding admin permissions...');
    const entries = Object.entries(ADMIN_PERMISSIONS) as [string, string][];

    for (const [slug, description] of entries) {
      const parts = slug.split('.');
      const action = parts.pop()!;
      const module = parts.join('.');
      await this.prisma.adminPermission.upsert({
        where: { slug },
        update: { description },
        create: { module, action, slug, description },
      });
    }
    console.log(`   ${entries.length} admin permissions seeded`);
  }

  private async seedAdminRoles() {
    console.log('Seeding admin roles...');

    const roleEntries = Object.values(AdminDefaultRole) as string[];

    for (const roleSlug of roleEntries) {
      const roleName = roleSlug
        .replace(/_/g, ' ')
        .replace(/\b\w/g, (l) => l.toUpperCase());

      const role = await this.prisma.adminRole.upsert({
        where: { slug: roleSlug },
        update: { name: roleName },
        create: {
          name: roleName,
          slug: roleSlug,
          description: `Default ${roleName} role`,
          isSystem: true,
        },
      });

      const permSlugs = ADMIN_ROLE_PERMISSIONS[roleSlug] || [];
      for (const permSlug of permSlugs) {
        const permission = await this.prisma.adminPermission.findUnique({
          where: { slug: permSlug },
        });
        if (permission) {
          await this.prisma.adminRolePermission.upsert({
            where: {
              roleId_permissionId: {
                roleId: role.id,
                permissionId: permission.id,
              },
            },
            update: {},
            create: {
              roleId: role.id,
              permissionId: permission.id,
            },
          });
        }
      }
    }
    console.log(`   ${roleEntries.length} admin roles seeded`);
  }

  private async seedSuperAdmin() {
    console.log('Seeding super admin user...');

    const email = 'admin@gestordelivery.com';
    const password = await bcrypt.hash('Admin@123', 12);

    const user = await this.prisma.adminUser.upsert({
      where: { email },
      update: {},
      create: {
        email,
        name: 'Super Admin',
        passwordHash: password,
        isActive: true,
      },
    });

    const superAdminRole = await this.prisma.adminRole.findUnique({
      where: { slug: 'super_admin' },
    });

    if (superAdminRole) {
      await this.prisma.adminUserRole.upsert({
        where: {
          userId_roleId: { userId: user.id, roleId: superAdminRole.id },
        },
        update: {},
        create: { userId: user.id, roleId: superAdminRole.id },
      });
    }

    console.log(`   Super admin created: ${email}`);
  }

  private async seedDemoTenant() {
    const TENANT_SLUG = 'pizzaria-demo';
    console.log('Seeding demo tenant...');

    const tenant = await this.prisma.tenant.upsert({
      where: { slug: TENANT_SLUG },
      update: {},
      create: {
        name: 'Pizzaria Demo',
        slug: TENANT_SLUG,
        status: 'active',
      },
    });
    console.log(`   Tenant created: ${tenant.id}`);

    await seedDemoAiAgentAccess(this.prisma, tenant.id);
    console.log('   Demo modules (ai_agent, whatsapp, ...) and AI config enabled');

    // Create tenant settings
    await this.prisma.tenantSettings.upsert({
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

    await this.prisma.schedulingSettings.upsert({
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

    await this.prisma.schedulingWindow.createMany({
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

    // Create tenant roles
    const roleEntries = Object.values(TenantDefaultRole) as string[];
    for (const roleSlug of roleEntries) {
      const roleName = roleSlug
        .replace(/_/g, ' ')
        .replace(/\b\w/g, (l) => l.toUpperCase());

      const role = await this.prisma.tenantRole.upsert({
        where: { tenantId_slug: { tenantId: tenant.id, slug: roleSlug } },
        update: { name: roleName },
        create: {
          tenantId: tenant.id,
          name: roleName,
          slug: roleSlug,
          description: `Default ${roleName} role`,
          isSystem: true,
        },
      });

      const permSlugs = TENANT_ROLE_PERMISSIONS[roleSlug] || [];
      for (const permSlug of permSlugs) {
        const permission = await this.prisma.tenantPermission.findUnique({
          where: { slug: permSlug },
        });
        if (permission) {
          await this.prisma.tenantRolePermission.upsert({
            where: {
              roleId_permissionId: {
                roleId: role.id,
                permissionId: permission.id,
              },
            },
            update: {},
            create: {
              roleId: role.id,
              permissionId: permission.id,
            },
          });
        }
      }
    }

    // Create tenant owner user
    const ownerEmail = 'owner@pizzariademo.com';
    const ownerPassword = await bcrypt.hash('Owner@123', 12);

    const owner = await this.prisma.tenantUser.upsert({
      where: {
        tenantId_email: { tenantId: tenant.id, email: ownerEmail },
      },
      update: {
        isActive: true,
      },
      create: {
        tenantId: tenant.id,
        email: ownerEmail,
        name: 'Dono da Pizzaria',
        passwordHash: ownerPassword,
        isActive: true,
      },
    });

    // Assign tenant_owner role
    const ownerRole = await this.prisma.tenantRole.findUnique({
      where: { tenantId_slug: { tenantId: tenant.id, slug: 'tenant_owner' } },
    });

    if (ownerRole) {
      await this.prisma.tenantUserRole.upsert({
        where: {
          userId_roleId: { userId: owner.id, roleId: ownerRole.id },
        },
        update: {},
        create: { userId: owner.id, roleId: ownerRole.id },
      });
    }

    console.log(`   Demo tenant created: ${tenant.name}`);
    console.log(`   Tenant owner: ${ownerEmail}`);

    await this.seedAlignedPizzaDemo(tenant.id);
    return;

    // Create demo category (ProductCategory)
    const category = await this.prisma.productCategory.upsert({
      where: { tenantId_slug: { tenantId: tenant.id, slug: 'pizzas' } },
      update: {},
      create: {
        tenantId: tenant.id,
        name: 'Pizzas',
        slug: 'pizzas',
      },
    });

    // === CATALOG V2 SEED ===
    console.log('   Seeding Catalog V2 demo data...');

    // V2 Option Groups
    const ogMassas = await this.prisma.optionGroup.create({
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

    const ogSabores = await this.prisma.optionGroup.create({
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
    await this.prisma.optionItem.createMany({
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
    const simpleProduct = await this.prisma.product.upsert({
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

    const configurableProduct = await this.prisma.product.upsert({
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

    const comboProduct = await this.prisma.product.upsert({
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
    await this.prisma.productOptionGroupLink.createMany({
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
    const slotPizza = await this.prisma.comboSlot.create({
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

    const slotBebida = await this.prisma.comboSlot.create({
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
    await this.prisma.comboSlotAllowedItem.createMany({
      data: [
        // Itens permitidos no slot de pizza
        {
          tenantId: tenant.id,
          comboSlotId: slotPizza.id,
          productId: configurableProduct.id, // Pizza Personalizada (V2)
          additionalPrice: 0,
          order: 0,
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
    await this.prisma.catalogPublication.create({
      data: {
        tenantId: tenant.id,
        productId: configurableProduct.id,
        publicationStatus: 'published',
        operationalStatus: 'active',
      },
    });

    await this.prisma.catalogPublication.create({
      data: {
        tenantId: tenant.id,
        productId: comboProduct.id,
        publicationStatus: 'published',
        operationalStatus: 'active',
      },
    });

    // Availability Rules (ex: combo disponível apenas fins de semana)
    // Primeiro criar as publicações para obter os IDs
    const configurablePub = await this.prisma.catalogPublication.findFirst({
      where: { tenantId: tenant.id, productId: configurableProduct.id },
    });
    const comboPub = await this.prisma.catalogPublication.findFirst({
      where: { tenantId: tenant.id, productId: comboProduct.id },
    });

    if (configurablePub && comboPub) {
      await this.prisma.catalogAvailabilityRule.createMany({
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
    }

    console.log(`   Catalog V2 data seeded for ${TENANT_SLUG}`);
    console.log(`   Products: simple (1), configurable (1), combo (1)`);
    console.log(`   Option Groups: 2 with 5 items total`);
    console.log(`   Combo Slots: 2 with 2 allowed items total`);
    console.log(`   Publication & Availability rules configured`);
  }

  private async seedAlignedPizzaDemo(tenantId: string) {
    const category = await this.prisma.productCategory.upsert({
      where: { tenantId_slug: { tenantId, slug: 'pizzas' } },
      update: {
        templateType: 'pizza',
        templateConfig: { pricingStrategy: 'highest' },
      },
      create: {
        tenantId,
        name: 'Pizzas',
        slug: 'pizzas',
        templateType: 'pizza',
        templateConfig: { pricingStrategy: 'highest' },
      },
    });

    const pizzaFlavors = [
      { name: 'Calabresa', slug: 'calabresa', basePrice: 30, prices: { pequena: 30, media: 38, grande: 45 } },
      { name: 'Mussarela', slug: 'mussarela', basePrice: 28, prices: { pequena: 28, media: 35, grande: 42 } },
      { name: 'Portuguesa', slug: 'portuguesa', basePrice: 32, prices: { pequena: 32, media: 40, grande: 48 } },
      { name: 'Frango com Catupiry', slug: 'frango-com-catupiry', basePrice: 33, prices: { pequena: 33, media: 41, grande: 49 } },
      { name: 'Marguerita', slug: 'marguerita', basePrice: 29, prices: { pequena: 29, media: 36, grande: 43 } },
    ] as const;

    for (const flavor of pizzaFlavors) {
      const product = await this.prisma.product.upsert({
        where: { tenantId_slug: { tenantId, slug: flavor.slug } },
        update: {
          categoryId: category.id,
          name: flavor.name,
          basePrice: flavor.basePrice,
          type: 'simple',
          isAvailable: true,
          sellableOnline: true,
          isActive: true,
        },
        create: {
          tenantId,
          categoryId: category.id,
          name: flavor.name,
          slug: flavor.slug,
          type: 'simple',
          basePrice: flavor.basePrice,
          isAvailable: true,
          sellableOnline: true,
          isActive: true,
          order: 10,
        },
      });

      await this.catalogTemplates.configureProductAsFlavor(tenantId, product.id);
      await this.upsertPizzaSizePrices(tenantId, product.id, flavor.prices);
    }

    await this.prisma.product.upsert({
      where: { tenantId_slug: { tenantId, slug: 'refrigerante-lata' } },
      update: {
        categoryId: category.id,
        name: 'Refrigerante Lata',
        basePrice: 8.0,
        type: 'simple',
        isAvailable: true,
        sellableOnline: true,
        isActive: true,
      },
      create: {
        tenantId,
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

    console.log('   Demo aligned with official pizza template');
    console.log(`   Demo category: ${category.name}`);
    console.log(`   Demo flavors: ${pizzaFlavors.map((item) => item.name).join(', ')}`);
  }

  private async upsertPizzaSizePrices(
    tenantId: string,
    productId: string,
    prices: { pequena: number; media: number; grande: number },
  ) {
    const sizes = await this.prisma.optionItem.findMany({
      where: {
        optionGroup: {
          tenantId,
          name: 'Tamanhos [Pizza]',
        },
      },
      select: { id: true, name: true },
    });

    const normalized = new Map<string, number>([
      ['pequena', prices.pequena],
      ['media', prices.media],
      ['grande', prices.grande],
    ]);

    for (const size of sizes) {
      const key = size.name.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      const price = normalized.get(key);
      if (price === undefined) continue;
      await this.prisma.productOptionItemPrice.upsert({
        where: {
          productId_optionItemId: {
            productId,
            optionItemId: size.id,
          },
        },
        create: {
          tenantId,
          productId,
          optionItemId: size.id,
          price,
        },
        update: { price },
      });
    }
  }
}
