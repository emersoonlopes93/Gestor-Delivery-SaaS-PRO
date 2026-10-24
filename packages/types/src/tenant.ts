// ============================================================
// Tenant Types — Shared between frontend and backend
// ============================================================

import { TenantStatus } from './enums';
import { TenantRole } from './rbac';
export type { TenantRole };

export const BUSINESS_SEGMENTS = [
  'PIZZARIA',
  'HAMBURGUERIA',
  'RESTAURANTE',
  'MERCADO',
  'ACAI',
  'PADARIA',
  'OTHER',
] as const;

export type BusinessSegment = (typeof BUSINESS_SEGMENTS)[number];

export const BUSINESS_SEGMENT_LABELS: Record<BusinessSegment, string> = {
  PIZZARIA: 'Pizzaria',
  HAMBURGUERIA: 'Hamburgueria',
  RESTAURANTE: 'Restaurante',
  MERCADO: 'Mercado',
  ACAI: 'Açaí',
  PADARIA: 'Padaria',
  OTHER: 'Outro',
};

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  status: TenantStatus;
  businessGroupId?: string | null;
  businessGroupRole?: BusinessGroupRole | null;
  settings?: TenantSettings;
  businessGroup?: BusinessGroupContext | null;
  createdAt: string;
  updatedAt: string;
}

export type BusinessGroupRole = 'headquarters' | 'branch';

export interface BusinessGroupTenantSummary {
  id: string;
  name: string;
  slug: string;
  status: TenantStatus;
  businessGroupRole?: BusinessGroupRole | null;
}

export interface BusinessGroupContext {
  id: string;
  name: string;
  ownerId?: string | null;
  headquartersTenantId?: string | null;
  createdAt: string;
  updatedAt: string;
  tenants?: BusinessGroupTenantSummary[];
  _count?: {
    tenants: number;
  };
}

export interface TenantNetworkStoreSummary {
  id: string;
  name: string;
  slug: string;
  status: string;
  isHeadquarters: boolean;
  city?: string | null;
  state?: string | null;
}

export interface TenantNetworkContext {
  groupId: string | null;
  groupName: string;
  role: BusinessGroupRole;
  ownerEmail: string;
  currentTenantId: string;
  stores: TenantNetworkStoreSummary[];
}

export interface CreateBranchRequest {
  name: string;
  slug?: string;
}

export interface TenantSettings {
  id: string;
  tenantId: string;
  timezone: string;
  currency: string;
  language: string;
  businessPhone?: string;
  businessSegment?: BusinessSegment | null;
  orderWhatsappNumber?: string;
  businessEmail?: string;
  address?: string; // Legacy/Plain text

  // Structured Address
  street?: string;
  number?: string;
  complement?: string;
  neighborhood?: string;
  city?: string;
  state?: string;
  zipCode?: string;

  // Coordinates
  lat?: number;
  lng?: number;

  // Payment Methods
  paymentMethods?: string[];
  minimumOrderValue?: number | null;
  pickupEnabled?: boolean;
  pickupMinMinutes?: number;
  pickupMaxMinutes?: number;

  // Financial / Pix
  pixKey?: string;
  bankName?: string;
  bankAgency?: string;
  bankAccount?: string;

  logoUrl?: string;

  // Fiscal / Billing
  cnpj?: string;
  razaoSocial?: string;
  inscricaoEstadual?: string;

  taxRegime?: string;
  standardCfop?: string;
  standardNcm?: string;
  businessGroupId?: string | null;

  isStorePaused: boolean;
  storePauseReason?: string;
  whatsappNotificationsEnabled?: boolean;
  notificationTemplates?: Record<string, string>;
  audioNotificationEnabled?: boolean;
  newOrderSound?: string;
  cancellationSound?: string;
  handoffSound?: string;
  readySound?: string;
  notificationVolume?: number;
  browserNotificationsEnabled?: boolean;
  autoAcceptOrdersEnabled?: boolean;
  autoAcceptDelaySeconds?: 0 | 30 | 60;
  autoAcceptDeliveryOrders?: boolean;
  autoAcceptPickupOrders?: boolean;
  loyaltyEnabled?: boolean;
  loyaltyPointsPerReal?: number;
  cashbackEnabled?: boolean;
  cashbackPercent?: number;
  cashbackValidityDays?: number;
  createdAt: string;
  updatedAt: string;
}

export interface OrderAutoAcceptSettings {
  autoAcceptOrdersEnabled: boolean;
  autoAcceptDelaySeconds: 0 | 30 | 60;
  autoAcceptDeliveryOrders: boolean;
  autoAcceptPickupOrders: boolean;
}

export type OnboardingBackendStep =
  | 'basicInfo'
  | 'operatingHours'
  | 'logo'
  | 'address'
  | 'delivery'
  | 'payments'
  | 'whatsapp'
  | 'menu'
  | 'catalog'
  | 'firstOrder';

export interface OnboardingCompletionCheck {
  canComplete: boolean;
  missingRequirements: string[];
  warnings: string[];
  nextRecommendedStep: string | null;
  blockingMessage?: string | null;
  completedAt?: string | null;
}

export interface TenantSchedulingSettings {
  id: string;
  tenantId: string;
  enabled: boolean;
  acceptScheduledOrders: boolean;
  allowScheduleWhenClosed: boolean;
  minimumAdvanceMinutes: number;
  maximumAdvanceDays: number;
  slotIntervalMinutes: number;
  maxOrdersPerSlot: number;
  timezone: string;
  createdAt: string;
  updatedAt: string;
}

export interface TenantOperatingHours {
  id: string;
  tenantId: string;
  dayOfWeek: number;
  isOpen: boolean;
  openTime: string | null;
  closeTime: string | null;
}

export interface UpdateOperatingHoursRequest {
  hours: Omit<TenantOperatingHours, 'id' | 'tenantId'>[];
}

export interface UpdateStorePauseRequest {
  isStorePaused: boolean;
  storePauseReason?: string;
}

export interface CreateTenantRequest {
  name: string;
  slug: string;
  ownerEmail: string;
  ownerName: string;
  ownerPassword: string;
}

export interface TenantContext {
  tenantId: string;
  tenantSlug: string;
  tenantName: string;
  tenantStatus: TenantStatus;
}

export interface TenantUser {
  id: string;
  tenantId: string;
  email: string;
  name: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  userRoles?: {
    role: TenantRole;
  }[];
}
