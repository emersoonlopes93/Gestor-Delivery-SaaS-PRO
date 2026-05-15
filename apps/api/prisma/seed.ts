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

const prisma = new PrismaClient();

async function seedTenantPermissions() {
  console.log('🔑 Seeding tenant permissions...');
  const entries = Object.entries(TENANT_PERMISSIONS);

  for (const [slug, description] of entries) {
    const [module, action] = slug.split('.');
    await prisma.tenantPermission.upsert({
      where: { slug },
      update: { description },
      create: { module, action, slug, description },
    });
  }
  console.log(`   ✅ ${entries.length} tenant permissions seeded`);
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

  const email = 'admin@gestordelivery.com';
  const password = await bcrypt.hash('Admin@123', 12);

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
      evolutionUrl: 'http://localhost:8080', // Default local evolution url
      evolutionGlobalToken: 'global_token_here',
      defaultWhatsAppProvider: 'evolution_go',
    },
  });

  console.log('   ✅ System config seeded');
}

async function seedDemoTenant() {
  const TENANT_SLUG = 'pizzaria-demo';
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

    // Create tenant roles
    const roleEntries = Object.values(TenantDefaultRole);
    for (const roleSlug of roleEntries) {
      const roleName = roleSlug
        .replace(/_/g, ' ')
        .replace(/\b\w/g, (l) => l.toUpperCase());

      const role = await prisma.tenantRole.upsert({
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

      // Assign permissions
      const permSlugs = TENANT_ROLE_PERMISSIONS[roleSlug] || [];
      for (const permSlug of permSlugs) {
        const permission = await prisma.tenantPermission.findUnique({
          where: { slug: permSlug },
        });
        if (permission) {
          await prisma.tenantRolePermission.upsert({
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

    const owner = await prisma.tenantUser.upsert({
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
    const ownerRole = await prisma.tenantRole.findUnique({
      where: { tenantId_slug: { tenantId: tenant.id, slug: 'tenant_owner' } },
    });

    if (ownerRole) {
      await prisma.tenantUserRole.upsert({
        where: {
          userId_roleId: { userId: owner.id, roleId: ownerRole.id },
        },
        update: {},
        create: { userId: owner.id, roleId: ownerRole.id },
      });
    }

    console.log(`   ? Demo tenant created: ${tenant.name}`);
    console.log(`   ? Tenant owner: ${ownerEmail}`);

    // Create delivery rate rules
    await (prisma as any).deliveryRateRule.create({
      data: {
        tenantId: tenant.id,
        type: 'neighborhood',
        neighborhood: 'centro',
        rate: 8.0,
      },
    });

    await (prisma as any).deliveryRateRule.create({
      data: {
        tenantId: tenant.id,
        type: 'neighborhood',
        neighborhood: 'jardins',
        rate: 12.0,
      },
    });

    await (prisma as any).deliveryRateRule.create({
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

    // Create complement group (ProductComplementGroup)
    const group = await prisma.productComplementGroup.upsert({
      where: { id: 'demo-group-id' },
      update: {},
      create: {
        id: 'demo-group-id',
        tenantId: tenant.id,
        name: 'Escolha a Borda',
        minSelect: 1,
        maxSelect: 1,
        isRequired: true,
      },
    });

    // Create complement items (ProductComplementItem)
    await prisma.productComplementItem.upsert({
      where: { id: 'demo-item-catupiry' },
      update: {},
      create: {
        id: 'demo-item-catupiry',
        tenantId: tenant.id,
        groupId: group.id,
        name: 'Catupiry',
        additionalPrice: 5.0,
      },
    });

    // Create product
    const product = await prisma.product.upsert({
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

    // Link product to complement group (ProductComplementGroupLink)
    await prisma.productComplementGroupLink.upsert({
      where: {
        productId_complementGroupId: {
          productId: product.id,
          complementGroupId: group.id,
        },
      },
      update: {},
      create: {
        tenantId: tenant.id,
        productId: product.id,
        complementGroupId: group.id,
        order: 0,
      },
    });

    // Create combo (ProductCombo)
    const combo = await prisma.productCombo.upsert({
      where: { tenantId_slug: { tenantId: tenant.id, slug: 'combo-casal' } },
      update: {},
      create: {
        tenantId: tenant.id,
        name: 'Combo Casal',
        slug: 'combo-casal',
        basePrice: 85.0,
        isActive: true,
      },
    });

    // Create combo block (ProductComboBlock)
    const block = await prisma.productComboBlock.upsert({
      where: { id: 'demo-block-id' },
      update: {},
      create: {
        id: 'demo-block-id',
        tenantId: tenant.id,
        comboId: combo.id,
        name: 'Escolha seu sabor',
        minSelect: 1,
        maxSelect: 1,
        order: 0,
      },
    });

    // Link product to combo block (ProductComboBlockItem)
    await prisma.productComboBlockItem.upsert({
      where: { blockId_productId: { blockId: block.id, productId: product.id } },
      update: {},
      create: {
        tenantId: tenant.id,
        blockId: block.id,
        productId: product.id,
        additionalPrice: 0,
        order: 0,
      },
    });

    console.log(`   ✅ Catalog data seeded for ${TENANT_SLUG}`);
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
    await (prisma as any).dineInTable.upsert({
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
  await seedDemoTenant();
  await seedDineInTables();

  console.log('\n✅ Seed completed successfully!');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    // @ts-ignore
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
