// ============================================================
// Auth Types — Shared between frontend and backend
// ============================================================

import type { BusinessGroupRole } from './tenant';

/** JWT payload for tenant users */
export interface TenantJwtPayload {
  sub: string;        // userId
  tenantId: string;
  type: 'tenant';
  email: string;
  isImpersonated?: boolean;
  impersonatedBy?: string; // adminId
  iat?: number;
  exp?: number;
}

/** JWT payload for admin users */
export interface AdminJwtPayload {
  sub: string;        // userId
  type: 'admin';
  email: string;
  iat?: number;
  exp?: number;
}

/** JWT payload for drivers */
export interface DriverJwtPayload {
  sub: string;        // driverId
  tenantId: string;
  type: 'driver';
  phone: string;
  name: string;
  iat?: number;
  exp?: number;
}

export type JwtPayload = TenantJwtPayload | AdminJwtPayload | CustomerJwtPayload | DriverJwtPayload;

/** Login request body */
export interface LoginRequest {
  email: string;
  password: string;
}

/** Login response */
export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

/** Refresh token request */
export interface RefreshTokenRequest {
  refreshToken: string;
}

/** Login response for tenant users */
export interface TenantLoginResponse extends AuthTokens {
  user: TenantUserSession;
}

/** Login response for admin users */
export interface AdminLoginResponse extends AuthTokens {
  user: AdminUserSession;
}

/** Current authenticated tenant user context */
export interface TenantUserSession {
  userId: string;
  tenantId: string;
  email: string;
  name: string;
  roles: string[];
  permissions: string[];
  /**
   * Módulos ativos para este tenant (calculados via BillingPlan + TenantModuleAccess).
   * Undefined = compatibilidade com sessões antigas (tratar como vazio/bloqueado).
   */
  enabledModules?: string[];
  accessibleTenants?: AccessibleTenantSession[];
  onboardingCompletedAt?: string | null;
  tenant?: {
    id: string;
    name: string;
    slug: string;
    status: string;
  };
}

export interface AccessibleTenantSession {
  userId: string;
  tenantId: string;
  roleSlugs: string[];
  businessGroupRole?: BusinessGroupRole | null;
  tenant: {
    id: string;
    name: string;
    slug: string;
    status: string;
  };
}

/** Current authenticated admin user context */
export interface AdminUserSession {
  userId: string;
  email: string;
  name: string;
  roles: string[];
  permissions: string[];
}

/** Current authenticated driver context */
export interface DriverUserSession {
  driverId: string;
  tenantId: string;
  name: string;
  phone: string;
  isActive: boolean;
  tenant?: {
    id: string;
    name: string;
    slug: string;
  };
}

/** JWT payload for customer (B2C) */
export interface CustomerJwtPayload {
  sub: string;        // customerId
  tenantId: string;
  type: 'customer';
  sid: string;
  iat?: number;
  exp?: number;
}

/** Customer Login Request */
export interface SendOtpRequest {
  phone: string;
}

/** Customer OTP Validation Request */
export interface ValidateOtpRequest {
  phone: string;
  code: string;
}

/** Customer Login Response */
export interface CustomerLoginResponse {
  accessToken: string;
  refreshToken: string;
  customer: {
    id: string;
    tenantId: string;
    name: string;
    phone: string;
  };
}

export interface CustomerGoogleSignInRequest {
  credential: string;
}

export interface CustomerGoogleLinkRequest extends ValidateOtpRequest {
  googleLinkCapability?: string;
}

export interface CustomerRefreshTokenRequest {
  refreshToken: string;
}

export type CustomerRefreshResponse = CustomerLoginResponse;

export type CustomerGoogleSignInResponse =
  | ({ status: 'AUTHENTICATED' } & CustomerLoginResponse)
  | { status: 'PHONE_LINK_REQUIRED'; googleLinkCapability: string };

/** Driver Login Request */
export interface DriverLoginRequest {
  phone: string;
  pin: string; // Senha ou PIN de 4/6 dígitos usado por entregadores
  tenantSlug?: string; // Compatibilidade temporária com clientes antigos
}

/** Driver Login Response */
export interface DriverLoginResponse extends AuthTokens {
  driver: DriverUserSession;
}

export interface DriverTenantSelectionOption {
  driverId: string;
  tenant: {
    id: string;
    name: string;
  };
}

export interface DriverTenantSelectionRequired {
  requiresTenantSelection: true;
  selectionToken: string;
  tenants: DriverTenantSelectionOption[];
}

export interface DriverTenantSelectionRequest {
  selectionToken: string;
  driverId: string;
}

export type DriverLoginResult = DriverLoginResponse | DriverTenantSelectionRequired;
