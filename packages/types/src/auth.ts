// ============================================================
// Auth Types — Shared between frontend and backend
// ============================================================

/** JWT payload for tenant users */
export interface TenantJwtPayload {
  sub: string;        // userId
  tenantId: string;
  type: 'tenant';
  email: string;
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
