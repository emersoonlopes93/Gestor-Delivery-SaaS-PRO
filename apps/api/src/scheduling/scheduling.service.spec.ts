import { Test, TestingModule } from '@nestjs/testing';
import { SchedulingService } from './scheduling.service';
import { PrismaService } from '../database/prisma.service';
import { TenantContextService } from '../common/context/tenant-context.service';

describe('SchedulingService', () => {
  let service: SchedulingService;
  let prismaMock: {
    timeSlot: { findMany: jest.Mock };
    schedulingSettings: { upsert: jest.Mock };
    tenantSettings: { findUnique: jest.Mock };
  };

  beforeEach(async () => {
    const timeSlotMocks = {
      timeSlot: {
        findMany: jest.fn(),
      },
      schedulingSettings: {
        upsert: jest.fn(),
      },
      tenantSettings: {
        findUnique: jest.fn().mockResolvedValue({ timezone: 'America/Sao_Paulo' }),
      },
    };

    const tenantContextMocks = {
      getTenantId: jest.fn().mockReturnValue('tenant-123'),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SchedulingService,
        {
          provide: PrismaService,
          useValue: timeSlotMocks,
        },
        {
          provide: TenantContextService,
          useValue: tenantContextMocks,
        },
      ],
    }).compile();

    service = module.get<SchedulingService>(SchedulingService);
    prismaMock = timeSlotMocks;
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.resetAllMocks();
  });

  it('returns available slots with explicit availability flag and filters full slots', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-06-15T10:00:00Z'));

    prismaMock.schedulingSettings.upsert.mockResolvedValue({
      enabled: true,
      acceptScheduledOrders: true,
      minimumAdvanceMinutes: 0,
      maximumAdvanceDays: 7,
      timezone: 'America/Sao_Paulo',
    });

    prismaMock.timeSlot.findMany.mockResolvedValue([
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
