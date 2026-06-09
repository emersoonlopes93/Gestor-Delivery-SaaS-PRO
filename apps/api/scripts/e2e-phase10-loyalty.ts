import 'reflect-metadata';
import { createHmac } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import * as bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';
import { PrismaService } from '../src/database/prisma.service';

type Status = 'PASS' | 'FAIL';
const results: Array<{ etapa: string; teste: string; status: Status; evidencia: unknown; detalhe?: string }> = [];

function base64url(input: Buffer | string) {
  return Buffer.from(input).toString('base64url');
}

function signJwt(payload: Record<string, unknown>, secret: string) {
  const header = { alg: 'HS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const body = { ...payload, iat: now, exp: now + 60 * 60 };
  const unsigned = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(body))}`;
  const signature = createHmac('sha256', secret).update(unsigned).digest('base64url');
  return `${unsigned}.${signature}`;
}

function assertCheck(etapa: string, teste: string, ok: boolean, evidencia: unknown, detalhe?: string) {
  results.push({ etapa, teste, status: ok ? 'PASS' : 'FAIL', evidencia, detalhe });
  console.log(`[${ok ? 'PASS' : 'FAIL'}] ${etapa} - ${teste}${ok ? '' : `: ${detalhe ?? ''}`}`);
}

async function createPermission(prisma: PrismaService, slug: string) {
  const [module, action] = slug.split('.');
  return prisma.tenantPermission.upsert({
    where: { slug },
    update: {},
    create: { slug, module: module || 'misc', action: action || 'access', description: `Phase 10 ${slug}` },
  });
}

async function api(baseUrl: string, token: string, method: string, path: string, body?: unknown) {
  const start = Date.now();
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await response.json().catch(() => null);
  return { ok: response.ok, status: response.status, json, ms: Date.now() - start };
}

async function seed(prisma: PrismaService) {
  const stamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
  const tenant = await prisma.tenant.create({ data: { name: 'Fase 10 Retencao', slug: `fase10-${stamp}` } });
  await prisma.tenantSettings.create({
    data: {
      tenantId: tenant.id,
      loyaltyEnabled: true,
      loyaltyPointsPerReal: 2,
      cashbackEnabled: true,
      cashbackPercent: 10,
      cashbackValidityDays: 30,
      gamificationEnabled: true,
    },
  });

  const role = await prisma.tenantRole.create({ data: { tenantId: tenant.id, name: 'Owner Fase 10', slug: 'owner', isSystem: true } });
  const permissionSlugs = ['crm.read', 'crm.manage_coupons', 'crm.manage_customers', 'crm.manage_loyalty_cashback', 'reports.read'];
  const permissions = await Promise.all(permissionSlugs.map((slug) => createPermission(prisma, slug)));
  await prisma.tenantRolePermission.createMany({ data: permissions.map((permission) => ({ roleId: role.id, permissionId: permission.id })) });
  const user = await prisma.tenantUser.create({
    data: {
      tenantId: tenant.id,
      email: `owner+fase10-${stamp}@demo.local`,
      name: 'Owner Fase 10',
      passwordHash: await bcrypt.hash('fase10', 8),
      userRoles: { create: { roleId: role.id } },
    },
  });

  const customer = await prisma.customer.create({
    data: {
      tenantId: tenant.id,
      name: 'Cliente Retencao',
      phone: `551198${stamp.slice(-6)}`,
      email: `cliente.${stamp}@demo.local`,
      birthDate: new Date('1990-06-09T00:00:00.000Z'),
      totalOrders: 1,
      totalSpent: 120,
      lastOrderDate: new Date(),
    },
  });

  const order = await prisma.order.create({
    data: {
      tenantId: tenant.id,
      orderNumber: 'F10-0001',
      status: 'completed',
      fulfillmentType: 'delivery',
      customerName: customer.name,
      customerPhone: customer.phone,
      customerEmail: customer.email,
      customerId: customer.id,
      itemsSubtotal: 120,
      total: 120,
      sourceChannel: 'storefront',
      idempotencyKey: `fase10-${stamp}`,
      publicTrackingToken: `fase10-${stamp}`,
      paymentMethod: 'pix',
    },
  });

  const otherTenant = await prisma.tenant.create({ data: { name: 'Fase 10 Outro Tenant', slug: `fase10-other-${stamp}` } });
  await prisma.tenantSettings.create({ data: { tenantId: otherTenant.id } });
  const otherCustomer = await prisma.customer.create({
    data: { tenantId: otherTenant.id, name: 'Cliente Isolado', phone: `551197${stamp.slice(-6)}` },
  });

  return { tenant, user, customer, order, otherTenant, otherCustomer };
}

async function run() {
  console.log('[INFO] Phase 10 E2E bootstrap');
  const prisma = new PrismaClient() as unknown as PrismaService;
  await prisma.$connect();
  const { LoyaltyService } = await import('../src/promotions/loyalty.service');
  const { CashbackService } = await import('../src/promotions/cashback.service');
  const { WalletService } = await import('../src/promotions/wallet.service');
  const { CouponsService } = await import('../src/promotions/coupons.service');
  const { CustomerIntelligenceService } = await import('../src/crm/customer-intelligence.service');
  const { BusinessInsightsService } = await import('../src/analytics/business-insights.service');
  const loyalty = new LoyaltyService(prisma);
  const cashback = new CashbackService(prisma);
  const wallet = new WalletService(prisma, cashback);
  const coupons = new CouponsService(prisma);
  const intelligence = new CustomerIntelligenceService(prisma);
  const insights = new BusinessInsightsService(prisma);

  try {
    console.log('[INFO] Seeding phase 10 data');
    const seedData = await seed(prisma);
    console.log(`[INFO] Seed complete tenant=${seedData.tenant.slug}`);
    signJwt({ sub: seedData.user.id, tenantId: seedData.tenant.id, type: 'tenant', roles: ['owner'] }, process.env.JWT_SECRET || 'dev-secret');

    const earnedPoints = await loyalty.awardForOrder(seedData.tenant.id, seedData.order.id);
    const loyaltySummary = await loyalty.getSummary(seedData.tenant.id, seedData.customer.id);
    const redeemed = await loyalty.redeem(seedData.tenant.id, seedData.customer.id, 40, 'Resgate E2E');
    assertCheck('Fidelidade', 'acumular e resgatar pontos', !!earnedPoints && loyaltySummary.balance === 240 && redeemed.points === 40, {
      earnedPoints,
      balanceBeforeRedeem: loyaltySummary.balance,
      redeemed,
    });

    const earnedCashback = await cashback.earnForOrder(seedData.tenant.id, seedData.order.id);
    const balanceAfterEarn = await cashback.getCashbackBalance(seedData.tenant.id, seedData.customer.id);
    const usedCashback = await cashback.createTransaction({
      tenantId: seedData.tenant.id,
      customerId: seedData.customer.id,
      type: 'used',
      amount: 5,
      description: 'Uso no checkout E2E',
    });
    assertCheck('Cashback', 'gerar saldo e utilizar saldo', !!earnedCashback && balanceAfterEarn === 12 && usedCashback.amount === 5, {
      earnedCashback,
      balanceAfterEarn,
      usedCashback,
    });

    const walletCredit = await wallet.createTransaction({
      tenantId: seedData.tenant.id,
      customerId: seedData.customer.id,
      type: 'credit',
      amount: 20,
      source: 'manual_bonus',
      description: 'Bonus E2E',
    });
    const walletDebit = await wallet.createTransaction({
      tenantId: seedData.tenant.id,
      customerId: seedData.customer.id,
      type: 'debit',
      amount: 7,
      source: 'checkout',
      description: 'Debito E2E',
    });
    const walletSummary = await wallet.getWallet(seedData.tenant.id, seedData.customer.id);
    assertCheck('Wallet', 'credito e debito promocional', walletCredit.amount === 20 && walletDebit.amount === 7 && walletSummary.promotionalCredits === 13, {
      walletSummary,
    });

    const coupon = await coupons.createCoupon(seedData.tenant.id, { code: 'FASE10', type: 'percentage', value: 10, isActive: true });
    const couponValidation = await coupons.validateCouponForTotal(seedData.tenant.id, 'FASE10', 100);
    assertCheck('Cupons', 'emissao e uso validado', coupon.code === 'FASE10' && couponValidation.discountAmount === 10, {
      coupon,
      couponValidation,
    });

    const [profile, walletDirect, loyaltyDirect, availableCoupons, orders] = await Promise.all([
      prisma.customer.findUnique({ where: { id: seedData.customer.id, tenantId: seedData.tenant.id } }),
      wallet.getWallet(seedData.tenant.id, seedData.customer.id),
      loyalty.getSummary(seedData.tenant.id, seedData.customer.id),
      coupons.listCoupons(seedData.tenant.id),
      prisma.order.findMany({ where: { tenantId: seedData.tenant.id, customerId: seedData.customer.id } }),
    ]);
    assertCheck('Area do Cliente', 'perfil, pontos, cashback, cupons e historico', !!profile && walletDirect.cashbackBalance === 7 && loyaltyDirect.balance === 200 && availableCoupons.length >= 1 && orders.length >= 1, {
      profile,
      wallet: walletDirect,
      loyalty: loyaltyDirect,
      coupons: availableCoupons,
      orders: orders.length,
    });

    const [segments, retention, generatedInsights] = await Promise.all([
      intelligence.getSegments(seedData.tenant.id),
      insights.getRetentionDashboard(seedData.tenant.id),
      insights.generateInsights(seedData.tenant.id),
    ]);
    const aiSuggestions = [
      segments.bySegment.vip.length ? 'Beneficio para cliente VIP' : null,
      retention.retentionRate < 1 ? 'Campanha de recompra' : null,
      generatedInsights.insights.length ? 'Cupom baseado em insights comerciais' : null,
    ].filter(Boolean);
    assertCheck('IA Comercial', 'recomendacoes reais e dashboard de retencao', aiSuggestions.length >= 1 && retention.ltv > 0, {
      aiSuggestions,
      retention,
      generatedInsights,
    });

    const isolated = await loyalty.getSummary(seedData.tenant.id, seedData.otherCustomer.id).then(() => true).catch(() => false);
    assertCheck('Seguranca', 'isolamento de tenant, wallet, cashback e loyalty', isolated === false, {
      tenantId: seedData.tenant.id,
      otherCustomerTenantId: seedData.otherTenant.id,
      isolated,
    });

    const latencies: number[] = [];
    for (let i = 0; i < 50; i += 1) {
      const start = Date.now();
      if (i % 2 === 0) await loyalty.getSummary(seedData.tenant.id, seedData.customer.id);
      else await wallet.getWallet(seedData.tenant.id, seedData.customer.id);
      latencies.push(Date.now() - start);
    }
    const sorted = [...latencies].sort((a, b) => a - b);
    const p95 = sorted[Math.floor(sorted.length * 0.95)];
    assertCheck('Performance', 'P95 abaixo de 2s', p95 < 2000, { samples: latencies.length, p95Ms: p95, maxMs: sorted[sorted.length - 1] });

    const artifact = {
      generatedAt: new Date().toISOString(),
      tenant: { id: seedData.tenant.id, slug: seedData.tenant.slug },
      summary: { total: results.length, passed: results.filter((r) => r.status === 'PASS').length, failed: results.filter((r) => r.status === 'FAIL').length },
      results,
    };
    mkdirSync(join(process.cwd(), 'artifacts'), { recursive: true });
    const artifactPath = join(process.cwd(), 'artifacts', `fase10-loyalty-${seedData.tenant.slug}.json`);
    writeFileSync(artifactPath, JSON.stringify(artifact, null, 2));
    console.log(`EVIDENCE_FILE=${artifactPath}`);
    if (artifact.summary.failed > 0) process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
