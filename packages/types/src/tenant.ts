// ============================================================
// Tenant Types — Shared between frontend and backend
// ============================================================

import { TenantStatus } from './enums';

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  status: TenantStatus;
  createdAt: string;
  updatedAt: string;
}

export interface TenantSettings {
  id: string;
  tenantId: string;
  timezone: string;
  currency: string;
  language: string;
  businessPhone?: string;
  businessEmail?: string;
  address?: string;
  logoUrl?: string;
  cnpj?: string;
  razaoSocial?: string;
  inscricaoEstadual?: string;
  isStorePaused: boolean;
  storePauseReason?: string;
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
