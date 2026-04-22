import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { TenantContextService } from '../common/context/tenant-context.service';
import { ScheduledOrderStatus, TimeSlotStatus } from '@prisma/client';

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
  async getAvailableTimeSlots(date: Date) {
    const tenantId = this.tenantContext.getTenantId();
    if (!tenantId) {
      throw new Error('Tenant context not found');
    }

    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    const slots = await this.prisma.timeSlot.findMany({
      where: {
        tenantId,
        startTime: {
          gte: startOfDay,
          lte: endOfDay,
        },
        status: TimeSlotStatus.available,
        isActive: true,
      },
      orderBy: {
        startTime: 'asc',
      },
    });

    return slots.map(slot => ({
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

  /**
   * Valida se um slot de tempo está disponível para agendamento
   */
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
    await this.prisma.timeSlot.update({
      where: { id: scheduledOrder.timeSlotId },
      data: {
        currentOccupancy: {
          decrement: 1,
        },
        status: TimeSlotStatus.available,
      },
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

    const where: any = { tenantId };
    
    if (date) {
      const startOfDay = new Date(date);
      startOfDay.setHours(0, 0, 0, 0);
      
      const endOfDay = new Date(date);
      endOfDay.setHours(23, 59, 59, 999);
      
      where.scheduledFor = {
        gte: startOfDay,
        lte: endOfDay,
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
    const queuePosition = await this.prisma.scheduledOrder.count({
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
    });

    const estimatedStart = new Date(scheduledOrder.scheduledFor);
    const estimatedCompletion = new Date(
      estimatedStart.getTime() + scheduledOrder.estimatedDuration * 60 * 1000
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

    const updateData: any = { status };

    if (status === ScheduledOrderStatus.confirmed) {
      updateData.confirmedAt = new Date();
    }

    return this.prisma.scheduledOrder.update({
      where: { id: scheduledOrderId },
      data: updateData,
    });
  }
}
