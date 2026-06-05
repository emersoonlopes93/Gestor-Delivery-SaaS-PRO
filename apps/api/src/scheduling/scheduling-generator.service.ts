import { DateTime } from 'luxon';
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { TenantContextService } from '../common/context/tenant-context.service';
import { SchedulingService } from './scheduling.service';

@Injectable()
export class SchedulingGeneratorService {
  private readonly logger = new Logger(SchedulingGeneratorService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContextService,
    private readonly schedulingService: SchedulingService,
  ) {}

  /**
   * Generate time slots for the configured range based on SchedulingSettings
   * and SchedulingWindow entries for the tenant.
   * This is a best-effort implementation that reuses the existing
   * SchedulingService.generateTimeSlots for DB creation.
   */
  async generateSlotsForNextDays(overrideTenantId?: string) {
    const tenantId = overrideTenantId || this.tenantContext.getTenantId();
    if (!tenantId) throw new Error('Tenant context not found');

    const settings = await this.prisma.schedulingSettings.findUnique({ where: { tenantId } });
    if (!settings || !settings.enabled || !settings.acceptScheduledOrders) {
      this.logger.log(`Scheduling disabled for tenant ${tenantId}`);
      return [];
    }

    const maxDays = settings.maximumAdvanceDays ?? 7;
    const nowLocal = DateTime.now().setZone(settings.timezone).startOf('day');
    const rangeStartUtc = nowLocal.toUTC().toJSDate();
    const rangeEndUtc = nowLocal.plus({ days: maxDays }).endOf('day').toUTC().toJSDate();

    const windows = await this.prisma.schedulingWindow.findMany({ where: { tenantId, active: true } });
    if (!windows || windows.length === 0) {
      this.logger.log(`No scheduling windows found for tenant ${tenantId}. Deactivating all upcoming slots.`);
      await this.prisma.timeSlot.updateMany({
        where: {
          tenantId,
          isActive: true,
          startTime: {
            gte: rangeStartUtc,
            lte: rangeEndUtc,
          },
        },
        data: {
          isActive: false,
        },
      });
      return [];
    }

    const newSlotStartTimes = new Set<number>();
    const interval = settings.slotIntervalMinutes ?? 30;
    const capacity = settings.maxOrdersPerSlot ?? 1;
    const results = [];

    for (let day = 0; day <= maxDays; day++) {
      const currentLocal = nowLocal.plus({ days: day });
      const weekday = currentLocal.weekday % 7; // Luxon weekday 1-7; convert to 0-6
      const dayWindows = windows.filter((w) => w.dayOfWeek === weekday && w.active);

      for (const w of dayWindows) {
        const [sh, sm] = (w.startTime || '00:00').split(':').map(Number);
        const [eh, em] = (w.endTime || '23:59').split(':').map(Number);

        const windowStartLocal = currentLocal.set({ hour: sh, minute: sm, second: 0, millisecond: 0 });
        const windowEndLocal = currentLocal.set({ hour: eh, minute: em, second: 0, millisecond: 0 });

        const windowStartUtc = windowStartLocal.toUTC().toJSDate();
        const windowEndUtc = windowEndLocal.toUTC().toJSDate();

        if (windowEndUtc <= windowStartUtc) {
          this.logger.warn(`Skipping invalid scheduling window ${w.id} for tenant ${tenantId}`);
          continue;
        }

        let current = windowStartUtc;
        while (current < windowEndUtc) {
          newSlotStartTimes.add(current.getTime());
          current = new Date(current.getTime() + interval * 60 * 1000);
        }
      }
    }

    if (newSlotStartTimes.size > 0) {
      await this.prisma.timeSlot.updateMany({
        where: {
          tenantId,
          isActive: true,
          startTime: {
            gte: rangeStartUtc,
            lte: rangeEndUtc,
            notIn: Array.from(newSlotStartTimes).map((timestamp) => new Date(timestamp)),
          },
        },
        data: {
          isActive: false,
        },
      });
    } else {
      await this.prisma.timeSlot.updateMany({
        where: {
          tenantId,
          isActive: true,
          startTime: {
            gte: rangeStartUtc,
            lte: rangeEndUtc,
          },
        },
        data: {
          isActive: false,
        },
      });
    }

    for (let day = 0; day <= maxDays; day++) {
      const currentLocal = nowLocal.plus({ days: day });
      const weekday = currentLocal.weekday % 7; // Luxon weekday 1-7; convert to 0-6
      const dayWindows = windows.filter((w) => w.dayOfWeek === weekday && w.active);

      for (const w of dayWindows) {
        const [sh, sm] = (w.startTime || '00:00').split(':').map(Number);
        const [eh, em] = (w.endTime || '23:59').split(':').map(Number);

        const windowStartLocal = currentLocal.set({ hour: sh, minute: sm, second: 0, millisecond: 0 });
        const windowEndLocal = currentLocal.set({ hour: eh, minute: em, second: 0, millisecond: 0 });

        const windowStartUtc = windowStartLocal.toUTC().toJSDate();
        const windowEndUtc = windowEndLocal.toUTC().toJSDate();

        if (windowEndUtc <= windowStartUtc) {
          this.logger.warn(`Skipping invalid scheduling window ${w.id} for tenant ${tenantId}`);
          continue;
        }

        try {
          const created = await this.schedulingService.generateTimeSlots(windowStartUtc, windowEndUtc, interval, capacity);
          results.push({ windowId: w.id, created });
        } catch (err) {
          this.logger.error(`Error generating slots for tenant=${tenantId} window=${w.id}: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
    }

    return results;
  }
}
