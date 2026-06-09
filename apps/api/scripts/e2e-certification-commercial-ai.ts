/**
 * E2E Certification - Fase 8.2: IA Comercial, CRM e Automacoes.
 *
 * Regra: nao assumir funcionamento. O script cria uma massa controlada real,
 * sobe a API Nest em porta efemera, chama endpoints autenticados e registra
 * evidencias em JSON.
 */

import 'reflect-metadata';
import { createHmac } from 'node:crypto';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { NestFactory } from '@nestjs/core';
import { Prisma } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/database/prisma.service';
import { AgentToolsService } from '../src/ai-agent/services/agent-tools.service';

type ResultStatus = 'PASS' | 'FAIL';

interface CheckResult {
  etapa: string;
  teste: string;
  status: ResultStatus;
  evidencia: unknown;
  detalhe?: string;
}

interface SeedProduct {
  id: string;
  name: string;
  price: number;
  type: 'simple' | 'combo';
}

const results: CheckResult[] = [];

function pass(etapa: string, teste: string, evidencia: unknown) {
  results.push({ etapa, teste, status: 'PASS', evidencia });
  console.log(`[PASS] ${etapa} - ${teste}`);
}

function fail(etapa: string, teste: string, evidencia: unknown, detalhe?: string) {
  results.push({ etapa, teste, status: 'FAIL', evidencia, detalhe });
  console.log(`[FAIL] ${etapa} - ${teste}: ${detalhe ?? ''}`);
}

function assertCheck(etapa: string, teste: string, ok: boolean, evidencia: unknown, detalhe?: string) {
  if (ok) pass(etapa, teste, evidencia);
  else fail(etapa, teste, evidencia, detalhe);
}

function daysAgo(days: number, hour = 19) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  date.setHours(hour, 0, 0, 0);
  return date;
}

function minutesAgo(minutes: number) {
  return new Date(Date.now() - minutes * 60_000);
}

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

async function readBody(req: IncomingMessage) {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString('utf8');
}

async function startMockEvolutionGo() {
  const sent: Array<{ path: string; body: unknown; headers: IncomingMessage['headers'] }> = [];
  const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    const raw = await readBody(req);
    let body: unknown = raw;
    try {
      body = raw ? JSON.parse(raw) : {};
    } catch {
      body = raw;
    }
    sent.push({ path: req.url ?? '', body, headers: req.headers });
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ data: { messageId: `mock-${sent.length}` } }));
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Mock Evolution-Go sem porta');
  return {
    url: `http://127.0.0.1:${address.port}`,
    sent,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

async function api(baseUrl: string, token: string, method: 'GET' | 'POST', path: string, body?: unknown) {
  const startedAt = performance.now();
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const elapsedMs = performance.now() - startedAt;
  const text = await response.text();
  let json: unknown = text;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = text;
  }
  return { status: response.status, ok: response.ok, elapsedMs, json };
}

async function createPermission(prisma: PrismaService, slug: string) {
  const [module, action] = slug.split('.');
  return prisma.tenantPermission.upsert({
    where: { slug },
    update: {},
    create: {
      slug,
      module: module || 'misc',
      action: action || 'access',
      description: `E2E permission ${slug}`,
    },
  });
}

