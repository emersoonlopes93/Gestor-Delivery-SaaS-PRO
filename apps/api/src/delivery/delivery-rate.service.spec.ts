import { Test, TestingModule } from '@nestjs/testing';
import { DeliveryRateService, DELIVERY_RATE_RULE_REPO, DELIVERY_COVERAGE_REPO } from './delivery-rate.service';
import { PrismaService } from '../database/prisma.service';
import { GeocodingService } from './geocoding.service';

describe('DeliveryRateService (P0.2 Priority Engine)', () => {
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
  };

  const mockGeocoding = {
    geocodeAddress: jest.fn(),
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

  const generatePolygon = (latCenter: number, lngCenter: number): Array<[number, number]> => {
    return [
      [lngCenter - 0.01, latCenter - 0.01],
      [lngCenter + 0.01, latCenter - 0.01],
      [lngCenter + 0.01, latCenter + 0.01],
      [lngCenter - 0.01, latCenter + 0.01],
      [lngCenter - 0.01, latCenter - 0.01],
    ];
  };

  it('deve retornar bloqueio quando na Praça da Sé (Origem Falsa)', async () => {
    mockPrisma.deliveryCoverageConfig.findUnique.mockResolvedValue({
      tenantId: 'tenant1',
      isDeliveryEnabled: true,
      storeLat: -23.55052,
      storeLng: -46.633308,
      maxRadiusKm: 10,
    });
    mockPrisma.tenantSettings.findUnique.mockResolvedValue(null);

    const result = await service.calculateDeliveryDecision({
      tenantId: 'tenant1',
      address: { lat: -23.560, lng: -46.640 },
    });

    expect(result.canDeliver).toBe(false);
    expect(result.reason).toContain('Configure o endereço');
  });

  it('deve priorizar blocked zone sobre distance tiers', async () => {
    mockPrisma.deliveryCoverageConfig.findUnique.mockResolvedValue({
      tenantId: 'tenant1',
      isDeliveryEnabled: true,
      storeLat: -23.00,
      storeLng: -46.00,
      maxRadiusKm: 10,
    });
    mockPrisma.tenantSettings.findUnique.mockResolvedValue(null);

    // Cliente está em -23.01, -46.01, distância aprox 1.5km
    const clientLat = -23.01;
    const clientLng = -46.01;

    mockPrisma.deliveryRateRule.findMany.mockResolvedValue([
      {
        id: 'blocked1',
        type: 'polygon',
        zoneKind: 'blocked_zone',
        priority: 10,
        polygonCoordinates: generatePolygon(-23.01, -46.01),
      },
      {
        id: 'tier1',
        type: 'distance',
        pricingMode: 'tiers',
        priority: 5, // Prioridade mais forte numericamente, mas é distance rule!
        distanceTiers: [
          { minDistanceKm: 0, maxDistanceKm: 5, fee: 5 },
        ],
      },
    ]);

    const result = await service.calculateDeliveryDecision({
      tenantId: 'tenant1',
      address: { lat: clientLat, lng: clientLng },
    });

    expect(result.canDeliver).toBe(false);
    expect(result.matchedStrategy).toBe('blocked_zone');
  });

  it('deve priorizar polygon custom sobre distance tiers globais', async () => {
    mockPrisma.deliveryCoverageConfig.findUnique.mockResolvedValue({
      tenantId: 'tenant1',
      isDeliveryEnabled: true,
      storeLat: -23.00,
      storeLng: -46.00,
      maxRadiusKm: 10,
    });
    mockPrisma.tenantSettings.findUnique.mockResolvedValue(null);

    const clientLat = -23.01;
    const clientLng = -46.01;

    mockPrisma.deliveryRateRule.findMany.mockResolvedValue([
      {
        id: 'poly1',
        type: 'polygon',
        pricingMode: 'fixed',
        fixedRate: 15,
        priority: 1000, // Prioridade numericamente "pior"
        polygonCoordinates: generatePolygon(-23.01, -46.01),
      },
      {
        id: 'tier1',
        type: 'distance',
        pricingMode: 'tiers',
        priority: 500, // Numeramente "melhor", mas como é distance global, perde para poly
        distanceTiers: [
          { minDistanceKm: 0, maxDistanceKm: 5, fee: 5 },
        ],
      },
    ]);

    const result = await service.calculateDeliveryDecision({
      tenantId: 'tenant1',
      address: { lat: clientLat, lng: clientLng },
    });

    expect(result.canDeliver).toBe(true);
    expect(result.fee).toBe(15);
    expect(result.matchedZoneId).toBe('poly1');
  });

  it('não deve aplicar distance tier se exceder maxRadiusKm', async () => {
    mockPrisma.deliveryCoverageConfig.findUnique.mockResolvedValue({
      tenantId: 'tenant1',
      isDeliveryEnabled: true,
      storeLat: -23.00,
      storeLng: -46.00,
      maxRadiusKm: 5, // Limite de 5km
    });
    mockPrisma.tenantSettings.findUnique.mockResolvedValue(null);

    const distanceKm = 7; // Cliente a 7km

    mockPrisma.deliveryRateRule.findMany.mockResolvedValue([
      {
        id: 'tier1',
        type: 'distance',
        pricingMode: 'tiers',
        priority: 500,
        distanceTiers: [
          { minDistanceKm: 0, maxDistanceKm: 10, fee: 20 },
        ],
      },
    ]);

    const result = await service.calculateDeliveryDecision({
      tenantId: 'tenant1',
      distanceKm, // Forçando a distância mockada para não ter que caçar coordenadas perfeitas
      address: { lat: -23.06, lng: -46.06 }, 
    });

    expect(result.canDeliver).toBe(false);
    expect(result.matchedStrategy).toBe('out_of_coverage');
  });
});
