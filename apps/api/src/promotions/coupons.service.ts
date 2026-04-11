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

    return coupons.map((c: any) => ({
      ...c,
      value: Number(c.value),
      minOrderValue: c.minOrderValue ? Number(c.minOrderValue) : null,
      maxDiscountValue: c.maxDiscountValue ? Number(c.maxDiscountValue) : null,
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
      maxDiscountValue: coupon.maxDiscountValue ? Number(coupon.maxDiscountValue) : null,
    };
  }

  async createCoupon(tenantId: string, data: CreateCouponDTO) {
    // Validate uniqueness of code
    const existing = await this.db.coupon.findUnique({
      where: { tenantId_code: { tenantId, code: data.code } },
    });
    if (existing) {
      throw new BadRequestException('Coupon code already exists');
    }

    const created = await this.db.coupon.create({
      data: {
        tenantId,
        code: data.code.toUpperCase(),
        name: data.name,
        description: data.description,
        type: data.type,
        value: data.value,
        minOrderValue: data.minOrderValue || null,
        maxDiscountValue: data.maxDiscountValue || null,
        usageLimit: data.usageLimit || null,
        startsAt: data.startsAt ? new Date(data.startsAt) : null,
        expiresAt: data.expiresAt ? new Date(data.expiresAt) : null,
      },
    });

    return {
      ...created,
      value: Number(created.value),
      minOrderValue: created.minOrderValue ? Number(created.minOrderValue) : null,
      maxDiscountValue: created.maxDiscountValue ? Number(created.maxDiscountValue) : null,
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
        name: data.name !== undefined ? data.name : coupon.name,
        description: data.description !== undefined ? data.description : coupon.description,
        minOrderValue: data.minOrderValue !== undefined ? data.minOrderValue : coupon.minOrderValue,
        maxDiscountValue: data.maxDiscountValue !== undefined ? data.maxDiscountValue : coupon.maxDiscountValue,
        usageLimit: data.usageLimit !== undefined ? data.usageLimit : coupon.usageLimit,
        startsAt: data.startsAt !== undefined ? (data.startsAt ? new Date(data.startsAt) : null) : coupon.startsAt,
        expiresAt: data.expiresAt !== undefined ? (data.expiresAt ? new Date(data.expiresAt) : null) : coupon.expiresAt,
        isActive: data.isActive !== undefined ? data.isActive : coupon.isActive,
      },
    });

    return {
      ...updated,
      value: Number(updated.value),
      minOrderValue: updated.minOrderValue ? Number(updated.minOrderValue) : null,
      maxDiscountValue: updated.maxDiscountValue ? Number(updated.maxDiscountValue) : null,
    };
  }

  async validateCouponForTotal(tenantId: string, code: string, currentTotal: number) {
    const coupon = await this.db.coupon.findUnique({
      where: { tenantId_code: { tenantId, code: code.toUpperCase() } },
    });

    if (!coupon) throw new BadRequestException('Coupon not found');
    if (!coupon.isActive) throw new BadRequestException('Coupon is inactive');

    const now = new Date();
    if (coupon.startsAt && coupon.startsAt > now) throw new BadRequestException('Coupon is not yet valid');
    if (coupon.expiresAt && coupon.expiresAt < now) throw new BadRequestException('Coupon is expired');

    if (coupon.usageLimit !== null && coupon.usedCount >= coupon.usageLimit) {
      throw new BadRequestException('Coupon usage limit reached');
    }

    if (coupon.minOrderValue && currentTotal < Number(coupon.minOrderValue)) {
      throw new BadRequestException(`Minimum order value is R$ ${coupon.minOrderValue}`);
    }

    // Calculate discount
    let discount = 0;
    const value = Number(coupon.value);
    const maxDiscount = coupon.maxDiscountValue ? Number(coupon.maxDiscountValue) : null;

    if (coupon.type === 'fixed_amount') {
      discount = value;
    } else if (coupon.type === 'percentage') {
      discount = currentTotal * (value / 100);
      if (maxDiscount && discount > maxDiscount) {
        discount = maxDiscount;
      }
    } else if (coupon.type === 'free_shipping') {
        // Handled at checkout
        discount = 0; 
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
