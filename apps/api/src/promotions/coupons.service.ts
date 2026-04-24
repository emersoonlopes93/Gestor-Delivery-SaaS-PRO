import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { CreateCouponDTO, UpdateCouponDTO } from '@gestor/types';
import { Coupon } from '@prisma/client';

@Injectable()
export class CouponsService {
  constructor(private readonly db: PrismaService) {}

  async listCoupons(tenantId: string) {
    const coupons = await this.db.coupon.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
    });

    return coupons.map((c: Coupon) => ({
      ...c,
      value: Number(c.value),
      minOrderValue: c.minOrderValue != null ? Number(c.minOrderValue) : null,
    }));
  }

  async getCoupon(tenantId: string, id: string) {
    const coupon = await this.db.coupon.findUnique({
      where: { id, tenantId },
    });
    if (!coupon) throw new NotFoundException('Coupon not found');
    return {
      ...coupon,
      value: Number(coupon.value),
      minOrderValue: coupon.minOrderValue ? Number(coupon.minOrderValue) : null,
    };
  }

  async createCoupon(tenantId: string, data: CreateCouponDTO) {
    // Validate uniqueness of code
    const existing = await this.db.coupon.findFirst({
      where: { 
        tenantId, 
        code: data.code.toUpperCase() 
      },
    });
    if (existing) {
      throw new BadRequestException('Coupon code already exists');
    }

    const created = await this.db.coupon.create({
      data: {
        tenantId,
        code: data.code.toUpperCase(),
        type: data.type,
        value: data.value,
        minOrderValue: data.minOrderValue || null,
        usageLimit: data.usageLimit || null,
        expiresAt: data.expiresAt ? new Date(data.expiresAt) : null,
        isActive: data.isActive ?? true,
      },
    });

    return {
      ...created,
      value: Number(created.value),
      minOrderValue: created.minOrderValue ? Number(created.minOrderValue) : null,
    };
  }

  async updateCoupon(tenantId: string, id: string, data: UpdateCouponDTO) {
    const coupon = await this.db.coupon.findUnique({
      where: { id, tenantId },
    });
    if (!coupon) throw new NotFoundException('Coupon not found');

    const updated = await this.db.coupon.update({
      where: { id },
      data: {
        minOrderValue: data.minOrderValue !== undefined ? data.minOrderValue : coupon.minOrderValue,
        usageLimit: data.usageLimit !== undefined ? data.usageLimit : coupon.usageLimit,
        expiresAt: data.expiresAt !== undefined ? (data.expiresAt ? new Date(data.expiresAt) : null) : coupon.expiresAt,
        isActive: data.isActive !== undefined ? data.isActive : coupon.isActive,
      },
    });

    return {
      ...updated,
      value: Number(updated.value),
      minOrderValue: updated.minOrderValue ? Number(updated.minOrderValue) : null,
    };
  }

  async validateCouponForTotal(tenantId: string, code: string, currentTotal: number) {
    const coupon = await this.db.coupon.findFirst({
      where: { 
        tenantId, 
        code: code.toUpperCase() 
      },
    });

    if (!coupon) throw new NotFoundException('Coupon not found');
    if (!coupon.isActive) throw new BadRequestException('Coupon is not active');
    const now = new Date();
    if (coupon.expiresAt && coupon.expiresAt < now) throw new BadRequestException('Coupon has expired');
    if (coupon.usageLimit && coupon.usedCount >= coupon.usageLimit) throw new BadRequestException('Coupon usage limit reached');
    
    const discountAmount = 0;
    if (coupon.minOrderValue && currentTotal < Number(coupon.minOrderValue)) {
      throw new BadRequestException(`Minimum order value is R$ ${coupon.minOrderValue}`);
    }

    // Calculate discount
    let discount = 0;
    const value = Number(coupon.value);

    if (coupon.type === 'fixed') {
      discount = value;
    } else if (coupon.type === 'percentage') {
      discount = currentTotal * (value / 100);
    }

    // Discount cannot exceed current total
    if (discount > currentTotal) {
      discount = currentTotal;
    }

    return {
      couponId: coupon.id,
      discountAmount: discount,
      type: coupon.type,
      code: coupon.code,
    };
  }
}
