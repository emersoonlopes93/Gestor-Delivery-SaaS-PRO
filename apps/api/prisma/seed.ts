import 'reflect-metadata';
import { PrismaClient, TenantStatus } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import {
  TENANT_PERMISSIONS,
  ADMIN_PERMISSIONS,
  TENANT_ROLE_PERMISSIONS,
  ADMIN_ROLE_PERMISSIONS,
} from '@gestor/core';
import { TenantDefaultRole, AdminDefaultRole } from '@gestor/core';
import { seedDemoAiAgentAccess } from '../src/seed/demo-ai-agent.seed';
import { seedBaseMenuTemplates } from '../src/catalog/menu-import/base-menu-bootstrap';
import {
  ensureDefaultTenantRoles,
  ensureTenantPermissionCatalog,
} from '../src/tenant/default-tenant-roles';
import { SMOKE_TENANT_FIXTURE } from './smoke-tenant-fixture';

const prisma = new PrismaClient();

async function seedTenantPermissions() {
  console.log('🔑 Seeding tenant permissions...');
  await ensureTenantPermissionCatalog(prisma);
  console.log(`   ✅ ${Object.keys(TENANT_PERMISSIONS).length} tenant permissions seeded`);
}

async function seedAdminPermissions() {
  console.log('🔑 Seeding admin permissions...');
  const entries = Object.entries(ADMIN_PERMISSIONS);

  for (const [slug, description] of entries) {
    // For admin, module is like "saas.tenants" and action is the last part
    const parts = slug.split('.');
    const action = parts.pop()!;
    const module = parts.join('.');
    await prisma.adminPermission.upsert({
      where: { slug },
      update: { description },
      create: { module, action, slug, description },
    });
  }
  console.log(`   ✅ ${entries.length} admin permissions seeded`);
}

