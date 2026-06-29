import { Injectable, Logger, Inject } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { PrismaService } from '../database/prisma.service';
import { normalizeStorefrontTheme } from '@gestor/theme';
import type {
  ReadinessScoreDto,
  ReadinessStatus,
  ReadinessDimensionDto,
  ReadinessCheckDto,
  ActivationMilestoneDto,
  AchievementDto,
} from './dto/readiness-score.dto';

interface SettingsSnapshot {
  businessPhone: string | null;
  street: string | null;
  number: string | null;
  neighborhood: string | null;
  zipCode: string | null;
  lat: number | null;
  lng: number | null;
  pickupEnabled: boolean | null;
  paymentMethods: unknown;
  logoUrl: string | null;
  storefrontThemeJson: unknown;
}

interface TenantSnapshot {
  name: string;
  createdAt: Date;
  settings: SettingsSnapshot | null;
  operatingHours: { isOpen: boolean }[];
}

interface DeliverySnapshot {
  isDeliveryEnabled: boolean;
  maxRadiusKm: unknown;
  defaultPricePerKm: unknown;
}

const CACHE_TTL_MS = 30_000;
const CACHE_PREFIX = 'readiness:';

const REQUIRED_KEYS: ReadonlyArray<string> = [
  'hasValidAddress',
  'hasOperatingHours',
  'hasPaymentMethod',
  'hasOperationalMode',
  'hasActiveProduct',
];

@Injectable()
export class ReadinessScoreService {
  private readonly logger = new Logger('ReadinessScoreService');

  constructor(
    private readonly prisma: PrismaService,
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
  ) {}

  async calculate(tenantId: string): Promise<ReadinessScoreDto> {
    const cacheKey = `${CACHE_PREFIX}${tenantId}`;
    const cached = await this.cacheManager.get<ReadinessScoreDto>(cacheKey);
    if (cached) return cached;

    const result = await this.computeScore(tenantId);
    await this.cacheManager.set(cacheKey, result, CACHE_TTL_MS);

    this.logger.log({
      event: 'readiness_score_calculated',
      tenantId,
      score: result.score,
      status: result.status,
      missingRequirements: result.missingRequirements,
    });

    return result;
  }

  async invalidateCache(tenantId: string): Promise<void> {
    await this.cacheManager.del(`${CACHE_PREFIX}${tenantId}`);
  }

  private async computeScore(tenantId: string): Promise<ReadinessScoreDto> {
    const [tenantRaw, coverageRaw, activeProductCount] = await Promise.all([
      this.prisma.tenant.findUnique({
        where: { id: tenantId },
        include: {
          settings: {
            select: {
              businessPhone: true,
              street: true,
              number: true,
              neighborhood: true,
              zipCode: true,
              lat: true,
              lng: true,
              pickupEnabled: true,
              paymentMethods: true,
              logoUrl: true,
              storefrontThemeJson: true,
            },
          },
          operatingHours: {
            select: { isOpen: true },
          },
        },
      }),
      this.prisma.deliveryCoverageConfig.findUnique({
        where: { tenantId },
        select: {
          isDeliveryEnabled: true,
          maxRadiusKm: true,
          defaultPricePerKm: true,
        },
      }),
      this.prisma.product.count({
        where: {
          tenantId,
          isActive: true,
          deletedAt: null,
        },
      }),
    ]);

    if (!tenantRaw) {
      return this.buildZeroScore(tenantId);
    }

    const tenant: TenantSnapshot = {
      name: tenantRaw.name,
      createdAt: tenantRaw.createdAt,
      settings: tenantRaw.settings
        ? {
            businessPhone: tenantRaw.settings.businessPhone,
            street: tenantRaw.settings.street,
            number: tenantRaw.settings.number,
            neighborhood: tenantRaw.settings.neighborhood,
            zipCode: tenantRaw.settings.zipCode,
            lat: tenantRaw.settings.lat,
            lng: tenantRaw.settings.lng,
            pickupEnabled: tenantRaw.settings.pickupEnabled,
            paymentMethods: tenantRaw.settings.paymentMethods,
            logoUrl: tenantRaw.settings.logoUrl,
            storefrontThemeJson: tenantRaw.settings.storefrontThemeJson,
          }
        : null,
      operatingHours: tenantRaw.operatingHours,
    };

    const delivery: DeliverySnapshot | null = coverageRaw;

    const dimensions: ReadinessDimensionDto[] = [
      this.evalPerfil(tenant),
      this.evalLocalizacao(tenant),
      this.evalEntrega(delivery, Boolean(tenant.settings?.pickupEnabled)),
      this.evalHorarios(tenant),
      this.evalPagamentos(tenant),
      this.evalCatalogo(activeProductCount),
      this.evalStorefront(tenant),
    ];

    const score = Math.round(dimensions.reduce((acc, dimension) => acc + dimension.score * dimension.weight, 0));
    const status = this.resolveStatus(score);
    const missingRequirements = this.resolveMissingRequired(dimensions, activeProductCount, tenant);
    const canActivate = missingRequirements.length === 0;
    const timeline = this.buildTimeline(tenant, missingRequirements, canActivate, activeProductCount);
    const achievements = this.buildAchievements(score, canActivate, activeProductCount);

    return {
      score,
      status,
      dimensions,
      missingRequirements,
      canActivate,
      timeline,
      achievements,
      calculatedAt: new Date().toISOString(),
    };
  }

