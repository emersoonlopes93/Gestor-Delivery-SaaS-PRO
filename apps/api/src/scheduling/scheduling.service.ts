import { DateTime } from 'luxon';
import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { TenantContextService } from '../common/context/tenant-context.service';
import { ScheduledOrderStatus, TimeSlotStatus, Prisma } from '@prisma/client';

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

    const slots: Array<{
      startTime: Date;
      endTime: Date;
      capacity: number;
    }> = [];

    const current = new Date(startDate);
    
    while (current < endDate) {
      const startTime = new Date(current);
      const endTime = new Date(current.getTime() + slotDurationMinutes * 60 * 1000);
      
      slots.push({
        startTime,
        endTime,
        capacity,
      });
      
      current.setTime(endTime.getTime());
    }

    // Criar slots no banco de dados
    const createdSlots = await this.prisma.timeSlot.createMany({
      data: slots.map(slot => ({
        tenantId,
        startTime: slot.startTime,
        endTime: slot.endTime,
        capacity: slot.capacity,
        status: TimeSlotStatus.available,
      })),
      skipDuplicates: true,
    });

    this.logger.log(`Generated ${createdSlots.count} time slots for tenant ${tenantId}`);
    
    return createdSlots;
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
    const timezone = settings.timezone || 'America/Sao_Paulo';
    const minimumAdvanceMinutes = settings.minimumAdvanceMinutes ?? 60;
    const maximumAdvanceDays = settings.maximumAdvanceDays ?? 7;

    // Compute tenant-local start/end of day for the requested date to avoid off-by-one
    const requestedDateInTz = DateTime.fromJSDate(date, { zone: timezone });
    const startOfRequestedDay = requestedDateInTz.startOf('day');
    const endOfRequestedDay = requestedDateInTz.endOf('day');

    const startUtc = startOfRequestedDay.toUTC().toJSDate();
    const endUtc = endOfRequestedDay.toUTC().toJSDate();

    const maxAllowed = DateTime.now().toUTC().plus({ days: maximumAdvanceDays }).toJSDate();

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

    return filtered.map(slot => ({
      id: slot.id,
      startTime: slot.startTime,
      endTime: slot.endTime,
      availableCapacity: slot.capacity - slot.currentOccupancy,
      totalCapacity: slot.capacity,
      minOrderValue: slot.minOrderValue,
      maxOrderValue: slot.maxOrderValue,
      maxItems: slot.maxItems,
    }));
  }

  async getSchedulingSettings() {
    const tenantId = this.tenantContext.getTenantId();
    if (!tenantId) throw new Error('Tenant context not found');

    return this.getOrCreateSchedulingSettings(tenantId);
  }

  async updateSchedulingSettings(data: Prisma.SchedulingSettingsUpdateInput) {
    const tenantId = this.tenantContext.getTenantId();
    if (!tenantId) throw new Error('Tenant context not found');

    if (data.timezone) {
      this.validateTimezone(data.timezone as string);
    }

    return this.prisma.schedulingSettings.upsert({
      where: { tenantId },
      create: {
        tenantId,
        enabled: data.enabled ?? true,
        acceptScheduledOrders: data.acceptScheduledOrders ?? true,
        minimumAdvanceMinutes: data.minimumAdvanceMinutes ?? 60,
        maximumAdvanceDays: data.maximumAdvanceDays ?? 7,
        slotIntervalMinutes: data.slotIntervalMinutes ?? 30,
        maxOrdersPerSlot: data.maxOrdersPerSlot ?? 4,
        timezone: data.timezone ?? 'America/Sao_Paulo',
      } as Prisma.SchedulingSettingsUncheckedCreateInput,
      update: data,
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

    return this.prisma.schedulingWindow.create({
      data: {
        tenantId,
        dayOfWeek: data.dayOfWeek,
        startTime: data.startTime,
        endTime: data.endTime,
        active: data.active ?? true,
      },
    });
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

    return this.prisma.schedulingWindow.update({
      where: { id },
      data: {
        dayOfWeek: data.dayOfWeek,
        startTime: data.startTime,
        endTime: data.endTime,
        active: data.active,
      },
    });
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
    } catch (err) {
      throw new BadRequestException('Invalid timezone');
    }
  }

  private async getOrCreateSchedulingSettings(tenantId: string) {
    return this.prisma.schedulingSettings.upsert({
      where: { tenantId },
      create: {
        tenantId,
        enabled: true,
        acceptScheduledOrders: true,
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
    customerId: string;
    scheduledFor: Date;
    timeSlotId: string;
    estimatedDuration: number;
    notes?: string;
  }) {
    const tenantId = this.tenantContext.getTenantId();
    if (!tenantId) {
      throw new Error('Tenant context not found');
    }

    // Validar slot
    const slot = await this.validateTimeSlotAvailability(data.timeSlotId);

    // Buscar dados do cliente para campos legados
    const customer = await this.prisma.customer.findUnique({
      where: { id: data.customerId },
    });

    if (!customer) {
      throw new NotFoundException('Customer not found');
    }

    // Criar agendamento
    const scheduledOrder = await this.prisma.scheduledOrder.create({
      data: {
        tenantId,
        customerId: data.customerId,
        scheduledFor: data.scheduledFor,
        timeSlotId: data.timeSlotId,
        estimatedDuration: data.estimatedDuration,
        notes: data.notes,
        status: ScheduledOrderStatus.scheduled,
        // Campos legados para compatibilidade
        customerName: customer.name,
        customerPhone: customer.phone,
        fulfillmentType: 'pickup', // default para agendamentos
      },
      include: {
        customer: true,
        timeSlot: true,
      },
    });

    // Atualizar ocupação do slot
    await this.prisma.timeSlot.update({
      where: { id: data.timeSlotId },
      data: {
        currentOccupancy: {
          increment: 1,
        },
        status: slot.currentOccupancy + 1 >= slot.capacity 
          ? TimeSlotStatus.occupied 
          : TimeSlotStatus.available,
      },
    });

    this.logger.log(`Created scheduled order ${scheduledOrder.id} for ${data.scheduledFor}`);

    return scheduledOrder;
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

    if (scheduledOrder.status === ScheduledOrderStatus.cancelled) {
      throw new BadRequestException('Cannot cancel already cancelled scheduled order');
    }

    // Atualizar status
    await this.prisma.scheduledOrder.update({
      where: { id: scheduledOrderId },
      data: {
        status: ScheduledOrderStatus.cancelled,
        notes: reason ? `${scheduledOrder.notes || ''}\nCancelado: ${reason}`.trim() : scheduledOrder.notes,
      },
    });

    // Liberar capacidade do slot
    if (scheduledOrder.timeSlotId) {
      await this.prisma.timeSlot.update({
        where: { id: scheduledOrder.timeSlotId },
        data: {
          currentOccupancy: {
            decrement: 1,
          },
          status: TimeSlotStatus.available,
        },
      });
    }

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
