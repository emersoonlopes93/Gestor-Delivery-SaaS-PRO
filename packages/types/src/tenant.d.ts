import { TenantStatus } from './enums';
import { TenantRole } from './rbac';
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
    street?: string;
    number?: string;
    complement?: string;
    neighborhood?: string;
    city?: string;
    state?: string;
    zipCode?: string;
    lat?: number;
    lng?: number;
    paymentMethods?: string[];
    pixKey?: string;
    bankName?: string;
    bankAgency?: string;
    bankAccount?: string;
    logoUrl?: string;
    cnpj?: string;
    razaoSocial?: string;
    inscricaoEstadual?: string;
    taxRegime?: string;
    standardCfop?: string;
    standardNcm?: string;
    businessGroupId?: string | null;
    isStorePaused: boolean;
    storePauseReason?: string;
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
