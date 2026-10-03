import * as bcrypt from 'bcryptjs';
import { TENANT_ROLE_PERMISSIONS } from '@gestor/core';
import { SMOKE_TENANT_FIXTURE } from './smoke-tenant-fixture';

describe('smoke tenant fixture', () => {
  it('defines the active owner credentials expected by the tenant smoke', async () => {
    const passwordHash = await bcrypt.hash(SMOKE_TENANT_FIXTURE.ownerPassword, 12);

    expect(SMOKE_TENANT_FIXTURE).toMatchObject({
      slug: 'pizzaria-demo',
      ownerEmail: 'owner@pizzariademo.com',
      ownerRole: 'tenant_owner',
      billingPlanSlug: 'revenue-growth',
    });
    expect(TENANT_ROLE_PERMISSIONS[SMOKE_TENANT_FIXTURE.ownerRole]).toEqual(
      expect.arrayContaining(['inventory.create']),
    );
    await expect(bcrypt.compare(SMOKE_TENANT_FIXTURE.ownerPassword, passwordHash)).resolves.toBe(true);
    await expect(bcrypt.compare('incorrect-smoke-password', passwordHash)).resolves.toBe(false);
  });
});
