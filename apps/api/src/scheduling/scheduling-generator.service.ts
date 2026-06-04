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
    if (!settings || !settings.enabled) {
      this.logger.log(`Scheduling disabled for tenant ${tenantId}`);
      return [];
    }

    const windows = await this.prisma.schedulingWindow.findMany({ where: { tenantId, active: true } });
    if (!windows || windows.length === 0) {
      this.logger.log(`No scheduling windows found for tenant ${tenantId}`);
      return [];
    }

    const maxDays = settings.maximumAdvanceDays || 7;
    const interval = settings.slotIntervalMinutes || 30;
    const capacity = settings.maxOrdersPerSlot || 1;

    const results = [];

    // Determine date range in tenant local date terms using Intl (approximation)
    const nowInTz = new Intl.DateTimeFormat('en-CA', { timeZone: settings.timezone }).format(new Date());
    const [y, m, d] = nowInTz.split('-').map(Number);
    const startDate = new Date(y, (m ?? 1) - 1, d, 0, 0, 0);
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + maxDays);

    for (let day = 0; day <= maxDays; day++) {
      const current = new Date(startDate);
      current.setDate(startDate.getDate() + day);

      const weekday = current.getDay(); // 0-6
      const dayWindows = windows.filter((w) => w.dayOfWeek === weekday && w.active);

      for (const w of dayWindows) {
        // Parse startTime/endTime stored as HH:MM
        const [sh, sm] = (w.startTime || '00:00').split(':').map(Number);
        const [eh, em] = (w.endTime || '23:59').split(':').map(Number);

        const windowStart = new Date(current);
        windowStart.setHours(sh, sm, 0, 0);

        const windowEnd = new Date(current);
        windowEnd.setHours(eh, em, 0, 0);

        // Use existing schedulingService to create slots in DB
        try {
          const created = await this.schedulingService.generateTimeSlots(windowStart, windowEnd, interval, capacity);
          results.push({ windowId: w.id, created });
        } catch (err) {
          this.logger.error(`Error generating slots for tenant=${tenantId} window=${w.id}: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
    }

    return results;
  }
}
