import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { Reflector } from '@nestjs/core';
import { Test, type TestingModule } from '@nestjs/testing';
import { AuthSessionStatus, AuthSubjectType } from '@prisma/client';
import { PaymentMethod, type CreateOrderDTO } from '@gestor/types';
import { PrismaService } from '../database/prisma.service';
import { TenantContextService } from '../common/context/tenant-context.service';
import { HttpExceptionFilter } from '../common/filters/http-exception.filter';
import { TransformInterceptor } from '../common/interceptors/transform.interceptor';
import { OrdersController } from '../orders/orders.controller';
import { OrdersService } from '../orders/orders.service';
import { CheckoutValidatorService } from '../orders/checkout-validator.service';
import { TenantController } from './tenant.controller';
import { TenantActivationService } from './tenant-activation.service';
import { TenantService } from './tenant.service';
import { OnboardingService } from './onboarding.service';
import { ReadinessScoreService } from './readiness-score.service';
import { AvailabilityService } from '../catalog/publication/availability.service';
import { TenantAuthGuard } from '../auth/guards/tenant-auth.guard';
import { JwtStrategy } from '../auth/strategies/jwt.strategy';
import { PermissionsGuard } from '../rbac/guards/permissions.guard';
import { RbacService } from '../rbac/rbac.service';
import { CouponsService } from '../promotions/coupons.service';
import { CashbackService } from '../promotions/cashback.service';
import { DeliveryRateService } from '../delivery/delivery-rate.service';
import { PizzaEngineService } from '../catalog/pizza-engine.service';
import { UpsellsService } from '../catalog/upsells.service';
import { FeatureControlService } from '../feature-control/feature-control.service';
import { ComboComponentEligibilityService } from '../catalog/combo-component-eligibility.service';
import { CustomerService } from '../crm/customer.service';
import { TheoreticalStockService } from '../inventory/theoretical-stock.service';
import { RecipeExpansionService } from '../inventory/recipe-expansion.service';
import { ConfigurableRecipeCompositionService } from '../inventory/configurable-recipe-composition.service';

const allowedHosts = new Set(['localhost', '127.0.0.1', '::1', 'ephemeral-postgres']);
const jwtSecret = 'commercial-v4-http-test-secret';

jest.setTimeout(180_000);

function assertEphemeralDatabaseUrls(): void {
  if (process.env.NODE_ENV !== 'test') throw new Error('Commercial V4 HTTP test requires NODE_ENV=test.');
  const databaseUrl = process.env.DATABASE_URL;
  const directUrl = process.env.DIRECT_URL;
  if (!databaseUrl || !directUrl) throw new Error('DATABASE_URL and DIRECT_URL are required.');
  const database = new URL(databaseUrl);
  const direct = new URL(directUrl);
  if (!allowedHosts.has(database.hostname) || database.host !== direct.host || database.pathname !== direct.pathname) {
    throw new Error('Commercial V4 HTTP test refused a non-ephemeral PostgreSQL database.');
  }
}

type HttpEnvelope<T> = { success: boolean; data: T };
type ActivationProjection = { storefrontSlug: string; firstStorefrontOrder: { status: string } | null };

