import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { UpdateCustomerDTO } from '@gestor/types';
import type { Prisma } from '@prisma/client';

@Injectable()
export class CustomerService {
  constructor(private readonly db: PrismaService) {}

  async listCustomers(tenantId: string) {
    const customers = await this.db.customer.findMany({
      where: { tenantId },
      orderBy: { lastOrderDate: 'desc' },
      select: {
        id: true,
        tenantId: true,
        name: true,
        phone: true,
        email: true,
        totalOrders: true,
        totalSpent: true,
        lastOrderDate: true,
        loyaltyPoints: true,
        cashbackBalance: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    
    type CustomerListRow = Prisma.CustomerGetPayload<{
      select: {
        id: true;
        tenantId: true;
        name: true;
        phone: true;
        email: true;
        totalOrders: true;
        totalSpent: true;
        lastOrderDate: true;
        loyaltyPoints: true;
        cashbackBalance: true;
        createdAt: true;
        updatedAt: true;
      };
    }>;

    // We parse Decimal to number
    return (customers as CustomerListRow[]).map((c) => ({
      ...c,
      totalSpent: Number(c.totalSpent),
      cashbackBalance: Number(c.cashbackBalance),
    }));
  }

  async getCustomer(tenantId: string, id: string) {
    const customer = await this.db.customer.findUnique({
      where: { id, tenantId },
    });

    if (!customer) {
      throw new NotFoundException('Customer not found');
    }

    return {
      ...customer,
      totalSpent: Number(customer.totalSpent),
      cashbackBalance: Number(customer.cashbackBalance),
    };
  }

  async updateCustomer(tenantId: string, id: string, data: UpdateCustomerDTO) {
    const customer = await this.db.customer.findUnique({
      where: { id, tenantId },
    });

    if (!customer) {
      throw new NotFoundException('Customer not found');
    }

    const updated = await this.db.customer.update({
      where: { id },
      data: {
        name: data.name !== undefined ? data.name : customer.name,
        email: data.email !== undefined ? data.email : customer.email,
        notes: data.notes !== undefined ? data.notes : customer.notes,
      },
    });

    return {
      ...updated,
      totalSpent: Number(updated.totalSpent),
      cashbackBalance: Number(updated.cashbackBalance),
    };
  }

  // Called during Order creation to upsert customer explicitly using exactly tenantId and phone
  async syncCustomerOnOrderUpsert(
    tenantId: string, 
    phone: string, 
    name: string,
    email?: string | null,
  ) {
    if (!phone) return null;

    return this.db.customer.upsert({
      where: {
        tenantId_phone: {
          tenantId,
          phone,
        },
      },
      update: {
        // If customer exists, we might want to update the name/email if it's new
        // We'll trust the latest order name, or just keep it as is. Let's update it.
        name,
        ...(email && { email }),
      },
      create: {
        tenantId,
        phone,
        name,
        email: email || null,
        totalOrders: 0,
        totalSpent: 0,
        loyaltyPoints: 0,
        cashbackBalance: 0,
      },
    });
  }

  async applyMetricsFromCompletedOrder(tenantId: string, customerId: string, orderTotal: number) {
    // Triggers when an order actually completes (Phase 5 timelines, etc.)
    await this.db.customer.update({
      where: { id: customerId, tenantId },
      data: {
        totalOrders: { increment: 1 },
        totalSpent: { increment: orderTotal },
        lastOrderDate: new Date(),
      },
    });
  }
}
