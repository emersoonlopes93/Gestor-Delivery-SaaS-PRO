import { GoalStatus, GoalTrendStatus, GoalType } from './enums';

export interface GoalDTO {
  id: string;
  tenantId: string;
  name: string;
  description?: string;
  type: GoalType;
  targetValue: number;
  currentValue: number;
  progressPercentage: number;
  startDate: string;
  endDate: string;
  status: GoalStatus;
  trend: GoalTrendStatus;
  parentId?: string;
  subGoals?: GoalDTO[];
  targetId?: string; // e.g. categoryId, channel name
  responsibleId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateGoalDTO {
  name: string;
  description?: string;
  type: GoalType;
  targetValue: number;
  startDate: string;
  endDate: string;
  parentId?: string;
  targetId?: string;
  responsibleId?: string;
}

export interface UpdateGoalDTO {
  name?: string;
  description?: string;
  targetValue?: number;
  status?: GoalStatus;
  endDate?: string;
  responsibleId?: string;
}

export interface GoalProgressDTO {
  goalId: string;
  currentValue: number;
  targetValue: number;
  percentage: number;
  trend: GoalTrendStatus;
  status: GoalStatus;
  lastUpdated: string;
}