  private evalPerfil(tenant: TenantSnapshot): ReadinessDimensionDto {
    const settings = tenant.settings;
    const checks: ReadinessCheckDto[] = [
      { key: 'storeName', label: 'Nome da loja', passed: !!tenant.name?.trim() },
      { key: 'businessPhone', label: 'Telefone de contato', passed: !!settings?.businessPhone?.trim() },
      { key: 'logoConfigured', label: 'Logo configurada', passed: !!settings?.logoUrl?.trim() },
    ];
    return this.buildDimension('profile', 'Perfil da Loja', 0.1, '/settings', 'Configurar perfil', 1, checks);
  }

  private evalLocalizacao(tenant: TenantSnapshot): ReadinessDimensionDto {
    const settings = tenant.settings;
    const hasCoordinates =
      typeof settings?.lat === 'number' &&
      typeof settings?.lng === 'number' &&
      Number.isFinite(settings.lat) &&
      Number.isFinite(settings.lng) &&
      settings.lat !== 0 &&
      settings.lng !== 0;

    const checks: ReadinessCheckDto[] = [
      { key: 'street', label: 'Endereco (rua e numero)', passed: !!(settings?.street?.trim() && settings?.number?.trim()) },
      { key: 'neighborhood', label: 'Bairro e CEP', passed: !!(settings?.neighborhood?.trim() && settings?.zipCode?.trim()) },
      { key: 'coordinates', label: 'Coordenadas geograficas', passed: hasCoordinates },
    ];
    return this.buildDimension('location', 'Localizacao', 0.15, '/settings', 'Configurar endereco', 2, checks);
  }

  private evalEntrega(delivery: DeliverySnapshot | null, pickupEnabled: boolean): ReadinessDimensionDto {
    const checks: ReadinessCheckDto[] = [
      { key: 'coverageConfig', label: 'Configuracao de entrega criada', passed: delivery !== null },
      { key: 'deliveryEnabled', label: 'Entrega ativada', passed: !!delivery?.isDeliveryEnabled },
      { key: 'pickupEnabled', label: 'Retirada ativada', passed: pickupEnabled },
      { key: 'radius', label: 'Raio de cobertura definido', passed: !!(delivery && Number(delivery.maxRadiusKm) > 0) },
    ];
    return this.buildDimension('delivery', 'Entrega e retirada', 0.1, '/delivery/rates', 'Configurar modos', 3, checks);
  }

  private evalHorarios(tenant: TenantSnapshot): ReadinessDimensionDto {
    const hasOpenDay = tenant.operatingHours.some((hour) => hour.isOpen);
    const checks: ReadinessCheckDto[] = [
      { key: 'hasOperatingHours', label: 'Pelo menos 1 dia configurado', passed: hasOpenDay },
    ];
    return this.buildDimension('hours', 'Horarios', 0.15, '/settings', 'Configurar horarios', 4, checks);
  }

  private evalPagamentos(tenant: TenantSnapshot): ReadinessDimensionDto {
    const methods = Array.isArray(tenant.settings?.paymentMethods) ? (tenant.settings?.paymentMethods as string[]) : [];
    const checks: ReadinessCheckDto[] = [
      { key: 'hasPaymentMethod', label: 'Pelo menos 1 metodo de pagamento', passed: methods.length > 0 },
    ];
    return this.buildDimension('payments', 'Pagamentos', 0.15, '/settings', 'Configurar pagamentos', 5, checks);
  }

  private evalCatalogo(productCount: number): ReadinessDimensionDto {
    const checks: ReadinessCheckDto[] = [
      { key: 'hasActiveProduct', label: 'Pelo menos 1 produto ativo', passed: productCount > 0 },
    ];
    return this.buildDimension('catalog', 'Catalogo', 0.2, '/catalog/products', 'Adicionar produtos', 6, checks);
  }

  private evalStorefront(tenant: TenantSnapshot): ReadinessDimensionDto {
    const settings = tenant.settings;
    const normalizedTheme = normalizeStorefrontTheme(settings?.storefrontThemeJson ?? null);
    const hasBackgroundImage = !!normalizedTheme.backgroundImageUrl?.trim();

    const checks: ReadinessCheckDto[] = [
      { key: 'logo', label: 'Logo da loja', passed: !!settings?.logoUrl?.trim() },
      { key: 'background', label: 'Imagem de fundo global', passed: hasBackgroundImage },
    ];
    return this.buildDimension('storefront', 'Vitrine', 0.15, '/settings/storefront', 'Personalizar loja', 7, checks);
  }

