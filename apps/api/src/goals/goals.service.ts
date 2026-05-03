import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { AnalyticsService } from '../analytics/analytics.service';
import type { Prisma } from '@prisma/client';
import { 
  GoalDTO, 
  CreateGoalDTO, 
  UpdateGoalDTO, 
  GoalType, 
  GoalStatus, 
  GoalTrendStatus 
} from '@gestor/types';

@Injectable()
export class GoalsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly analytics: AnalyticsService
  ) {}

  private mapEntityToBaseDTO(goal: Prisma.GoalGetPayload<{ include: { subGoals: true } }>): Omit<GoalDTO, 'currentValue' | 'progressPercentage' | 'trend'> {
    return {
      id: goal.id,
      tenantId: goal.tenantId,
      name: goal.name,
      description: goal.description ?? undefined,
      type: goal.type as GoalType,
      targetValue: Number(goal.targetValue),
      startDate: goal.startDate.toISOString(),
      endDate: goal.endDate.toISOString(),
      status: goal.status as GoalStatus,
      parentId: goal.parentId ?? undefined,
      targetId: goal.targetId ?? undefined,
      responsibleId: goal.responsibleId ?? undefined,
      createdAt: goal.createdAt.toISOString(),
      updatedAt: goal.updatedAt.toISOString(),
      subGoals: undefined,
    };
  }

  async create(tenantId: string, data: CreateGoalDTO): Promise<GoalDTO> {
    const goal = await this.prisma.tenantClient.goal.create({
      data: {
        tenantId,
        name: data.name,
        description: data.description ?? null,
        type: data.type,
        targetValue: data.targetValue,
        startDate: new Date(data.startDate),
        endDate: new Date(data.endDate),
        status: 'active',
        parentId: data.parentId ?? null,
        targetId: data.targetId ?? null,
        responsibleId: data.responsibleId ?? null,
      },
      include: { subGoals: true },
    });

    return this.enrichGoalWithProgress(tenantId, goal);
  }

  async findAll(tenantId: string): Promise<GoalDTO[]> {
    const goals = await this.prisma.tenantClient.goal.findMany({
      where: { tenantId, parentId: null },
      include: { subGoals: true },
    });

    return Promise.all(goals.map((g) => this.enrichGoalWithProgress(tenantId, g)));
  }

  async findOne(tenantId: string, id: string): Promise<GoalDTO> {
    const goal = await this.prisma.tenantClient.goal.findFirst({
      where: { tenantId, id },
      include: { subGoals: true },
    });

    if (!goal) throw new NotFoundException('Goal not found');

    return this.enrichGoalWithProgress(tenantId, goal);
  }

  async update(tenantId: string, id: string, data: UpdateGoalDTO): Promise<GoalDTO> {
    const updateResult = await this.prisma.tenantClient.goal.updateMany({
      where: { tenantId, id },
      data: {
        ...data,
        description: data.description ?? undefined,
        targetValue: data.targetValue,
        endDate: data.endDate ? new Date(data.endDate) : undefined,
      },
    });

    if (updateResult.count === 0) {
      throw new NotFoundException('Goal not found');
    }

    const goal = await this.prisma.tenantClient.goal.findFirst({
      where: { tenantId, id },
      include: { subGoals: true },
    });

    if (!goal) throw new NotFoundException('Goal not found');

    return this.enrichGoalWithProgress(tenantId, goal);
  }

  async remove(tenantId: string, id: string): Promise<void> {
    const deleteResult = await this.prisma.tenantClient.goal.deleteMany({
      where: { tenantId, id },
    });

    if (deleteResult.count === 0) {
      throw new NotFoundException('Goal not found');
    }
  }

  private async enrichGoalWithProgress(
    tenantId: string,
    goal: Prisma.GoalGetPayload<{ include: { subGoals: true } }>,
  ): Promise<GoalDTO> {
    const base = this.mapEntityToBaseDTO(goal);
    const currentValue = await this.calculateCurrentValue(tenantId, {
      ...base,
      currentValue: 0,
      progressPercentage: 0,
      trend: GoalTrendStatus.ON_TRACK,
    });
    const progressPercentage = base.targetValue > 0 ? (currentValue / base.targetValue) * 100 : 0;

    // Trend calculation (simplified)
    const trend = this.calculateTrend(base, progressPercentage);

    const subGoals = goal.subGoals.length
      ? await Promise.all(goal.subGoals.map((sg) => this.enrichGoalWithProgress(tenantId, { ...sg, subGoals: [] })))
      : [];

    return {
      ...base,
      currentValue,
      progressPercentage,
      trend,
      subGoals,
    };
  }

  private async calculateCurrentValue(tenantId: string, goal: GoalDTO): Promise<number> {
    const filter = {
      startDate: new Date(goal.startDate).toISOString(),
      endDate: new Date(goal.endDate).toISOString(),
    };

    switch (goal.type as any) {
      case GoalType.REVENUE: {
        const metrics = await this.analytics.getCommercialMetrics(tenantId, filter);
        return metrics.totalRevenue;
      }
      case GoalType.ORDERS: {
        const metrics = await this.analytics.getCommercialMetrics(tenantId, filter);
        return metrics.totalOrders;
      }
      case GoalType.AVG_TICKET: {
        const metrics = await this.analytics.getCommercialMetrics(tenantId, filter);
        return metrics.averageTicket;
      }
      case GoalType.PREPARATION_TIME: {
        const metrics = await this.analytics.getOperationalMetrics(tenantId, filter);
        return metrics.averagePreparationTimeMinutes;
      }
      case GoalType.DELIVERY_TIME: {
        const metrics = await this.analytics.getOperationalMetrics(tenantId, filter);
        return metrics.averageDeliveryTimeMinutes;
      }
      case GoalType.GROSS_MARGIN: {
        const metrics = await this.analytics.getCostMarginMetrics(tenantId, filter);
        return metrics.grossMarginPercentage;
      }
      default:
        return 0;
    }
  }

  private calculateTrend(
    goal: Pick<GoalDTO, 'startDate' | 'endDate'>,
    progress: number,
  ): GoalTrendStatus {
    const now = new Date();
    const start = new Date(goal.startDate);
    const end = new Date(goal.endDate);

    if (now > end) return progress >= 100 ? GoalTrendStatus.ON_TRACK : GoalTrendStatus.BEHIND;
    
    const totalTime = end.getTime() - start.getTime();
    const elapsed = now.getTime() - start.getTime();
    
    if (elapsed <= 0) return GoalTrendStatus.ON_TRACK;

    const timeProgress = (elapsed / totalTime) * 100;
    
    if (progress >= timeProgress) return GoalTrendStatus.ON_TRACK;
    if (progress >= timeProgress * 0.8) return GoalTrendStatus.AT_RISK;
    return GoalTrendStatus.BEHIND;
  }
}
