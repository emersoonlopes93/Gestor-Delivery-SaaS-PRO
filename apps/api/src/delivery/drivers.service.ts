import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { CreateDriverDTO, UpdateDriverDTO } from '@gestor/types';

@Injectable()
export class DriversService {
  constructor(private readonly prisma: PrismaService) {}

  async listDrivers(tenantId: string) {
    return this.prisma.deliveryDriver.findMany({
      where: { tenantId },
      orderBy: { name: 'asc' },
    });
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
