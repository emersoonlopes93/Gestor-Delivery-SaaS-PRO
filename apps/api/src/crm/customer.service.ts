import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import {
  CreateCustomerDTO,
  CustomerAddressDTO,
  CustomerAddressSummaryDTO,
  PosCustomerSearchResultDTO,
  UpdateCustomerDTO,
  UpsertCustomerAddressDTO,
} from '@gestor/types';
import type { CustomerAddress, Prisma } from '@prisma/client';

@Injectable()
export class CustomerService {
  constructor(private readonly db: PrismaService) {}

  private normalizePhone(phone: string): string {
    return phone.replace(/\D/g, '');
  }

  private ensureRequiredText(value: string | undefined | null, label: string): string {
    const text = value?.trim();
    if (!text) throw new BadRequestException(`${label} e obrigatorio.`);
    return text;
  }

  private normalizeState(value: string | undefined | null): string {
    const text = value?.trim().toUpperCase();
    return text ? text.slice(0, 2) : 'NA';
  }

  private normalizeZipCode(value: string | undefined | null): string {
    const text = value?.replace(/\D/g, '');
    return text || '00000000';
  }

  private mapCustomerAddress(address: CustomerAddress): CustomerAddressDTO {
    return {
      id: address.id,
      tenantId: address.tenantId,
      customerId: address.customerId,
      label: address.label,
      street: address.street,
      number: address.number,
      complement: address.complement,
      neighborhood: address.neighborhood,
      city: address.city,
      state: address.state,
      zipCode: address.zipCode,
      reference: address.reference,
      lat: address.lat,
      lng: address.lng,
      isDefault: address.isDefault,
      createdAt: address.createdAt.toISOString(),
      updatedAt: address.updatedAt.toISOString(),
    };
  }

  private mapCustomerAddressSummary(address: CustomerAddress): CustomerAddressSummaryDTO {
    return {
      id: address.id,
      label: address.label,
      street: address.street,
      number: address.number,
      complement: address.complement,
      neighborhood: address.neighborhood,
      city: address.city,
      state: address.state,
      zipCode: address.zipCode,
      reference: address.reference,
      lat: address.lat,
      lng: address.lng,
      isDefault: address.isDefault,
    };
  }

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

  async searchCustomers(tenantId: string, rawQuery: string, rawLimit?: number): Promise<PosCustomerSearchResultDTO[]> {
    const query = rawQuery.trim();
    if (query.length < 2) return [];

    const limit = Math.min(Math.max(rawLimit || 8, 1), 12);
    const normalizedPhone = this.normalizePhone(query);
    const phoneConditions = normalizedPhone
      ? [
          { phone: { contains: normalizedPhone, mode: 'insensitive' as const } },
          { phone: { contains: query, mode: 'insensitive' as const } },
        ]
      : [{ phone: { contains: query, mode: 'insensitive' as const } }];

    const customers = await this.db.customer.findMany({
      where: {
        tenantId,
        OR: [
          { name: { contains: query, mode: 'insensitive' } },
          ...phoneConditions,
        ],
      },
      orderBy: [{ lastOrderDate: 'desc' }, { updatedAt: 'desc' }],
      take: limit,
      include: {
        addresses: {
          orderBy: [{ isDefault: 'desc' }, { updatedAt: 'desc' }],
          take: 5,
        },
      },
    });

    return customers.map((customer) => ({
      id: customer.id,
      name: customer.name,
      phone: customer.phone,
      email: customer.email,
      notes: customer.notes,
      lastOrderAt: customer.lastOrderDate?.toISOString() || null,
      orderCount: customer.totalOrders,
      addresses: customer.addresses.map((address) => this.mapCustomerAddressSummary(address)),
    }));
  }

