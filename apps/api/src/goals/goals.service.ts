import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { AnalyticsService } from '../analytics/analytics.service';
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

  async create(tenantId: string, data: CreateGoalDTO): Promise<GoalDTO> {
    const goal = await (this.prisma.tenantClient as any).goal.create({
      data: {
        ...data,
        targetValue: data.targetValue,
        startDate: new Date(data.startDate),
        endDate: new Date(data.endDate),
        status: 'active' as GoalStatus,
      },
    });

    return this.enrichGoalWithProgress(tenantId, goal as any);
  }

  async findAll(tenantId: string): Promise<GoalDTO[]> {
    const goals = await (this.prisma.tenantClient as any).goal.findMany({
      where: { parentId: null },
      include: { subGoals: true },
    });

    return Promise.all(goals.map((g: any) => this.enrichGoalWithProgress(tenantId, g as any)));
  }

  async findOne(tenantId: string, id: string): Promise<GoalDTO> {
    const goal = await (this.prisma.tenantClient as any).goal.findFirst({
      where: { id },
      include: { subGoals: true },
    });

    if (!goal) throw new NotFoundException('Goal not found');

    return this.enrichGoalWithProgress(tenantId, goal as any);
  }

  async update(tenantId: string, id: string, data: UpdateGoalDTO): Promise<GoalDTO> {
    const goal = await (this.prisma.tenantClient as any).goal.update({
      where: { id },
      data: {
        ...data,
        targetValue: data.targetValue,
        endDate: data.endDate ? new Date(data.endDate) : undefined,
      },
    });

    return this.enrichGoalWithProgress(tenantId, goal as any);
  }

  async remove(tenantId: string, id: string): Promise<void> {
    await (this.prisma.tenantClient as any).goal.delete({
      where: { id },
    });
  }

  private async enrichGoalWithProgress(tenantId: string, goal: GoalDTO): Promise<GoalDTO> {
    const currentValue = await this.calculateCurrentValue(tenantId, goal);
    const progressPercentage = goal.targetValue > 0 ? (currentValue / goal.targetValue) * 100 : 0;
    
    // Trend calculation (simplified: if progress > 50% through 50% of time)
    const trend = this.calculateTrend(goal, progressPercentage);

    return {
      ...goal,
      currentValue,
      progressPercentage,
      trend,
      subGoals: goal.subGoals ? await Promise.all(goal.subGoals.map((sg: any) => this.enrichGoalWithProgress(tenantId, sg))) : [],
    };
  }

  private async calculateCurrentValue(tenantId: string, goal: GoalDTO): Promise<number> {
    const filter = {
      startDate: new Date(goal.startDate).toISOString(),
      endDate: new Date(goal.endDate).toISOString(),
    };

    switch (goal.type) {
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

  private calculateTrend(goal: GoalDTO, progress: number): GoalTrendStatus {
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
