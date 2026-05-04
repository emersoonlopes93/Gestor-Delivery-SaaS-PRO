/** JWT payload for tenant users */
export interface TenantJwtPayload {
    sub: string;
    tenantId: string;
    type: 'tenant';
    email: string;
    isImpersonated?: boolean;
    impersonatedBy?: string;
    iat?: number;
    exp?: number;
}
/** JWT payload for admin users */
export interface AdminJwtPayload {
    sub: string;
    type: 'admin';
    email: string;
    iat?: number;
    exp?: number;
}
/** JWT payload for drivers */
export interface DriverJwtPayload {
    sub: string;
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
    onboardingCompletedAt?: string | null;
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
    sub: string;
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
/** Driver Login Request */
export interface DriverLoginRequest {
    phone: string;
    pin: string;
}
/** Driver Login Response */
export interface DriverLoginResponse extends AuthTokens {
    driver: DriverUserSession;
}
//# sourceMappingURL=auth.d.ts.map