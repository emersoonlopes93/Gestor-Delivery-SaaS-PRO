import { Injectable, NotFoundException, BadRequestException, Inject, forwardRef } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { CreateDriverDTO, UpdateDriverDTO } from '@gestor/types';
import { UpdateDriverLocationDTO } from './dto/update-driver-location.dto';
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

  async updateDriverLocation(tenantId: string, id: string, data: UpdateDriverLocationDTO) {
    const driver = await this.getDriver(tenantId, id);
    const now = new Date();
    
    const lastLocationAt = driver.lastLocationAt;
    const shouldWriteHistory = !lastLocationAt || (now.getTime() - lastLocationAt.getTime() >= 10_000);

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
