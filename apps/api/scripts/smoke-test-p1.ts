import 'reflect-metadata';
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const API = process.env.SMOKE_API_BASE_URL ?? 'http://localhost:3333/api/v1';
const TENANT_A_SLUG = process.env.SMOKE_TENANT_SLUG ?? 'pizzaria-demo';
const TENANT_A_EMAIL = process.env.SMOKE_TENANT_EMAIL ?? 'demo@demo.com';
const TENANT_A_PASSWORD = process.env.SMOKE_TENANT_PASSWORD ?? 'demo123';
const TENANT_B_SLUG = 'smoke-tenant-b';
const TENANT_B_EMAIL = 'smoke-b@demo.com';
const TENANT_B_PASSWORD = 'smoke123';
const RESTRICTED_EMAIL = 'smoke-restricted@demo.com';
const RESTRICTED_PASSWORD = 'smoke123';

type TestResult = {
  name: string;
  passed: boolean;
  detail: string;
};

type ApiResult = {
  status: number;
  data: unknown;
  raw: unknown;
};

const prisma = new PrismaClient();
const results: TestResult[] = [];

function record(name: string, passed: boolean, detail: string, payload?: unknown) {
  const suffix = payload === undefined ? '' : ` | Payload: ${JSON.stringify(payload).slice(0, 700)}`;
  results.push({ name, passed, detail: `${detail}${suffix}` });
  process.stdout.write(`${passed ? 'OK ' : 'ERR'} ${name}${passed ? '' : `: ${detail}${suffix}`}\n`);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function pickString(value: unknown, key: string): string | null {
  const field = asRecord(value)?.[key];
  return typeof field === 'string' ? field : null;
}

function pickNumber(value: unknown, key: string): number | null {
  const field = asRecord(value)?.[key];
  return typeof field === 'number' ? field : null;
}

async function api(method: string, path: string, body?: unknown, token?: string): Promise<ApiResult> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;

  let response: Response;
  try {
    response = await fetch(`${API}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`API offline ou inacessivel em ${API}. Suba a API antes de rodar pnpm smoke:p1. Detalhe: ${message}`);
  }

  const raw: unknown = await response.json().catch(() => ({}));
  const rawRecord = asRecord(raw);
  const data = rawRecord && 'success' in rawRecord && 'data' in rawRecord ? rawRecord.data : raw;
  return { status: response.status, data, raw };
}

async function login(email: string, password: string, tenantSlug: string): Promise<string> {
  const response = await api('POST', '/auth/tenant/login', { email, password, tenantSlug });
  const token = pickString(response.data, 'accessToken');
  record(`login ${tenantSlug}/${email}`, response.status === 200 || response.status === 201, `status=${response.status}`, response.raw);
  record(`token ${tenantSlug}/${email}`, !!token && token.length > 20, 'accessToken presente');
  return token ?? '';
}

function firstSimpleProduct(storefront: unknown): { productId: string | null; productName: string | null } {
  const categories = asArray(asRecord(storefront)?.categories);
  for (const category of categories) {
    const products = asArray(asRecord(category)?.products);
    for (const product of products) {
      const complements = asArray(asRecord(product)?.complements);
      const hasRequiredComplements = complements.some((group) => asRecord(group)?.isRequired === true);
      if (!hasRequiredComplements) {
        return { productId: pickString(product, 'id'), productName: pickString(product, 'name') };
      }
    }
  }
  return { productId: null, productName: null };
}

function orderListContains(orderList: unknown, orderId: string): boolean {
  const listRecord = asRecord(orderList);
  const candidates = [orderList, listRecord?.items, listRecord?.orders, listRecord?.data];
  return candidates.some((candidate) => asArray(candidate).some((item) => pickString(item, 'id') === orderId));
}

async function seedSmokeTenant(slug: string, email: string, password: string): Promise<void> {
  const tenant = await prisma.tenant.upsert({
    where: { slug },
    update: { status: 'active' },
    create: { name: `Smoke ${slug}`, slug, status: 'active' },
  });

  await prisma.tenantSettings.upsert({
    where: { tenantId: tenant.id },
    update: {
      paymentMethods: ['pix', 'cash', 'credit_card'],
      isStorePaused: false,
      street: 'Av. Paulista',
      number: '1000',
      neighborhood: 'Bela Vista',
      city: 'Sao Paulo',
      state: 'SP',
      zipCode: '01310-100',
      lat: -23.5614,
      lng: -46.6559,
      pixKey: `${slug}@smoke.local`,
    },
    create: {
      tenantId: tenant.id,
      paymentMethods: ['pix', 'cash', 'credit_card'],
      street: 'Av. Paulista',
      number: '1000',
      neighborhood: 'Bela Vista',
      city: 'Sao Paulo',
      state: 'SP',
      zipCode: '01310-100',
      lat: -23.5614,
      lng: -46.6559,
      pixKey: `${slug}@smoke.local`,
    },
  });

  await prisma.deliveryCoverageConfig.upsert({
    where: { tenantId: tenant.id },
    update: {
      storeLat: -23.5614,
      storeLng: -46.6559,
      maxRadiusKm: 15,
      defaultPricePerKm: 2.5,
      minimumFee: 5,
      maximumFee: 20,
      isDeliveryEnabled: true,
    },
    create: {
      tenantId: tenant.id,
      storeLat: -23.5614,
      storeLng: -46.6559,
      maxRadiusKm: 15,
      defaultPricePerKm: 2.5,
      minimumFee: 5,
      maximumFee: 20,
      isDeliveryEnabled: true,
    },
  });

  for (let dayOfWeek = 0; dayOfWeek <= 6; dayOfWeek += 1) {
    await prisma.tenantOperatingHours.upsert({
      where: { tenantId_dayOfWeek: { tenantId: tenant.id, dayOfWeek } },
      update: { isOpen: true, openTime: '00:00', closeTime: '23:59' },
      create: { tenantId: tenant.id, dayOfWeek, isOpen: true, openTime: '00:00', closeTime: '23:59' },
    });
  }

  const role = await prisma.tenantRole.upsert({
    where: { tenantId_slug: { tenantId: tenant.id, slug: 'tenant_owner' } },
    update: { name: 'Tenant Owner' },
    create: { tenantId: tenant.id, name: 'Tenant Owner', slug: 'tenant_owner', isSystem: true },
  });

  const permissions = await prisma.tenantPermission.findMany({ select: { id: true } });
  for (const permission of permissions) {
    await prisma.tenantRolePermission.upsert({
      where: { roleId_permissionId: { roleId: role.id, permissionId: permission.id } },
      update: {},
      create: { roleId: role.id, permissionId: permission.id },
    });
  }

  const user = await prisma.tenantUser.upsert({
    where: { tenantId_email: { tenantId: tenant.id, email } },
    update: { isActive: true },
    create: {
      tenantId: tenant.id,
      email,
      name: `Owner ${slug}`,
      passwordHash: await bcrypt.hash(password, 12),
      isActive: true,
    },
  });

  await prisma.tenantUserRole.upsert({
    where: { userId_roleId: { userId: user.id, roleId: role.id } },
    update: {},
    create: { userId: user.id, roleId: role.id },
  });

  const category = await prisma.productCategory.upsert({
    where: { tenantId_slug: { tenantId: tenant.id, slug: 'smoke-produtos' } },
    update: { isActive: true },
    create: { tenantId: tenant.id, name: 'Smoke Produtos', slug: 'smoke-produtos', isActive: true },
  });

  const product = await prisma.product.upsert({
    where: { tenantId_slug: { tenantId: tenant.id, slug: 'smoke-produto' } },
    update: {
      categoryId: category.id,
      basePrice: 12,
      isActive: true,
      isAvailable: true,
      sellableOnline: true,
      deletedAt: null,
    },
    create: {
      tenantId: tenant.id,
      categoryId: category.id,
      name: 'Smoke Produto',
      slug: 'smoke-produto',
      basePrice: 12,
      isActive: true,
      isAvailable: true,
      sellableOnline: true,
    },
  });

  await prisma.catalogPublication.upsert({
    where: { productId: product.id },
    update: { publicationStatus: 'published', operationalStatus: 'active' },
    create: {
      tenantId: tenant.id,
      productId: product.id,
      publicationStatus: 'published',
      operationalStatus: 'active',
    },
  });
}

async function seedRestrictedUser(tenantId: string): Promise<void> {
  const role = await prisma.tenantRole.upsert({
    where: { tenantId_slug: { tenantId, slug: 'smoke_no_finance' } },
    update: { name: 'Smoke Sem Financeiro' },
    create: { tenantId, name: 'Smoke Sem Financeiro', slug: 'smoke_no_finance', isSystem: false },
  });

  await prisma.tenantRolePermission.deleteMany({ where: { roleId: role.id } });

  const user = await prisma.tenantUser.upsert({
    where: { tenantId_email: { tenantId, email: RESTRICTED_EMAIL } },
    update: { isActive: true },
    create: {
      tenantId,
      email: RESTRICTED_EMAIL,
      name: 'Smoke Restricted',
      passwordHash: await bcrypt.hash(RESTRICTED_PASSWORD, 12),
      isActive: true,
    },
  });

  await prisma.tenantUserRole.deleteMany({ where: { userId: user.id } });
  await prisma.tenantUserRole.create({ data: { userId: user.id, roleId: role.id } });
}

async function ensureTenantOpenForSmoke(tenantId: string): Promise<void> {
  await prisma.tenantSettings.upsert({
    where: { tenantId },
    update: {
      isStorePaused: false,
      paymentMethods: ['pix', 'cash', 'credit_card'],
      pixKey: 'pizzaria-demo@smoke.local',
      lat: -23.5614,
      lng: -46.6559,
    },
    create: {
      tenantId,
      isStorePaused: false,
      paymentMethods: ['pix', 'cash', 'credit_card'],
      pixKey: 'pizzaria-demo@smoke.local',
      lat: -23.5614,
      lng: -46.6559,
    },
  });

  await prisma.deliveryCoverageConfig.upsert({
    where: { tenantId },
    update: {
      storeLat: -23.5614,
      storeLng: -46.6559,
      maxRadiusKm: 15,
      defaultPricePerKm: 2.5,
      minimumFee: 5,
      maximumFee: 20,
      isDeliveryEnabled: true,
    },
    create: {
      tenantId,
      storeLat: -23.5614,
      storeLng: -46.6559,
      maxRadiusKm: 15,
      defaultPricePerKm: 2.5,
      minimumFee: 5,
      maximumFee: 20,
      isDeliveryEnabled: true,
    },
  });

  for (let dayOfWeek = 0; dayOfWeek <= 6; dayOfWeek += 1) {
    await prisma.tenantOperatingHours.upsert({
      where: { tenantId_dayOfWeek: { tenantId, dayOfWeek } },
      update: { isOpen: true, openTime: '00:00', closeTime: '23:59' },
      create: { tenantId, dayOfWeek, isOpen: true, openTime: '00:00', closeTime: '23:59' },
    });
  }
}

async function main() {
  process.stdout.write(`SMOKE P1 operacional\nAPI=${API}\n`);

  const tenantA = await prisma.tenant.findUnique({ where: { slug: TENANT_A_SLUG }, select: { id: true } });
  if (!tenantA) throw new Error(`Seed obrigatorio ausente: tenant ${TENANT_A_SLUG}. Rode pnpm db:seed.`);

  await ensureTenantOpenForSmoke(tenantA.id);
  await seedRestrictedUser(tenantA.id);
  await seedSmokeTenant(TENANT_B_SLUG, TENANT_B_EMAIL, TENANT_B_PASSWORD);

  const health = await api('GET', '/health');
  record('API online e health responde', health.status === 200, `status=${health.status}`, health.raw);
  record('Banco acessivel pelo health', pickString(asRecord(health.data)?.services, 'database') === 'ok', 'services.database=ok', health.raw);

  const ownerToken = await login(TENANT_A_EMAIL, TENANT_A_PASSWORD, TENANT_A_SLUG);
  const tenantBToken = await login(TENANT_B_EMAIL, TENANT_B_PASSWORD, TENANT_B_SLUG);
  const restrictedToken = await login(RESTRICTED_EMAIL, RESTRICTED_PASSWORD, TENANT_A_SLUG);

  const me = await api('GET', '/auth/tenant/me', undefined, ownerToken);
  record('/me retorna usuario autenticado', me.status === 200 && !!pickString(me.data, 'tenantId'), `status=${me.status}`, me.raw);

  const tenantMe = await api('GET', '/tenant/me', undefined, ownerToken);
  record('Tenant acessa painel/contexto', tenantMe.status === 200 && pickString(tenantMe.data, 'slug') === TENANT_A_SLUG, `status=${tenantMe.status}`, tenantMe.raw);

  const hours = await api('GET', '/tenant/operating-hours', undefined, ownerToken);
  record('Tenant carrega horarios', hours.status === 200 && asArray(hours.data).length > 0, `status=${hours.status}`, hours.raw);

  const storefront = await api('GET', `/public/storefront/${TENANT_A_SLUG}`);
  const product = firstSimpleProduct(storefront.data);
  record('Storefront publico responde com cardapio real', storefront.status === 200 && !!product.productId, `status=${storefront.status}; product=${product.productName ?? 'none'}`, storefront.raw);
  if (!product.productId) throw new Error('Storefront sem produto simples vendavel para smoke P1.');

  const invalidCheckout = await api('POST', `/orders/public-checkout/${TENANT_A_SLUG}`, {
    idempotencyKey: `smoke-invalid-${Date.now()}`,
    items: [{ lineType: 'product', productId: '00000000-0000-0000-0000-000000000000', quantity: 1, complements: [] }],
    customerName: 'Smoke Invalid',
    customerPhone: '11900000000',
    fulfillmentType: 'pickup',
    payment: { method: 'pix' },
  });
  record('Checkout invalido rejeitado pelo backend', invalidCheckout.status >= 400, `status=${invalidCheckout.status}`, invalidCheckout.raw);

  const checkout = await api('POST', `/orders/public-checkout/${TENANT_A_SLUG}`, {
    idempotencyKey: `smoke-valid-${Date.now()}`,
    items: [{ lineType: 'product', productId: product.productId, quantity: 2, complements: [] }],
    customerName: 'Smoke Cliente',
    customerPhone: '11900000001',
    fulfillmentType: 'delivery',
    deliveryAddress: {
      street: 'Rua Smoke',
      number: '123',
      neighborhood: 'Centro',
      city: 'Sao Paulo',
      state: 'SP',
      zipCode: '01001000',
      lat: -23.55,
      lng: -46.63,
    },
    payment: { method: 'pix' },
  });
  const orderId = pickString(checkout.data, 'id');
  const orderTotal = pickNumber(checkout.data, 'total');
  const deliveryFee = pickNumber(checkout.data, 'deliveryFee');
  record('Checkout valido cria pedido', (checkout.status === 200 || checkout.status === 201) && !!orderId, `status=${checkout.status}`, checkout.raw);
  record('Preco final calculado no backend', typeof orderTotal === 'number' && orderTotal > 0, `total=${String(orderTotal)}`, checkout.raw);
  record('Taxa de entrega calculada no backend', typeof deliveryFee === 'number' && deliveryFee >= 0, `deliveryFee=${String(deliveryFee)}`, checkout.raw);
  if (!orderId) throw new Error('Checkout valido nao retornou orderId.');

  const orderDetail = await api('GET', `/orders/${orderId}`, undefined, ownerToken);
  record('Pedido aparece no gestor', orderDetail.status === 200 && pickString(orderDetail.data, 'id') === orderId, `status=${orderDetail.status}`, orderDetail.raw);

  const orderList = await api('GET', '/orders?limit=50', undefined, ownerToken);
  record('Pedido aparece na lista', orderList.status === 200 && orderListContains(orderList.data, orderId), `status=${orderList.status}`, orderList.raw);

  const board = await api('GET', '/orders/operation/board', undefined, ownerToken);
  record('Kanban responde em runtime', board.status === 200, `status=${board.status}`, board.raw);

  const statusUpdate = await api('PATCH', `/orders/${orderId}/status`, { status: 'confirmed' }, ownerToken);
  record('Operador avanca status', statusUpdate.status === 200 && pickString(statusUpdate.data, 'status') === 'confirmed', `status=${statusUpdate.status}`, statusUpdate.raw);

  const cashCurrent = await api('GET', '/cash/current', undefined, ownerToken);
  const cashReady = cashCurrent.status === 200 || (await api('POST', '/cash/open', { openingAmount: 0 }, ownerToken)).status < 300;
  record('Caixa basico abre ou ja esta aberto', cashReady, `currentStatus=${cashCurrent.status}`, cashCurrent.raw);

  const posSale = await api('POST', '/pos/sales', {
    idempotencyKey: `smoke-pos-${Date.now()}`,
    items: [{ lineType: 'product', productId: product.productId, quantity: 1, complements: [] }],
    customerName: 'Smoke Balcao',
    customerPhone: '11900000002',
    fulfillmentType: 'pickup',
    paymentMethod: 'cash',
  }, ownerToken);
  const posOrderId = pickString(posSale.data, 'id');
  record('PDV cria venda real', (posSale.status === 200 || posSale.status === 201) && !!posOrderId, `status=${posSale.status}`, posSale.raw);

  const financeDenied = await api('GET', '/finance/accounts', undefined, restrictedToken);
  record('RBAC bloqueia financeiro sem permissao', financeDenied.status === 401 || financeDenied.status === 403, `status=${financeDenied.status}`, financeDenied.raw);

  const tenantBStorefront = await api('GET', `/public/storefront/${TENANT_B_SLUG}`);
  const tenantBProduct = firstSimpleProduct(tenantBStorefront.data);
  record('Storefront Tenant B isolado responde', tenantBStorefront.status === 200 && !!tenantBProduct.productId, `status=${tenantBStorefront.status}`, tenantBStorefront.raw);

  const tenantBCheckout = await api('POST', `/orders/public-checkout/${TENANT_B_SLUG}`, {
    idempotencyKey: `smoke-b-${Date.now()}`,
    items: [{ lineType: 'product', productId: tenantBProduct.productId, quantity: 1, complements: [] }],
    customerName: 'Smoke Tenant B',
    customerPhone: '11900000003',
    fulfillmentType: 'pickup',
    payment: { method: 'pix' },
  });
  const tenantBOrderId = pickString(tenantBCheckout.data, 'id');
  record('Tenant B cria pedido proprio', (tenantBCheckout.status === 200 || tenantBCheckout.status === 201) && !!tenantBOrderId, `status=${tenantBCheckout.status}`, tenantBCheckout.raw);

  if (tenantBProduct.productId) {
    const crossProduct = await api('GET', `/catalog/products/${tenantBProduct.productId}`, undefined, ownerToken);
    record('Tenant A nao acessa produto do Tenant B', crossProduct.status === 404 || crossProduct.status === 403, `status=${crossProduct.status}`, crossProduct.raw);
  }

  if (tenantBOrderId) {
    const crossOrder = await api('GET', `/orders/${tenantBOrderId}`, undefined, ownerToken);
    record('Tenant A nao acessa pedido do Tenant B', crossOrder.status === 404 || crossOrder.status === 403, `status=${crossOrder.status}`, crossOrder.raw);

    const ownOrder = await api('GET', `/orders/${tenantBOrderId}`, undefined, tenantBToken);
    record('Tenant B acessa seu proprio pedido', ownOrder.status === 200 && pickString(ownOrder.data, 'id') === tenantBOrderId, `status=${ownOrder.status}`, ownOrder.raw);
  }

  const billing = await api('GET', '/billing/me', undefined, ownerToken);
  record('Billing manual/sandbox visivel ao tenant', billing.status === 200, `status=${billing.status}`, billing.raw);

  const failed = results.filter((result) => !result.passed);
  process.stdout.write(`\nResumo smoke:p1: ${results.length - failed.length} OK, ${failed.length} falha(s)\n`);
  for (const failure of failed) process.stdout.write(`- ${failure.name}: ${failure.detail}\n`);
  process.exitCode = failed.length ? 1 : 0;
}

main()
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`SMOKE P1 crashed: ${message}\n`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