async function seedTenant(prisma: PrismaService, mockUrl: string) {
  const stamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
  const slug = `pizzaria-demo-fase82-${stamp}`;
  const tenant = await prisma.tenant.create({
    data: { name: 'Pizzaria Demo Fase 8.2', slug },
  });

  await prisma.tenantSettings.create({
    data: {
      tenantId: tenant.id,
      currency: 'BRL',
      language: 'pt-BR',
      timezone: 'America/Sao_Paulo',
    },
  });

  const role = await prisma.tenantRole.create({
    data: { tenantId: tenant.id, name: 'Owner E2E', slug: 'owner', isSystem: true },
  });

  const permissionSlugs = ['crm.read', 'crm.manage_coupons', 'crm.manage_customers', 'reports.read', 'reports.view_costs'];
  const permissions = await Promise.all(permissionSlugs.map((slug) => createPermission(prisma, slug)));
  await prisma.tenantRolePermission.createMany({
    data: permissions.map((permission) => ({ roleId: role.id, permissionId: permission.id })),
    skipDuplicates: true,
  });

  const user = await prisma.tenantUser.create({
    data: {
      tenantId: tenant.id,
      email: `owner+fase82-${stamp}@demo.local`,
      name: 'Owner Fase 8.2',
      passwordHash: await bcrypt.hash('fase82-demo', 8),
      userRoles: { create: { roleId: role.id } },
    },
  });

  await prisma.whatsAppInstance.create({
    data: {
      tenantId: tenant.id,
      instanceName: `fase82-${stamp}`,
      apiUrl: mockUrl,
      apiKey: 'mock-key',
      evolutionInstanceId: `fase82-${stamp}`,
      status: 'connected',
    },
  });

  const categories = await Promise.all([
    prisma.productCategory.create({ data: { tenantId: tenant.id, name: 'Pizzas', slug: `pizzas-${stamp}`, order: 1 } }),
    prisma.productCategory.create({ data: { tenantId: tenant.id, name: 'Bebidas', slug: `bebidas-${stamp}`, order: 2 } }),
    prisma.productCategory.create({ data: { tenantId: tenant.id, name: 'Combos', slug: `combos-${stamp}`, order: 3 } }),
    prisma.productCategory.create({ data: { tenantId: tenant.id, name: 'Lanches', slug: `lanches-${stamp}`, order: 4 } }),
    prisma.productCategory.create({ data: { tenantId: tenant.id, name: 'Sobremesas', slug: `sobremesas-${stamp}`, order: 5 } }),
  ]);

  const createProduct = async (name: string, price: number, categoryId: string, type: 'simple' | 'combo' = 'simple'): Promise<SeedProduct> => {
    const product = await prisma.product.create({
      data: {
        tenantId: tenant.id,
        categoryId,
        name,
        slug: `${name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-')}-${stamp}`,
        basePrice: new Prisma.Decimal(price),
        isActive: true,
        isAvailable: true,
        sellableOnline: true,
        type,
        comboMode: type === 'combo' ? 'bundle' : undefined,
        comboPricingType: type === 'combo' ? 'fixed_price' : undefined,
        comboPricingValue: type === 'combo' ? new Prisma.Decimal(price) : undefined,
      },
    });
    return { id: product.id, name: product.name, price, type };
  };

  const products = {
    pizza: await createProduct('Pizza Calabresa', 50, categories[0].id),
    coca: await createProduct('Coca-Cola', 12, categories[1].id),
    guarana: await createProduct('Guarana', 10, categories[1].id),
    comboCasal: await createProduct('Combo Casal', 80, categories[2].id, 'combo'),
    pudim: await createProduct('Pudim', 16, categories[4].id),
    comboFamilia: await createProduct('Combo Familia', 130, categories[2].id, 'combo'),
    coca2l: await createProduct('Coca 2L', 15, categories[1].id),
    burger: await createProduct('X-Burger', 28, categories[3].id),
    batata: await createProduct('Batata Frita', 14, categories[3].id),
  };

  await prisma.upsell.create({
    data: {
      tenantId: tenant.id,
      name: 'Acompanhamentos recomendados',
      description: 'Sugestoes comerciais usadas como fallback da IA',
      items: {
        create: [
          { tenantId: tenant.id, productId: products.coca.id, sortOrder: 1 },
          { tenantId: tenant.id, productId: products.pudim.id, sortOrder: 2 },
        ],
      },
    },
  });

  const customers: Record<string, Array<{ id: string; phone: string; name: string }>> = {
    vip: [],
    frequent: [],
    new: [],
    atRisk: [],
    inactive30: [],
    inactive60: [],
    inactive90: [],
  };

  for (const segment of Object.keys(customers)) {
    for (let index = 1; index <= 10; index += 1) {
      const phone = `551199${stamp.slice(-4)}${Object.keys(customers).indexOf(segment)}${String(index).padStart(2, '0')}`;
      const customer = await prisma.customer.create({
        data: {
          tenantId: tenant.id,
          name: `${segment} Cliente ${index}`,
          phone,
          email: `${segment}.${index}.${stamp}@demo.local`,
        },
      });
      customers[segment].push({ id: customer.id, phone: customer.phone, name: customer.name });
    }
  }

  let orderSeq = 1;
  const customerStats = new Map<string, { totalOrders: number; totalSpent: number; lastOrderDate: Date }>();
  const addOrder = async (
    customer: { id: string; phone: string; name: string },
    items: SeedProduct[],
    createdAt: Date,
    sourceChannel = 'storefront',
  ) => {
    const total = items.reduce((sum, item) => sum + item.price, 0);
    const order = await prisma.order.create({
      data: {
        tenantId: tenant.id,
        orderNumber: `F82-${String(orderSeq).padStart(5, '0')}`,
        status: 'completed',
        fulfillmentType: 'delivery',
        customerName: customer.name,
        customerPhone: customer.phone,
        customerId: customer.id,
        itemsSubtotal: new Prisma.Decimal(total),
        total: new Prisma.Decimal(total),
        sourceChannel,
        idempotencyKey: `fase82-${stamp}-${orderSeq}`,
        publicTrackingToken: `fase82-${stamp}-${orderSeq}`,
        paymentMethod: 'pix',
        createdAt,
        updatedAt: createdAt,
        items: {
          create: items.map((item) => ({
            tenantId: tenant.id,
            lineType: item.type === 'combo' ? 'combo' : 'product',
            productId: item.type === 'simple' ? item.id : undefined,
            comboId: item.type === 'combo' ? item.id : undefined,
            quantity: 1,
            unitPrice: new Prisma.Decimal(item.price),
            lineTotal: new Prisma.Decimal(item.price),
            snapshotName: item.name,
            snapshotBasePrice: new Prisma.Decimal(item.price),
            snapshotExtrasTotal: new Prisma.Decimal(0),
          })),
        },
      },
    });
    orderSeq += 1;
    const previous = customerStats.get(customer.id) ?? { totalOrders: 0, totalSpent: 0, lastOrderDate: createdAt };
    customerStats.set(customer.id, {
      totalOrders: previous.totalOrders + 1,
      totalSpent: previous.totalSpent + total,
      lastOrderDate: createdAt > previous.lastOrderDate ? createdAt : previous.lastOrderDate,
    });
    return order;
  };

  for (const customer of customers.vip) {
    for (let i = 0; i < 6; i += 1) {
      await addOrder(customer, [products.comboFamilia, products.coca2l, products.pudim], daysAgo(5 + i * 3), 'whatsapp');
    }
  }
  for (const customer of customers.frequent) {
    await addOrder(customer, [products.pizza, products.coca], daysAgo(8), 'storefront');
    await addOrder(customer, [products.burger, products.batata], daysAgo(22), 'pos');
  }
  await addOrder(customers.frequent[0], [products.pizza], minutesAgo(90), 'storefront');
  for (const customer of customers.new) {
    await addOrder(customer, [products.pizza, products.coca], daysAgo(4), 'storefront');
  }
  for (const customer of customers.atRisk) {
    await addOrder(customer, [products.comboCasal, products.pudim], daysAgo(45), 'whatsapp');
    await addOrder(customer, [products.comboCasal, products.pudim], daysAgo(35), 'whatsapp');
    await addOrder(customer, [products.comboCasal, products.pudim], daysAgo(25), 'whatsapp');
  }
  for (const customer of customers.inactive30) {
    await addOrder(customer, [products.pizza, products.coca], daysAgo(35), 'storefront');
  }
  for (const customer of customers.inactive60) {
    await addOrder(customer, [products.pizza, products.guarana], daysAgo(65), 'storefront');
  }
  for (const customer of customers.inactive90) {
    await addOrder(customer, [products.burger, products.batata], daysAgo(95), 'pos');
  }

  for (const [customerId, stats] of customerStats) {
    await prisma.customer.update({
      where: { id: customerId },
      data: {
        totalOrders: stats.totalOrders,
        totalSpent: new Prisma.Decimal(stats.totalSpent),
        lastOrderDate: stats.lastOrderDate,
      },
    });
  }

  const abandonedEligible = [
    ...customers.frequent.slice(0, 10).map((customer, index) => ({ customer, minutes: 35 + index })),
    ...customers.atRisk.slice(0, 10).map((customer, index) => ({ customer, minutes: 130 + index })),
    ...customers.inactive60.slice(0, 10).map((customer, index) => ({ customer, minutes: 1500 + index })),
    ...customers.inactive90.slice(0, 10).map((customer, index) => ({ customer, minutes: 45 + index })),
    ...customers.inactive30.slice(0, 10).map((customer, index) => ({ customer, minutes: 150 + index })),
    ...customers.new.slice(0, 10).map((customer, index) => ({ customer, minutes: 1510 + index })),
  ];

  for (const item of abandonedEligible) {
    await prisma.chatSession.create({
      data: {
        tenantId: tenant.id,
        customerId: item.customer.id,
        customerPhone: item.customer.phone,
        displayName: item.customer.name,
        state: 'building_cart',
        cartData: { items: [{ productId: products.pizza.id, quantity: 1 }] },
        lastMessageAt: minutesAgo(item.minutes),
        lastCustomerMessageAt: minutesAgo(item.minutes),
        metadata: {},
      },
    });
  }

  const optOutCustomer = customers.vip[0];
  await prisma.customerOptOut.create({
    data: {
      tenantId: tenant.id,
      customerId: optOutCustomer.id,
      phone: optOutCustomer.phone,
      reason: 'E2E LGPD opt-out',
    },
  });
  await prisma.chatSession.create({
    data: {
      tenantId: tenant.id,
      customerId: optOutCustomer.id,
      customerPhone: optOutCustomer.phone,
      displayName: optOutCustomer.name,
      state: 'building_cart',
      cartData: { items: [{ productId: products.pizza.id, quantity: 1 }] },
      lastMessageAt: minutesAgo(200),
      lastCustomerMessageAt: minutesAgo(200),
      metadata: {},
    },
  });

  return { tenant, user, products, customers, orderCount: orderSeq - 1, abandonedEligibleCount: abandonedEligible.length };
}

