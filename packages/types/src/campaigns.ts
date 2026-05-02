export type CampaignStatus = 'draft' | 'scheduled' | 'running' | 'paused' | 'completed' | 'cancelled';

export interface Campaign {
  id: string;
  tenantId: string;
  name: string;
  objective?: string;
  status: CampaignStatus;
  messageTemplate: string;
  mediaUrl?: string;
  segmentRules: {
    minOrders?: number;
    maxOrders?: number;
    minSpent?: number;
    daysSinceLastOrder?: number;
    specificCustomers?: string[];
  };
  scheduledAt?: string;
  startedAt?: string;
  completedAt?: string;
  cancelledAt?: string;
  totalAudience: number;
  totalSent: number;
  totalDelivered: number;
  totalRead: number;
  totalReplied: number;
  totalConverted: number;
  totalOptOut: number;
  maxDispatches: number;
  createdAt: string;
  updatedAt: string;
}

export interface CampaignDispatch {
  id: string;
  campaignId: string;
  customerId: string;
  phone: string;
  status: 'queued' | 'sent' | 'delivered' | 'read' | 'replied' | 'converted' | 'opt_out' | 'failed';
  sentAt?: string;
  deliveredAt?: string;
  readAt?: string;
  repliedAt?: string;
  convertedAt?: string;
  optOutAt?: string;
  failedAt?: string;
  errorMessage?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateCampaignDto {
  name: string;
  objective?: string;
  messageTemplate: string;
  mediaUrl?: string;
  segmentRules: {
    minOrders?: number;
    maxOrders?: number;
    minSpent?: number;
    daysSinceLastOrder?: number;
    specificCustomers?: string[];
  };
  scheduledAt?: string;
  maxDispatches?: number;
}
