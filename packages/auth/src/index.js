/**
 * Type guard: checks if the JWT payload belongs to a tenant user.
 */
export function isTenantPayload(payload) {
    return payload.type === 'tenant' && 'tenantId' in payload;
}
/**
 * Type guard: checks if the JWT payload belongs to an admin user.
 */
export function isAdminPayload(payload) {
    return payload.type === 'admin';
}
/**
 * Checks if a user has a specific permission.
 */
export function hasPermission(userPermissions, required) {
    return userPermissions.includes(required);
}
/**
 * Checks if a user has ALL of the specified permissions.
 */
export function hasAllPermissions(userPermissions, required) {
    return required.every((p) => userPermissions.includes(p));
}
/**
 * Checks if a user has ANY of the specified permissions.
 */
export function hasAnyPermission(userPermissions, required) {
    return required.some((p) => userPermissions.includes(p));
}
//# sourceMappingURL=index.js.map