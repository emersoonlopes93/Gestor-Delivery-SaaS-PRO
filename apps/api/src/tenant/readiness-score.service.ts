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

// ─── Tipos internos (mapeados dos campos reais do schema Prisma) ─────────────

interface SettingsSnapshot {
  businessPhone: string | null;
  street: string | null;
  number: string | null;
  neighborhood: string | null;
  zipCode: string | null;
  lat: number | null;
  lng: number | null;
  paymentMethods: unknown; // Json? no schema — validamos em runtime
  logoUrl: string | null;
  storefrontThemeJson: unknown; // Json? no schema
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

// ─── Constantes ─────────────────────────────────────────────────────────────

const CACHE_TTL_MS = 30_000;
const CACHE_PREFIX = 'readiness:';

const REQUIRED_KEYS: ReadonlyArray<string> = [
  'hasValidAddress',
  'hasOperatingHours',
  'hasPaymentMethod',
  'hasActiveProduct',
];

// ─── Service ────────────────────────────────────────────────────────────────

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

  // ─── Cálculo principal ────────────────────────────────────────────────────

  private async computeScore(tenantId: string): Promise<ReadinessScoreDto> {
    // Única chamada paralela com 3 queries independentes
    const [tenantRaw, coverageRaw, activeProductCount] = await Promise.all([
      this.prisma.tenant.findUnique({
        where: { id: tenantId },
        // Usar `include` para buscar relações (select dentro de include para otimizar)
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
      // Filtro oficial do Storefront: isActive: true + deletedAt: null
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
            paymentMethods: tenantRaw.settings.paymentMethods,
            logoUrl: tenantRaw.settings.logoUrl,
            storefrontThemeJson: tenantRaw.settings.storefrontThemeJson,
          }
        : null,
      operatingHours: tenantRaw.operatingHours,
    };

    const delivery: DeliverySnapshot | null = coverageRaw;

    const dims: ReadinessDimensionDto[] = [
      this.evalPerfil(tenant),
      this.evalLocalizacao(tenant),
      this.evalEntrega(delivery),
      this.evalHorarios(tenant),
      this.evalPagamentos(tenant),
      this.evalCatalogo(activeProductCount),
      this.evalStorefront(tenant),
    ];

    const score = Math.round(
      dims.reduce((acc, d) => acc + d.score * d.weight, 0),
    );

    const status = this.resolveStatus(score);
    const missingRequirements = this.resolveMissingRequired(dims, activeProductCount, tenant);
    // Readiness score is diagnostico; completion is gated only by real minimum requirements.
    const canActivate = missingRequirements.length === 0;

    const timeline = this.buildTimeline(tenant, missingRequirements, canActivate, activeProductCount);
    const achievements = this.buildAchievements(score, canActivate, activeProductCount);

    return {
      score,
      status,
      dimensions: dims,
      missingRequirements,
      canActivate,
      timeline,
      achievements,
      calculatedAt: new Date().toISOString(),
    };
  }

  // ─── Dimensões ────────────────────────────────────────────────────────────

  private evalPerfil(t: TenantSnapshot): ReadinessDimensionDto {
    const s = t.settings;
    const checks: ReadinessCheckDto[] = [
      { key: 'storeName', label: 'Nome da loja', passed: !!t.name?.trim() },
      // businessCategory não existe no schema atual — substituído por telefone + nome
      { key: 'businessPhone', label: 'Telefone de contato', passed: !!s?.businessPhone?.trim() },
      { key: 'logoConfigured', label: 'Logo configurada', passed: !!s?.logoUrl?.trim() },
    ];
    return this.buildDimension('profile', 'Perfil da Loja', 0.10, '/settings', 'Configurar perfil', 1, checks);
  }

  private evalLocalizacao(t: TenantSnapshot): ReadinessDimensionDto {
    const s = t.settings;
    const checks: ReadinessCheckDto[] = [
      { key: 'street', label: 'Endereço (rua e número)', passed: !!(s?.street?.trim() && s?.number?.trim()) },
      { key: 'neighborhood', label: 'Bairro e CEP', passed: !!(s?.neighborhood?.trim() && s?.zipCode?.trim()) },
      { key: 'coordinates', label: 'Coordenadas geográficas', passed: !!(typeof s?.lat === 'number' && typeof s?.lng === 'number') },
    ];
    return this.buildDimension('location', 'Localização', 0.15, '/settings', 'Configurar endereço', 2, checks);
  }

  private evalEntrega(d: DeliverySnapshot | null): ReadinessDimensionDto {
    const checks: ReadinessCheckDto[] = [
      { key: 'coverageConfig', label: 'Configuração de entrega criada', passed: d !== null },
      { key: 'deliveryEnabled', label: 'Entrega ativada', passed: !!(d?.isDeliveryEnabled) },
      { key: 'radius', label: 'Raio de cobertura definido', passed: !!(d && Number(d.maxRadiusKm) > 0) },
    ];
    return this.buildDimension('delivery', 'Entrega', 0.10, '/delivery/rates', 'Configurar entrega', 3, checks);
  }

  private evalHorarios(t: TenantSnapshot): ReadinessDimensionDto {
    const hasOpen = t.operatingHours.some(h => h.isOpen);
    const checks: ReadinessCheckDto[] = [
      { key: 'hasOperatingHours', label: 'Pelo menos 1 dia configurado', passed: hasOpen },
    ];
    return this.buildDimension('hours', 'Horários', 0.15, '/settings', 'Configurar horários', 4, checks);
  }

  private evalPagamentos(t: TenantSnapshot): ReadinessDimensionDto {
    const rawMethods = t.settings?.paymentMethods;
    const methods: string[] = Array.isArray(rawMethods) ? rawMethods as string[] : [];
    const checks: ReadinessCheckDto[] = [
      { key: 'hasPaymentMethod', label: 'Pelo menos 1 método de pagamento', passed: methods.length > 0 },
    ];
    return this.buildDimension('payments', 'Pagamentos', 0.15, '/settings', 'Configurar pagamentos', 5, checks);
  }

  private evalCatalogo(count: number): ReadinessDimensionDto {
    const checks: ReadinessCheckDto[] = [
      { key: 'hasActiveProduct', label: 'Pelo menos 1 produto ativo', passed: count > 0 },
    ];
    return this.buildDimension('catalog', 'Catálogo', 0.20, '/catalog/products', 'Adicionar produtos', 6, checks);
  }

  private evalStorefront(t: TenantSnapshot): ReadinessDimensionDto {
    const s = t.settings;
    const hasLogo = !!s?.logoUrl?.trim();
    // backgroundImageUrl via normalizeStorefrontTheme (campo oficial do tema global, nao banner)
    const normalizedTheme = normalizeStorefrontTheme(s?.storefrontThemeJson ?? null);
    const hasBackgroundImage = !!(normalizedTheme.backgroundImageUrl?.trim());

    const checks: ReadinessCheckDto[] = [
      { key: 'logo', label: 'Logo da loja', passed: hasLogo },
      { key: 'background', label: 'Imagem de fundo global', passed: hasBackgroundImage },
    ];
    return this.buildDimension('storefront', 'Vitrine', 0.15, '/settings/storefront', 'Personalizar loja', 7, checks);
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────

  private buildDimension(
    key: string,
    label: string,
    weight: number,
    actionPath: string,
    actionLabel: string,
    priority: number,
    checks: ReadinessCheckDto[],
  ): ReadinessDimensionDto {
    const passedCount = checks.filter(c => c.passed).length;
    const score = checks.length > 0 ? Math.round((passedCount / checks.length) * 100) : 0;
    const allPassed = passedCount === checks.length;
    return { key, label, score, weight, passed: allPassed, actionPath, actionLabel, priority, checks };
  }

  private resolveStatus(score: number): ReadinessStatus {
    if (score >= 90) return 'ready';
    if (score >= 70) return 'almost_ready';
    if (score >= 40) return 'partially_configured';
    return 'not_configured';
  }

  private resolveMissingRequired(
    dims: ReadinessDimensionDto[],
    productCount: number,
    tenant: TenantSnapshot,
  ): string[] {
    const missing: string[] = [];

    // hasValidAddress — rua + bairro (campos usados pelo SetupWizard)
    const locationDim = dims.find(d => d.key === 'location');
    const addressOk = locationDim?.checks
      .filter(c => c.key === 'street' || c.key === 'neighborhood')
      .every(c => c.passed) ?? false;
    if (!addressOk) missing.push('hasValidAddress');

    // hasOperatingHours
    if (!tenant.operatingHours.some(h => h.isOpen)) {
      missing.push('hasOperatingHours');
    }

    // hasPaymentMethod
    const rawMethods = tenant.settings?.paymentMethods;
    const methods: string[] = Array.isArray(rawMethods) ? rawMethods as string[] : [];
    if (methods.length === 0) missing.push('hasPaymentMethod');

    // hasActiveProduct
    if (productCount === 0) missing.push('hasActiveProduct');

    return missing;
  }

  private buildZeroScore(tenantId: string): ReadinessScoreDto {
    this.logger.warn(`Tenant ${tenantId} não encontrado no cálculo de readiness`);
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

  // ─── Gamificação (Timeline & Achievements) ────────────────────────────────

  private buildTimeline(
    tenant: TenantSnapshot,
    missingRequirements: string[],
    canActivate: boolean,
    activeProductCount: number
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
        label: 'Endereço configurado',
        completed: !missingRequirements.includes('hasValidAddress'),
      },
      {
        key: 'hours_configured',
        label: 'Horários configurados',
        completed: !missingRequirements.includes('hasOperatingHours'),
      },
      {
        key: 'payments_configured',
        label: 'Pagamentos configurados',
        completed: !missingRequirements.includes('hasPaymentMethod'),
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

  private buildAchievements(
    score: number,
    canActivate: boolean,
    activeProductCount: number
  ): AchievementDto[] {
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
        title: 'Catálogo Inicial',
        description: 'Tenha 5 produtos ativos na sua vitrine.',
        unlocked: activeProductCount >= 5,
        progress: Math.min(activeProductCount, 5),
        max: 5,
      },
      {
        key: 'complete_catalog',
        title: 'Catálogo Completo',
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
        description: 'Sua loja completou os requisitos mínimos.',
        unlocked: canActivate,
      },
    ];
  }
}
