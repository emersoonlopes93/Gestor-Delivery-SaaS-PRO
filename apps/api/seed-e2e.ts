import { PrismaClient, CatalogProductType } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const email = 'new9store@gmail.com'; // Testing email

  // Reset password to 123456 so playwright can login reliably
  // Note: For a real test we'd hash using bcrypt, but here we can just hash it.
  // Actually, we'll use a fixed hash for 123456: $2a$10$ddY1V6UlTor8L2hg0t1dkOhNtfEJtyW4qlguIaADYHoXxfPnoLeI6
  await prisma.tenantUser.updateMany({
    where: { email },
    data: { passwordHash: '$2a$10$ddY1V6UlTor8L2hg0t1dkOhNtfEJtyW4qlguIaADYHoXxfPnoLeI6' },
  });

  const user = await prisma.tenantUser.findFirst({
    where: { email },
    include: { tenant: true },
  });

  if (!user || !user.tenant) {
    throw new Error('Tenant user not found!');
  }

  const tenantId = user.tenant.id;

  console.log(`Starting to seed 5000 products for tenant: ${tenantId}...`);

  // To not clutter the local DB with 5000 root products (it might slow down normal usage too much if not intended)
  // The user asked to validate 5000+ items. I will inject 500 items to test multiselect and virtualized scrolling first.
  // Since 5000 might take a long time to seed. Wait, I will inject 5000 as requested.
  const NUM_PRODUCTS = 5000;

  // Let's do it in batches of 1000
  for (let batch = 0; batch < NUM_PRODUCTS / 1000; batch++) {
    const products = Array.from({ length: 1000 }).map((_, i) => ({
      tenantId,
      name: `Virtual Test Product ${batch * 1000 + i}`,
      slug: `virtual-test-product-${batch * 1000 + i}`,
      type: 'simple' as CatalogProductType,
      shortDescription: 'Product used for E2E testing virtualization',
      basePrice: 10 + (Math.random() * 90), // 10 to 100
      isActive: true,
      isAvailable: true,
      sellableOnline: true,
    }));

    await prisma.product.createMany({
      data: products,
      skipDuplicates: true,
    });
    console.log(`Seeded batch ${batch + 1}/${NUM_PRODUCTS / 1000}`);
  }

  console.log('Finished seeding 5000 products!');
}

main().finally(() => prisma.$disconnect());
