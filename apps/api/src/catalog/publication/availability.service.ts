import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { TenantSettings, TenantOperatingHours } from '@prisma/client';

export type SalesChannel = 'storefront_delivery' | 'storefront_pickup' | 'pos';

export interface AvailabilityDecision {
  canSell: boolean;
  reason: string | null;
  effectiveStatus: string | null;
}

@Injectable()
export class AvailabilityService {
  constructor(private readonly prisma: PrismaService) {}

  async getStoreStatus(
    tenantId: string, 
    now?: Date,
    context?: { settings?: Partial<TenantSettings> | null; operatingHours?: TenantOperatingHours[] }
  ): Promise<{ isOpen: boolean; message: string; reason: string; nextOpenAt?: string | null }> {
    const d = now ?? new Date();

    const settings = await this.prisma.tenantSettings.findUnique({
      where: { tenantId },
      select: { 
        isStorePaused: true, 
        storePauseReason: true, 
        timezone: true,
        street: true,
        number: true,
        neighborhood: true,
        zipCode: true,
        pixKey: true,
        paymentMethods: true
      },
    });

    if (settings?.isStorePaused) {
      return {
        isOpen: false,
        message: settings.storePauseReason || 'Loja temporariamente pausada.',
        reason: 'PAUSED',
        nextOpenAt: null,
      };
    }

    // 1. Validar requisitos operacionais mínimos obrigatórios
    const hasAddress = !!(settings?.street && settings?.number && settings?.neighborhood && settings?.zipCode);
    
    let hasPayments = false;
    if (settings?.pixKey && settings?.paymentMethods) {
      const methods = settings.paymentMethods;
      if (Array.isArray(methods)) {
        hasPayments = methods.length > 0;
      } else if (typeof methods === 'string') {
        try {
          const parsed = JSON.parse(methods);
          hasPayments = Array.isArray(parsed) && parsed.length > 0;
        } catch {
          hasPayments = false;
        }
      } else if (typeof methods === 'object' && methods !== null) {
        hasPayments = Object.keys(methods).length > 0;
      }
    }

    const deliveryCoverage = await this.prisma.deliveryCoverageConfig.findUnique({
      where: { tenantId }
    });
    const hasDelivery = !!deliveryCoverage;

    const operatingHours = [...(context?.operatingHours || await this.prisma.tenantOperatingHours.findMany({
      where: { tenantId },
    }))];
    const hasHours = operatingHours.length > 0;

    if (!hasAddress || !hasPayments || !hasDelivery || !hasHours) {
      const missing = [];
      if (!hasAddress) missing.push('endereço da loja');
      if (!hasPayments) missing.push('formas de pagamento');
      if (!hasDelivery) missing.push('taxa de entrega/cobertura');
      if (!hasHours) missing.push('horários de funcionamento');

      return {
        isOpen: false,
        message: `Loja desativada temporariamente. Configurações pendentes: ${missing.join(', ')}.`,
        reason: 'CONFIG_PENDING',
        nextOpenAt: null,
      };
    }

    const timezone = settings?.timezone || 'America/Sao_Paulo';
    const localInfo = this.getTenantLocalDayAndTime(d, timezone);
    const { dayOfWeek, timeHHmm } = localInfo;
    const currentMinutes = this.timeToMinutes(timeHHmm);

    // Sort to make searching for next open easy (0=sun to 6=sat)
    const sortedRules = [...operatingHours].sort((a, b) => a.dayOfWeek - b.dayOfWeek);
    const todayRules = sortedRules.filter((h) => h.dayOfWeek === dayOfWeek);

    // 1. Is it open right now?
    const openRule = todayRules.find((rule) => {
      if (!rule.isOpen || !rule.openTime || !rule.closeTime) return false;
      const openMinutes = this.timeToMinutes(rule.openTime);
      const closeMinutes = this.timeToMinutes(rule.closeTime);
      return currentMinutes >= openMinutes && currentMinutes <= closeMinutes;
    });

    if (openRule) {
      return { isOpen: true, message: 'Aberto agora', reason: 'OPEN' };
    }

    // Check if there is another shift later today
    const laterRuleToday = todayRules
      .filter((rule) => rule.isOpen && rule.openTime)
      .sort((a, b) => this.timeToMinutes(a.openTime!) - this.timeToMinutes(b.openTime!))
      .find((rule) => this.timeToMinutes(rule.openTime!) > currentMinutes);

    if (laterRuleToday && laterRuleToday.openTime) {
      return {
        isOpen: false,
        message: `Fechado. Abrimos hoje às ${laterRuleToday.openTime}`,
        reason: 'CLOSED',
        nextOpenAt: laterRuleToday.openTime,
      };
    }

    // 2. Find next opening time (searching up to 7 days ahead)
    for (let i = 1; i <= 7; i++) {
        const nextDay = (dayOfWeek + i) % 7;
        const nextRules = sortedRules.filter(r => r.dayOfWeek === nextDay);
        
        const nextOpenShift = nextRules
          .filter(r => r.isOpen && r.openTime)
          .sort((a, b) => this.timeToMinutes(a.openTime!) - this.timeToMinutes(b.openTime!))[0];

        if (nextOpenShift && nextOpenShift.openTime) {
            const dayLabel = i === 1 ? 'amanhã' : this.dayOfWeekToName(nextDay);
            return {
                isOpen: false,
                message: `Fechado. Abrimos ${dayLabel} às ${nextOpenShift.openTime}`,
                reason: 'CLOSED',
                nextOpenAt: nextOpenShift.openTime,
            };
        }
    }

    return { isOpen: false, message: 'Fechado no momento.', reason: 'CLOSED' };
  }

