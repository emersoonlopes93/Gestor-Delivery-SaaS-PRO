import * as bcrypt from 'bcryptjs';
import { SMOKE_TENANT_FIXTURE } from './smoke-tenant-fixture';

describe('smoke tenant fixture', () => {
  it('defines the active owner credentials expected by the tenant smoke', async () => {
    const passwordHash = await bcrypt.hash(SMOKE_TENANT_FIXTURE.ownerPassword, 12);

    expect(SMOKE_TENANT_FIXTURE).toMatchObject({
      slug: 'pizzaria-demo',
      ownerEmail: 'owner@pizzariademo.com',
      ownerRole: 'tenant_owner',
    });
    await expect(bcrypt.compare(SMOKE_TENANT_FIXTURE.ownerPassword, passwordHash)).resolves.toBe(true);
    await expect(bcrypt.compare('incorrect-smoke-password', passwordHash)).resolves.toBe(false);
  });
});
