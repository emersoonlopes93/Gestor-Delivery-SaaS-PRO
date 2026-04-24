import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { CreateDriverDTO, UpdateDriverDTO } from '@gestor/types';
import { UpdateDriverLocationDTO } from './dto/update-driver-location.dto';
import { DeliveryTrackingGateway } from './delivery-tracking.gateway';

@Injectable()
export class DriversService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly trackingGateway: DeliveryTrackingGateway,
  ) {}

  private asRecord(value: unknown): Record<string, unknown> | null {
    return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null;
  }

  private pickDate(value: unknown): Date | null {
    return value instanceof Date ? value : null;
  }

  private shouldWriteLocationHistory(now: Date, last: Date | null): boolean {
    if (!last) return true;
    const deltaMs = now.getTime() - last.getTime();
    return deltaMs >= 10_000;
  }

  async listDrivers(tenantId: string) {
    return this.prisma.deliveryDriver.findMany({
      where: { tenantId },
      orderBy: { name: 'asc' },
    });
  }

  async updateDriverLocation(tenantId: string, id: string, data: UpdateDriverLocationDTO) {
    const driver = await this.getDriver(tenantId, id);

    const driverRec = this.asRecord(driver);
    const lastLocationAt = driverRec ? this.pickDate(driverRec.lastLocationAt) : null;

    const now = new Date();
    const shouldWriteHistory = this.shouldWriteLocationHistory(now, lastLocationAt);

    await this.prisma.$transaction(async (tx) => {
      await tx.deliveryDriver.update({
        where: { id: driver.id },
        data: {
          currentLat: data.lat,
          currentLng: data.lng,
          lastLocationAt: now,
        },
      });

      if (shouldWriteHistory) {
        await tx.deliveryDriverLocation.create({
          data: {
            tenantId,
            driverId: driver.id,
            lat: data.lat,
            lng: data.lng,
          },
        });
      }
    });

    // Broadcast location to active orders being delivered by this driver
    const activeOrders = await this.prisma.order.findMany({
      where: {
        deliveryDriverId: driver.id,
        status: 'out_for_delivery',
      },
      select: { publicTrackingToken: true },
    });

    for (const order of activeOrders) {
      if (order.publicTrackingToken) {
        this.trackingGateway.emitLocationUpdate(order.publicTrackingToken, {
          lat: data.lat,
          lng: data.lng,
          driverId: driver.id,
        });
      }
    }

    return {
      success: true,
      sampled: shouldWriteHistory,
      driverId: driver.id,
      currentLat: data.lat,
      currentLng: data.lng,
      lastLocationAt: now.toISOString(),
    };
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
    return this.prisma.deliveryDriver.create({
      data: {
        tenantId,
        name: data.name,
        phone: data.phone,
        vehicleType: data.vehicleType,
        notes: data.notes,
      },
    });
  }

  async updateDriver(tenantId: string, id: string, data: UpdateDriverDTO) {
    const driver = await this.getDriver(tenantId, id);

    return this.prisma.deliveryDriver.update({
      where: { id: driver.id },
      data: {
        name: data.name,
        phone: data.phone,
        isActive: data.isActive,
        status: data.status,
        vehicleType: data.vehicleType,
        notes: data.notes,
      },
    });
  }

  async deleteDriver(tenantId: string, id: string) {
    const driver = await this.getDriver(tenantId, id);
    // Ideally soft-delete, or hard-delete if no orders associated.
    // For now we will hard-delete since Prisma handles Cascade, but better practice
    // is to prevent delete if orders exist. Let's do that.
    
    const ordersCount = await this.prisma.order.count({
      where: { deliveryDriverId: id },
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
