import { Test, TestingModule } from '@nestjs/testing';
import { SchedulingService } from './scheduling.service';
import { PrismaService } from '../database/prisma.service';
import { TenantContextService } from '../common/context/tenant-context.service';

describe('SchedulingService', () => {
  let service: SchedulingService;
  let prisma: PrismaService;
  let tenantContext: TenantContextService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SchedulingService,
        {
          provide: PrismaService,
          useValue: {
            timeSlot: {
              findMany: jest.fn(),
            },
          },
        },
        {
          provide: TenantContextService,
          useValue: {
            getTenantId: jest.fn().mockReturnValue('tenant-123'),
          },
        },
      ],
    }).compile();

    service = module.get<SchedulingService>(SchedulingService);
    prisma = module.get<PrismaService>(PrismaService);
    tenantContext = module.get<TenantContextService>(TenantContextService);
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.resetAllMocks();
  });

  it('returns available slots with explicit availability flag and filters full slots', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-06-15T10:00:00Z'));

    jest.spyOn(service as any, 'getOrCreateSchedulingSettings').mockResolvedValue({
      enabled: true,
      acceptScheduledOrders: true,
      minimumAdvanceMinutes: 0,
      maximumAdvanceDays: 7,
      timezone: 'America/Sao_Paulo',
    });

    (prisma as any).timeSlot.findMany.mockResolvedValue([
      {
        id: 'slot-1',
        startTime: new Date('2026-06-15T21:00:00Z'),
        endTime: new Date('2026-06-15T21:30:00Z'),
        currentOccupancy: 1,
        capacity: 2,
        minOrderValue: null,
        maxOrderValue: null,
        maxItems: null,
      },
      {
        id: 'slot-2',
        startTime: new Date('2026-06-15T22:00:00Z'),
        endTime: new Date('2026-06-15T22:30:00Z'),
        currentOccupancy: 2,
        capacity: 2,
        minOrderValue: null,
        maxOrderValue: null,
        maxItems: null,
      },
    ]);

    const slots = await service.getAvailableTimeSlots(new Date('2026-06-15T12:00:00Z'));

    expect(slots).toHaveLength(1);
    expect(slots[0]).toMatchObject({
      id: 'slot-1',
      available: true,
      availableCapacity: 1,
      totalCapacity: 2,
    });
  });
});
