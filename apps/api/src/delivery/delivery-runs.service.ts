import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  DeliveryRunStatus as SharedDeliveryRunStatus,
  DeliveryStopStatus as SharedDeliveryStopStatus,
  DriverStatus as SharedDriverStatus,
  DriverVehicleType as SharedDriverVehicleType,
  ORDER_STATUS_TRANSITIONS,
} from '@gestor/types';
import type {
  DeliveryRunBuilderDataDTO,
  DeliveryRunDTO,
  DeliveryRunSettingsDTO,
  DeliveryStopDTO,
} from '@gestor/types';
import {
  DeliveryRunStatus,
  DeliveryStopStatus,
  DriverShiftStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { runSerializableTransactionWithRetry } from '../database/serializable-transaction';

type TransactionClient = Prisma.TransactionClient;

type RunWithStops = Prisma.DeliveryRunGetPayload<{
  include: { stops: { orderBy: { sequence: 'asc' } } };
}>;

type TenantRun = Prisma.DeliveryRunGetPayload<{
  include: { driver: true; stops: { orderBy: { sequence: 'asc' } } };
}>;

const ACTIVE_RUN_STATUSES: DeliveryRunStatus[] = [
  DeliveryRunStatus.PENDING_ACCEPTANCE,
  DeliveryRunStatus.ASSIGNED,
  DeliveryRunStatus.IN_PROGRESS,
  DeliveryRunStatus.RETURNING,
];

const OPEN_STOP_STATUSES: DeliveryStopStatus[] = [
  DeliveryStopStatus.PENDING,
  DeliveryStopStatus.CURRENT,
  DeliveryStopStatus.ARRIVED,
  DeliveryStopStatus.FAILED_ATTEMPT,
  DeliveryStopStatus.RETURN_TO_STORE,
];

@Injectable()
export class DeliveryRunsService {
  constructor(private readonly prisma: PrismaService) {}

  async getBuilderData(tenantId: string): Promise<DeliveryRunBuilderDataDTO> {
    const [drivers, orders] = await Promise.all([
      this.prisma.deliveryDriver.findMany({
        where: {
          tenantId,
          isActive: true,
          status: 'available',
          shifts: { some: { status: DriverShiftStatus.ACTIVE } },
          deliveryRuns: { none: { status: { in: ACTIVE_RUN_STATUSES } } },
        },
        orderBy: { name: 'asc' },
      }),
      this.prisma.order.findMany({
        where: {
          tenantId,
          fulfillmentType: 'delivery',
          status: 'ready_for_delivery',
          deliveryStops: { none: { status: { in: OPEN_STOP_STATUSES } } },
        },
        include: { deliveryAddress: true },
        orderBy: { createdAt: 'asc' },
      }),
    ]);

    return {
      drivers: drivers.map(({ pin: _pin, ...driver }) => ({
        ...driver,
        status: SharedDriverStatus[driver.status],
        vehicleType: SharedDriverVehicleType[driver.vehicleType],
        lastLocationAt: driver.lastLocationAt?.toISOString() ?? null,
      })),
      orders: orders.map((order) => ({
        id: order.id,
        orderNumber: order.orderNumber,
        customerName: order.customerName,
        customerPhone: order.customerPhone,
        address: order.deliveryAddress
          ? `${order.deliveryAddress.street}, ${order.deliveryAddress.number} - ${order.deliveryAddress.neighborhood}`
          : 'Endereço não informado',
        createdAt: order.createdAt.toISOString(),
      })),
    };
  }

  async listActiveRuns(tenantId: string): Promise<DeliveryRunDTO[]> {
    const runs = await this.prisma.deliveryRun.findMany({
      where: { tenantId, status: { in: ACTIVE_RUN_STATUSES } },
      include: { driver: true, stops: { orderBy: { sequence: 'asc' } } },
      orderBy: { createdAt: 'desc' },
    });
    return runs.map((run) => this.toDTO(run));
  }

  async getSettings(tenantId: string): Promise<DeliveryRunSettingsDTO> {
    const settings = await this.prisma.tenantSettings.findUnique({
      where: { tenantId },
      select: { deliveryRunRequiresAcceptance: true },
    });
    return { requiresAcceptance: settings?.deliveryRunRequiresAcceptance ?? true };
  }

  async updateSettings(
    tenantId: string,
    requiresAcceptance: boolean,
    actorId: string,
  ): Promise<DeliveryRunSettingsDTO> {
    await this.prisma.$transaction(async (tx) => {
      const before = await tx.tenantSettings.findUnique({
        where: { tenantId },
        select: { deliveryRunRequiresAcceptance: true },
      });
      await tx.tenantSettings.upsert({
        where: { tenantId },
        create: { tenantId, deliveryRunRequiresAcceptance: requiresAcceptance },
        update: { deliveryRunRequiresAcceptance: requiresAcceptance },
      });
      await tx.auditLog.create({
        data: {
          tenantId,
          userId: actorId,
          userType: 'tenant_user',
          action: 'tenant.delivery.run_acceptance.update',
          resource: 'tenant_settings',
          details: {
            before: before?.deliveryRunRequiresAcceptance ?? true,
            after: requiresAcceptance,
          },
        },
      });
    });
    return { requiresAcceptance };
  }

  async startShift(tenantId: string, driverId: string) {
    return this.transaction(async (tx) => {
      const driver = await tx.deliveryDriver.findFirst({ where: { id: driverId, tenantId, isActive: true } });
      if (!driver) throw new NotFoundException('Entregador não encontrado nesta loja.');

      const existing = await tx.driverShift.findFirst({
        where: { tenantId, driverId, status: DriverShiftStatus.ACTIVE },
      });
      if (existing) return existing;

      const shift = await tx.driverShift.create({ data: { tenantId, driverId } });
      await tx.deliveryDriver.update({ where: { id: driverId }, data: { status: 'available' } });
      return shift;
    });
  }

  async endShift(tenantId: string, driverId: string) {
    return this.transaction(async (tx) => {
      const shift = await tx.driverShift.findFirst({
        where: { tenantId, driverId, status: DriverShiftStatus.ACTIVE },
      });
      if (!shift) throw new NotFoundException('Turno ativo não encontrado.');

      const activeRun = await tx.deliveryRun.findFirst({
        where: { tenantId, driverId, status: { in: ACTIVE_RUN_STATUSES } },
        select: { id: true },
      });
      if (activeRun) throw new ConflictException('Conclua a rota e os retornos antes de encerrar o turno.');

      const endedAt = new Date();
      const ended = await tx.driverShift.update({
        where: { id: shift.id },
        data: { status: DriverShiftStatus.ENDED, endedAt },
      });
      await tx.deliveryDriver.update({ where: { id: driverId }, data: { status: 'offline' } });
      return ended;
    });
  }

  async createRun(
    tenantId: string,
    driverId: string,
    orderIds: string[],
    actorId?: string,
    options: { assignImmediately?: boolean } = {},
  ) {
    if (orderIds.length === 0 || new Set(orderIds).size !== orderIds.length) {
      throw new BadRequestException('A rota exige pedidos únicos e pelo menos uma parada.');
    }

    return this.transaction(async (tx) => {
      const [driver, shift, orders, settings] = await Promise.all([
        tx.deliveryDriver.findFirst({ where: { id: driverId, tenantId, isActive: true, status: 'available' } }),
        tx.driverShift.findFirst({ where: { tenantId, driverId, status: DriverShiftStatus.ACTIVE } }),
        tx.order.findMany({
          where: {
            tenantId,
            id: { in: orderIds },
            fulfillmentType: 'delivery',
            status: 'ready_for_delivery',
          },
          include: { deliveryAddress: true },
        }),
        options.assignImmediately
          ? tx.tenantSettings.findUnique({
              where: { tenantId },
              select: { deliveryRunRequiresAcceptance: true },
            })
          : Promise.resolve(null),
      ]);

      if (!driver) throw new NotFoundException('Entregador não encontrado nesta loja.');
      if (!shift) throw new BadRequestException('O entregador precisa iniciar o turno antes de receber uma rota.');
      if (orders.length !== orderIds.length) {
        throw new BadRequestException('Todos os pedidos devem pertencer à loja e estar prontos para entrega.');
      }

      const byId = new Map(orders.map((order) => [order.id, order]));
      const createdAt = new Date();
      const requiresAcceptance = settings?.deliveryRunRequiresAcceptance ?? true;
      const assignedAt = options.assignImmediately ? createdAt : null;
      const run = await tx.deliveryRun.create({
        data: {
          tenantId,
          driverId,
          shiftId: shift.id,
          assignedAt,
          acceptedAt: assignedAt && !requiresAcceptance ? assignedAt : null,
          status: assignedAt && !requiresAcceptance
            ? DeliveryRunStatus.ASSIGNED
            : DeliveryRunStatus.PENDING_ACCEPTANCE,
          history: [
            this.historyEvent('RUN_CREATED', createdAt, actorId),
            ...(assignedAt
              ? [this.historyEvent(
                  requiresAcceptance ? 'RUN_ASSIGNED' : 'RUN_AUTO_ACCEPTED',
                  assignedAt,
                  actorId,
                )]
              : []),
          ],
          stops: {
            create: orderIds.map((orderId, index) => {
              const order = byId.get(orderId);
              if (!order) throw new BadRequestException('Pedido inválido na rota.');
              return {
                tenantId,
                orderId,
                sequence: index + 1,
                orderNumberSnapshot: order.orderNumber,
                customerNameSnapshot: order.customerName,
                customerPhoneSnapshot: order.customerPhone,
                addressSnapshot: order.deliveryAddress
                  ? {
                      street: order.deliveryAddress.street,
                      number: order.deliveryAddress.number,
                      complement: order.deliveryAddress.complement,
                      neighborhood: order.deliveryAddress.neighborhood,
                      city: order.deliveryAddress.city,
                      state: order.deliveryAddress.state,
                      zipCode: order.deliveryAddress.zipCode,
                      reference: order.deliveryAddress.reference,
                      lat: order.deliveryAddress.lat,
                      lng: order.deliveryAddress.lng,
                    }
                  : Prisma.JsonNull,
              };
            }),
          },
        },
        include: { stops: { orderBy: { sequence: 'asc' } } },
      });

      if (assignedAt) {
        await tx.order.updateMany({
          where: { tenantId, id: { in: orderIds }, status: 'ready_for_delivery' },
          data: { deliveryDriverId: driverId },
        });
      }
      await tx.deliveryDriver.update({ where: { id: driverId }, data: { status: 'busy' } });
      return run;
    });
  }

  async createAssignedRun(
    tenantId: string,
    driverId: string,
    orderIds: string[],
    actorId: string,
  ): Promise<DeliveryRunDTO> {
    const created = await this.createRun(
      tenantId,
      driverId,
      orderIds,
      actorId,
      { assignImmediately: true },
    );
    return this.getTenantRunDTO(tenantId, created.id);
  }

  async reorderTenantStops(
    tenantId: string,
    runId: string,
    stopIds: string[],
    expectedVersion: number,
    actorId: string,
  ): Promise<DeliveryRunDTO> {
    await this.reorderStops(tenantId, runId, stopIds, expectedVersion, actorId);
    return this.getTenantRunDTO(tenantId, runId);
  }

  async assignRun(tenantId: string, runId: string, actorId?: string) {
    return this.transaction(async (tx) => {
      const run = await this.getRun(tx, tenantId, runId);
      if (run.assignedAt) return run;
      if (run.status !== DeliveryRunStatus.PENDING_ACCEPTANCE) {
        throw new ConflictException('Somente uma rota pendente pode ser atribuída.');
      }

      const settings = await tx.tenantSettings.findUnique({ where: { tenantId } });
      const assignedAt = new Date();
      const requiresAcceptance = settings?.deliveryRunRequiresAcceptance ?? true;
      await tx.order.updateMany({
        where: { tenantId, id: { in: run.stops.map((stop) => stop.orderId) } },
        data: { deliveryDriverId: run.driverId },
      });
      return tx.deliveryRun.update({
        where: { id: run.id },
        data: {
          assignedAt,
          acceptedAt: requiresAcceptance ? null : assignedAt,
          status: requiresAcceptance ? DeliveryRunStatus.PENDING_ACCEPTANCE : DeliveryRunStatus.ASSIGNED,
          version: { increment: 1 },
          history: this.appendHistory(run.history, this.historyEvent(
            requiresAcceptance ? 'RUN_ASSIGNED' : 'RUN_AUTO_ACCEPTED',
            assignedAt,
            actorId,
          )),
        },
        include: { stops: { orderBy: { sequence: 'asc' } } },
      });
    });
  }

  async acceptRun(tenantId: string, runId: string, driverId: string) {
    return this.transaction(async (tx) => {
      const run = await this.getDriverRun(tx, tenantId, runId, driverId);
      if (run.status === DeliveryRunStatus.ASSIGNED) return run;
      if (run.status !== DeliveryRunStatus.PENDING_ACCEPTANCE || !run.assignedAt) {
        throw new ConflictException('Esta rota não está aguardando aceite.');
      }
      const acceptedAt = new Date();
      return tx.deliveryRun.update({
        where: { id: run.id },
        data: {
          status: DeliveryRunStatus.ASSIGNED,
          acceptedAt,
          rejectedAt: null,
          rejectionReason: null,
          version: { increment: 1 },
          history: this.appendHistory(run.history, this.historyEvent('RUN_ACCEPTED', acceptedAt, driverId)),
        },
        include: { stops: { orderBy: { sequence: 'asc' } } },
      });
    });
  }

  async rejectRun(tenantId: string, runId: string, driverId: string, reason: string) {
    if (!reason.trim()) throw new BadRequestException('Informe o motivo da recusa.');
    return this.transaction(async (tx) => {
      const run = await this.getDriverRun(tx, tenantId, runId, driverId);
      if (run.status !== DeliveryRunStatus.PENDING_ACCEPTANCE || !run.assignedAt) {
        throw new ConflictException('Esta rota não está aguardando aceite.');
      }
      const rejectedAt = new Date();
      await tx.deliveryStop.updateMany({
        where: { tenantId, runId: run.id, status: DeliveryStopStatus.PENDING },
        data: { status: DeliveryStopStatus.CANCELLED, cancelledAt: rejectedAt, cancellationReason: 'Rota recusada' },
      });
      await tx.order.updateMany({
        where: { tenantId, id: { in: run.stops.map((stop) => stop.orderId) }, deliveryDriverId: driverId },
        data: { deliveryDriverId: null },
      });
      await tx.deliveryDriver.update({ where: { id: driverId }, data: { status: 'available' } });
      return tx.deliveryRun.update({
        where: { id: run.id },
        data: {
          status: DeliveryRunStatus.CANCELLED,
          rejectedAt,
          rejectionReason: reason.trim(),
          cancelledAt: rejectedAt,
          version: { increment: 1 },
          history: this.appendHistory(run.history, this.historyEvent('RUN_REJECTED', rejectedAt, driverId, { reason: reason.trim() })),
        },
        include: { stops: { orderBy: { sequence: 'asc' } } },
      });
    });
  }

  async startRun(tenantId: string, runId: string, driverId: string) {
    return this.transaction(async (tx) => {
      const run = await this.getDriverRun(tx, tenantId, runId, driverId);
      if (run.status === DeliveryRunStatus.IN_PROGRESS || run.status === DeliveryRunStatus.RETURNING) return run;
      if (run.status !== DeliveryRunStatus.ASSIGNED) {
        throw new ConflictException('A rota precisa estar aceita antes de iniciar.');
      }

      const activeStops = run.stops.filter((stop) => stop.status === DeliveryStopStatus.PENDING);
      if (activeStops.length === 0) throw new ConflictException('A rota não possui paradas pendentes.');
      const orderIds = activeStops.map((stop) => stop.orderId);
      const orders = await tx.order.findMany({ where: { tenantId, id: { in: orderIds } } });
      if (
        orders.length !== orderIds.length
        || orders.some((order) => !ORDER_STATUS_TRANSITIONS[order.status].includes('out_for_delivery'))
      ) {
        throw new ConflictException('Todos os pedidos precisam permanecer prontos para entrega.');
      }

      const startedAt = new Date();
      const updatedOrders = await tx.order.updateMany({
        where: { tenantId, id: { in: orderIds }, status: 'ready_for_delivery', deliveryDriverId: driverId },
        data: { status: 'out_for_delivery' },
      });
      if (updatedOrders.count !== orderIds.length) throw new ConflictException('A rota foi alterada durante o início.');

      await tx.orderTimeline.createMany({
        data: orders.map((order) => ({
          tenantId,
          orderId: order.id,
          status: 'out_for_delivery',
          note: 'Pedido despachado na rota de entrega.',
          actorId: driverId,
          actorType: 'delivery_driver',
        })),
      });
      await tx.deliveryStop.update({
        where: { id: activeStops[0].id },
        data: { status: DeliveryStopStatus.CURRENT },
      });
      return tx.deliveryRun.update({
        where: { id: run.id },
        data: {
          status: DeliveryRunStatus.IN_PROGRESS,
          startedAt,
          version: { increment: 1 },
          history: this.appendHistory(run.history, this.historyEvent('RUN_STARTED', startedAt, driverId)),
        },
        include: { stops: { orderBy: { sequence: 'asc' } } },
      });
    });
  }

  async reorderStops(tenantId: string, runId: string, stopIds: string[], expectedVersion: number, actorId?: string) {
    if (stopIds.length === 0 || new Set(stopIds).size !== stopIds.length) {
      throw new BadRequestException('Informe cada parada futura uma única vez.');
    }
    return this.transaction(async (tx) => {
      const run = await this.getRun(tx, tenantId, runId);
      const reorderableStatuses: DeliveryRunStatus[] = [
        DeliveryRunStatus.PENDING_ACCEPTANCE,
        DeliveryRunStatus.ASSIGNED,
        DeliveryRunStatus.IN_PROGRESS,
      ];
      if (!reorderableStatuses.includes(run.status)) {
        throw new ConflictException('Esta rota não permite mais alterar a ordem das paradas.');
      }
      if (run.version !== expectedVersion) throw new ConflictException('A rota foi atualizada; recarregue antes de reordenar.');

      const future = run.stops.filter((stop) => stop.status === DeliveryStopStatus.PENDING);
      if (future.length !== stopIds.length || future.some((stop) => !stopIds.includes(stop.id))) {
        throw new BadRequestException('A sequência deve conter exatamente as paradas futuras da rota.');
      }
      const firstSequence = Math.min(...future.map((stop) => stop.sequence));
      await tx.deliveryStop.updateMany({
        where: { tenantId, runId, id: { in: stopIds } },
        data: { sequence: { increment: 1_000_000 } },
      });
      for (const [index, stopId] of stopIds.entries()) {
        await tx.deliveryStop.updateMany({
          where: { id: stopId, tenantId, runId, status: DeliveryStopStatus.PENDING },
          data: { sequence: firstSequence + index },
        });
      }
      const changed = await tx.deliveryRun.updateMany({
        where: { id: run.id, tenantId, version: expectedVersion },
        data: {
          version: { increment: 1 },
          history: this.appendHistory(run.history, this.historyEvent('STOPS_REORDERED', new Date(), actorId, { stopIds })),
        },
      });
      if (changed.count !== 1) throw new ConflictException('A rota foi atualizada durante a reordenação.');
      return this.getRun(tx, tenantId, runId);
    });
  }

  async cancelStopFromOrderCancellation(tenantId: string, orderId: string, reason = 'Pedido cancelado') {
    return this.transaction(async (tx) => {
      const stop = await tx.deliveryStop.findFirst({
        where: { tenantId, orderId, status: { in: OPEN_STOP_STATUSES } },
        include: { run: { include: { stops: { orderBy: { sequence: 'asc' } } } } },
      });
      if (!stop) return null;
      const cancelledAt = new Date();
      await tx.deliveryStop.update({
        where: { id: stop.id },
        data: { status: DeliveryStopStatus.CANCELLED, cancelledAt, cancellationReason: reason },
      });
      await this.advanceOrFinalize(tx, stop.run, stop.id, cancelledAt, 'STOP_CANCELLED');
      return this.getRun(tx, tenantId, stop.runId);
    });
  }

  async markStopArrived(tenantId: string, runId: string, stopId: string, driverId: string) {
    return this.transaction(async (tx) => {
      const run = await this.getDriverRun(tx, tenantId, runId, driverId);
      const stop = run.stops.find((item) => item.id === stopId);
      if (stop?.status === DeliveryStopStatus.ARRIVED) return run;
      if (run.status !== DeliveryRunStatus.IN_PROGRESS || !stop || stop.status !== DeliveryStopStatus.CURRENT) {
        throw new ConflictException('Esta não é a parada atual da rota.');
      }
      const arrivedAt = new Date();
      await tx.deliveryStop.update({
        where: { id: stopId },
        data: { status: DeliveryStopStatus.ARRIVED, arrivedAt, attempts: { increment: 1 } },
      });
      await this.recordRunEvent(tx, run, 'STOP_ARRIVED', arrivedAt, driverId, { stopId });
      return this.getRun(tx, tenantId, runId);
    });
  }

  async completeStop(tenantId: string, runId: string, stopId: string, driverId: string) {
    return this.transaction(async (tx) => {
      const run = await this.getDriverRun(tx, tenantId, runId, driverId);
      const stop = run.stops.find((item) => item.id === stopId);
      if (stop?.status === DeliveryStopStatus.DELIVERED) return run;
      if (!stop || stop.status !== DeliveryStopStatus.ARRIVED) {
        throw new ConflictException('A parada precisa estar marcada como chegada.');
      }
      const deliveredAt = new Date();
      const order = await tx.order.findFirst({ where: { id: stop.orderId, tenantId, status: 'out_for_delivery' } });
      if (!order || !ORDER_STATUS_TRANSITIONS[order.status].includes('completed')) {
        throw new ConflictException('O pedido não pode ser concluído neste estado.');
      }
      const changed = await tx.order.updateMany({
        where: { id: order.id, tenantId, status: 'out_for_delivery' },
        data: { status: 'completed' },
      });
      if (changed.count !== 1) throw new ConflictException('O pedido foi atualizado durante a conclusão.');
      await tx.orderTimeline.create({
        data: {
          tenantId,
          orderId: order.id,
          status: 'completed',
          note: 'Entrega concluída na rota.',
          actorId: driverId,
          actorType: 'delivery_driver',
        },
      });
      await tx.deliveryStop.update({
        where: { id: stop.id },
        data: { status: DeliveryStopStatus.DELIVERED, deliveredAt },
      });
      await this.advanceOrFinalize(tx, run, stop.id, deliveredAt, 'STOP_DELIVERED');
      return this.getRun(tx, tenantId, runId);
    });
  }

  async markFailedAttempt(
    tenantId: string,
    runId: string,
    stopId: string,
    driverId: string,
    reason: string,
  ) {
    if (!reason.trim()) throw new BadRequestException('Informe o motivo da tentativa sem sucesso.');
    return this.transaction(async (tx) => {
      const run = await this.getDriverRun(tx, tenantId, runId, driverId);
      const stop = run.stops.find((item) => item.id === stopId);
      if (stop?.status === DeliveryStopStatus.RETURN_TO_STORE) return run;
      if (!stop || stop.status !== DeliveryStopStatus.ARRIVED) {
        throw new ConflictException('A parada precisa estar marcada como chegada.');
      }
      const failedAt = new Date();
      await tx.deliveryStop.update({
        where: { id: stop.id },
        data: {
          status: DeliveryStopStatus.RETURN_TO_STORE,
          failedAt,
          failureReason: reason.trim(),
          returnRequiredAt: failedAt,
        },
      });
      await this.advanceOrFinalize(tx, run, stop.id, failedAt, 'STOP_FAILED_ATTEMPT', { reason: reason.trim() });
      return this.getRun(tx, tenantId, runId);
    });
  }

  async confirmReturnedToStore(tenantId: string, runId: string, stopId: string, driverId: string) {
    return this.transaction(async (tx) => {
      const run = await this.getDriverRun(tx, tenantId, runId, driverId);
      const stop = run.stops.find((item) => item.id === stopId);
      if (stop?.status === DeliveryStopStatus.RETURNED_TO_STORE) return run;
      if (!stop || stop.status !== DeliveryStopStatus.RETURN_TO_STORE) {
        throw new ConflictException('Esta parada não possui retorno pendente.');
      }
      const returnedAt = new Date();
      await tx.deliveryStop.update({
        where: { id: stop.id },
        data: { status: DeliveryStopStatus.RETURNED_TO_STORE, returnedAt },
      });
      await this.advanceOrFinalize(tx, run, stop.id, returnedAt, 'STOP_RETURNED_TO_STORE');
      return this.getRun(tx, tenantId, runId);
    });
  }

  async completeRun(tenantId: string, runId: string, driverId: string) {
    return this.transaction(async (tx) => {
      const run = await this.getDriverRun(tx, tenantId, runId, driverId);
      if (run.status === DeliveryRunStatus.COMPLETED) return run;
      await this.completeRunInTransaction(tx, run, new Date());
      return this.getRun(tx, tenantId, runId);
    });
  }

  private async advanceOrFinalize(
    tx: TransactionClient,
    run: RunWithStops,
    changedStopId: string,
    occurredAt: Date,
    eventType: string,
    details: Prisma.InputJsonObject = {},
  ) {
    const refreshedStops = await tx.deliveryStop.findMany({
      where: { tenantId: run.tenantId, runId: run.id },
      orderBy: { sequence: 'asc' },
    });
    const next = refreshedStops.find((stop) => stop.status === DeliveryStopStatus.PENDING);
    if (next) {
      await tx.deliveryStop.update({ where: { id: next.id }, data: { status: DeliveryStopStatus.CURRENT } });
      await this.recordRunEvent(tx, run, eventType, occurredAt, undefined, { ...details, stopId: changedStopId, nextStopId: next.id });
      return;
    }

    const pendingReturn = refreshedStops.some((stop) => stop.status === DeliveryStopStatus.RETURN_TO_STORE);
    if (pendingReturn) {
      await tx.deliveryRun.update({
        where: { id: run.id },
        data: {
          status: DeliveryRunStatus.RETURNING,
          returningAt: run.returningAt ?? occurredAt,
          version: { increment: 1 },
          history: this.appendHistory(run.history, this.historyEvent(eventType, occurredAt, undefined, { ...details, stopId: changedStopId })),
        },
      });
      return;
    }
    await this.completeRunInTransaction(tx, run, occurredAt, eventType, { ...details, stopId: changedStopId });
  }

  private async completeRunInTransaction(
    tx: TransactionClient,
    run: RunWithStops,
    completedAt: Date,
    precedingEvent?: string,
    details: Prisma.InputJsonObject = {},
  ) {
    const openStops = await tx.deliveryStop.count({
      where: { tenantId: run.tenantId, runId: run.id, status: { in: OPEN_STOP_STATUSES } },
    });
    if (openStops > 0) throw new ConflictException('Conclua todas as paradas e retornos antes de finalizar a rota.');
    const history = precedingEvent
      ? this.appendHistory(run.history, this.historyEvent(precedingEvent, completedAt, undefined, details))
      : this.appendHistory(run.history, this.historyEvent('RUN_COMPLETED', completedAt));
    const finalHistory = precedingEvent
      ? [...history, this.historyEvent('RUN_COMPLETED', completedAt)]
      : history;
    await tx.deliveryRun.update({
      where: { id: run.id },
      data: {
        status: DeliveryRunStatus.COMPLETED,
        completedAt,
        version: { increment: 1 },
        history: finalHistory,
      },
    });
    await tx.deliveryDriver.update({ where: { id: run.driverId }, data: { status: 'available' } });
  }

  private async recordRunEvent(
    tx: TransactionClient,
    run: RunWithStops,
    type: string,
    occurredAt: Date,
    actorId?: string,
    details: Prisma.InputJsonObject = {},
  ) {
    await tx.deliveryRun.update({
      where: { id: run.id },
      data: {
        version: { increment: 1 },
        history: this.appendHistory(run.history, this.historyEvent(type, occurredAt, actorId, details)),
      },
    });
  }

  private toDTO(run: TenantRun): DeliveryRunDTO {
    return {
      id: run.id,
      driverId: run.driverId,
      driverName: run.driver.name,
      status: SharedDeliveryRunStatus[run.status],
      version: run.version,
      assignedAt: run.assignedAt?.toISOString() ?? null,
      acceptedAt: run.acceptedAt?.toISOString() ?? null,
      startedAt: run.startedAt?.toISOString() ?? null,
      returningAt: run.returningAt?.toISOString() ?? null,
      completedAt: run.completedAt?.toISOString() ?? null,
      createdAt: run.createdAt.toISOString(),
      stops: run.stops.map((stop) => this.stopToDTO(stop)),
    };
  }

  private async getTenantRunDTO(tenantId: string, runId: string): Promise<DeliveryRunDTO> {
    const run = await this.prisma.deliveryRun.findFirst({
      where: { id: runId, tenantId },
      include: { driver: true, stops: { orderBy: { sequence: 'asc' } } },
    });
    if (!run) throw new NotFoundException('Rota de entrega não encontrada.');
    return this.toDTO(run);
  }

  private stopToDTO(stop: TenantRun['stops'][number]): DeliveryStopDTO {
    const address = stop.addressSnapshot;
    return {
      id: stop.id,
      orderId: stop.orderId,
      sequence: stop.sequence,
      status: SharedDeliveryStopStatus[stop.status],
      attempts: stop.attempts,
      orderNumber: stop.orderNumberSnapshot,
      customerName: stop.customerNameSnapshot,
      customerPhone: stop.customerPhoneSnapshot,
      address: address && typeof address === 'object' && !Array.isArray(address)
        ? address
        : null,
      arrivedAt: stop.arrivedAt?.toISOString() ?? null,
      deliveredAt: stop.deliveredAt?.toISOString() ?? null,
      failedAt: stop.failedAt?.toISOString() ?? null,
      failureReason: stop.failureReason,
      returnRequiredAt: stop.returnRequiredAt?.toISOString() ?? null,
      returnedAt: stop.returnedAt?.toISOString() ?? null,
      cancelledAt: stop.cancelledAt?.toISOString() ?? null,
      cancellationReason: stop.cancellationReason,
    };
  }

  private getRun(tx: TransactionClient, tenantId: string, runId: string): Promise<RunWithStops> {
    return tx.deliveryRun.findFirst({
      where: { id: runId, tenantId },
      include: { stops: { orderBy: { sequence: 'asc' } } },
    }).then((run) => {
      if (!run) throw new NotFoundException('Rota de entrega não encontrada.');
      return run;
    });
  }

  private async getDriverRun(tx: TransactionClient, tenantId: string, runId: string, driverId: string) {
    const run = await tx.deliveryRun.findFirst({
      where: { id: runId, tenantId, driverId },
      include: { stops: { orderBy: { sequence: 'asc' } } },
    });
    if (!run) throw new NotFoundException('Rota de entrega não encontrada para este entregador.');
    return run;
  }

  private historyEvent(
    type: string,
    occurredAt: Date,
    actorId?: string,
    details: Prisma.InputJsonObject = {},
  ): Prisma.InputJsonObject {
    return {
      type,
      occurredAt: occurredAt.toISOString(),
      actorId: actorId ?? null,
      ...details,
    };
  }

  private appendHistory(history: Prisma.JsonValue, event: Prisma.InputJsonObject): Prisma.InputJsonArray {
    const previous: Prisma.InputJsonObject[] = [];
    if (Array.isArray(history)) {
      for (const entry of history) {
        if (entry && typeof entry === 'object' && !Array.isArray(entry)) {
          previous.push(entry);
        }
      }
    }
    return [...previous, event];
  }

  private transaction<T>(operation: (tx: TransactionClient) => Promise<T>): Promise<T> {
    return runSerializableTransactionWithRetry(this.prisma, operation).catch((error: unknown) => {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('A operação conflita com outra rota ou turno ativo.');
      }
      throw error;
    });
  }
}
