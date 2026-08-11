import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '../lib/api-client';
import {
  friendlyMediaUploadError,
  tryAcquireUploadLock,
  uploadMediaFiles,
  validateMediaFile,
} from './image-picker-upload';

function file(name: string, type = 'image/png', size = 128) {
  return new File([new Uint8Array(size)], name, { type });
}

const asset = {
  id: 'asset-1',
  title: 'Produto',
  originalName: 'produto.png',
  publicUrl: '/media/produto.webp',
  altText: 'Produto',
  scope: 'tenant_library',
};

describe('image picker upload flow', () => {
  it('returns the persisted asset for the happy path', async () => {
    const upload = vi.fn().mockResolvedValue(asset);

    const result = await uploadMediaFiles([file('produto.png')], 'Produto', upload);

    expect(result.uploadedAssets).toEqual([asset]);
    expect(result.failedFiles).toEqual([]);
    expect(upload).toHaveBeenCalledOnce();
  });

  it('keeps a failed file available for retry with a friendly error', async () => {
    const selectedFile = file('produto.png');
    const result = await uploadMediaFiles(
      [selectedFile],
      'Produto',
      vi.fn().mockRejectedValue(new Error('bucket connection refused')),
    );

    expect(result.uploadedAssets).toEqual([]);
    expect(result.failedFiles).toEqual([selectedFile]);
    expect(result.issues[0]?.reason).toBe('Não foi possível salvar a imagem. Tente novamente.');
    expect(result.issues[0]?.reason).not.toContain('bucket');
  });

  it('uses actionable messages for type, size and invalid image errors', () => {
    expect(validateMediaFile(file('produto.gif', 'image/gif'))).toContain('Formato não suportado');
    expect(validateMediaFile(file('produto.png', 'image/png', 10 * 1024 * 1024 + 1))).toContain('Arquivo muito grande');
    expect(friendlyMediaUploadError(new ApiError(400, 'sharp failed'))).toContain('JPG, PNG ou WebP');
    expect(friendlyMediaUploadError(new ApiError(413, 'provider detail'))).toContain('menor que 10 MB');
  });

  it('allows only one logical save for two immediate clicks', () => {
    const lock = { current: false };

    expect(tryAcquireUploadLock(lock)).toBe(true);
    expect(tryAcquireUploadLock(lock)).toBe(false);
  });
});
