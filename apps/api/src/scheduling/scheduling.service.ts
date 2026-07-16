import { DateTime } from 'luxon';
import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { TenantContextService } from '../common/context/tenant-context.service';
import { ScheduledOrderStatus, TimeSlotStatus, Prisma } from '@prisma/client';
import { FulfillmentType } from '@gestor/types';

@Injectable()
export class SchedulingService {
  private readonly logger = new Logger(SchedulingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContextService,
  ) {}

  /**
   * Gera slots de tempo disponíveis para um período específico
   */
  async generateTimeSlots(
    startDate: Date,
    endDate: Date,
    slotDurationMinutes: number = 30,
    capacity: number = 1,
  ) {
    const tenantId = this.tenantContext.getTenantId();
    if (!tenantId) {
      throw new Error('Tenant context not found');
    }
    this.validateTimeSlotRange(startDate, endDate, capacity);
    if (!Number.isInteger(slotDurationMinutes) || slotDurationMinutes < 5 || slotDurationMinutes > 1440) {
      throw new BadRequestException('slotDurationMinutes must be an integer between 5 and 1440');
    }
    if (endDate.getTime() - startDate.getTime() > 31 * 24 * 60 * 60 * 1000) {
      throw new BadRequestException('Time slot generation range cannot exceed 31 days');
    }

    const slots: Array<{
      startTime: Date;
      endTime: Date;
      capacity: number;
    }> = [];

    const current = new Date(startDate);
    
    while (current.getTime() + slotDurationMinutes * 60 * 1000 <= endDate.getTime()) {
      const startTime = new Date(current);
      const endTime = new Date(current.getTime() + slotDurationMinutes * 60 * 1000);
      
      slots.push({
        startTime,
        endTime,
        capacity,
      });
      
      current.setTime(endTime.getTime());
    }

    const existing = await this.prisma.timeSlot.findMany({
      where: { tenantId, startTime: { gte: startDate, lt: endDate } },
    });
    const byInterval = new Map(
      existing.map((slot) => [`${slot.startTime.getTime()}:${slot.endTime.getTime()}`, slot]),
    );
    let createdCount = 0;

    for (const slot of slots) {
      const key = `${slot.startTime.getTime()}:${slot.endTime.getTime()}`;
      const current = byInterval.get(key);
      if (current) {
        if (slot.capacity < current.currentOccupancy) {
          this.logger.warn(`Preserving occupied slot capacity tenantId=${tenantId} slotId=${current.id}`);
          continue;
        }
        await this.prisma.timeSlot.update({
          where: { id: current.id },
          data: { isActive: true, capacity: slot.capacity },
        });
      } else {
        await this.prisma.timeSlot.create({
          data: {
            tenantId,
            startTime: slot.startTime,
            endTime: slot.endTime,
            capacity: slot.capacity,
            status: TimeSlotStatus.available,
          },
        });
        createdCount += 1;
      }
    }

    this.logger.log(`Generated ${createdCount} time slots for tenant ${tenantId}`);
    return { count: createdCount };
  }

  async createTimeSlot(data: {
    startTime: string;
    endTime: string;
    capacity?: number;
    minOrderValue?: number;
    maxOrderValue?: number;
    maxItems?: number;
  }) {
    const tenantId = this.requireTenantId();
    const startTime = new Date(data.startTime);
    const endTime = new Date(data.endTime);
    this.validateTimeSlotRange(startTime, endTime, data.capacity ?? 1);

    const duplicate = await this.prisma.timeSlot.findFirst({
      where: { tenantId, startTime, endTime },
      select: { id: true },
    });
    if (duplicate) {
      throw new BadRequestException('A time slot already exists for this interval');
    }

    const slot = await this.prisma.timeSlot.create({
      data: {
        tenantId,
        startTime,
        endTime,
        capacity: data.capacity ?? 1,
        minOrderValue: data.minOrderValue,
        maxOrderValue: data.maxOrderValue,
        maxItems: data.maxItems,
      },
    });
    this.logger.log(`Scheduling slot created tenantId=${tenantId} slotId=${slot.id}`);
    return slot;
  }

