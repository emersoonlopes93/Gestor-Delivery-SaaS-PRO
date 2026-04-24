// ============================================================
// Auth Types — Shared between frontend and backend
// ============================================================

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

export type JwtPayload = TenantJwtPayload | AdminJwtPayload;

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
  tenant?: {
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

/** JWT payload for customer (B2C) */
export interface CustomerJwtPayload {
  sub: string;        // customerId
  tenantId: string;
  type: 'customer';
  phone: string;
  name: string;
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
  customer: {
    id: string;
    tenantId: string;
    name: string;
    phone: string;
  };
}