  async createCustomer(tenantId: string, data: CreateCustomerDTO) {
    const rawPhone = this.ensureRequiredText(data.phone, 'Telefone');
    const phone = this.normalizePhone(rawPhone);
    if (phone.length < 8) {
      throw new BadRequestException('Telefone deve ter pelo menos 8 digitos.');
    }

    const existing = await this.db.customer.findFirst({
      where: {
        tenantId,
        OR: [{ phone }, { phone: rawPhone }],
      },
    });
    if (existing) {
      throw new ConflictException('Cliente ja existe para este telefone. Selecione o cliente existente.');
    }

    const customer = await this.db.customer.create({
      data: {
        tenantId,
        name: this.ensureRequiredText(data.name, 'Nome'),
        phone,
        email: data.email?.trim() || null,
        notes: data.notes?.trim() || null,
        totalOrders: 0,
        totalSpent: 0,
        loyaltyPoints: 0,
        cashbackBalance: 0,
      },
    });

    return {
      ...customer,
      totalSpent: Number(customer.totalSpent),
      cashbackBalance: Number(customer.cashbackBalance),
    };
  }

  async getCustomer(tenantId: string, id: string) {
    const customer = await this.db.customer.findUnique({
      where: { id, tenantId },
      include: {
        addresses: {
          where: { tenantId },
          orderBy: [{ isDefault: 'desc' }, { updatedAt: 'desc' }],
        },
        orders: {
          where: { tenantId },
          orderBy: { createdAt: 'desc' },
          take: 10,
          select: {
            id: true,
            orderNumber: true,
            status: true,
            fulfillmentType: true,
            total: true,
            createdAt: true,
          },
        },
      },
    });

    if (!customer) {
      throw new NotFoundException('Customer not found');
    }

    return {
      ...customer,
      totalSpent: Number(customer.totalSpent),
      cashbackBalance: Number(customer.cashbackBalance),
      orders: customer.orders.map((order) => ({
        ...order,
        total: Number(order.total),
      })),
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

  private async assertCustomerBelongsToTenant(tenantId: string, customerId: string): Promise<void> {
    const customer = await this.db.customer.findUnique({
      where: { id: customerId, tenantId },
      select: { id: true },
    });
    if (!customer) throw new NotFoundException('Cliente nao encontrado.');
  }

  async listAddresses(tenantId: string, customerId: string): Promise<CustomerAddressDTO[]> {
    await this.assertCustomerBelongsToTenant(tenantId, customerId);
    const addresses = await this.db.customerAddress.findMany({
      where: { tenantId, customerId },
      orderBy: [{ isDefault: 'desc' }, { updatedAt: 'desc' }],
    });
    return addresses.map((address) => this.mapCustomerAddress(address));
  }

  async createAddress(
    tenantId: string,
    customerId: string,
    data: UpsertCustomerAddressDTO,
  ): Promise<CustomerAddressDTO> {
    await this.assertCustomerBelongsToTenant(tenantId, customerId);

    const created = await this.db.$transaction(async (tx) => {
      if (data.isDefault) {
        await tx.customerAddress.updateMany({
          where: { tenantId, customerId },
          data: { isDefault: false },
        });
      }

      return tx.customerAddress.create({
        data: {
          tenantId,
          customerId,
          label: data.label?.trim() || null,
          street: this.ensureRequiredText(data.street, 'Rua'),
          number: this.ensureRequiredText(data.number, 'Numero'),
          complement: data.complement?.trim() || null,
          neighborhood: this.ensureRequiredText(data.neighborhood, 'Bairro'),
          city: data.city?.trim() || 'Nao informado',
          state: this.normalizeState(data.state),
          zipCode: this.normalizeZipCode(data.zipCode),
          reference: data.reference?.trim() || null,
          lat: data.lat,
          lng: data.lng,
          isDefault: data.isDefault || false,
        },
      });
    });

    return this.mapCustomerAddress(created);
  }

  async updateAddress(
    tenantId: string,
    customerId: string,
    addressId: string,
    data: UpsertCustomerAddressDTO,
  ): Promise<CustomerAddressDTO> {
    await this.assertCustomerBelongsToTenant(tenantId, customerId);

    const existing = await this.db.customerAddress.findFirst({
      where: { id: addressId, tenantId, customerId },
    });
    if (!existing) throw new NotFoundException('Endereco nao encontrado.');

    const updated = await this.db.$transaction(async (tx) => {
      if (data.isDefault) {
        await tx.customerAddress.updateMany({
          where: { tenantId, customerId, id: { not: addressId } },
          data: { isDefault: false },
        });
      }

      return tx.customerAddress.update({
        where: { id: addressId },
        data: {
          label: data.label !== undefined ? data.label.trim() || null : existing.label,
          street: data.street !== undefined ? this.ensureRequiredText(data.street, 'Rua') : existing.street,
          number: data.number !== undefined ? this.ensureRequiredText(data.number, 'Numero') : existing.number,
          complement: data.complement !== undefined ? data.complement.trim() || null : existing.complement,
          neighborhood: data.neighborhood !== undefined
            ? this.ensureRequiredText(data.neighborhood, 'Bairro')
            : existing.neighborhood,
          city: data.city !== undefined ? data.city.trim() || 'Nao informado' : existing.city,
          state: data.state !== undefined ? this.normalizeState(data.state) : existing.state,
          zipCode: data.zipCode !== undefined ? this.normalizeZipCode(data.zipCode) : existing.zipCode,
          reference: data.reference !== undefined ? data.reference.trim() || null : existing.reference,
          lat: data.lat !== undefined ? data.lat : existing.lat,
          lng: data.lng !== undefined ? data.lng : existing.lng,
          isDefault: data.isDefault !== undefined ? data.isDefault : existing.isDefault,
        },
      });
    });

    return this.mapCustomerAddress(updated);
  }

  async deleteAddress(tenantId: string, customerId: string, addressId: string): Promise<void> {
    await this.assertCustomerBelongsToTenant(tenantId, customerId);
    const existing = await this.db.customerAddress.findFirst({
      where: { id: addressId, tenantId, customerId },
      select: { id: true },
    });
    if (!existing) throw new NotFoundException('Endereco nao encontrado.');

    await this.db.customerAddress.delete({ where: { id: addressId } });
  }

  async saveDeliveryAddressFromOrder(
    tenantId: string,
    customerId: string,
    address: {
      street: string;
      number: string;
      complement?: string | null;
      neighborhood: string;
      city: string;
      state: string;
      zipCode: string;
      reference?: string | null;
      lat?: number | null;
      lng?: number | null;
    },
  ): Promise<void> {
    await this.assertCustomerBelongsToTenant(tenantId, customerId);

    const existing = await this.db.customerAddress.findFirst({
      where: {
        tenantId,
        customerId,
        street: address.street,
        number: address.number,
        zipCode: this.normalizeZipCode(address.zipCode),
      },
      select: { id: true },
    });

    if (existing) {
      await this.db.customerAddress.update({
        where: { id: existing.id },
        data: {
          complement: address.complement ?? null,
          neighborhood: address.neighborhood,
          city: address.city,
          state: this.normalizeState(address.state),
          reference: address.reference ?? null,
          lat: address.lat ?? null,
          lng: address.lng ?? null,
          isDefault: true,
        },
      });
      return;
    }

    await this.db.customerAddress.create({
      data: {
        tenantId,
        customerId,
        label: 'Principal',
        street: address.street,
        number: address.number,
        complement: address.complement ?? null,
        neighborhood: address.neighborhood,
        city: address.city,
        state: this.normalizeState(address.state),
        zipCode: this.normalizeZipCode(address.zipCode),
        reference: address.reference ?? null,
        lat: address.lat ?? null,
        lng: address.lng ?? null,
        isDefault: true,
      },
    });
  }

  // Called during Order creation to upsert customer explicitly using exactly tenantId and phone
  async syncCustomerOnOrderUpsert(
    tenantId: string, 
    phone: string, 
    name: string,
    email?: string | null,
  ) {
    if (!phone) return null;
    const normalizedPhone = this.normalizePhone(phone);
    const existing = await this.db.customer.findFirst({
      where: {
        tenantId,
        OR: [{ phone: normalizedPhone }, { phone }],
      },
    });

    if (existing) {
      return this.db.customer.update({
        where: { id: existing.id },
        data: {
          name,
          phone: normalizedPhone,
          ...(email && { email }),
        },
      });
    }

    return this.db.customer.create({
      data: {
        tenantId,
        phone: normalizedPhone,
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
