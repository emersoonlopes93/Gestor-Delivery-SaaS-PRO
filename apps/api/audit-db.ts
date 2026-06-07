import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

const TENANT_ID = '1287fc80-faf9-413b-9fc1-313263ed8e7c';

async function main() {
  console.log('\n======================================================');
  console.log('  AUDITORIA DO BANCO DE DADOS — CARDÁPIO V3');
  console.log('======================================================\n');

  // ---- ETAPA 11 — Verificar estruturas V3 ----
  console.log('📊 ETAPA 11 — Verificar tabelas V3\n');

  const optionGroupCount = await prisma.optionGroup.count({ where: { tenantId: TENANT_ID } });
  console.log(`  OptionGroup:            ${optionGroupCount} registros`);

  const optionItemCount = await prisma.optionItem.count({
    where: { optionGroup: { tenantId: TENANT_ID } },
  });
  console.log(`  OptionItem:             ${optionItemCount} registros`);

  const tenantProductIds = await prisma.product
    .findMany({ where: { tenantId: TENANT_ID }, select: { id: true } })
    .then((ps) => ps.map((p) => p.id));

  const comboSlotCount = await prisma.comboSlot.count({
    where: { comboProductId: { in: tenantProductIds } },
  });
  console.log(`  ComboSlot:              ${comboSlotCount} registros`);

  const slotIds = await prisma.comboSlot
    .findMany({ where: { comboProductId: { in: tenantProductIds } }, select: { id: true } })
    .then((ss) => ss.map((s) => s.id));

  const comboSlotAllowedCount = await prisma.comboSlotAllowedItem.count({
    where: { comboSlotId: { in: slotIds } },
  });
  console.log(`  ComboSlotAllowedItem:   ${comboSlotAllowedCount} registros`);

  const productComboCount = await prisma.product.count({
    where: { tenantId: TENANT_ID, type: 'combo' },
  });
  console.log(`  Product(type=combo):    ${productComboCount} registros`);

  // ---- Verificar tabelas LEGADAS ----
  console.log('\n📊 Verificar tabelas LEGADAS (devem estar VAZIAS após migração V3)\n');

  const legacyCompGroupCount = await prisma.productComplementGroup.count({
    where: { tenantId: TENANT_ID },
  });
  console.log(`  ProductComplementGroup: ${legacyCompGroupCount} registros ${legacyCompGroupCount > 0 ? '⚠️ LEGADO AINDA ATIVO' : '✅ VAZIO'}`);

  const legacyCompItemCount = await prisma.productComplementItem.count({
    where: { group: { tenantId: TENANT_ID } },
  });
  console.log(`  ProductComplementItem:  ${legacyCompItemCount} registros ${legacyCompItemCount > 0 ? '⚠️ LEGADO AINDA ATIVO' : '✅ VAZIO'}`);

  const legacyComboCount = await prisma.productCombo.count({ where: { tenantId: TENANT_ID } });
  console.log(`  ProductCombo:           ${legacyComboCount} registros ${legacyComboCount > 0 ? '⚠️ LEGADO AINDA ATIVO' : '✅ VAZIO'}`);

  const legacyComboBlockCount = await prisma.productComboBlock.count({
    where: { combo: { tenantId: TENANT_ID } },
  });
  console.log(`  ProductComboBlock:      ${legacyComboBlockCount} registros ${legacyComboBlockCount > 0 ? '⚠️ LEGADO AINDA ATIVO' : '✅ VAZIO'}`);

  // ---- ETAPA 7 — Confirmar 5000 produtos injetados ----
  console.log('\n📊 ETAPA 7 — Verificar produtos injetados para teste de virtualização\n');
  const totalProducts = await prisma.product.count({ where: { tenantId: TENANT_ID } });
  const virtualProducts = await prisma.product.count({
    where: { tenantId: TENANT_ID, name: { startsWith: 'Virtual Test Product' } },
  });
  console.log(`  Total de produtos:          ${totalProducts}`);
  console.log(`  Produtos de teste virtual:  ${virtualProducts} ${virtualProducts >= 5000 ? '✅ OK' : '⚠️ MENOS DE 5000'}`);

  // ---- ETAPA 8 — Status dos Produtos ----
  console.log('\n📊 ETAPA 8 — Status dos produtos\n');
  const active = await prisma.product.count({ where: { tenantId: TENANT_ID, isActive: true } });
  const inactive = await prisma.product.count({ where: { tenantId: TENANT_ID, isActive: false } });
  const available = await prisma.product.count({ where: { tenantId: TENANT_ID, isAvailable: true } });
  const unavailable = await prisma.product.count({ where: { tenantId: TENANT_ID, isAvailable: false } });
  console.log(`  isActive=true:    ${active}`);
  console.log(`  isActive=false:   ${inactive}`);
  console.log(`  isAvailable=true: ${available}`);
  console.log(`  isAvailable=false:${unavailable}`);

  // ---- ETAPA 10 — Verificar Storefront (slug do tenant) ----
  console.log('\n📊 ETAPA 10 — Storefront\n');
  const tenant = await prisma.tenant.findUnique({
    where: { id: TENANT_ID },
    select: { slug: true, status: true },
  });
  console.log(`  Tenant slug: ${tenant?.slug}`);
  console.log(`  Status:      ${tenant?.status}`);
  console.log(`  Storefront URL: http://localhost:3000/${tenant?.slug}`);

  // ---- OptionGroups recentes ----
  console.log('\n📊 Últimos 5 OptionGroups criados\n');
  const recentGroups = await prisma.optionGroup.findMany({
    where: { tenantId: TENANT_ID },
    take: 5,
    orderBy: { createdAt: 'desc' },
    include: { items: true },
  });
  if (recentGroups.length === 0) {
    console.log('  Nenhum OptionGroup encontrado. ⚠️ (nenhum grupo foi criado ainda)');
  } else {
    for (const g of recentGroups) {
      console.log(`  - [${g.id}] "${g.name}" | Required=${g.isRequired} | Items=${g.items.length}`);
    }
  }

  // ---- Combos recentes ----
  console.log('\n📊 Últimos 5 Combos criados (Product type=combo)\n');
  const recentCombos = await prisma.product.findMany({
    where: { tenantId: TENANT_ID, type: 'combo' },
    take: 5,
    orderBy: { createdAt: 'desc' },
    include: { comboSlots: { include: { allowedItems: true } } },
  });
  if (recentCombos.length === 0) {
    console.log('  Nenhum combo encontrado.');
  } else {
    for (const c of recentCombos) {
      console.log(`  - [${c.id}] "${c.name}" | Slots=${c.comboSlots.length}`);
    }
  }

  console.log('\n======================================================');
  console.log('  AUDITORIA CONCLUÍDA');
  console.log('======================================================\n');
}

main().finally(() => prisma.$disconnect());
