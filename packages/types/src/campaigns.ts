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
  totalClicked: number;
  totalReplied: number;
  totalConverted: number;
  totalOptOut: number;
  revenueGenerated: number;
  maxDispatches: number;
  createdAt: string;
  updatedAt: string;
}

export interface CampaignDispatch {
  id: string;
  campaignId: string;
  customerId: string;
  phone: string;
  status: 'queued' | 'processing' | 'sent' | 'delivered' | 'read' | 'replied' | 'opt_out' | 'failed';
  sentAt?: string;
  deliveredAt?: string;
  readAt?: string;
  clickedAt?: string;
  repliedAt?: string;
  convertedAt?: string;
  revenueGenerated?: number;
  failReason?: string;
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
