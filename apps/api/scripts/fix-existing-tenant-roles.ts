import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  console.log('Buscando todas as permissões do sistema...');
  const allPermissions = await prisma.tenantPermission.findMany();
  console.log(`Total de permissões encontradas: ${allPermissions.length}`);

  if (allPermissions.length === 0) {
    console.log('Nenhuma permissão cadastrada no banco de dados.');
    return;
  }

  console.log('Buscando papéis de dono de tenant ("owner" ou "tenant_owner")...');
  const ownerRoles = await prisma.tenantRole.findMany({
    where: {
      slug: {
        in: ['owner', 'tenant_owner'],
      },
    },
  });

  console.log(`Total de papéis de dono encontrados: ${ownerRoles.length}`);

  let updatedCount = 0;
  for (const role of ownerRoles) {
    console.log(`Processando papel: "${role.name}" (Slug: ${role.slug}, Tenant ID: ${role.tenantId})...`);

    // Criar as associações de permissões para cada papel se não existirem
    const result = await prisma.tenantRolePermission.createMany({
      data: allPermissions.map((permission) => ({
        roleId: role.id,
        permissionId: permission.id,
      })),
      skipDuplicates: true,
    });

    console.log(`  -> Permissões vinculadas com sucesso: ${result.count}`);
    updatedCount += result.count;
  }

  console.log(`\n✅ Processo concluído! Total de novas associações criadas: ${updatedCount}`);
}

main()
  .catch((e: unknown) => {
    console.error('Erro ao executar o script de correção:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
