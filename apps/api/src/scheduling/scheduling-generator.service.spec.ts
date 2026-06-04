import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../database/prisma.service';
import { TenantContextService } from '../common/context/tenant-context.service';
import { SchedulingGeneratorService } from './scheduling-generator.service';
import { SchedulingService } from './scheduling.service';

describe('SchedulingGeneratorService', () => {
  let service: SchedulingGeneratorService;
  let prisma: PrismaService;
  let schedulingService: SchedulingService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SchedulingGeneratorService,
        {
          provide: PrismaService,
          useValue: {
            schedulingSettings: {
              findUnique: jest.fn(),
            },
            schedulingWindow: {
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
        {
          provide: SchedulingService,
          useValue: {
            generateTimeSlots: jest.fn().mockResolvedValue([{ count: 1 }]),
          },
        },
      ],
    }).compile();

    service = module.get<SchedulingGeneratorService>(SchedulingGeneratorService);
    prisma = module.get<PrismaService>(PrismaService);
    schedulingService = module.get<SchedulingService>(SchedulingService);
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.resetAllMocks();
  });

  it('generates slots for tenant windows using timezone-aware local dates', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-06-15T12:00:00Z'));

    (prisma as any).schedulingSettings.findUnique.mockResolvedValue({
      enabled: true,
      acceptScheduledOrders: true,
      maximumAdvanceDays: 0,
      slotIntervalMinutes: 30,
      maxOrdersPerSlot: 2,
      timezone: 'America/Sao_Paulo',
    });

    (prisma as any).schedulingWindow.findMany.mockResolvedValue([
      {
        id: 'window-1',
        dayOfWeek: 1,
        startTime: '10:00',
        endTime: '19:00',
        active: true,
      },
    ]);

    const result = await service.generateSlotsForNextDays();

    expect((prisma as any).schedulingSettings.findUnique).toHaveBeenCalledWith({ where: { tenantId: 'tenant-123' } });
    expect((prisma as any).schedulingWindow.findMany).toHaveBeenCalledWith({ where: { tenantId: 'tenant-123', active: true } });
    expect((schedulingService as any).generateTimeSlots).toHaveBeenCalledTimes(1);

    const [startDate, endDate] = (schedulingService as any).generateTimeSlots.mock.calls[0];
    expect(startDate.toISOString()).toBe('2026-06-15T13:00:00.000Z');
    expect(endDate.toISOString()).toBe('2026-06-15T22:00:00.000Z');
    expect(result).toHaveLength(1);
  });

  it.each([
    ['America/Sao_Paulo', '2026-06-15T21:00:00.000Z', '2026-06-16T02:00:00.000Z'],
    ['America/Manaus', '2026-06-15T22:00:00.000Z', '2026-06-16T03:00:00.000Z'],
    ['America/Rio_Branco', '2026-06-15T23:00:00.000Z', '2026-06-16T04:00:00.000Z'],
  ])('converts local window times to UTC correctly for %s', async (timezone, expectedStart, expectedEnd) => {
    jest.useFakeTimers().setSystemTime(new Date('2026-06-15T12:00:00Z'));

    (prisma as any).schedulingSettings.findUnique.mockResolvedValue({
      enabled: true,
      acceptScheduledOrders: true,
      maximumAdvanceDays: 0,
      slotIntervalMinutes: 30,
      maxOrdersPerSlot: 1,
      timezone,
    });

    (prisma as any).schedulingWindow.findMany.mockResolvedValue([
      {
        id: 'window-1',
        dayOfWeek: 1,
        startTime: '18:00',
        endTime: '23:00',
        active: true,
      },
    ]);

    const result = await service.generateSlotsForNextDays();

    expect(result).toHaveLength(1);
    expect((schedulingService as any).generateTimeSlots).toHaveBeenCalledTimes(1);

    const [startDate, endDate] = (schedulingService as any).generateTimeSlots.mock.calls[0];
    expect(startDate.toISOString()).toBe(expectedStart);
    expect(endDate.toISOString()).toBe(expectedEnd);
  });
});
