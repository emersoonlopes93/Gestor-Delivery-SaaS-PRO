import { Injectable, NotFoundException, BadRequestException, Inject, forwardRef } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import {
  CreateDriverDTO,
  DriverStatus,
  UpdateDriverDTO,
  type DriverLocationIngestResultDTO,
  type DriverLocationPointDTO,
} from '@gestor/types';
import { DeliveryTrackingGateway } from './delivery-tracking.gateway';
import { Prisma } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

@Injectable()
export class DriversService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(forwardRef(() => DeliveryTrackingGateway))
    private readonly trackingGateway: DeliveryTrackingGateway,
  ) {}

  private normalizePhone(phone: string): string {
    return phone.replace(/\D/g, '');
  }

  private generatePin(length = 6): string {
    return Math.floor(100000 + Math.random() * 900000).toString().substring(0, length);
  }

  async listDrivers(tenantId: string) {
    const drivers = await this.prisma.deliveryDriver.findMany({
      where: { tenantId },
      orderBy: { name: 'asc' },
    });

    return drivers.map(({ pin: _pin, ...driver }) => ({
      ...driver,
      dailyRate: driver.dailyRate === null ? null : Number(driver.dailyRate),
      payFixedAmount: driver.payFixedAmount === null ? null : Number(driver.payFixedAmount),
      payPercentage: driver.payPercentage === null ? null : Number(driver.payPercentage),
      lastLocationAt: driver.lastLocationAt?.toISOString() ?? null,
    }));
  }

  async getDriver(tenantId: string, id: string) {
    const driver = await this.prisma.deliveryDriver.findUnique({
      where: { id, tenantId },
    });

    if (!driver) {
      throw new NotFoundException('Delivery driver not found');
    }

    return driver;
  }

  async createDriver(tenantId: string, data: CreateDriverDTO) {
    const normalizedPhone = this.normalizePhone(data.phone);

    // Check for existing driver with same phone in this tenant
    const existing = await this.prisma.deliveryDriver.findUnique({
      where: {
        tenantId_phone: {
          tenantId,
          phone: normalizedPhone,
        },
      },
    });

    if (existing) {
      throw new BadRequestException('Já existe um entregador com este telefone neste estabelecimento.');
    }

    const rawPin = this.generatePin();
    const pinHash = await bcrypt.hash(rawPin, 10);

    const driver = await this.prisma.deliveryDriver.create({
      data: {
        tenantId,
        name: data.name,
        phone: normalizedPhone,
        pin: pinHash,
        vehicleType: data.vehicleType,
        notes: data.notes,
      },
    });

    return {
      ...driver,
      pin: rawPin, // Retorna apenas na criação
    };
  }

  async resetDriverPin(tenantId: string, id: string) {
    const driver = await this.getDriver(tenantId, id);

    const rawPin = this.generatePin();
    const pinHash = await bcrypt.hash(rawPin, 10);

    const updated = await this.prisma.deliveryDriver.update({
      where: { id: driver.id },
      data: { pin: pinHash },
    });

    return {
      ...updated,
      pin: rawPin, // Retorna apenas no reset
    };
  }

  async updateDriver(tenantId: string, id: string, data: UpdateDriverDTO) {
    const driver = await this.getDriver(tenantId, id);

    const updateData: Prisma.DeliveryDriverUpdateInput = {
      name: data.name,
      isActive: data.isActive,
      status: data.status,
      vehicleType: data.vehicleType,
      notes: data.notes,
      payOverrideEnabled: data.payOverrideEnabled,
      payMode: data.payMode,
      dailyRate: data.dailyRate,
      payFixedAmount: data.payFixedAmount,
      payPercentage: data.payPercentage,
      payRateTable: data.payRateTable?.map((tier) => ({ upToKm: tier.upToKm, amount: tier.amount })),
      payFailedAttempt: data.payFailedAttempt,
    };

    if (data.phone) {
      const normalizedPhone = this.normalizePhone(data.phone);
      if (normalizedPhone !== driver.phone) {
        // Check for collision
        const collision = await this.prisma.deliveryDriver.findUnique({
          where: {
            tenantId_phone: {
              tenantId,
              phone: normalizedPhone,
            },
          },
        });
        if (collision) {
          throw new BadRequestException('Este telefone já está em uso por outro entregador.');
        }
        updateData.phone = normalizedPhone;
      }
    }

    return this.prisma.deliveryDriver.update({
      where: { id: driver.id },
      data: updateData,
    });
  }

  async ingestDriverLocations(
    tenantId: string,
    id: string,
    points: DriverLocationPointDTO[],
    now = new Date(),
  ): Promise<DriverLocationIngestResultDTO> {
    if (points.length === 0 || points.length > 100) {
      throw new BadRequestException('Envie entre 1 e 100 pontos de localizacao.');
    }
    if (points.some((point) => (
      !point.eventKey
      || point.eventKey.length > 128
      || !Number.isFinite(point.lat)
      || point.lat < -90
      || point.lat > 90
      || !Number.isFinite(point.lng)
      || point.lng < -180
      || point.lng > 180
      || (point.accuracy !== undefined && (!Number.isFinite(point.accuracy) || point.accuracy < 0 || point.accuracy > 10_000))
      || (point.heading !== undefined && (!Number.isFinite(point.heading) || point.heading < 0 || point.heading > 360))
      || (point.speed !== undefined && (!Number.isFinite(point.speed) || point.speed < 0 || point.speed > 150))
      || !['foreground', 'background'].includes(point.source)
    ))) {
      throw new BadRequestException('Um ou mais pontos de localizacao sao invalidos.');
    }
    const driver = await this.getDriver(tenantId, id);
    const shift = await this.prisma.driverShift.findFirst({
      where: { tenantId, driverId: driver.id, status: 'ACTIVE' },
      orderBy: { startedAt: 'desc' },
      select: { id: true },
    });
    if (!shift) throw new BadRequestException('Inicie seu turno antes de compartilhar a localização.');

    const run = await this.prisma.deliveryRun.findFirst({
      where: {
        tenantId,
        driverId: driver.id,
        shiftId: shift.id,
        status: { in: ['IN_PROGRESS', 'RETURNING'] },
      },
      select: { id: true },
    });
    if (!run) throw new BadRequestException('A localização ao vivo só é usada durante uma rota ativa.');

    const uniquePoints = new Map<string, DriverLocationPointDTO>();
    for (const point of points) {
      if (!uniquePoints.has(point.eventKey)) uniquePoints.set(point.eventKey, point);
    }
    const ordered = [...uniquePoints.values()]
      .map((point) => ({ ...point, timestamp: new Date(point.recordedAt) }))
      .sort((left, right) => left.timestamp.getTime() - right.timestamp.getTime());
    const oldestAllowed = now.getTime() - 24 * 60 * 60 * 1_000;
    const newestAllowed = now.getTime() + 5 * 60 * 1_000;
    if (ordered.some((point) => (
      Number.isNaN(point.timestamp.getTime())
      || point.timestamp.getTime() < oldestAllowed
      || point.timestamp.getTime() > newestAllowed
    ))) {
      throw new BadRequestException('Um ou mais pontos possuem horário inválido.');
    }

    const eventKeys = ordered.map((point) => point.eventKey);
    const existing = await this.prisma.deliveryDriverLocation.findMany({
      where: { tenantId, driverId: driver.id, eventKey: { in: eventKeys } },
      select: { eventKey: true },
    });
    const duplicateEventKeys = existing
      .map((point) => point.eventKey)
      .filter((eventKey): eventKey is string => Boolean(eventKey));
    const duplicateSet = new Set(duplicateEventKeys);
    const lastSample = await this.prisma.deliveryDriverLocation.findFirst({
      where: { tenantId, driverId: driver.id, runId: run.id },
      orderBy: [{ recordedAt: 'desc' }, { id: 'desc' }],
      select: { recordedAt: true },
    });
    const existingLastSampleAt = lastSample?.recordedAt.getTime() ?? Number.NEGATIVE_INFINITY;
    let replaySampleAt = Number.NEGATIVE_INFINITY;
    let liveSampleAt = existingLastSampleAt;
    const sampledOutEventKeys: string[] = [];
    const candidates = ordered.filter((point) => {
      if (duplicateSet.has(point.eventKey)) return false;
      const pointTime = point.timestamp.getTime();
      const comparisonSampleAt = pointTime <= existingLastSampleAt ? replaySampleAt : liveSampleAt;
      if (pointTime - comparisonSampleAt < 10_000) {
        sampledOutEventKeys.push(point.eventKey);
        return false;
      }
      if (pointTime <= existingLastSampleAt) replaySampleAt = pointTime;
      else liveSampleAt = pointTime;
      return true;
    });
    const newest = ordered[ordered.length - 1];

    await this.prisma.$transaction(async (tx) => {
      if (candidates.length > 0) {
        await tx.deliveryDriverLocation.createMany({
          data: candidates.map((point) => ({
            tenantId,
            driverId: driver.id,
            shiftId: shift.id,
            runId: run.id,
            eventKey: point.eventKey,
            lat: point.lat,
            lng: point.lng,
            recordedAt: point.timestamp,
            accuracy: point.accuracy,
            heading: point.heading,
            speed: point.speed,
            source: point.source,
          })),
          skipDuplicates: true,
        });
      }
      if (newest && (!driver.lastLocationAt || newest.timestamp > driver.lastLocationAt)) {
        await tx.deliveryDriver.update({
          where: { id: driver.id },
          data: {
            currentLat: newest.lat,
            currentLng: newest.lng,
            lastLocationAt: newest.timestamp,
          },
        });
      }
    });

    if (newest && (!driver.lastLocationAt || newest.timestamp > driver.lastLocationAt)) {
      this.trackingGateway.emitDriverLocationUpdated(tenantId, {
        tenantId,
        driverId: driver.id,
        runId: run.id,
        lat: newest.lat,
        lng: newest.lng,
        lastLocationAt: newest.timestamp.toISOString(),
      });
      const activeOrders = await this.prisma.order.findMany({
        where: { tenantId, deliveryDriverId: driver.id, status: 'out_for_delivery' },
        select: { publicTrackingToken: true },
      });
      for (const order of activeOrders) {
        if (order.publicTrackingToken) {
          this.trackingGateway.emitLocationUpdate(order.publicTrackingToken, {
            lat: newest.lat,
            lng: newest.lng,
            driverId: driver.id,
          });
        }
      }
    }

    return {
      acknowledgedEventKeys: eventKeys,
      persistedEventKeys: candidates.map((point) => point.eventKey),
      duplicateEventKeys,
      sampledOutEventKeys,
    };
  }

  async updateOperationalStatus(
    tenantId: string,
    id: string,
    status: DriverStatus.available | DriverStatus.offline,
  ) {
    const driver = await this.getDriver(tenantId, id);
    const [activeRuns, legacyActiveDeliveries] = await Promise.all([
      this.prisma.deliveryRun.count({
        where: {
          tenantId,
          driverId: driver.id,
          status: { in: ['PENDING_ACCEPTANCE', 'ASSIGNED', 'IN_PROGRESS', 'RETURNING'] },
        },
      }),
      this.prisma.order.count({
        where: {
          tenantId,
          deliveryDriverId: driver.id,
          status: { in: ['ready_for_delivery', 'out_for_delivery'] },
        },
      }),
    ]);

    if (activeRuns > 0 || legacyActiveDeliveries > 0) {
      if (driver.status !== DriverStatus.busy) {
        await this.prisma.deliveryDriver.update({
          where: { id: driver.id },
          data: { status: DriverStatus.busy },
        });
      }
      throw new BadRequestException('Conclua a entrega ativa antes de alterar sua disponibilidade.');
    }

    return this.prisma.deliveryDriver.update({
      where: { id: driver.id },
      data: { status },
      select: { id: true, status: true },
    });
  }

  async deleteDriver(tenantId: string, id: string) {
    const driver = await this.getDriver(tenantId, id);
    // Ideally soft-delete, or hard-delete if no orders associated.
    // For now we will hard-delete since Prisma handles Cascade, but better practice
    // is to prevent delete if orders exist. Let's do that.
    
    const ordersCount = await this.prisma.order.count({
      where: { tenantId, deliveryDriverId: id },
    });

    if (ordersCount > 0) {
        // Soft delete mechanism or error block
        return this.prisma.deliveryDriver.update({
            where: { id: driver.id },
            data: { isActive: false, status: 'offline' }
        });
    }

    return this.prisma.deliveryDriver.delete({
      where: { id: driver.id },
    });
  }
}
