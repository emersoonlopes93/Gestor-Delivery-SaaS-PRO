"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const bcrypt = __importStar(require("bcryptjs"));
const core_1 = require("@gestor/core");
const core_2 = require("@gestor/core");
const prisma = new client_1.PrismaClient();
async function seedTenantPermissions() {
    console.log('🔑 Seeding tenant permissions...');
    const entries = Object.entries(core_1.TENANT_PERMISSIONS);
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
    const entries = Object.entries(core_1.ADMIN_PERMISSIONS);
    for (const [slug, description] of entries) {
        // For admin, module is like "saas.tenants" and action is the last part
        const parts = slug.split('.');
        const action = parts.pop();
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
    const roleEntries = Object.values(core_2.AdminDefaultRole);
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
        const permSlugs = core_1.ADMIN_ROLE_PERMISSIONS[roleSlug] || [];
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
                userId_roleId: { userId: user.id, roleId: superAdminRole.id },
            },
            update: {},
            create: { userId: user.id, roleId: superAdminRole.id },
        });
    }
    console.log(`   ✅ Super admin created: ${email}`);
}
async function seedDemoTenant() {
    console.log('🏪 Seeding demo tenant...');
    // Create tenant
    const tenant = await prisma.tenant.upsert({
        where: { slug: 'pizzaria-demo' },
        update: {},
        create: {
            name: 'Pizzaria Demo',
            slug: 'pizzaria-demo',
            status: 'active',
        },
    });
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
    const roleEntries = Object.values(core_2.TenantDefaultRole);
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
        const permSlugs = core_1.TENANT_ROLE_PERMISSIONS[roleSlug] || [];
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
        update: {},
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
    console.log(`   ✅ Demo tenant created: ${tenant.name}`);
    console.log(`   ✅ Tenant owner: ${ownerEmail}`);
}
async function main() {
    console.log('🌱 Starting seed...\n');
    await seedTenantPermissions();
    await seedAdminPermissions();
    await seedAdminRoles();
    await seedSuperAdmin();
    await seedDemoTenant();
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
//# sourceMappingURL=seed.js.map