  async updateTimeSlot(id: string, data: {
    startTime?: string;
    endTime?: string;
    capacity?: number;
    minOrderValue?: number;
    maxOrderValue?: number;
    maxItems?: number;
    status?: TimeSlotStatus;
    isActive?: boolean;
  }) {
    const tenantId = this.requireTenantId();
    const existing = await this.prisma.timeSlot.findFirst({ where: { id, tenantId } });
    if (!existing) throw new NotFoundException('Time slot not found');

    const startTime = data.startTime ? new Date(data.startTime) : existing.startTime;
    const endTime = data.endTime ? new Date(data.endTime) : existing.endTime;
    const capacity = data.capacity ?? existing.capacity;
    this.validateTimeSlotRange(startTime, endTime, capacity);
    if (capacity < existing.currentOccupancy) {
      throw new BadRequestException('Capacity cannot be lower than current occupancy');
    }

    const duplicate = await this.prisma.timeSlot.findFirst({
      where: { tenantId, startTime, endTime, id: { not: id } },
      select: { id: true },
    });
    if (duplicate) throw new BadRequestException('A time slot already exists for this interval');

    return this.prisma.timeSlot.update({
      where: { id },
      data: {
        startTime,
        endTime,
        capacity,
        minOrderValue: data.minOrderValue,
        maxOrderValue: data.maxOrderValue,
        maxItems: data.maxItems,
        status: data.status,
        isActive: data.isActive,
      },
    });
  }

  async deleteTimeSlot(id: string) {
    const tenantId = this.requireTenantId();
    const existing = await this.prisma.timeSlot.findFirst({ where: { id, tenantId } });
    if (!existing) throw new NotFoundException('Time slot not found');
    if (existing.currentOccupancy > 0) {
      throw new BadRequestException('Cannot delete a time slot with scheduled orders');
    }
    await this.prisma.timeSlot.delete({ where: { id } });
    this.logger.log(`Scheduling slot removed tenantId=${tenantId} slotId=${id}`);
  }

  /**
   * Lista slots de tempo disponíveis para uma data específica
   */
  async getAvailableTimeSlots(date: Date, overrideTenantId?: string) {
    const tenantId = overrideTenantId || this.tenantContext.getTenantId();
    if (!tenantId) {
      throw new Error('Tenant context not found');
    }

    // Load tenant scheduling settings (create defaults if missing)
    const settings = await this.getOrCreateSchedulingSettings(tenantId);
    const tenantSettings = await this.prisma.tenantSettings.findUnique({
      where: { tenantId },
      select: { timezone: true },
    });
    const timezone = tenantSettings?.timezone || settings.timezone || 'America/Sao_Paulo';
    this.validateTimezone(timezone);
    const minimumAdvanceMinutes = settings.minimumAdvanceMinutes ?? 60;
    const maximumAdvanceDays = settings.maximumAdvanceDays ?? 7;

    // Compute tenant-local start/end of day for the requested date to avoid off-by-one
    const requestedDateInTz = DateTime.fromJSDate(date, { zone: timezone });
    const startOfRequestedDay = requestedDateInTz.startOf('day');
    const endOfRequestedDay = requestedDateInTz.endOf('day');

    const startUtc = startOfRequestedDay.toUTC().toJSDate();
    const endUtc = endOfRequestedDay.toUTC().toJSDate();

    const maxAllowed = DateTime.now()
      .setZone(timezone)
      .plus({ days: maximumAdvanceDays })
      .endOf('day')
      .toUTC()
      .toJSDate();

    if (!settings.enabled || !settings.acceptScheduledOrders) {
      return [];
    }

    const slots = await this.prisma.timeSlot.findMany({
      where: {
        tenantId,
        startTime: {
          gte: startUtc,
          lte: endUtc,
        },
        status: TimeSlotStatus.available,
        isActive: true,
      },
      orderBy: { startTime: 'asc' },
    });

    const now = new Date();
    const filtered = slots.filter((slot) => {
      // Exclude past slots
      if (slot.startTime.getTime() <= now.getTime()) return false;

      // Minimum advance
      if (slot.startTime.getTime() - now.getTime() < minimumAdvanceMinutes * 60 * 1000) return false;

      // Maximum future allowed
      if (slot.startTime.getTime() > maxAllowed.getTime()) return false;

      // Capacity
      if (slot.currentOccupancy >= slot.capacity) return false;

      // Active and available already enforced in query
      return true;
    });

    this.logger.log(
      `Scheduling slots queried tenantId=${tenantId} date=${startOfRequestedDay.toISODate()} timezone=${timezone} resultCount=${filtered.length}`,
    );
    return filtered.map(slot => ({
      id: slot.id,
      startTime: slot.startTime,
      endTime: slot.endTime,
      available: (slot.currentOccupancy ?? 0) < slot.capacity,
      availableCapacity: slot.capacity - (slot.currentOccupancy ?? 0),
      totalCapacity: slot.capacity,
      minOrderValue: slot.minOrderValue,
      maxOrderValue: slot.maxOrderValue,
      maxItems: slot.maxItems,
    }));
  }

