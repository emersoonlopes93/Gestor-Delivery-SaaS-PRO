import { PrismaClient } from '@prisma/client';
import { ADMIN_PERMISSIONS } from '@gestor/core';

const prisma = new PrismaClient();

async function main() {
  console.log('🔍 Iniciando Diagnóstico de RBAC...');
  const roles = await prisma.adminRole.findMany({
    include: {
      rolePermissions: {
        include: {
          permission: true,
        },
      },
    },
  });

  console.log('\n👤 Roles e Permissões no Banco:');
  for (const r of roles) {
    console.log(`- Role: ${r.name} (${r.slug})`);
    console.log(`  Permissões associadas: ${r.rolePermissions.length}`);
    for (const rp of r.rolePermissions) {
      console.log(`    * ${rp.permission.slug}`);
    }
  }

  const dbPermissions = await prisma.adminPermission.findMany();
  const dbPermissionSlugs = new Set(dbPermissions.map((p) => p.slug));
  const declaredSlugs = Object.keys(ADMIN_PERMISSIONS);

  console.log('\n📋 Comparação com Permissões Declaradas no Código:');
  console.log(`- Permissões no banco: ${dbPermissionSlugs.size}`);
  console.log(`- Permissões declaradas: ${declaredSlugs.length}`);

  const missingInDb = declaredSlugs.filter((p) => !dbPermissionSlugs.has(p));
  if (missingInDb.length > 0) {
    console.log('❌ Permissões declaradas mas FALTANDO no banco:');
    for (const p of missingInDb) {
      console.log(`  * ${p}`);
    }
  } else {
    console.log('✅ Todas as permissões declaradas existem no banco.');
  }

  // Verificar super_admin especificamente
  const superAdmin = roles.find((r) => r.slug === 'super_admin');
  if (superAdmin) {
    const superAdminPerms = new Set(superAdmin.rolePermissions.map((p) => p.permission.slug));
    const missingInSuperAdmin = declaredSlugs.filter((p) => !superAdminPerms.has(p));
    if (missingInSuperAdmin.length > 0) {
      console.log('❌ Permissões FALTANDO no super_admin:');
      for (const p of missingInSuperAdmin) {
        console.log(`  * ${p}`);
      }
    } else {
      console.log('✅ O role super_admin possui todas as permissões declaradas.');
    }
  } else {
    console.log('❌ Role super_admin não foi encontrado no banco.');
  }

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
