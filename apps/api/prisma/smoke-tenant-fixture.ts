import { TenantDefaultRole } from '@gestor/core';

export const SMOKE_TENANT_FIXTURE = {
  slug: 'pizzaria-demo',
  ownerEmail: 'owner@pizzariademo.com',
  ownerPassword: 'Owner@123',
  ownerRole: TenantDefaultRole.TENANT_OWNER,
} as const;