  async getSchedulingSettings() {
    const tenantId = this.tenantContext.getTenantId();
    if (!tenantId) throw new Error('Tenant context not found');

    const [settings, tenantSettings] = await Promise.all([
      this.getOrCreateSchedulingSettings(tenantId),
      this.prisma.tenantSettings.findUnique({
        where: { tenantId },
        select: { timezone: true },
      }),
    ]);
    return { ...settings, timezone: tenantSettings?.timezone || settings.timezone };
  }

  async updateSchedulingSettings(data: Prisma.SchedulingSettingsUpdateInput) {
    const tenantId = this.tenantContext.getTenantId();
    if (!tenantId) throw new Error('Tenant context not found');

    const tenantSettings = await this.prisma.tenantSettings.findUnique({
      where: { tenantId },
      select: { timezone: true },
    });
    const timezone = tenantSettings?.timezone || (data.timezone as string | undefined) || 'America/Sao_Paulo';
    this.validateTimezone(timezone);

    return this.prisma.schedulingSettings.upsert({
      where: { tenantId },
      create: {
        tenantId,
        enabled: data.enabled ?? true,
        acceptScheduledOrders: data.acceptScheduledOrders ?? true,
        allowScheduleWhenClosed: data.allowScheduleWhenClosed ?? false,
        minimumAdvanceMinutes: data.minimumAdvanceMinutes ?? 60,
        maximumAdvanceDays: data.maximumAdvanceDays ?? 7,
        slotIntervalMinutes: data.slotIntervalMinutes ?? 30,
        maxOrdersPerSlot: data.maxOrdersPerSlot ?? 4,
        timezone,
      } as Prisma.SchedulingSettingsUncheckedCreateInput,
      update: { ...data, timezone },
    });
  }

