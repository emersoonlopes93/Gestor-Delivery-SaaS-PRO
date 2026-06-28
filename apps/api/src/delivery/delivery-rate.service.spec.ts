import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../database/prisma.service';
import { GeocodingService } from './geocoding.service';
import { DeliveryRateService, DELIVERY_COVERAGE_REPO, DELIVERY_RATE_RULE_REPO } from './delivery-rate.service';

describe('DeliveryRateService', () => {
  let service: DeliveryRateService;

  const mockPrisma = {
    deliveryCoverageConfig: {
      findUnique: jest.fn(),
    },
    tenantSettings: {
      findUnique: jest.fn(),
    },
    deliveryRateRule: {
      findMany: jest.fn(),
    },
    deliveryRateDistanceTier: {
      deleteMany: jest.fn(),
      createMany: jest.fn(),
    },
  };

  const mockGeocoding = {
    geocodeAddress: jest.fn(),
    geocodeFreeform: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DeliveryRateService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: GeocodingService, useValue: mockGeocoding },
        { provide: DELIVERY_RATE_RULE_REPO, useValue: {} },
        { provide: DELIVERY_COVERAGE_REPO, useValue: {} },
      ],
    }).compile();

    service = module.get<DeliveryRateService>(DeliveryRateService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  const generatePolygon = (latCenter: number, lngCenter: number): Array<[number, number]> => [
    [lngCenter - 0.01, latCenter - 0.01],
    [lngCenter + 0.01, latCenter - 0.01],
    [lngCenter + 0.01, latCenter + 0.01],
    [lngCenter - 0.01, latCenter + 0.01],
    [lngCenter - 0.01, latCenter - 0.01],
  ];

  it('bloqueia calculo com origem padrao invalida', async () => {
    mockPrisma.deliveryCoverageConfig.findUnique.mockResolvedValue({
      tenantId: 'tenant1',
      isDeliveryEnabled: true,
      storeLat: -23.55052,
      storeLng: -46.633308,
      maxRadiusKm: 10,
      defaultEstimatedDeliveryMinutes: 45,
    });
    mockPrisma.tenantSettings.findUnique.mockResolvedValue(null);

    const result = await service.calculateDeliveryDecision({
      tenantId: 'tenant1',
      address: { lat: -23.56, lng: -46.64 },
    });

    expect(result.canDeliver).toBe(false);
    expect(result.available).toBe(false);
    expect(result.appliedRule).toContain('Origem');
  });

  it('prioriza area bloqueada sobre faixas globais', async () => {
    mockPrisma.deliveryCoverageConfig.findUnique.mockResolvedValue({
      tenantId: 'tenant1',
      isDeliveryEnabled: true,
      storeLat: -23,
      storeLng: -46,
      maxRadiusKm: 10,
      defaultEstimatedDeliveryMinutes: 45,
      minimumFee: null,
      maximumFee: null,
    });
    mockPrisma.tenantSettings.findUnique.mockResolvedValue(null);
    mockPrisma.deliveryRateRule.findMany.mockResolvedValue([
      {
        id: 'blocked1',
        type: 'polygon',
        zoneKind: 'blocked_zone',
        blocksDelivery: true,
        priority: 10,
        polygonCoordinates: generatePolygon(-23.01, -46.01),
        distanceTiers: [],
      },
      {
        id: 'tier1',
        type: 'distance',
        pricingMode: 'tiers',
        priority: 5,
        distanceTiers: [{ minDistanceKm: 0, maxDistanceKm: 5, fee: 5, estimatedDeliveryMinutes: 30 }],
      },
    ]);

    const result = await service.calculateDeliveryDecision({
      tenantId: 'tenant1',
      address: { lat: -23.01, lng: -46.01 },
    });

    expect(result.canDeliver).toBe(false);
    expect(result.matchedStrategy).toBe('blocked_zone');
  });

  it('prioriza area especial sobre faixa global e retorna tempo da area', async () => {
    mockPrisma.deliveryCoverageConfig.findUnique.mockResolvedValue({
      tenantId: 'tenant1',
      isDeliveryEnabled: true,
      storeLat: -23,
      storeLng: -46,
      maxRadiusKm: 10,
      defaultEstimatedDeliveryMinutes: 45,
      minimumFee: null,
      maximumFee: null,
    });
    mockPrisma.tenantSettings.findUnique.mockResolvedValue(null);
    mockPrisma.deliveryRateRule.findMany.mockResolvedValue([
      {
        id: 'poly1',
        type: 'polygon',
        pricingMode: 'fixed',
        fixedRate: 15,
        estimatedDeliveryMinutes: 70,
        priority: 1000,
        blocksDelivery: false,
        polygonCoordinates: generatePolygon(-23.01, -46.01),
        distanceTiers: [],
      },
      {
        id: 'tier1',
        type: 'distance',
        pricingMode: 'tiers',
        priority: 500,
        distanceTiers: [{ minDistanceKm: 0, maxDistanceKm: 5, fee: 5, estimatedDeliveryMinutes: 35 }],
      },
    ]);

    const result = await service.calculateDeliveryDecision({
      tenantId: 'tenant1',
      address: { lat: -23.01, lng: -46.01 },
    });

    expect(result.canDeliver).toBe(true);
    expect(result.fee).toBe(15);
    expect(result.estimatedDeliveryMinutes).toBe(70);
    expect(result.matchedZoneId).toBe('poly1');
  });

  it('nao aplica faixa global fora do raio maximo', async () => {
    mockPrisma.deliveryCoverageConfig.findUnique.mockResolvedValue({
      tenantId: 'tenant1',
      isDeliveryEnabled: true,
      storeLat: -23,
      storeLng: -46,
      maxRadiusKm: 5,
      defaultEstimatedDeliveryMinutes: 45,
      minimumFee: null,
      maximumFee: null,
    });
    mockPrisma.tenantSettings.findUnique.mockResolvedValue(null);
    mockPrisma.deliveryRateRule.findMany.mockResolvedValue([
      {
        id: 'tier1',
        type: 'distance',
        pricingMode: 'tiers',
        priority: 500,
        distanceTiers: [{ minDistanceKm: 0, maxDistanceKm: 10, fee: 20, estimatedDeliveryMinutes: 55 }],
      },
    ]);

    const result = await service.calculateDeliveryDecision({
      tenantId: 'tenant1',
      distanceKm: 7,
      address: { lat: -23.06, lng: -46.06 },
    });

    expect(result.canDeliver).toBe(false);
    expect(result.matchedStrategy).toBe('out_of_coverage');
  });

  it('retorna tempo estimado da faixa global', async () => {
    mockPrisma.deliveryCoverageConfig.findUnique.mockResolvedValue({
      tenantId: 'tenant1',
      isDeliveryEnabled: true,
      storeLat: -23,
      storeLng: -46,
      maxRadiusKm: 10,
      defaultPricePerKm: 3,
      defaultEstimatedDeliveryMinutes: 50,
      minimumFee: null,
      maximumFee: null,
    });
    mockPrisma.tenantSettings.findUnique.mockResolvedValue(null);
    mockPrisma.deliveryRateRule.findMany.mockResolvedValue([
      {
        id: 'tier1',
        type: 'distance',
        pricingMode: 'tiers',
        priority: 100,
        estimatedDeliveryMinutes: null,
        distanceTiers: [{ minDistanceKm: 0, maxDistanceKm: 5, fee: 8, estimatedDeliveryMinutes: 35 }],
      },
    ]);

    const result = await service.calculateDeliveryDecision({
      tenantId: 'tenant1',
      distanceKm: 3,
      address: { lat: -23.01, lng: -46.01 },
    });

    expect(result.canDeliver).toBe(true);
    expect(result.estimatedDeliveryMinutes).toBe(35);
    expect(result.appliedRule).toContain('Raio');
  });
});
