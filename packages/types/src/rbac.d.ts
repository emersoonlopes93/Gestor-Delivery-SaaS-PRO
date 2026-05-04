export interface TenantRole {
    id: string;
    tenantId: string;
    name: string;
    slug: string;
    description?: string;
    isSystem: boolean;
    permissions: string[];
}
export interface AdminRole {
    id: string;
    name: string;
    slug: string;
    description?: string;
    isSystem: boolean;
    permissions: string[];
}
export interface Permission {
    id: string;
    module: string;
    action: string;
    slug: string;
    description?: string;
}
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
