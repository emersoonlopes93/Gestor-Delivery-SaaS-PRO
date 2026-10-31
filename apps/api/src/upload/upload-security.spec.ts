import { BadRequestException } from '@nestjs/common';
import { UploadService, validateBufferSafety } from './upload.service';

describe('upload security invariants', () => {
  it('rejects active content disguised as a supported image', () => {
    const disguisedSvg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script /></svg>');
    expect(() => validateBufferSafety(disguisedSvg, 'image/png')).toThrow(BadRequestException);
  });

  it('scopes media deletion to the authenticated tenant', async () => {
    const findFirst = jest.fn().mockResolvedValue(null);
    const service = new UploadService(
      { mediaAsset: { findFirst } } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await expect(service.deleteMediaAsset('tenant-a', 'asset-from-tenant-b'))
      .rejects.toThrow('Midia nao encontrada ou sem permissao.');
    expect(findFirst).toHaveBeenCalledWith({
      where: { id: 'asset-from-tenant-b', tenantId: 'tenant-a', deletedAt: null },
    });
  });
});