  private buildDimension(
    key: string,
    label: string,
    weight: number,
    actionPath: string,
    actionLabel: string,
    priority: number,
    checks: ReadinessCheckDto[],
  ): ReadinessDimensionDto {
    const passedCount = checks.filter((check) => check.passed).length;
    const score = checks.length > 0 ? Math.round((passedCount / checks.length) * 100) : 0;
    return {
      key,
      label,
      score,
      weight,
      passed: passedCount === checks.length,
      actionPath,
      actionLabel,
      priority,
      checks,
    };
  }

  private resolveStatus(score: number): ReadinessStatus {
    if (score >= 90) return 'ready';
    if (score >= 70) return 'almost_ready';
    if (score >= 40) return 'partially_configured';
    return 'not_configured';
  }

  private resolveMissingRequired(
    dimensions: ReadinessDimensionDto[],
    productCount: number,
    tenant: TenantSnapshot,
  ): string[] {
    const missing: string[] = [];

    const locationDimension = dimensions.find((dimension) => dimension.key === 'location');
    const addressOk =
      locationDimension?.checks
        .filter((check) => check.key === 'street' || check.key === 'neighborhood')
        .every((check) => check.passed) ?? false;
    if (!addressOk) missing.push('hasValidAddress');

    if (!tenant.operatingHours.some((hour) => hour.isOpen)) {
      missing.push('hasOperatingHours');
    }

    const paymentMethods = Array.isArray(tenant.settings?.paymentMethods) ? (tenant.settings?.paymentMethods as string[]) : [];
    if (paymentMethods.length === 0) missing.push('hasPaymentMethod');

    const deliveryDimension = dimensions.find((dimension) => dimension.key === 'delivery');
    const deliveryEnabled = deliveryDimension?.checks.find((check) => check.key === 'deliveryEnabled')?.passed ?? false;
    const pickupEnabled = deliveryDimension?.checks.find((check) => check.key === 'pickupEnabled')?.passed ?? false;
    if (!deliveryEnabled && !pickupEnabled) missing.push('hasOperationalMode');

    if (productCount === 0) missing.push('hasActiveProduct');

    return missing;
  }

  private buildZeroScore(tenantId: string): ReadinessScoreDto {
    this.logger.warn(`Tenant ${tenantId} nao encontrado no calculo de readiness`);
    return {
      score: 0,
      status: 'not_configured',
      dimensions: [],
      missingRequirements: [...REQUIRED_KEYS],
      canActivate: false,
      timeline: [],
      achievements: [],
      calculatedAt: new Date().toISOString(),
    };
  }

  private buildTimeline(
    tenant: TenantSnapshot,
    missingRequirements: string[],
    canActivate: boolean,
    activeProductCount: number,
  ): ActivationMilestoneDto[] {
    return [
      {
        key: 'account_created',
        label: 'Conta criada',
        completed: true,
        date: tenant.createdAt.toISOString(),
      },
      {
        key: 'address_configured',
        label: 'Endereco configurado',
        completed: !missingRequirements.includes('hasValidAddress'),
      },
      {
        key: 'hours_configured',
        label: 'Horarios configurados',
        completed: !missingRequirements.includes('hasOperatingHours'),
      },
      {
        key: 'payments_configured',
        label: 'Pagamentos configurados',
        completed: !missingRequirements.includes('hasPaymentMethod'),
      },
      {
        key: 'order_modes_configured',
        label: 'Modos de pedido configurados',
        completed: !missingRequirements.includes('hasOperationalMode'),
      },
      {
        key: 'first_product',
        label: 'Primeiro produto criado',
        completed: activeProductCount > 0,
      },
      {
        key: 'store_ready',
        label: 'Loja pronta',
        completed: canActivate,
      },
    ];
  }

  private buildAchievements(score: number, canActivate: boolean, activeProductCount: number): AchievementDto[] {
    return [
      {
        key: 'first_products',
        title: 'Primeiros Produtos',
        description: 'Cadastre seu primeiro produto para iniciar as vendas.',
        unlocked: activeProductCount >= 1,
        progress: Math.min(activeProductCount, 1),
        max: 1,
      },
      {
        key: 'initial_catalog',
        title: 'Catalogo Inicial',
        description: 'Tenha 5 produtos ativos na sua vitrine.',
        unlocked: activeProductCount >= 5,
        progress: Math.min(activeProductCount, 5),
        max: 5,
      },
      {
        key: 'complete_catalog',
        title: 'Catalogo Completo',
        description: 'Tenha 20 produtos ativos na sua vitrine.',
        unlocked: activeProductCount >= 20,
        progress: Math.min(activeProductCount, 20),
        max: 20,
      },
      {
        key: 'store_configured',
        title: 'Loja Configurada',
        description: 'Atingiu 90% ou mais de completude no setup.',
        unlocked: score >= 90,
      },
      {
        key: 'ready_to_sell',
        title: 'Pronto para Vender',
        description: 'Sua loja completou os requisitos minimos.',
        unlocked: canActivate,
      },
    ];
  }
}
