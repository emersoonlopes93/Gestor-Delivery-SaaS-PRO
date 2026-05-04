/** Role for tenant users */
export interface TenantRole {
    id: string;
    tenantId: string;
    name: string;
    slug: string;
    description?: string;
    isSystem: boolean;
    permissions: string[];
}
/** Role for admin users */
export interface AdminRole {
    id: string;
    name: string;
    slug: string;
    description?: string;
    isSystem: boolean;
    permissions: string[];
}
/** Permission definition */
export interface Permission {
    id: string;
    module: string;
    action: string;
    slug: string;
    description?: string;
}
/** Actor context — unified representation of who is performing an action */
export type ActorContext = {
    type: 'tenant';
    userId: string;
    tenantId: string;
    permissions: string[];
} | {
    type: 'admin';
    userId: string;
    permissions: string[];
};
//# sourceMappingURL=rbac.d.ts.map