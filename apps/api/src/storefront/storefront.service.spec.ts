import { Test, TestingModule } from '@nestjs/testing';
import { StorefrontService } from './storefront.service';
import { PrismaService } from '../database/prisma.service';
import { AvailabilityService } from '../catalog/publication/availability.service';
import { UpsellsService } from '../catalog/upsells.service';
import { MediaLibraryService } from '../upload/media-library.service';
import { SchedulingService } from '../scheduling/scheduling.service';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { DateTime } from 'luxon';

describe('StorefrontService', () => {
  let service: StorefrontService;
  let prisma: PrismaService;
  let schedulingService: SchedulingService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StorefrontService,
        {
          provide: PrismaService,
          useValue: {
            tenant: {
              findUnique: jest.fn(),
            },
          },
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
          useValue: {
            getAvailableTimeSlots: jest.fn(),
          },
        },
        {
          provide: CACHE_MANAGER,
          useValue: {
            get: jest.fn().mockResolvedValue(null),
            set: jest.fn().mockResolvedValue(null),
          },
        },
      ],
    }).compile();

    service = module.get<StorefrontService>(StorefrontService);
    prisma = module.get<PrismaService>(PrismaService);
    schedulingService = module.get<SchedulingService>(SchedulingService);
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
    (prisma as any).tenant.findUnique.mockResolvedValue(tenant);
    (schedulingService as any).getAvailableTimeSlots.mockResolvedValue([
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

    expect((schedulingService as any).getAvailableTimeSlots).toHaveBeenCalledWith(expectedDate, 'tenant-1');
  });
});