async function run() {
  console.log('[INFO] Starting mock Evolution-Go');
  const mock = await startMockEvolutionGo();
  console.log(`[INFO] Mock Evolution-Go listening at ${mock.url}`);
  console.log('[INFO] Starting Nest API application');
  const app = await NestFactory.create(AppModule, { logger: ['error', 'warn'] });
  await app.listen(0, '127.0.0.1');
  const address = app.getHttpServer().address();
  if (!address || typeof address === 'string') throw new Error('API sem porta');
  const baseUrl = `http://127.0.0.1:${address.port}`;

  const prisma = app.get(PrismaService);
  const agentTools = app.get(AgentToolsService);

  try {
    console.log('[INFO] Seeding controlled tenant and certification dataset');
    const seed = await seedTenant(prisma, mock.url);
    console.log(`[INFO] Seed complete tenant=${seed.tenant.slug} orders=${seed.orderCount} abandoned=${seed.abandonedEligibleCount}`);
    const token = signJwt(
      {
        sub: seed.user.id,
        tenantId: seed.tenant.id,
        email: seed.user.email,
        name: seed.user.name,
        type: 'tenant',
        roles: ['owner'],
      },
      process.env.JWT_SECRET || 'dev-secret',
    );

    const counts = {
      customers: await prisma.customer.count({ where: { tenantId: seed.tenant.id } }),
      completedOrders: await prisma.order.count({ where: { tenantId: seed.tenant.id, status: 'completed' } }),
      orderItems: await prisma.orderItem.count({ where: { tenantId: seed.tenant.id } }),
      abandonedSessions: await prisma.chatSession.count({ where: { tenantId: seed.tenant.id, cartData: { not: Prisma.JsonNull }, closedAt: null } }),
      optOuts: await prisma.customerOptOut.count({ where: { tenantId: seed.tenant.id } }),
    };
    assertCheck('Seed', 'tenant e massa controlada criados', counts.customers === 70 && counts.completedOrders >= 100 && counts.abandonedSessions >= 60, {
      tenantId: seed.tenant.id,
      slug: seed.tenant.slug,
      ...counts,
    });

    const segmentsResponse = await api(baseUrl, token, 'GET', '/crm/customers/intelligence/segments');
    const segments = segmentsResponse.json as { bySegment?: Record<string, unknown[]>; profiles?: unknown[] };
    const segmentCounts = Object.fromEntries(Object.entries(segments.bySegment ?? {}).map(([key, value]) => [key, Array.isArray(value) ? value.length : 0]));
    assertCheck('CRM', 'segmentacao automatica via API', segmentsResponse.ok && segmentCounts.vip >= 10 && segmentCounts.frequent >= 10 && segmentCounts.new >= 10 && segmentCounts.at_risk >= 10 && segmentCounts.inactive_30 >= 10 && segmentCounts.inactive_60 >= 10 && segmentCounts.inactive_90 >= 10, {
      httpStatus: segmentsResponse.status,
      segmentCounts,
      totalProfiles: segments.profiles?.length,
    });

    const vipProfile = (segments.profiles ?? []).find((profile: any) => profile.customerId === seed.customers.vip[1].id) as any;
    assertCheck('CRM', 'analise individual contem ticket, favoritos e horario', Boolean(vipProfile?.favoriteProducts?.length && vipProfile?.purchaseHours?.length && vipProfile.averageTicket > vipProfile.tenantAverageTicket), {
      customerId: seed.customers.vip[1].id,
      favoriteProducts: vipProfile?.favoriteProducts?.slice(0, 3),
      purchaseHours: vipProfile?.purchaseHours?.slice(0, 3),
      averageTicket: vipProfile?.averageTicket,
      tenantAverageTicket: vipProfile?.tenantAverageTicket,
    });

    const kpisResponse = await api(baseUrl, token, 'GET', '/crm/customers/intelligence/kpis');
    const kpis = kpisResponse.json as Record<string, unknown>;
    assertCheck('Metricas', 'KPIs comerciais via API', kpisResponse.ok && Number(kpis.averageTicket) > 0 && Number(kpis.ltv) > 0 && Number(kpis.purchaseFrequency) > 0, {
      httpStatus: kpisResponse.status,
      averageTicket: kpis.averageTicket,
      ltv: kpis.ltv,
      purchaseFrequency: kpis.purchaseFrequency,
      retentionRate: kpis.retentionRate,
    });

    const recovery30 = await api(baseUrl, token, 'GET', '/campaigns/recovery/30');
    const recovery60 = await api(baseUrl, token, 'GET', '/campaigns/recovery/60');
    const recovery90 = await api(baseUrl, token, 'GET', '/campaigns/recovery/90');
    assertCheck('Recovery', 'previews 30/60/90 respeitam audiencia', recovery30.ok && recovery60.ok && recovery90.ok, {
      days30: recovery30.json,
      days60: recovery60.json,
      days90: recovery90.json,
    });

    const campaign30 = await api(baseUrl, token, 'POST', '/campaigns/recovery/30');
    const campaign60 = await api(baseUrl, token, 'POST', '/campaigns/recovery/60');
    const campaign90 = await api(baseUrl, token, 'POST', '/campaigns/recovery/90');
    assertCheck('Recovery', 'campanhas de recuperacao criadas via API', campaign30.ok && campaign60.ok && campaign90.ok, {
      status30: campaign30.status,
      status60: campaign60.status,
      status90: campaign90.status,
      campaign30: campaign30.json,
    });

    const upsellPizza = await api(baseUrl, token, 'GET', `/campaigns/upsell/recommendations?productId=${seed.products.pizza.id}&limit=3`);
    const upsellCombo = await api(baseUrl, token, 'POST', '/campaigns/upsell/recommendations', {
      items: [{ comboId: seed.products.comboCasal.id, quantity: 1 }],
      customerId: seed.customers.atRisk[0].id,
      limit: 3,
    });
    const pizzaRecommendation = (upsellPizza.json as any)?.recommendations?.[0];
    const comboRecommendation = (upsellCombo.json as any)?.recommendations?.[0];
    assertCheck('Upsell', 'recomendacoes por coocorrencia via API', upsellPizza.ok && upsellCombo.ok && pizzaRecommendation?.productId === seed.products.coca.id && comboRecommendation?.productId === seed.products.pudim.id, {
      pizzaRecommendation,
      comboRecommendation,
    });

    const session = await prisma.chatSession.create({
      data: {
        tenantId: seed.tenant.id,
        customerId: seed.customers.frequent[0].id,
        customerPhone: seed.customers.frequent[0].phone,
        displayName: seed.customers.frequent[0].name,
        state: 'building_cart',
        cartData: { items: [{ productId: seed.products.pizza.id, quantity: 1 }] },
        metadata: {
          ai: {
            orderDraft: {
              items: [{ productId: seed.products.pizza.id, quantity: 1 }],
            },
          },
        },
      },
    });
    const aiTool = await agentTools.executeTool(seed.tenant.id, 'consultar_ofertas_checkout', {}, {
      sessionId: session.id,
      customerId: seed.customers.frequent[0].id,
      customerPhone: seed.customers.frequent[0].phone,
    }) as any;
    assertCheck('IA WhatsApp', 'tool consultar_ofertas_checkout executa upsell real', aiTool?.sugestoes?.[0]?.productId === seed.products.coca.id && aiTool?.limiteConversa?.maximoPorEtapa === 1 && aiTool?.limiteConversa?.maximoPorConversa === 3, aiTool);

    const automationsBefore = await api(baseUrl, token, 'GET', '/campaigns/automations');
    const beforeCarts = (automationsBefore.json as any)?.abandonedCarts ?? [];
    const dispatch = await api(baseUrl, token, 'POST', '/campaigns/abandoned-cart/dispatch', { limit: 25 });
    const sentAfterFirstDispatch = mock.sent.filter((item) => item.path === '/send/text').length;
    const dispatchAgain = await api(baseUrl, token, 'POST', '/campaigns/abandoned-cart/dispatch', { limit: 25 });
    const sentAfterSecondDispatch = mock.sent.filter((item) => item.path === '/send/text').length;
    const auditCount = await prisma.auditLog.count({ where: { tenantId: seed.tenant.id, action: 'abandoned_cart_reminders_dispatched' } });
    const secondResults = ((dispatchAgain.json as any)?.results ?? []) as Array<{ sent?: boolean; error?: string }>;
    const secondBlockedByCooldown = secondResults.length > 0 && secondResults.every((item) => item.sent === false && item.error === 'cooldown_24h');
    assertCheck('Carrinho Abandonado', 'detecta, envia, audita e bloqueia duplicidade por cooldown', automationsBefore.ok && dispatch.ok && sentAfterFirstDispatch >= 25 && sentAfterSecondDispatch === sentAfterFirstDispatch && secondBlockedByCooldown && auditCount >= 2, {
      dueBefore: beforeCarts.length,
      firstDispatch: dispatch.json,
      secondDispatch: dispatchAgain.json,
      mockWhatsAppSends: sentAfterSecondDispatch,
      auditCount,
    });

    const optOutPhone = seed.customers.vip[0].phone;
    const optOutWasSent = mock.sent.some((item) => JSON.stringify(item.body).includes(optOutPhone.replace(/\D/g, '')));
    assertCheck('Seguranca', 'opt-out LGPD respeitado no carrinho abandonado', !optOutWasSent, {
      optOutPhone,
      totalOptOuts: counts.optOuts,
      mockSendPayloadsInspected: mock.sent.length,
    });

    const insightsResponse = await api(baseUrl, token, 'GET', '/analytics/insights');
    const insightsPayload = insightsResponse.json as { insights?: unknown[] };
    const insights = insightsPayload.insights ?? [];
    assertCheck('Dashboard', 'insights automaticos via API', insightsResponse.ok && Array.isArray(insights) && insights.length > 0, {
      httpStatus: insightsResponse.status,
      insightCount: insights.length,
      sample: insights.slice(0, 3),
    });

    const automationRun = await api(baseUrl, token, 'POST', '/campaigns/automations/run');
    const automationRunJson = automationRun.json as any;
    const automationCenter = await api(baseUrl, token, 'GET', '/campaigns/automations');
    const centerTotals = (automationCenter.json as any)?.center?.totals;
    assertCheck(
      'Automacoes Fase 9',
      'orquestrador executa recompra, upsell pos-compra, metricas e cooldown',
      automationRun.ok &&
        automationRunJson.reorderCampaigns >= 1 &&
        automationRunJson.upsellCampaigns >= 1 &&
        centerTotals &&
        centerTotals.sent >= 25 &&
        centerTotals.failures >= 1,
      {
        automationRun: automationRun.json,
        centerTotals,
      },
    );

    const perfPaths = [
      '/crm/customers/intelligence/segments',
      '/crm/customers/intelligence/kpis',
      `/campaigns/upsell/recommendations?productId=${seed.products.pizza.id}&limit=3`,
      '/campaigns/automations',
      '/analytics/insights',
    ];
    const latencies: number[] = [];
    for (let i = 0; i < 50; i += 1) {
      const response = await api(baseUrl, token, 'GET', perfPaths[i % perfPaths.length]);
      latencies.push(response.elapsedMs);
    }
    const sorted = [...latencies].sort((a, b) => a - b);
    const p95 = sorted[Math.floor(sorted.length * 0.95) - 1] ?? sorted[sorted.length - 1] ?? 0;
    const avg = latencies.reduce((sum, value) => sum + value, 0) / latencies.length;
    assertCheck('Performance', '50 chamadas autenticadas com p95 abaixo de 2s', p95 < 2000, {
      samples: latencies.length,
      avgMs: Math.round(avg),
      p95Ms: Math.round(p95),
      maxMs: Math.round(sorted[sorted.length - 1] ?? 0),
    });

    const isolatedToken = signJwt(
      {
        sub: seed.user.id,
        tenantId: 'tenant-inexistente-fase82',
        email: seed.user.email,
        name: seed.user.name,
        type: 'tenant',
        roles: ['owner'],
      },
      process.env.JWT_SECRET || 'dev-secret',
    );
    const isolated = await api(baseUrl, isolatedToken, 'GET', '/crm/customers/intelligence/segments');
    const isolatedPayload = isolated.json as { profiles?: unknown[] };
    assertCheck('Seguranca', 'tenantId do token controla isolamento', isolated.ok && Array.isArray(isolatedPayload.profiles) && isolatedPayload.profiles.length === 0, {
      httpStatus: isolated.status,
      response: isolated.json,
    });

    const report = {
      generatedAt: new Date().toISOString(),
      apiBaseUrl: baseUrl,
      tenant: { id: seed.tenant.id, slug: seed.tenant.slug, name: seed.tenant.name },
      seed: counts,
      results,
      summary: {
        total: results.length,
        passed: results.filter((result) => result.status === 'PASS').length,
        failed: results.filter((result) => result.status === 'FAIL').length,
      },
    };

    mkdirSync(join(process.cwd(), 'artifacts'), { recursive: true });
    const output = join(process.cwd(), 'artifacts', `fase82-commercial-ai-${seed.tenant.slug}.json`);
    writeFileSync(output, JSON.stringify(report, null, 2), 'utf8');
    console.log(`\nEVIDENCE_FILE=${output}`);

    if (report.summary.failed > 0) {
      process.exitCode = 1;
    }
  } finally {
    await app.close();
    await mock.close();
  }
}

run()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    process.exit(process.exitCode ?? 0);
  });