describe('Commercial V4 HTTP checkout with real JWT, sessions and RBAC', () => {
  let moduleRef: TestingModule;
  let app: Awaited<ReturnType<TestingModule['createNestApplication']>>;
  let prisma: PrismaService;
  let jwt: JwtService;
  let baseUrl: string;
  const tenantIds: string[] = [];
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;

  const url = (path: string) => `${baseUrl}${path}`;
  const asJson = async <T>(response: Response): Promise<T> => response.json() as Promise<T>;

  beforeAll(async () => {
    assertEphemeralDatabaseUrls();
    moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true, load: [() => ({ JWT_SECRET: jwtSecret })] }),
        PassportModule.register({ defaultStrategy: 'jwt' }),
        JwtModule.register({ secret: jwtSecret }),
      ],
      controllers: [OrdersController, TenantController],
      providers: [
        TenantContextService,
        EventEmitter2,
        PrismaService,
        AvailabilityService,
        TenantActivationService,
        RbacService,
        JwtStrategy,
        TenantAuthGuard,
        PermissionsGuard,
        CouponsService,
        CashbackService,
        CustomerService,
        ComboComponentEligibilityService,
        {
          provide: PizzaEngineService,
          useFactory: (db: PrismaService) => new PizzaEngineService({ tenantClient: db } as never),
          inject: [PrismaService],
        },
        {
          provide: FeatureControlService,
          useFactory: (db: PrismaService) => new FeatureControlService(db, undefined as never, undefined as never, undefined as never),
          inject: [PrismaService],
        },
        {
          provide: DeliveryRateService,
          useFactory: (db: PrismaService) => new DeliveryRateService(db.deliveryRateRule, db.deliveryCoverageConfig, db, undefined as never, undefined as never),
          inject: [PrismaService],
        },
        RecipeExpansionService,
        {
          provide: ConfigurableRecipeCompositionService,
          useFactory: (db: PrismaService, expansion: RecipeExpansionService, pizza: PizzaEngineService) => new ConfigurableRecipeCompositionService(db, expansion, pizza),
          inject: [PrismaService, RecipeExpansionService, PizzaEngineService],
        },
        {
          provide: CheckoutValidatorService,
          useFactory: (db: PrismaService, coupons: CouponsService, cashback: CashbackService, delivery: DeliveryRateService, availability: AvailabilityService, pizza: PizzaEngineService, upsells: UpsellsService, features: FeatureControlService, combo: ComboComponentEligibilityService) => new CheckoutValidatorService(db, coupons, cashback, delivery, availability, pizza, upsells, features, combo),
          inject: [PrismaService, CouponsService, CashbackService, DeliveryRateService, AvailabilityService, PizzaEngineService, UpsellsService, FeatureControlService, ComboComponentEligibilityService],
        },
        {
          provide: UpsellsService,
          useFactory: (db: PrismaService) => new UpsellsService(db),
          inject: [PrismaService],
        },
        {
          provide: TheoreticalStockService,
          useFactory: (db: PrismaService, composition: ConfigurableRecipeCompositionService, combo: ComboComponentEligibilityService) => new TheoreticalStockService(db, composition, combo),
          inject: [PrismaService, ConfigurableRecipeCompositionService, ComboComponentEligibilityService],
        },
        {
          provide: OrdersService,
          useFactory: (db: PrismaService, validator: CheckoutValidatorService, customers: CustomerService, cashback: CashbackService, inventory: TheoreticalStockService) => new OrdersService(db, validator, customers, cashback, {} as never, inventory, {} as never, {} as never, {} as never, { emitNewOrder: () => undefined, emitOrderChanged: () => undefined } as never, {} as never, {} as never, {} as never, {} as never, {} as never),
          inject: [PrismaService, CheckoutValidatorService, CustomerService, CashbackService, TheoreticalStockService],
        },
        { provide: TenantService, useValue: {} },
        { provide: OnboardingService, useValue: {} },
        { provide: ReadinessScoreService, useValue: {} },
      ],
    })
      .overrideProvider(ConfigService)
      .useValue(new ConfigService({ JWT_SECRET: jwtSecret }))
      .compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('/api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    app.useGlobalInterceptors(new TransformInterceptor(app.get(Reflector)));
    await app.init();
    await app.listen(0, '127.0.0.1');
    const address = app.getHttpServer().address();
    if (!address || typeof address === 'string') throw new Error('HTTP test server did not expose a TCP address.');
    baseUrl = `http://127.0.0.1:${address.port}`;
    prisma = moduleRef.get(PrismaService);
    jwt = moduleRef.get(JwtService);
  }, 120_000);

  afterAll(async () => {
    if (prisma) await prisma.tenant.deleteMany({ where: { id: { in: tenantIds } } });
    if (app) await app.close();
  });

  async function fixture(label: string) {
    const tenant = await prisma.tenant.create({ data: { name: `HTTP ${label}`, slug: `commercial-v4-http-${label}-${suffix}` } });
    tenantIds.push(tenant.id);
    await prisma.tenantSettings.create({ data: { tenantId: tenant.id, street: 'Rua HTTP', number: '1', neighborhood: 'Centro', zipCode: '01001000', pickupEnabled: true, paymentMethods: ['cash'] } });
    await prisma.tenantOperatingHours.createMany({ data: Array.from({ length: 7 }, (_, dayOfWeek) => ({ tenantId: tenant.id, dayOfWeek, isOpen: true, openTime: '00:00', closeTime: '23:59' })) });
    const category = await prisma.productCategory.create({ data: { tenantId: tenant.id, name: 'Categoria HTTP', slug: `http-cat-${label}-${suffix}` } });
    const product = await prisma.product.create({ data: { tenantId: tenant.id, categoryId: category.id, name: 'Produto HTTP', slug: `http-prod-${label}-${suffix}`, basePrice: 10 } });
    await prisma.tenantOnboarding.create({ data: { tenantId: tenant.id, completedAt: new Date() } });
    return { tenant, product };
  }

  async function userWithSession(tenantId: string, roleSlug: string, grantDashboard: boolean) {
    const user = await prisma.tenantUser.create({ data: { tenantId, name: `HTTP User ${roleSlug}`, email: `${roleSlug}-${suffix}@example.test`, passwordHash: 'not-used-by-http-test' } });
    const role = await prisma.tenantRole.create({ data: { tenantId, name: roleSlug, slug: roleSlug } });
    await prisma.tenantUserRole.create({ data: { userId: user.id, roleId: role.id } });
    if (grantDashboard) {
      const permission = await prisma.tenantPermission.upsert({ where: { slug: 'dashboard.view' }, update: {}, create: { slug: 'dashboard.view', module: 'dashboard', action: 'view', description: 'HTTP test dashboard access' } });
      await prisma.tenantRolePermission.create({ data: { roleId: role.id, permissionId: permission.id } });
    }
    const session = await prisma.authSession.create({ data: { subjectType: AuthSubjectType.tenant, subjectId: user.id, tenantId, userId: user.id, status: AuthSessionStatus.active, refreshTokenHash: `hash-${user.id}`, refreshTokenFamilyId: `family-${user.id}`, expiresAt: new Date(Date.now() + 60 * 60 * 1000) } });
    const token = jwt.sign({ sub: user.id, type: 'tenant', tenantId, email: user.email, sid: session.id });
    return { user, session, token };
  }

  function checkoutDto(productId: string, key: string): CreateOrderDTO {
    return { idempotencyKey: key, items: [{ lineType: 'product', productId, quantity: 1 }], customerName: 'Cliente HTTP', customerPhone: `119${suffix.replace(/\D/g, '').slice(-8).padStart(8, '0')}`, fulfillmentType: 'pickup', payment: { method: PaymentMethod.cash }, sourceChannel: 'direct_online' };
  }

  it('validates pickup cash through HTTP without writes and creates one replay-safe order', async () => {
    const { tenant, product } = await fixture('checkout');
    const dto = checkoutDto(product.id, `http-create-${suffix}`);
    const before = await prisma.order.count({ where: { tenantId: tenant.id } });
    const validation = await fetch(url(`/api/v1/orders/public-checkout/${tenant.slug}/validate`), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(dto) });
    expect(validation.status).toBe(201);
    const validated = await asJson<HttpEnvelope<{ itemsSubtotal: number; total: number }>>(validation);
    expect(validated.success).toBe(true);
    expect(validated.data.itemsSubtotal).toBe(10);
    expect(validated.data.total).toBe(10);
    expect(await prisma.order.count({ where: { tenantId: tenant.id } })).toBe(before);

    const create = async () => fetch(url(`/api/v1/orders/public-checkout/${tenant.slug}`), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(dto) });
    const first = await create();
    expect(first.status).toBe(201);
    const created = await asJson<HttpEnvelope<{ id: string; orderNumber: number }>>(first);
    const replay = await create();
    expect(replay.status).toBe(201);
    const replayed = await asJson<HttpEnvelope<{ id: string; orderNumber: number }>>(replay);
    expect(replayed.data).toEqual(created.data);
    const persisted = await prisma.order.findUniqueOrThrow({ where: { tenantId_idempotencyKey: { tenantId: tenant.id, idempotencyKey: dto.idempotencyKey } }, include: { items: true, timeline: true } });
    expect(persisted.items).toHaveLength(1);
    expect(persisted.timeline).toHaveLength(1);
    expect(await prisma.order.count({ where: { tenantId: tenant.id } })).toBe(before + 1);
  });

  it('rejects paused and unavailable public checkout requests without writes', async () => {
    const { tenant, product } = await fixture('negative');
    const count = async () => Promise.all([prisma.order.count({ where: { tenantId: tenant.id } }), prisma.orderItem.count({ where: { tenantId: tenant.id } }), prisma.orderTimeline.count({ where: { tenantId: tenant.id } })]);
    const initial = await count();
    await prisma.tenantSettings.update({ where: { tenantId: tenant.id }, data: { isStorePaused: true, storePauseReason: 'HTTP test pause' } });
    try {
      const paused = await fetch(url(`/api/v1/orders/public-checkout/${tenant.slug}`), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(checkoutDto(product.id, `http-paused-${suffix}`)) });
      expect(paused.status).toBe(400);
      expect((await asJson<{ success: boolean }>(paused)).success).toBe(false);
      expect(await count()).toEqual(initial);
    } finally { await prisma.tenantSettings.update({ where: { tenantId: tenant.id }, data: { isStorePaused: false, storePauseReason: null } }); }
    await prisma.product.update({ where: { id: product.id }, data: { isAvailable: false } });
    try {
      const unavailable = await fetch(url(`/api/v1/orders/public-checkout/${tenant.slug}`), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(checkoutDto(product.id, `http-unavailable-${suffix}`)) });
      expect(unavailable.status).toBe(400);
      expect(await count()).toEqual(initial);
    } finally { await prisma.product.update({ where: { id: product.id }, data: { isAvailable: true } }); }
    const missing = await fetch(url('/api/v1/orders/public-checkout/missing-store/validate'), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(checkoutDto(product.id, `http-missing-${suffix}`)) });
    expect(missing.status).toBe(404);
  });

  it('enforces real JWT session state, RBAC and tenant-isolated activation projections over HTTP', async () => {
    const { tenant: tenantA, product: productA } = await fixture('tenant-a');
    const { tenant: tenantB } = await fixture('tenant-b');
    const dto = checkoutDto(productA.id, `http-activation-${suffix}`);
    const created = await fetch(url(`/api/v1/orders/public-checkout/${tenantA.slug}`), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(dto) });
    expect(created.status).toBe(201);
    const noBearer = await fetch(url('/api/v1/tenant/activation-status'));
    expect(noBearer.status).toBe(401);
    const denied = await userWithSession(tenantA.id, `http-denied-${suffix}`, false);
    const deniedResponse = await fetch(url('/api/v1/tenant/activation-status'), { headers: { authorization: `Bearer ${denied.token}` } });
    expect(deniedResponse.status).toBe(403);
    const allowedA = await userWithSession(tenantA.id, `http-allowed-a-${suffix}`, true);
    const allowedB = await userWithSession(tenantB.id, `http-allowed-b-${suffix}`, true);
    const [beforeA, beforeB] = await Promise.all([prisma.order.count({ where: { tenantId: tenantA.id } }), prisma.order.count({ where: { tenantId: tenantB.id } })]);
    const responseA = await fetch(url('/api/v1/tenant/activation-status'), { headers: { authorization: `Bearer ${allowedA.token}` } });
    const responseB = await fetch(url('/api/v1/tenant/activation-status'), { headers: { authorization: `Bearer ${allowedB.token}` } });
    expect(responseA.status).toBe(200);
    expect(responseB.status).toBe(200);
    const bodyA = await asJson<HttpEnvelope<ActivationProjection>>(responseA);
    const bodyB = await asJson<HttpEnvelope<ActivationProjection>>(responseB);
    expect(bodyA.data.storefrontSlug).toBe(tenantA.slug);
    expect(bodyA.data.firstStorefrontOrder?.status).toBe('pending');
    expect(bodyB.data.storefrontSlug).toBe(tenantB.slug);
    expect(bodyB.data.firstStorefrontOrder).toBeNull();
    expect(await prisma.order.count({ where: { tenantId: tenantA.id } })).toBe(beforeA);
    expect(await prisma.order.count({ where: { tenantId: tenantB.id } })).toBe(beforeB);
    await prisma.authSession.update({ where: { id: allowedA.session.id }, data: { status: AuthSessionStatus.revoked, revokedAt: new Date(), revokedReason: 'HTTP test' } });
    const revoked = await fetch(url('/api/v1/tenant/activation-status'), { headers: { authorization: `Bearer ${allowedA.token}` } });
    expect(revoked.status).toBe(401);
  });
});
