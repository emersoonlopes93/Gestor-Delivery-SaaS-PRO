/// <reference types="jest" />
import { ForbiddenException } from '@nestjs/common';
import { TenantController } from './tenant.controller';

describe('TenantController branch creation capability', () => {
  it('blocks direct API creation while preserving the network read endpoint', async () => {
    const tenantService = {
      createBranch: jest.fn(),
      getNetworkContext: jest.fn().mockResolvedValue({ stores: [{ id: 'branch-1' }] }),
    };
    const featureControlService = {
      getTenantActionCapability: jest.fn().mockReturnValue({
        enabled: false,
        code: 'BRANCH_CREATION_TEMPORARILY_DISABLED',
        message: 'A criação de novas filiais está temporariamente indisponível.',
      }),
    };
    const controller = new TenantController(
      tenantService as never,
      {} as never,
      {} as never,
      featureControlService as never,
    );

    await expect(controller.createBranch('tenant-1', 'user-1', { name: 'Centro' }))
      .rejects.toBeInstanceOf(ForbiddenException);
    expect(tenantService.createBranch).not.toHaveBeenCalled();

    await expect(controller.getNetworkContext('tenant-1')).resolves.toEqual({
      stores: [{ id: 'branch-1' }],
    });
  });
});
