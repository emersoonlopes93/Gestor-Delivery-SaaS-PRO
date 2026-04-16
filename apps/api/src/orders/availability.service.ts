import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';

export type SalesChannel = 'storefront_delivery' | 'storefront_pickup' | 'pos';

export interface AvailabilityDecision {
  canSell: boolean;
  reason: string | null;
  effectiveStatus: string | null;
}

@Injectable()
export class AvailabilityService {
  constructor(private readonly prisma: PrismaService) {}

  async decide(input: {
    tenantId: string;
    productId: string;
    channel: SalesChannel;
    now?: Date;
  }): Promise<AvailabilityDecision> {
    const now = input.now ?? new Date();

    const product = await this.prisma.product.findFirst({
      where: { id: input.productId, tenantId: input.tenantId, deletedAt: null },
      select: { id: true },
    });

    if (!product) {
      return { canSell: false, reason: 'NOT_FOUND', effectiveStatus: null };
    }

    const tenantSettings = await this.prisma.tenantSettings.findUnique({
      where: { tenantId: input.tenantId },
      select: { timezone: true },
    });

    const timezone = tenantSettings?.timezone || 'America/Sao_Paulo';

    const publication = await this.prisma.catalogPublication.findFirst({
      where: { tenantId: input.tenantId, productId: input.productId },
      select: { id: true, tenantId: true, productId: true, publicationStatus: true, operationalStatus: true },
    });

    if (!publication) {
      return { canSell: true, reason: null, effectiveStatus: null };
    }

    const isStorefront = input.channel.startsWith('storefront_');

    if (isStorefront && publication.publicationStatus !== 'published') {
      return { canSell: false, reason: 'NOT_PUBLISHED', effectiveStatus: publication.operationalStatus };
    }

    if (publication.operationalStatus === 'inactive') {
      return { canSell: false, reason: 'INACTIVE', effectiveStatus: publication.operationalStatus };
    }

    if (publication.operationalStatus === 'sold_out_manual') {
      return { canSell: false, reason: 'SOLD_OUT', effectiveStatus: publication.operationalStatus };
    }

    if (isStorefront && publication.operationalStatus === 'hidden') {
      return { canSell: false, reason: 'HIDDEN', effectiveStatus: publication.operationalStatus };
    }

    const rules = await this.prisma.catalogAvailabilityRule.findMany({
      where: { tenantId: input.tenantId, publicationId: publication.id, isActive: true, channel: input.channel },
      select: { daysOfWeek: true, startTime: true, endTime: true },
    });

    if (!rules || rules.length === 0) {
      return { canSell: true, reason: null, effectiveStatus: publication.operationalStatus };
    }

    const { dayOfWeek, timeHHmm } = this.getTenantLocalDayAndTime(now, timezone);

    const matchesAny = rules.some((r) => {
      const days = (r.daysOfWeek || []) as number[];
      if (!days.includes(dayOfWeek)) return false;
      return this.isTimeInRange(timeHHmm, r.startTime, r.endTime);
    });

    if (!matchesAny) {
      return { canSell: false, reason: 'OUT_OF_SCHEDULE', effectiveStatus: publication.operationalStatus };
    }

    return { canSell: true, reason: null, effectiveStatus: publication.operationalStatus };
  }

  async assertCanSell(input: {
    tenantId: string;
    productId: string;
    channel: SalesChannel;
    now?: Date;
  }): Promise<void> {
    const decision = await this.decide(input);
    if (!decision.canSell) {
      throw new BadRequestException(decision.reason || 'Produto indisponível.');
    }
  }

  private getTenantLocalDayAndTime(date: Date, timeZone: string): { dayOfWeek: number; timeHHmm: string } {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hour12: false,
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
    }).formatToParts(date);

    const weekdayPart = parts.find((p) => p.type === 'weekday')?.value;
    const hour = parts.find((p) => p.type === 'hour')?.value || '00';
    const minute = parts.find((p) => p.type === 'minute')?.value || '00';

    const dayOfWeek = this.weekdayShortToNumber(weekdayPart);
    const timeHHmm = `${hour}:${minute}`;

    return { dayOfWeek, timeHHmm };
  }

  private weekdayShortToNumber(value: string | undefined): number {
    const v = (value || '').toLowerCase();
    const map: Record<string, number> = {
      sun: 0,
      mon: 1,
      tue: 2,
      wed: 3,
      thu: 4,
      fri: 5,
      sat: 6,
    };
    return map[v] ?? 0;
  }

  private isTimeInRange(timeHHmm: string, startHHmm: string, endHHmm: string): boolean {
    if (startHHmm === endHHmm) return true;

    const t = this.timeToMinutes(timeHHmm);
    const start = this.timeToMinutes(startHHmm);
    const end = this.timeToMinutes(endHHmm);

    if (start < end) {
      return t >= start && t <= end;
    }

    return t >= start || t <= end;
  }

  private timeToMinutes(hhmm: string): number {
    const [hh, mm] = hhmm.split(':').map((x) => Number(x));
    return (hh || 0) * 60 + (mm || 0);
  }
}
