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
export interface AdminJwtPayload {
    sub: string;
    type: 'admin';
    email: string;
    iat?: number;
    exp?: number;
}
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
export interface LoginRequest {
    email: string;
    password: string;
}
export interface AuthTokens {
    accessToken: string;
    refreshToken: string;
}
export interface RefreshTokenRequest {
    refreshToken: string;
}
export interface TenantLoginResponse extends AuthTokens {
    user: TenantUserSession;
}
export interface AdminLoginResponse extends AuthTokens {
    user: AdminUserSession;
}
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
export interface AdminUserSession {
    userId: string;
    email: string;
    name: string;
    roles: string[];
    permissions: string[];
}
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
export interface CustomerJwtPayload {
    sub: string;
    tenantId: string;
    type: 'customer';
    phone: string;
    name: string;
    iat?: number;
    exp?: number;
}
export interface SendOtpRequest {
    phone: string;
}
export interface ValidateOtpRequest {
    phone: string;
    code: string;
}
export interface CustomerLoginResponse {
    accessToken: string;
    customer: {
        id: string;
        tenantId: string;
        name: string;
        phone: string;
    };
}
export interface DriverLoginRequest {
    phone: string;
    pin: string;
}
export interface DriverLoginResponse extends AuthTokens {
    driver: DriverUserSession;
}
