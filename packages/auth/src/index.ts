import type { TenantJwtPayload, AdminJwtPayload, JwtPayload } from '@gestor/types';

/**
 * Type guard: checks if the JWT payload belongs to a tenant user.
 */
export function isTenantPayload(payload: JwtPayload): payload is TenantJwtPayload {
  return payload.type === 'tenant' && 'tenantId' in payload;
}

/**
 * Type guard: checks if the JWT payload belongs to an admin user.
 */
export function isAdminPayload(payload: JwtPayload): payload is AdminJwtPayload {
  return payload.type === 'admin';
}

/**
 * Checks if a user has a specific permission.
 */
export function hasPermission(userPermissions: string[], required: string): boolean {
  return userPermissions.includes(required);
}

/**
 * Checks if a user has ALL of the specified permissions.
 */
export function hasAllPermissions(userPermissions: string[], required: string[]): boolean {
  return required.every((p) => userPermissions.includes(p));
}

/**
 * Checks if a user has ANY of the specified permissions.
 */
export function hasAnyPermission(userPermissions: string[], required: string[]): boolean {
  return required.some((p) => userPermissions.includes(p));
}

export type { TenantJwtPayload, AdminJwtPayload, JwtPayload };
