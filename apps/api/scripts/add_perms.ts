import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const user = await prisma.tenantUser.findFirst({ where: { email: 'demo@demo.com' } });
  if (!user) {
    console.error('User demo@demo.com not found');
    return;
  }

  // Find all scheduling permissions
  const perms = await prisma.tenantPermission.findMany({
    where: { module: 'scheduling' }
  });

  console.log(`Found ${perms.length} scheduling permissions.`);

  const role = await prisma.tenantRole.findFirst({
    where: { tenantId: user.tenantId, name: 'Owner' }
  });

  if (role) {
    for (const p of perms) {
      await prisma.tenantRolePermission.upsert({
        where: {
          roleId_permissionId: {
            roleId: role.id,
            permissionId: p.id
          }
        },
        update: {},
        create: {
          roleId: role.id,
          permissionId: p.id
        }
      });
    }
    console.log('Permissions added to Owner role.');
  }

  await prisma.$disconnect();
}

main();