  async getSchedulingWindows() {
    const tenantId = this.tenantContext.getTenantId();
    if (!tenantId) throw new Error('Tenant context not found');

    return this.prisma.schedulingWindow.findMany({
      where: { tenantId },
      orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }],
    });
  }

  async createSchedulingWindow(data: {
    dayOfWeek: number;
    startTime: string;
    endTime: string;
    active?: boolean;
  }) {
    const tenantId = this.tenantContext.getTenantId();
    if (!tenantId) throw new Error('Tenant context not found');

    this.validateSchedulingWindow(data);
    await this.assertNoWindowOverlap(tenantId, data);

    const created = await this.prisma.schedulingWindow.create({
      data: {
        tenantId,
        dayOfWeek: data.dayOfWeek,
        startTime: data.startTime,
        endTime: data.endTime,
        active: data.active ?? true,
      },
    });
    this.logger.log(`Scheduling window created tenantId=${tenantId} windowId=${created.id}`);
    return created;
  }

  async updateSchedulingWindow(id: string, data: {
    dayOfWeek?: number;
    startTime?: string;
    endTime?: string;
    active?: boolean;
  }) {
    const tenantId = this.tenantContext.getTenantId();
    if (!tenantId) throw new Error('Tenant context not found');

    const existing = await this.prisma.schedulingWindow.findFirst({
      where: { id, tenantId },
    });

    if (!existing) {
      throw new NotFoundException('Scheduling window not found');
    }

    const updatedData = {
      ...data,
      dayOfWeek: data.dayOfWeek ?? existing.dayOfWeek,
      startTime: data.startTime ?? existing.startTime,
      endTime: data.endTime ?? existing.endTime,
    };

    this.validateSchedulingWindow(updatedData);
    await this.assertNoWindowOverlap(tenantId, updatedData, id);

    const updated = await this.prisma.schedulingWindow.update({
      where: { id },
      data: {
        dayOfWeek: data.dayOfWeek,
        startTime: data.startTime,
        endTime: data.endTime,
        active: data.active,
      },
    });
    this.logger.log(`Scheduling window updated tenantId=${tenantId} windowId=${id}`);
    return updated;
  }

  async deleteSchedulingWindow(id: string) {
    const tenantId = this.tenantContext.getTenantId();
    if (!tenantId) throw new Error('Tenant context not found');

    const existing = await this.prisma.schedulingWindow.findFirst({
      where: { id, tenantId },
    });

    if (!existing) {
      throw new NotFoundException('Scheduling window not found');
    }

    await this.prisma.schedulingWindow.delete({ where: { id } });
    this.logger.log(`Scheduling window removed tenantId=${tenantId} windowId=${id}`);

    return { success: true };
  }

  private validateSchedulingWindow(data: { dayOfWeek: number; startTime: string; endTime: string }) {
    if (typeof data.dayOfWeek !== 'number' || data.dayOfWeek < 0 || data.dayOfWeek > 6) {
      throw new BadRequestException('dayOfWeek must be an integer between 0 and 6');
    }

    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(data.startTime) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(data.endTime)) {
      throw new BadRequestException('startTime and endTime must be in HH:MM format');
    }

    const [startHour, startMinute] = data.startTime.split(':').map(Number);
    const [endHour, endMinute] = data.endTime.split(':').map(Number);
    const startMinutes = startHour * 60 + startMinute;
    const endMinutes = endHour * 60 + endMinute;

    if (endMinutes <= startMinutes) {
      throw new BadRequestException('endTime must be after startTime');
    }
  }

  private validateTimezone(timezone: string) {
    try {
      Intl.DateTimeFormat('en-US', { timeZone: timezone }).format(new Date());
    } catch {
      throw new BadRequestException('Invalid timezone');
    }
  }

  private requireTenantId(): string {
    const tenantId = this.tenantContext.getTenantId();
    if (!tenantId) throw new Error('Tenant context not found');
    return tenantId;
  }

  private validateTimeSlotRange(startTime: Date, endTime: Date, capacity: number) {
    if (Number.isNaN(startTime.getTime()) || Number.isNaN(endTime.getTime())) {
      throw new BadRequestException('Invalid time slot date');
    }
    if (endTime <= startTime) throw new BadRequestException('endTime must be after startTime');
    if (!Number.isInteger(capacity) || capacity < 1) {
      throw new BadRequestException('capacity must be a positive integer');
    }
  }

  private async assertNoWindowOverlap(
    tenantId: string,
    data: { dayOfWeek: number; startTime: string; endTime: string },
    excludeId?: string,
  ) {
    const overlap = await this.prisma.schedulingWindow.findFirst({
      where: {
        tenantId,
        dayOfWeek: data.dayOfWeek,
        startTime: { lt: data.endTime },
        endTime: { gt: data.startTime },
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
      select: { id: true },
    });
    if (overlap) {
      throw new BadRequestException('Scheduling window overlaps an existing window');
    }
  }

  private async getOrCreateSchedulingSettings(tenantId: string) {
    return this.prisma.schedulingSettings.upsert({
      where: { tenantId },
      create: {
        tenantId,
        enabled: true,
        acceptScheduledOrders: true,
        allowScheduleWhenClosed: false,
        minimumAdvanceMinutes: 60,
        maximumAdvanceDays: 7,
        slotIntervalMinutes: 30,
        maxOrdersPerSlot: 4,
        timezone: 'America/Sao_Paulo',
      } as Prisma.SchedulingSettingsUncheckedCreateInput,
      update: {},
    });
  }
  async validateTimeSlotAvailability(
    timeSlotId: string,
    orderValue?: number,
    itemCount?: number,
  ) {
    const tenantId = this.tenantContext.getTenantId();
    if (!tenantId) {
      throw new Error('Tenant context not found');
    }

    const slot = await this.prisma.timeSlot.findFirst({
      where: {
        id: timeSlotId,
        tenantId,
        isActive: true,
        status: TimeSlotStatus.available,
      },
    });

    if (!slot) {
      throw new NotFoundException('Time slot not found or not available');
    }

    // Verificar capacidade
    if (slot.currentOccupancy >= slot.capacity) {
      throw new BadRequestException('Time slot is fully occupied');
    }

    // Verificar valor mínimo do pedido
    if (slot.minOrderValue && orderValue && Number(orderValue) < Number(slot.minOrderValue)) {
      throw new BadRequestException(
        `Minimum order value for this slot is R$ ${slot.minOrderValue}`
      );
    }

    // Verificar valor máximo do pedido
    if (slot.maxOrderValue && orderValue && Number(orderValue) > Number(slot.maxOrderValue)) {
      throw new BadRequestException(
        `Maximum order value for this slot is R$ ${slot.maxOrderValue}`
      );
    }

    // Verificar limite de itens
    if (slot.maxItems && itemCount && itemCount > slot.maxItems) {
      throw new BadRequestException(
        `Maximum items allowed for this slot is ${slot.maxItems}`
      );
    }

    return slot;
  }

  /**
   * Cria um agendamento de pedido
   */
  async createScheduledOrder(data: {
    orderId?: string;
    customerId: string;
    fulfillmentType?: FulfillmentType;
    scheduledFor: Date;
    timeSlotId: string;
    estimatedDuration: number;
    notes?: string;
  }) {
    const tenantId = this.requireTenantId();
    return this.prisma.$transaction((tx) =>
      this.reserveScheduledOrderInTransaction(tx, { ...data, tenantId }),
    );
  }

  async reserveScheduledOrderInTransaction(
    tx: Prisma.TransactionClient,
    data: {
      tenantId: string;
      orderId?: string;
      customerId: string;
      fulfillmentType?: FulfillmentType;
      scheduledFor: Date;
      timeSlotId: string;
      estimatedDuration: number;
      notes?: string;
    },
  ) {
    if (!['delivery', 'pickup'].includes(data.fulfillmentType ?? 'pickup')) {
      throw new BadRequestException('Scheduled orders support delivery or pickup only');
    }
    if (Number.isNaN(data.scheduledFor.getTime())) {
      throw new BadRequestException('Invalid scheduled date');
    }

    await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT "id" FROM "time_slots"
      WHERE "id" = ${data.timeSlotId} AND "tenant_id" = ${data.tenantId}
      FOR UPDATE
    `);

    const [slot, settings, tenantSettings, customer] = await Promise.all([
      tx.timeSlot.findFirst({
        where: {
          id: data.timeSlotId,
          tenantId: data.tenantId,
          isActive: true,
          status: TimeSlotStatus.available,
        },
      }),
      tx.schedulingSettings.findUnique({ where: { tenantId: data.tenantId } }),
      tx.tenantSettings.findUnique({
        where: { tenantId: data.tenantId },
        select: { timezone: true },
      }),
      tx.customer.findFirst({ where: { id: data.customerId, tenantId: data.tenantId } }),
    ]);

    if (!settings?.enabled || !settings.acceptScheduledOrders) {
      throw new BadRequestException('Scheduling is disabled for this store');
    }
    if (!slot) throw new BadRequestException('The selected time slot is no longer available');
    if (!customer) throw new NotFoundException('Customer not found');
    if (slot.currentOccupancy >= slot.capacity) {
      this.logger.warn(`Scheduling capacity exceeded tenantId=${data.tenantId} slotId=${data.timeSlotId}`);
      throw new BadRequestException('The selected time slot is no longer available');
    }
    if (slot.startTime.getTime() !== data.scheduledFor.getTime()) {
      throw new BadRequestException('Scheduled date does not match the selected time slot');
    }

    const timezone = tenantSettings?.timezone || settings.timezone || 'America/Sao_Paulo';
    this.validateTimezone(timezone);
    const now = DateTime.now();
    const slotStart = DateTime.fromJSDate(slot.startTime);
    if (slotStart.diff(now, 'minutes').minutes < settings.minimumAdvanceMinutes) {
      throw new BadRequestException('The selected time slot does not meet the minimum advance time');
    }
    const localNow = now.setZone(timezone).startOf('day');
    const localSlot = slotStart.setZone(timezone);
    if (localSlot.startOf('day') > localNow.plus({ days: settings.maximumAdvanceDays })) {
      throw new BadRequestException('The selected time slot exceeds the scheduling horizon');
    }

    const localTime = localSlot.toFormat('HH:mm');
    const localEnd = DateTime.fromJSDate(slot.endTime).setZone(timezone);
    const windows = await tx.schedulingWindow.findMany({
      where: {
        tenantId: data.tenantId,
        dayOfWeek: localSlot.weekday % 7,
        active: true,
      },
      select: { startTime: true, endTime: true },
    });
    const activeWindow = localEnd.hasSame(localSlot, 'day')
      && windows.some((window) =>
        window.startTime <= localTime && window.endTime >= localEnd.toFormat('HH:mm'));
    if (!activeWindow) {
      throw new BadRequestException('The selected time slot is outside an active scheduling window');
    }

    if (data.orderId) {
      const order = await tx.order.findFirst({
        where: { id: data.orderId, tenantId: data.tenantId },
        select: { id: true },
      });
      if (!order) throw new NotFoundException('Order not found');
    }

    const scheduledOrder = await tx.scheduledOrder.create({
      data: {
        tenantId: data.tenantId,
        orderId: data.orderId || null,
        customerId: data.customerId,
        scheduledFor: slot.startTime,
        timeSlotId: slot.id,
        estimatedDuration: data.estimatedDuration,
        notes: data.notes,
        status: ScheduledOrderStatus.scheduled,
        customerName: customer.name,
        customerPhone: customer.phone,
        fulfillmentType: data.fulfillmentType || 'pickup',
      },
      include: { customer: true, timeSlot: true },
    });

    const nextOccupancy = slot.currentOccupancy + 1;
    await tx.timeSlot.update({
      where: { id: slot.id },
      data: {
        currentOccupancy: nextOccupancy,
        status: nextOccupancy >= slot.capacity ? TimeSlotStatus.occupied : TimeSlotStatus.available,
      },
    });
    this.logger.log(
      `Scheduled order created tenantId=${data.tenantId} orderId=${data.orderId ?? 'none'} slotId=${slot.id} fulfillmentType=${data.fulfillmentType ?? 'pickup'} scheduledFor=${slot.startTime.toISOString()}`,
    );
    return scheduledOrder;
  }

  async cancelByOrderInTransaction(
    tx: Prisma.TransactionClient,
    tenantId: string,
    orderId: string,
    reason?: string,
  ) {
    const scheduledOrder = await tx.scheduledOrder.findFirst({
      where: {
        tenantId,
        orderId,
        status: { in: [ScheduledOrderStatus.scheduled, ScheduledOrderStatus.confirmed] },
      },
    });
    if (!scheduledOrder) return;

    if (scheduledOrder.timeSlotId) {
      await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        SELECT "id" FROM "time_slots"
        WHERE "id" = ${scheduledOrder.timeSlotId} AND "tenant_id" = ${tenantId}
        FOR UPDATE
      `);
    }

    await tx.scheduledOrder.update({
      where: { id: scheduledOrder.id },
      data: {
        status: ScheduledOrderStatus.cancelled,
        notes: reason
          ? `${scheduledOrder.notes || ''}\nCancelado: ${reason}`.trim()
          : scheduledOrder.notes,
      },
    });
    if (scheduledOrder.timeSlotId) {
      await tx.timeSlot.updateMany({
        where: {
          id: scheduledOrder.timeSlotId,
          tenantId,
          currentOccupancy: { gt: 0 },
        },
        data: {
          currentOccupancy: { decrement: 1 },
          status: TimeSlotStatus.available,
        },
      });
    }
    this.logger.log(`Scheduled order cancelled tenantId=${tenantId} orderId=${orderId}`);
  }

  /**
   * Confirma um agendamento (geralmente após pagamento)
   */
  async confirmScheduledOrder(scheduledOrderId: string) {
    const tenantId = this.tenantContext.getTenantId();
    if (!tenantId) {
      throw new Error('Tenant context not found');
    }

    const scheduledOrder = await this.prisma.scheduledOrder.findFirst({
      where: {
        id: scheduledOrderId,
        tenantId,
      },
    });

    if (!scheduledOrder) {
      throw new NotFoundException('Scheduled order not found');
    }

    if (scheduledOrder.status !== ScheduledOrderStatus.scheduled) {
      throw new BadRequestException('Scheduled order is not in scheduled status');
    }

    const updated = await this.prisma.scheduledOrder.update({
      where: { id: scheduledOrderId },
      data: {
        status: ScheduledOrderStatus.confirmed,
        confirmedAt: new Date(),
      },
    });

    this.logger.log(`Confirmed scheduled order ${scheduledOrderId}`);
    
    return updated;
  }

  /**
   * Cancela um agendamento
   */
  async cancelScheduledOrder(scheduledOrderId: string, reason?: string) {
    const tenantId = this.requireTenantId();
    await this.prisma.$transaction(async (tx) => {
      const scheduledOrder = await tx.scheduledOrder.findFirst({
        where: { id: scheduledOrderId, tenantId },
      });
      if (!scheduledOrder) throw new NotFoundException('Scheduled order not found');
      if (scheduledOrder.status === ScheduledOrderStatus.cancelled) {
        throw new BadRequestException('Cannot cancel already cancelled scheduled order');
      }

      if (scheduledOrder.timeSlotId) {
        await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
          SELECT "id" FROM "time_slots"
          WHERE "id" = ${scheduledOrder.timeSlotId} AND "tenant_id" = ${tenantId}
          FOR UPDATE
        `);
      }
      await tx.scheduledOrder.update({
        where: { id: scheduledOrderId },
        data: {
          status: ScheduledOrderStatus.cancelled,
          notes: reason
            ? `${scheduledOrder.notes || ''}\nCancelado: ${reason}`.trim()
            : scheduledOrder.notes,
        },
      });
      if (scheduledOrder.timeSlotId) {
        await tx.timeSlot.updateMany({
          where: {
            id: scheduledOrder.timeSlotId,
            tenantId,
            currentOccupancy: { gt: 0 },
          },
          data: { currentOccupancy: { decrement: 1 }, status: TimeSlotStatus.available },
        });
      }
    });

    this.logger.log(`Cancelled scheduled order ${scheduledOrderId}`);

    return true;
  }

  /**
   * Lista agendamentos de um cliente
   */
  async getCustomerScheduledOrders(customerId: string, status?: ScheduledOrderStatus) {
    const tenantId = this.tenantContext.getTenantId();
    if (!tenantId) {
      throw new Error('Tenant context not found');
    }

    return this.prisma.scheduledOrder.findMany({
      where: {
        tenantId,
        customerId,
        ...(status && { status }),
      },
      include: {
        timeSlot: true,
        order: true,
      },
      orderBy: {
        scheduledFor: 'asc',
      },
    });
  }

  async getScheduledOrder(id: string) {
    const tenantId = this.requireTenantId();
    const scheduledOrder = await this.prisma.scheduledOrder.findFirst({
      where: { id, tenantId },
      include: { customer: true, timeSlot: true, order: true },
    });
    if (!scheduledOrder) throw new NotFoundException('Scheduled order not found');
    return scheduledOrder;
  }

  async updateScheduledOrder(
    id: string,
    data: {
      scheduledFor?: string;
      timeSlotId?: string;
      estimatedDuration?: number;
      notes?: string;
    },
  ) {
    const tenantId = this.requireTenantId();
    const existing = await this.prisma.scheduledOrder.findFirst({
      where: { id, tenantId },
      select: { id: true, status: true },
    });
    if (!existing) throw new NotFoundException('Scheduled order not found');
    if (existing.status === ScheduledOrderStatus.cancelled) {
      throw new BadRequestException('Cancelled scheduled orders cannot be edited');
    }
    if (data.scheduledFor !== undefined || data.timeSlotId !== undefined) {
      throw new BadRequestException('To change the slot, cancel this scheduling and create a new one');
    }
    return this.prisma.scheduledOrder.update({
      where: { id },
      data: { estimatedDuration: data.estimatedDuration, notes: data.notes },
    });
  }

  /**
   * Lista todos os agendamentos (admin)
   */
  async getAllScheduledOrders(
    date?: Date,
    status?: ScheduledOrderStatus,
    page = 1,
    limit = 20,
  ) {
    const tenantId = this.tenantContext.getTenantId();
    if (!tenantId) {
      throw new Error('Tenant context not found');
    }

    const skip = (page - 1) * limit;

    const where: Prisma.ScheduledOrderWhereInput = { tenantId };
    
    if (date) {
      const settings = await this.getOrCreateSchedulingSettings(tenantId);
      const dateInTz = DateTime.fromJSDate(date, { zone: settings.timezone });
      const start = dateInTz.startOf('day');
      const end = dateInTz.endOf('day');

      where.scheduledFor = {
        gte: start.toUTC().toJSDate(),
        lte: end.toUTC().toJSDate(),
      };
    }

    if (status) {
      where.status = status;
    }

    const [items, total] = await Promise.all([
      this.prisma.scheduledOrder.findMany({
        where,
        include: {
          customer: true,
          timeSlot: true,
          order: true,
        },
        orderBy: {
          scheduledFor: 'asc',
        },
        skip,
        take: limit,
      }),
      this.prisma.scheduledOrder.count({ where }),
    ]);

    return {
      items,
      total,
      page,
      limit,
    };
  }

  /**
   * Calcula ETA (Estimated Time of Arrival/Completion)
   */
  async calculateETA(scheduledOrderId: string): Promise<{
    estimatedStart: Date;
    estimatedCompletion: Date;
    queuePosition?: number;
  }> {
    const tenantId = this.tenantContext.getTenantId();
    if (!tenantId) {
      throw new Error('Tenant context not found');
    }

    const scheduledOrder = await this.prisma.scheduledOrder.findFirst({
      where: {
        id: scheduledOrderId,
        tenantId,
      },
      include: {
        timeSlot: true,
      },
    });

    if (!scheduledOrder) {
      throw new NotFoundException('Scheduled order not found');
    }

    // Contar pedidos na fila para o mesmo slot
    const queuePosition = scheduledOrder.timeSlotId 
      ? await this.prisma.scheduledOrder.count({
          where: {
            tenantId,
            timeSlotId: scheduledOrder.timeSlotId,
            status: {
              in: [ScheduledOrderStatus.scheduled, ScheduledOrderStatus.confirmed],
            },
            scheduledFor: {
              lt: scheduledOrder.scheduledFor,
            },
          },
        })
      : 0;

    const estimatedStart = new Date(scheduledOrder.scheduledFor);
    const estimatedCompletion = new Date(
      estimatedStart.getTime() + (scheduledOrder.estimatedDuration || 30) * 60 * 1000
    );

    return {
      estimatedStart,
      estimatedCompletion,
      queuePosition: queuePosition > 0 ? queuePosition + 1 : undefined,
    };
  }

  /**
   * Atualiza status de agendamentos (ex: para preparação)
   */
  async updateScheduledOrderStatus(
    scheduledOrderId: string,
    status: ScheduledOrderStatus,
  ) {
    const tenantId = this.tenantContext.getTenantId();
    if (!tenantId) {
      throw new Error('Tenant context not found');
    }

    if (status === ScheduledOrderStatus.cancelled) {
      await this.cancelScheduledOrder(scheduledOrderId);
      return this.getScheduledOrder(scheduledOrderId);
    }

    const existing = await this.prisma.scheduledOrder.findFirst({
      where: { id: scheduledOrderId, tenantId },
      select: { id: true },
    });
    if (!existing) throw new NotFoundException('Scheduled order not found');

    const updateData: Prisma.ScheduledOrderUpdateInput = { status };

    if (status === ScheduledOrderStatus.confirmed) {
      updateData.confirmedAt = new Date();
    }

    return this.prisma.scheduledOrder.update({
      where: { id: scheduledOrderId },
      data: updateData,
    });
  }
}
