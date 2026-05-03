import type { TenantJwtPayload, AdminJwtPayload, JwtPayload } from '@gestor/types';
/**
 * Type guard: checks if the JWT payload belongs to a tenant user.
 */
export declare function isTenantPayload(payload: JwtPayload): payload is TenantJwtPayload;
/**
 * Type guard: checks if the JWT payload belongs to an admin user.
 */
export declare function isAdminPayload(payload: JwtPayload): payload is AdminJwtPayload;
/**
 * Checks if a user has a specific permission.
 */
export declare function hasPermission(userPermissions: string[], required: string): boolean;
/**
 * Checks if a user has ALL of the specified permissions.
 */
export declare function hasAllPermissions(userPermissions: string[], required: string[]): boolean;
/**
 * Checks if a user has ANY of the specified permissions.
 */
export declare function hasAnyPermission(userPermissions: string[], required: string[]): boolean;
export type { TenantJwtPayload, AdminJwtPayload, JwtPayload };
//# sourceMappingURL=index.d.ts.map