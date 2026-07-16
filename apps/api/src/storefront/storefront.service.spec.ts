import { Test, TestingModule } from '@nestjs/testing';
import { StorefrontService } from './storefront.service';
import { PrismaService } from '../database/prisma.service';
import { AvailabilityService } from '../catalog/publication/availability.service';
import { UpsellsService } from '../catalog/upsells.service';
import { MediaLibraryService } from '../upload/media-library.service';
import { SchedulingService } from '../scheduling/scheduling.service';
import { BusinessIntelligenceService } from '../analytics/business-intelligence.service';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { DateTime } from 'luxon';
import { StorefrontCacheService } from './services/storefront-cache.service';
import { FeatureControlService } from '../feature-control/feature-control.service';

describe('StorefrontService', () => {
  let service: StorefrontService;
  let prismaMock: { tenant: { findFirst: jest.Mock } };
  let schedulingServiceMock: { getAvailableTimeSlots: jest.Mock };

  beforeEach(async () => {
    const tenantMocks = {
      tenant: {
        findFirst: jest.fn(),
      },
    };

    const schedulingServiceMocks = {
      getAvailableTimeSlots: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StorefrontService,
        {
          provide: PrismaService,
          useValue: tenantMocks,
        },
        {
          provide: AvailabilityService,
          useValue: {
            decideMany: jest.fn(),
          },
        },
        {
          provide: UpsellsService,
          useValue: {
            getAllUpsells: jest.fn(),
          },
        },
        {
          provide: MediaLibraryService,
          useValue: {
            resolveFinalImage: jest.fn().mockReturnValue({ imageUrl: 'https://example.com/image.png', imageAltText: '', imageSource: '' }),
          },
        },
        {
          provide: SchedulingService,
          useValue: schedulingServiceMocks,
        },
        {
          provide: BusinessIntelligenceService,
          useValue: {
            getStorefrontBestSellers: jest.fn().mockResolvedValue([]),
          },
        },
        {
          provide: CACHE_MANAGER,
          useValue: {
            get: jest.fn().mockResolvedValue(null),
            set: jest.fn().mockResolvedValue(null),
          },
        },
        {
          provide: StorefrontCacheService,
          useValue: { getPayload: jest.fn(), setPayload: jest.fn() },
        },
        {
          provide: FeatureControlService,
          useValue: {
            resolveTenantFeature: jest.fn().mockResolvedValue({ enabled: true }),
          },
        },
      ],
    }).compile();

    service = module.get<StorefrontService>(StorefrontService);
    prismaMock = tenantMocks;
    schedulingServiceMock = schedulingServiceMocks;
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  it('parses public slot date in tenant timezone and forwards the correct target date', async () => {
    const tenant = {
      id: 'tenant-1',
      settings: {
        timezone: 'America/Sao_Paulo',
      },
    };
    prismaMock.tenant.findFirst.mockResolvedValue(tenant);
    schedulingServiceMock.getAvailableTimeSlots.mockResolvedValue([
      {
        id: 'slot-1',
        startTime: new Date('2026-06-15T21:00:00Z'),
        endTime: new Date('2026-06-15T21:30:00Z'),
        available: true,
        availableCapacity: 1,
        totalCapacity: 1,
      },
    ]);

    await service.getAvailableSlots('test-slug', '2026-06-15');

    const expectedDate = DateTime.fromISO('2026-06-15', { zone: 'America/Sao_Paulo' })
      .set({ hour: 12, minute: 0, second: 0, millisecond: 0 })
      .toJSDate();

    expect(schedulingServiceMock.getAvailableTimeSlots).toHaveBeenCalledWith(expectedDate, 'tenant-1');
  });
});
