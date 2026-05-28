export interface DashboardStats {
  activeTenants: number;
  trialTenants: number;
  totalTenants: number;
  mrr: number;
  supportTickets: number;
}

export interface ActivityItem {
  id: string;
  tenantId: string;
  tenantName: string;
  action: string;
  resource: string | null;
  createdAt: string;
}