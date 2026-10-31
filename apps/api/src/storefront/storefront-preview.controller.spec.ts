/// <reference types="jest" />
import { StorefrontPreviewController } from './storefront-preview.controller';

describe('StorefrontPreviewController', () => {
  it('forwards preview resolution only for the tenant from the authenticated context', async () => {
    const storefrontService = {
      getStorefrontPreviewPayload: jest.fn().mockResolvedValue({ categories: [] }),
    };
    const controller = new StorefrontPreviewController(storefrontService as never);
    const request = {
      customization: { theme: {}, layout: {} },
      fulfillmentType: 'delivery' as const,
    };

    await controller.getStorefrontPreview('tenant-from-token', request);

    expect(storefrontService.getStorefrontPreviewPayload).toHaveBeenCalledWith(
      'tenant-from-token',
      request.customization,
      'delivery',
    );
  });
});
