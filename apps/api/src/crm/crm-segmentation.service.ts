import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { differenceInDays } from 'date-fns';

export enum CustomerSegment {
  CHAMPION = 'champion',
  LOYAL = 'loyal',
  AT_RISK = 'at_risk',
  HIBERNATING = 'hibernating',
  NEW = 'new',
}

@Injectable()
export class CrmSegmentationService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Calculate RFM scores and segment customers.
   * R (Recency): Days since last order
   * F (Frequency): Total orders
   * M (Monetary): Total spent
   */
  async segmentCustomers(tenantId: string) {
    const customers = await this.prisma.customer.findMany({
      where: { tenantId },
      select: {
        id: true,
        lastOrderDate: true,
        totalOrders: true,
        totalSpent: true,
      },
    });

    const now = new Date();

    return customers.map((customer) => {
      const recency = customer.lastOrderDate ? differenceInDays(now, customer.lastOrderDate) : 999;
      const frequency = customer.totalOrders;
      const monetary = Number(customer.totalSpent);

      let segment = CustomerSegment.NEW;

      if (recency <= 30 && frequency >= 5 && monetary >= 500) {
        segment = CustomerSegment.CHAMPION;
      } else if (recency <= 60 && frequency >= 3) {
        segment = CustomerSegment.LOYAL;
      } else if (recency > 60 && recency <= 120) {
        segment = CustomerSegment.AT_RISK;
      } else if (recency > 120) {
        segment = CustomerSegment.HIBERNATING;
      }

      return {
        customerId: customer.id,
        recency,
        frequency,
        monetary,
        segment,
      };
    });
  }

  /**
   * Get paginated customers for a tenant with their RFM segment info.
   */
  async getSegmentedCustomers(tenantId: string, page = 1, limit = 50) {
    const normalizedPage = Number.isFinite(page) ? Math.max(1, Math.floor(page)) : 1;
    const normalizedLimit = Number.isFinite(limit) ? Math.min(100, Math.max(1, Math.floor(limit))) : 50;
    const skip = (normalizedPage - 1) * normalizedLimit;
    const take = normalizedLimit;

    const [total, customers] = await this.prisma.$transaction([
      this.prisma.customer.count({ where: { tenantId } }),
      this.prisma.customer.findMany({
        where: { tenantId },
        orderBy: { lastOrderDate: 'desc' },
        skip,
        take,
      }),
    ]);

    const now = new Date();

    const data = customers.map((customer) => {
      const recency = customer.lastOrderDate ? differenceInDays(now, customer.lastOrderDate) : 999;
      const frequency = customer.totalOrders;
      const monetary = Number(customer.totalSpent);

      let segment = CustomerSegment.NEW;

      if (recency <= 30 && frequency >= 5 && monetary >= 500) {
        segment = CustomerSegment.CHAMPION;
      } else if (recency <= 60 && frequency >= 3) {
        segment = CustomerSegment.LOYAL;
      } else if (recency > 60 && recency <= 120) {
        segment = CustomerSegment.AT_RISK;
      } else if (recency > 120) {
        segment = CustomerSegment.HIBERNATING;
      }

      return {
        ...customer,
        totalSpent: monetary,
        cashbackBalance: Number(customer.cashbackBalance),
        rfm: {
          recency,
          frequency,
          monetary,
          segment,
        },
      };
    });

    return {
      data,
      meta: {
        total,
        page: normalizedPage,
        limit: normalizedLimit,
        totalPages: Math.ceil(total / normalizedLimit),
      },
    };
  }

  /**
   * Get metrics for retention dashboard.
   */
  async getRetentionMetrics(tenantId: string) {
    const segments = await this.segmentCustomers(tenantId);
    
    const stats = {
      [CustomerSegment.CHAMPION]: 0,
      [CustomerSegment.LOYAL]: 0,
      [CustomerSegment.AT_RISK]: 0,
      [CustomerSegment.HIBERNATING]: 0,
      [CustomerSegment.NEW]: 0,
    };

    segments.forEach(s => {
      stats[s.segment]++;
    });

    return stats;
  }
}