  private dayOfWeekToName(day: number): string {
    const names = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
    return names[day];
  }

  async decide(input: {
    tenantId: string;
    productId: string;
    channel: SalesChannel;
    now?: Date;
    context?: { settings?: Partial<TenantSettings> | null; operatingHours?: TenantOperatingHours[] };
  }): Promise<AvailabilityDecision> {
    const now = input.now ?? new Date();

    // 1. Check Global Store Status
    const storeStatus = await this.getStoreStatus(input.tenantId, now, input.context);
    if (!storeStatus.isOpen) {
      return { 
        canSell: false, 
        reason: `STORE_${storeStatus.reason}`, 
        effectiveStatus: storeStatus.message 
      };
    }

    // 2. Check Product existence
    const product = await this.prisma.product.findFirst({
      where: { id: input.productId, tenantId: input.tenantId, deletedAt: null },
      select: {
        id: true,
        isActive: true,
        isAvailable: true,
        category: { select: { isActive: true, activeDays: true } },
      },
    });

    if (!product) {
      return { canSell: false, reason: 'NOT_FOUND', effectiveStatus: null };
    }

    if (!product.isActive) {
      return { canSell: false, reason: 'PRODUCT_INACTIVE', effectiveStatus: null };
    }

    if (!product.isAvailable) {
      return { canSell: false, reason: 'PRODUCT_UNAVAILABLE', effectiveStatus: null };
    }

    const settings = input.context?.settings || await this.prisma.tenantSettings.findUnique({
      where: { tenantId: input.tenantId },
      select: { timezone: true },
    });
    const timezone = settings?.timezone || 'America/Sao_Paulo';
    const { dayOfWeek, timeHHmm } = this.getTenantLocalDayAndTime(now, timezone);

    if (!this.isCategoryAvailableNow(product.category, dayOfWeek)) {
      return {
        canSell: false,
        reason: product.category?.isActive === false ? 'CATEGORY_INACTIVE' : 'CATEGORY_OUT_OF_SCHEDULE',
        effectiveStatus: null,
      };
    }

    // 3. Product Rules (Publication and Availability Rules)
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

    // Re-check timezone and time for product rules
    const rules = await this.prisma.catalogAvailabilityRule.findMany({
      where: { tenantId: input.tenantId, publicationId: publication.id, isActive: true, channel: input.channel },
      select: { daysOfWeek: true, startTime: true, endTime: true },
    });

    if (!rules || rules.length === 0) {
      return { canSell: true, reason: null, effectiveStatus: publication.operationalStatus };
    }

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

  async decideMany(input: {
    tenantId: string;
    productIds: string[];
    channel: SalesChannel;
    now?: Date;
    context?: { settings?: Partial<TenantSettings> | null; operatingHours?: TenantOperatingHours[] };
    ignoreStoreClosed?: boolean;
  }): Promise<Map<string, AvailabilityDecision>> {
    const now = input.now ?? new Date();
    const storeStatus = await this.getStoreStatus(input.tenantId, now, input.context);
    
    const results = new Map<string, AvailabilityDecision>();

    if (!input.ignoreStoreClosed && !storeStatus.isOpen) {
      for (const id of input.productIds) {
        results.set(id, { canSell: false, reason: `STORE_${storeStatus.reason}`, effectiveStatus: storeStatus.message });
      }
      return results;
    }

    const [products, publications] = await Promise.all([
      this.prisma.product.findMany({
        where: { tenantId: input.tenantId, id: { in: input.productIds }, deletedAt: null },
        select: {
          id: true,
          isActive: true,
          isAvailable: true,
          category: { select: { isActive: true, activeDays: true } },
        },
      }),
      this.prisma.catalogPublication.findMany({
      where: { tenantId: input.tenantId, productId: { in: input.productIds } },
      include: { rules: { where: { isActive: true, channel: input.channel } } }
      }),
    ]);

    const productMap = new Map(products.map((product) => [product.id, product]));
    const pubMap = new Map<string, typeof publications[number]>(publications.map(p => [p.productId, p]));

    const settings = input.context?.settings || await this.prisma.tenantSettings.findUnique({
      where: { tenantId: input.tenantId },
      select: { timezone: true },
    });
    const timezone = settings?.timezone || 'America/Sao_Paulo';
    const { dayOfWeek, timeHHmm } = this.getTenantLocalDayAndTime(now, timezone);

    const isStorefront = input.channel.startsWith('storefront_');

    for (const productId of input.productIds) {
      const product = productMap.get(productId);
      if (!product) {
        results.set(productId, { canSell: false, reason: 'NOT_FOUND', effectiveStatus: null });
        continue;
      }
      if (!product.isActive) {
        results.set(productId, { canSell: false, reason: 'PRODUCT_INACTIVE', effectiveStatus: null });
        continue;
      }
      if (!product.isAvailable) {
        results.set(productId, { canSell: false, reason: 'PRODUCT_UNAVAILABLE', effectiveStatus: null });
        continue;
      }
      if (!this.isCategoryAvailableNow(product.category, dayOfWeek)) {
        results.set(productId, {
          canSell: false,
          reason: product.category?.isActive === false ? 'CATEGORY_INACTIVE' : 'CATEGORY_OUT_OF_SCHEDULE',
          effectiveStatus: null,
        });
        continue;
      }
      const pub = pubMap.get(productId);
      if (!pub) {
        results.set(productId, { canSell: true, reason: null, effectiveStatus: null });
        continue;
      }

      if (isStorefront && pub.publicationStatus !== 'published') {
        results.set(productId, { canSell: false, reason: 'NOT_PUBLISHED', effectiveStatus: pub.operationalStatus });
        continue;
      }

      if (pub.operationalStatus === 'inactive') {
        results.set(productId, { canSell: false, reason: 'INACTIVE', effectiveStatus: pub.operationalStatus });
        continue;
      }

      if (pub.operationalStatus === 'sold_out_manual') {
        results.set(productId, { canSell: false, reason: 'SOLD_OUT', effectiveStatus: pub.operationalStatus });
        continue;
      }

      if (isStorefront && pub.operationalStatus === 'hidden') {
        results.set(productId, { canSell: false, reason: 'HIDDEN', effectiveStatus: pub.operationalStatus });
        continue;
      }

      if (!pub.rules || pub.rules.length === 0) {
        results.set(productId, { canSell: true, reason: null, effectiveStatus: pub.operationalStatus });
        continue;
      }

      const matchesAny = pub.rules.some((r) => {
        const days = (r.daysOfWeek || []) as number[];
        if (!days.includes(dayOfWeek)) return false;
        return this.isTimeInRange(timeHHmm, r.startTime, r.endTime);
      });

      if (!matchesAny) {
        results.set(productId, { canSell: false, reason: 'OUT_OF_SCHEDULE', effectiveStatus: pub.operationalStatus });
      } else {
        results.set(productId, { canSell: true, reason: null, effectiveStatus: pub.operationalStatus });
      }
    }

    return results;
  }

  async assertCanSell(input: {
    tenantId: string;
    productId: string;
    channel: SalesChannel;
    now?: Date;
    context?: { settings?: Partial<TenantSettings> | null; operatingHours?: TenantOperatingHours[] };
  }): Promise<void> {
    const decision = await this.decide(input);
    if (!decision.canSell) {
      throw new BadRequestException(decision.reason || 'Este produto não está disponível para venda no momento.');
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

  private isCategoryAvailableNow(
    category: { isActive: boolean; activeDays: string[] } | null,
    dayOfWeek: number,
  ): boolean {
    if (!category) return true;
    if (!category.isActive) return false;
    if (category.activeDays.length === 0) return true;
    const activeDay = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'][dayOfWeek];
    return category.activeDays.includes(activeDay);
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