async function seedAdminRoles() {
  console.log('👤 Seeding admin roles...');

  const roleEntries = Object.values(AdminDefaultRole);

  for (const roleSlug of roleEntries) {
    const roleName = roleSlug
      .replace(/_/g, ' ')
      .replace(/\b\w/g, (l) => l.toUpperCase());

    const role = await prisma.adminRole.upsert({
      where: { slug: roleSlug },
      update: { name: roleName },
      create: {
        name: roleName,
        slug: roleSlug,
        description: `Default ${roleName} role`,
        isSystem: true,
      },
    });

    // Assign permissions
    const permSlugs = ADMIN_ROLE_PERMISSIONS[roleSlug] || [];
    for (const permSlug of permSlugs) {
      const permission = await prisma.adminPermission.findUnique({
        where: { slug: permSlug },
      });
      if (permission) {
        await prisma.adminRolePermission.upsert({
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
  console.log(`   ✅ ${roleEntries.length} admin roles seeded`);
}

async function seedSuperAdmin() {
  console.log('🛡️  Seeding super admin user...');

  const email = 'admin@saas.com';
  const password = await bcrypt.hash('admin123', 12);

  const user = await prisma.adminUser.upsert({
    where: { email },
    update: {},
    create: {
      email,
      name: 'Super Admin',
      passwordHash: password,
      isActive: true,
    },
  });

  const superAdminRole = await prisma.adminRole.findUnique({
    where: { slug: 'super_admin' },
  });

  if (superAdminRole) {
    await prisma.adminUserRole.upsert({
      where: {
        userId_roleId: {
          userId: user.id,
          roleId: superAdminRole.id,
        },
      },
      update: {},
      create: {
        userId: user.id,
        roleId: superAdminRole.id,
      },
    });
  }

  console.log('   ✅ Super admin seeded');
}

async function seedSystemConfig() {
  console.log('⚙️  Seeding system config...');

  await prisma.systemConfig.upsert({
    where: { id: 'global' },
    update: {},
    create: {
      id: 'global',
      evolutionUrl: 'http://localhost:8080',
      evolutionGlobalToken: 'global_token_here',
      defaultWhatsAppProvider: 'evolution_go',
      // --- Configuração Global do Agente IA ---
      aiDefaultAgentName: 'Assistente',
      aiDefaultTone: 'friendly',
      aiMemoryEnabled: false,
      aiRememberCustomerName: false,
      aiRememberAddresses: false,
      aiRememberLastOrder: false,
      aiRememberPreferences: false,
      aiAllowRepeatLastOrder: false,
      aiMemoryRetentionDays: 180,
      aiDebounceMs: 10000,
      aiSimulateTyping: true,
      aiRequireCustomerName: false,
      aiRequireConfirmation: true,
      aiEnableUpsell: false,
      aiEnableHumanHandoff: true,
    },
  });

  console.log('   ✅ System config seeded');
}

async function seedBillingFoundation() {
  console.log('💳 Seeding billing foundation...');

  const plan = await prisma.billingPlan.upsert({
    where: { slug: 'revenue-growth' },
    update: {
      name: 'Crescimento por Faturamento',
      description: 'Plano novo para faturamento por receita mensal',
      type: 'revenue_tiered',
      cycleInterval: 'monthly',
      isActive: true,
      isPublic: true,
      currency: 'BRL',
      trialDays: 0,
      requiresPaymentMethod: false,
      allowAllModules: true,
    },
    create: {
      name: 'Crescimento por Faturamento',
      slug: 'revenue-growth',
      description: 'Plano novo para faturamento por receita mensal',
      type: 'revenue_tiered',
      cycleInterval: 'monthly',
      isActive: true,
      isPublic: true,
      currency: 'BRL',
      trialDays: 0,
      requiresPaymentMethod: false,
      allowAllModules: true,
    },
  });

  const mvpPlan = await prisma.billingPlan.upsert({
    where: { slug: 'mvp-starter' },
    update: {
      name: 'MVP Starter',
      description: 'Plano inicial (apenas funcionalidades essenciais)',
      type: 'fixed',
      cycleInterval: 'monthly',
      isActive: true,
      isPublic: true,
      currency: 'BRL',
      trialDays: 0,
      requiresPaymentMethod: false,
      allowAllModules: false, // Bloqueia módulos avançados
    },
    create: {
      name: 'MVP Starter',
      slug: 'mvp-starter',
      description: 'Plano inicial (apenas funcionalidades essenciais)',
      type: 'fixed',
      cycleInterval: 'monthly',
      isActive: true,
      isPublic: true,
      currency: 'BRL',
      trialDays: 0,
      requiresPaymentMethod: false,
      allowAllModules: false,
    },
  });

  const tiers = [
    { minRevenue: 0, maxRevenue: 1500, price: 0, label: 'Até R$ 1.500', sortOrder: 0 },
    { minRevenue: 1500.01, maxRevenue: 4000, price: 100, label: 'R$ 1.500,01 até R$ 4.000', sortOrder: 1 },
    { minRevenue: 4000.01, maxRevenue: 6000, price: 200, label: 'R$ 4.000,01 até R$ 6.000', sortOrder: 2 },
    { minRevenue: 6000.01, maxRevenue: null, price: 300, label: 'Acima de R$ 6.000', sortOrder: 3 },
  ];

  for (const tier of tiers) {
    await prisma.billingRevenueTier.upsert({
      where: {
        planId_sortOrder: {
          planId: plan.id,
          sortOrder: tier.sortOrder,
        },
      },
      update: {
        minRevenue: tier.minRevenue,
        maxRevenue: tier.maxRevenue,
        price: tier.price,
        label: tier.label,
      },
      create: {
        planId: plan.id,
        minRevenue: tier.minRevenue,
        maxRevenue: tier.maxRevenue,
        price: tier.price,
        label: tier.label,
        sortOrder: tier.sortOrder,
      },
    });
  }

  await prisma.billingSettings.upsert({
    where: { id: 'global' },
    update: {
      includeDeliveryFeeByDefault: false,
      includeServiceFeeByDefault: false,
      countStorefrontOrders: true,
      countDirectOnlineOrders: true,
      countPosOrders: true,
      countWhatsappAiOrders: true,
      countManualOrders: false,
      countMarketplaceIfoodOrders: true,
      countConfirmedOrders: true,
      countCompletedOrders: true,
      excludeCancelledOrders: true,
      discountReducesRevenue: true,
      defaultGracePeriodDays: 7,
      defaultTrialDays: 0,
      requirePaymentMethodForPaidPlans: false,
      trialProEnabled: false,
      trialIncludesAi: true,
      trialIncludesIfood: true,
      trialIncludesAdvancedReports: true,
      trialAutoConvertToBilling: false,
      aiIncludedForPaidTenants: true,
      aiIncludedMonthlyMessages: 200,
      aiFreeTrialMessages: 0,
      aiHardLimitMonthlyMessages: 1000,
    },
    create: {
      id: 'global',
      includeDeliveryFeeByDefault: false,
      includeServiceFeeByDefault: false,
      countStorefrontOrders: true,
      countDirectOnlineOrders: true,
      countPosOrders: true,
      countWhatsappAiOrders: true,
      countManualOrders: false,
      countMarketplaceIfoodOrders: true,
      countConfirmedOrders: true,
      countCompletedOrders: true,
      excludeCancelledOrders: true,
      discountReducesRevenue: true,
      defaultGracePeriodDays: 7,
      defaultTrialDays: 0,
      requirePaymentMethodForPaidPlans: false,
      trialProEnabled: false,
      trialIncludesAi: true,
      trialIncludesIfood: true,
      trialIncludesAdvancedReports: true,
      trialAutoConvertToBilling: false,
      aiIncludedForPaidTenants: true,
      aiIncludedMonthlyMessages: 200,
      aiFreeTrialMessages: 0,
      aiHardLimitMonthlyMessages: 1000,
    },
  });

  await prisma.billingModuleAddon.upsert({
    where: { addonKey: 'ai_agent' },
    update: {
      addonKey: 'ai_agent',
      moduleKey: 'ai_agent',
      name: 'Add-on Agente IA',
      description: 'Libera o Agente IA com cota controlada.',
      pricingType: 'fixed',
      price: 70,
      isActive: true,
    },
    create: {
      addonKey: 'ai_agent',
      moduleKey: 'ai_agent',
      name: 'Add-on Agente IA',
      description: 'Libera o Agente IA com cota controlada.',
      pricingType: 'fixed',
      price: 70,
      isActive: true,
    },
  });

  console.log('   ✅ Billing foundation seeded');
}

async function seedAiPlanPresets() {
  console.log('🤖 Seeding AI agent plan presets...');

  const presets = [
    {
      plan: 'basic',
      memoryAllowed: false,
      repeatLastOrderAllowed: false,
      maxRetentionDays: 30,
      advancedToolsAllowed: false,
      customPromptAllowed: false,
    },
    {
      plan: 'pro',
      memoryAllowed: true,
      repeatLastOrderAllowed: true,
      maxRetentionDays: 90,
      advancedToolsAllowed: false,
      customPromptAllowed: true,
    },
    {
      plan: 'premium',
      memoryAllowed: true,
      repeatLastOrderAllowed: true,
      maxRetentionDays: 365,
      advancedToolsAllowed: true,
      customPromptAllowed: true,
    },
  ];

  for (const preset of presets) {
    await prisma.aiAgentPlanPreset.upsert({
      where: { plan: preset.plan },
      update: preset,
      create: preset,
    });
  }

  console.log(`   ✅ ${presets.length} AI plan presets seeded (basic / pro / premium)`);
}

async function seedBaseMenus() {
  console.log('Seeding base menu templates...');
  const summary = await seedBaseMenuTemplates(prisma);
  for (const message of summary.messages) {
    console.log(`   ${message}`);
  }
  for (const warning of summary.warnings) {
    console.warn(`   ${warning}`);
  }
  console.log(
    `   Base menus: ${summary.templatesCreated} created, ${summary.templatesPreserved} preserved, ` +
      `${summary.versionsCreated} versions created, ${summary.versionsOverwritten} versions overwritten, ` +
      `${summary.productsOverwritten} products overwritten`,
  );
}

async function seedDemoTenant() {
  const TENANT_SLUG = SMOKE_TENANT_FIXTURE.slug;
  console.log('🏪 Seeding demo tenant...');

  try {
    const tenant = await prisma.tenant.upsert({
      where: { slug: TENANT_SLUG },
      update: {},
      create: {
        name: 'Pizzaria Demo',
        slug: TENANT_SLUG,
        status: 'active',
      },
    });
    console.log(`   ✅ Tenant created: ${tenant.id}`);

    await seedDemoAiAgentAccess(prisma, tenant.id);
    console.log('   ✅ Demo modules (ai_agent, whatsapp) + AI agent isEnabled=true');

    // Create tenant settings with full operational configs
    const notificationTemplates = {
      confirmed: '✅ Pedido #{{orderNumber}} confirmado! {{restaurantName}} já está preparando seu pedido.',
      preparing: '👨‍🍳 Pedido #{{orderNumber}} está sendo preparado por {{restaurantName}}. Já já sai!',
      ready: '📦 Pedido #{{orderNumber}} está pronto! Aguardando retirada/entregador.',
      out_for_delivery: '🛵 Pedido #{{orderNumber}} saiu para entrega! Fique atento.',
      completed: '🎉 Pedido #{{orderNumber}} foi entregue! Bom apetite! Obrigado por pedir no {{restaurantName}}.',
      cancelled: '❌ Pedido #{{orderNumber}} foi cancelado. Entre em contato com {{restaurantName}} para mais informações.',
    };

    await prisma.tenantSettings.upsert({
      where: { tenantId: tenant.id },
      update: {
        street: 'Av. Paulista',
        number: '1000',
        neighborhood: 'Bela Vista',
        city: 'São Paulo',
        state: 'SP',
        zipCode: '01310-100',
        pixKey: 'contato@pizzariademo.com',
        paymentMethods: ['pix', 'credit_card', 'cash'],
        audioNotificationEnabled: true,
        newOrderSound: 'notification.mp3',
        cancellationSound: 'notification.mp3',
        handoffSound: 'notification.mp3',
        readySound: 'notification.mp3',
        notificationVolume: 1.0,
        browserNotificationsEnabled: true,
        whatsappNotificationsEnabled: false,
        notificationTemplates: notificationTemplates,
      },
      create: {
        tenantId: tenant.id,
        timezone: 'America/Sao_Paulo',
        currency: 'BRL',
        language: 'pt-BR',
        businessPhone: '(11) 99999-0000',
        businessEmail: 'contato@pizzariademo.com',
        street: 'Av. Paulista',
        number: '1000',
        neighborhood: 'Bela Vista',


        city: 'São Paulo',
        state: 'SP',
        zipCode: '01310-100',
        pixKey: 'contato@pizzariademo.com',
        paymentMethods: ['pix', 'credit_card', 'cash'],
        audioNotificationEnabled: true,
        newOrderSound: 'notification.mp3',
        cancellationSound: 'notification.mp3',
        handoffSound: 'notification.mp3',
        readySound: 'notification.mp3',
        notificationVolume: 1.0,
        browserNotificationsEnabled: true,
        whatsappNotificationsEnabled: false,
        notificationTemplates: notificationTemplates,
      },
    });

    await ensureDefaultTenantRoles(prisma, tenant.id);

    // CI owns a deterministic, disposable tenant fixture. Persistent environments
    // retain the existing demo owner password hash on repeated seeds.
    const isEphemeralSmokeSeed = process.env.NODE_ENV === 'test';
    const ownerEmail = isEphemeralSmokeSeed
      ? SMOKE_TENANT_FIXTURE.ownerEmail
      : 'demo@demo.com';
    const ownerPassword = isEphemeralSmokeSeed
      ? await bcrypt.hash(SMOKE_TENANT_FIXTURE.ownerPassword, 12)
      : undefined;

    const owner = await prisma.tenantUser.upsert({
      where: {
        tenantId_email: { tenantId: tenant.id, email: ownerEmail },
      },
      update: {
        isActive: true,
        ...(ownerPassword ? { passwordHash: ownerPassword } : {}),
      },
      create: {
        tenantId: tenant.id,
        email: ownerEmail,
        name: 'Dono da Pizzaria',
        passwordHash: ownerPassword ?? await bcrypt.hash('demo123', 12),
        isActive: true,
      },
    });

    // Assign tenant_owner role
    const ownerRole = await prisma.tenantRole.findUniqueOrThrow({
      where: { tenantId_slug: { tenantId: tenant.id, slug: TenantDefaultRole.TENANT_OWNER } },
    });

    await prisma.tenantUserRole.upsert({
      where: {
        userId_roleId: { userId: owner.id, roleId: ownerRole.id },
      },
      update: {},
      create: { userId: owner.id, roleId: ownerRole.id },
    });

    console.log(`   👤 Demo tenant created: ${tenant.name}`);
    console.log(`   👤 Tenant owner: ${ownerEmail}`);

    // Create default delivery coverage config
    await prisma.deliveryCoverageConfig.upsert({
      where: { tenantId: tenant.id },
      update: {},
      create: {
        tenantId: tenant.id,
        storeLat: -23.5614,
        storeLng: -46.6559,
        maxRadiusKm: 15.0,
        defaultPricePerKm: 2.5,
        minimumFee: 5.0,
        maximumFee: 20.0,
        isDeliveryEnabled: true,
      },
    });

    // Create default tenant operating hours (08:00 to 22:00 for Sun-Sat)
    for (let day = 0; day <= 6; day++) {
      const existingHours = await prisma.tenantOperatingHours.findFirst({
        where: { tenantId: tenant.id, dayOfWeek: day }
      });
      if (!existingHours) {
        await prisma.tenantOperatingHours.create({
          data: {
            tenantId: tenant.id,
            dayOfWeek: day,
            isOpen: true,
            openTime: '08:00',
            closeTime: '22:00',
          }
        });
      }
    }

    // Create delivery rate rules
    await prisma.deliveryRateRule.create({
      data: {
        tenantId: tenant.id,
        type: 'neighborhood',
        neighborhood: 'centro',
        rate: 8.0,
      },
    });

    await prisma.deliveryRateRule.create({
      data: {
        tenantId: tenant.id,
        type: 'neighborhood',
        neighborhood: 'jardins',
        rate: 12.0,
      },
    });

    await prisma.deliveryRateRule.create({
      data: {
        tenantId: tenant.id,
        type: 'fixed',
        fixedRate: 10.0,
      },
    });

    // Create demo category (ProductCategory)
    const category = await prisma.productCategory.upsert({
      where: { tenantId_slug: { tenantId: tenant.id, slug: 'pizzas' } },
      update: {},
      create: {
        tenantId: tenant.id,
        name: 'Pizzas',
        slug: 'pizzas',
      },
    });

    // Create product
    await prisma.product.upsert({
      where: { tenantId_slug: { tenantId: tenant.id, slug: 'pizza-de-calabresa' } },
      update: {},
      create: {
        tenantId: tenant.id,
        categoryId: category.id,
        name: 'Pizza de Calabresa',
        slug: 'pizza-de-calabresa',
        basePrice: 45.0,
        isAvailable: true,
        sellableOnline: true,
      },
    });

    // Create Bebidas category
    const bebidasCategory = await prisma.productCategory.upsert({
      where: { tenantId_slug: { tenantId: tenant.id, slug: 'bebidas' } },
      update: {},
      create: {
        tenantId: tenant.id,
        name: 'Bebidas',
        slug: 'bebidas',
      },
    });

    // Create simple product without complements
    await prisma.product.upsert({
      where: { tenantId_slug: { tenantId: tenant.id, slug: 'refrigerante' } },
      update: {},
      create: {
        tenantId: tenant.id,
        categoryId: bebidasCategory.id,
        name: 'Refrigerante',
        slug: 'refrigerante',
        basePrice: 6.0,
        isAvailable: true,
        sellableOnline: true,
      },
    });

    console.log('   ✅ Catalog data seeded');
  } catch (err) {
    console.error('❌ Error inside seedDemoTenant:', err);
    throw err;
  }
}

async function seedDineInTables() {
  const TENANT_SLUG = 'pizzaria-demo';
  console.log('🍽️ Seeding dine-in tables...');

  const tenant = await prisma.tenant.findUnique({ where: { slug: TENANT_SLUG } });
  if (!tenant) return;

  for (let i = 1; i <= 12; i++) {
    const tableName = `Mesa ${i.toString().padStart(2, '0')}`;
    await prisma.dineInTable.upsert({
      where: { tenantId_name: { tenantId: tenant.id, name: tableName } },
      update: {},
      create: {
        tenantId: tenant.id,
        name: tableName,
        capacity: i % 2 === 0 ? 4 : 2,
        status: 'free',
      }
    });
  }
  console.log('   ✅ 12 tables seeded');
}

async function main() {
  console.log('🌱 Starting seed...\n');

  await seedTenantPermissions();
  await seedAdminPermissions();
  await seedAdminRoles();
  await seedSuperAdmin();
  await seedSystemConfig();
  await seedBillingFoundation();
  await seedAiPlanPresets();
  await seedBaseMenus();
  await seedDemoTenant();
  await seedDineInTables();

  console.log('\n✅ Seed completed successfully!');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
