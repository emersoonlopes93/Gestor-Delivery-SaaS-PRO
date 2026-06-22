import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { CustomerJwtPayload } from '@gestor/types';
import { CurrentCustomer } from '../common/decorators';
import { CustomerAuthGuard } from '../auth/guards/customer-auth.guard';
import { PrismaService } from '../database/prisma.service';
import { CustomerIntelligenceService } from './customer-intelligence.service';
import { LoyaltyService } from '../promotions/loyalty.service';
import { WalletService } from '../promotions/wallet.service';
import { CouponsService } from '../promotions/coupons.service';
import type { CustomerAddressSummaryDTO } from '@gestor/types';

@Controller('public/customer-profile')
@UseGuards(CustomerAuthGuard)
export class CustomerProfileController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly intelligence: CustomerIntelligenceService,
    private readonly loyalty: LoyaltyService,
    private readonly wallet: WalletService,
    private readonly coupons: CouponsService,
  ) {}

  @Get()
  async getProfile(@CurrentCustomer() customer: CustomerJwtPayload) {
    const [record, intelligence, loyalty, wallet, coupons, orders, addresses] = await Promise.all([
      this.prisma.customer.findUnique({
        where: { id: customer.sub, tenantId: customer.tenantId },
        select: { id: true, name: true, phone: true, email: true, birthDate: true, totalOrders: true, totalSpent: true },
      }),
      this.intelligence.analyzeCustomer(customer.tenantId, customer.sub),
      this.loyalty.getSummary(customer.tenantId, customer.sub),
      this.wallet.getWallet(customer.tenantId, customer.sub),
      this.coupons.listCoupons(customer.tenantId),
      this.prisma.order.findMany({
        where: { tenantId: customer.tenantId, customerId: customer.sub },
        orderBy: { createdAt: 'desc' },
        take: 20,
        select: { id: true, orderNumber: true, total: true, status: true, createdAt: true, couponId: true, cashbackUsed: true },
      }),
      this.prisma.customerAddress.findMany({
        where: { tenantId: customer.tenantId, customerId: customer.sub },
        orderBy: [{ isDefault: 'desc' }, { updatedAt: 'desc' }],
        take: 5,
        select: {
          id: true,
          label: true,
          street: true,
          number: true,
          complement: true,
          neighborhood: true,
          city: true,
          state: true,
          zipCode: true,
          reference: true,
          lat: true,
          lng: true,
          isDefault: true,
        },
      }) as Promise<CustomerAddressSummaryDTO[]>,
    ]);

    return {
      profile: record,
      intelligence,
      loyalty,
      wallet,
      coupons: coupons.filter((coupon) => coupon.isActive),
      orders: orders.map((order) => ({
        ...order,
        total: Number(order.total),
        cashbackUsed: order.cashbackUsed ? Number(order.cashbackUsed) : 0,
      })),
      addresses,
    };
  }

  @Patch()
  async updateProfile(
    @CurrentCustomer() customer: CustomerJwtPayload,
    @Body() body: { name?: string; email?: string | null; birthDate?: string | null },
  ) {
    return this.prisma.customer.update({
      where: { id: customer.sub, tenantId: customer.tenantId },
      data: {
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.email !== undefined ? { email: body.email } : {}),
        ...(body.birthDate !== undefined ? { birthDate: body.birthDate ? new Date(body.birthDate) : null } : {}),
      },
      select: { id: true, name: true, phone: true, email: true, birthDate: true },
    });
  }
}
