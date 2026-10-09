import { ApiError } from '../lib/api-client';

export type UploadMediaAsset = {
  id: string;
  title: string | null;
  originalName: string | null;
  publicUrl: string;
  altText: string | null;
  scope: string;
  category?: string | null;
  categoryId?: string | null;
};

export type MediaUploadIssue = {
  fileName: string;
  reason: string;
  stage: 'prevalidacao' | 'upload';
};

export const MAX_MEDIA_FILE_SIZE_BYTES = 10 * 1024 * 1024;

export function tryAcquireUploadLock(lock: { current: boolean }) {
  if (lock.current) return false;
  lock.current = true;
  return true;
}

export function validateMediaFile(file: Pick<File, 'type' | 'size'>) {
  const allowedTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);
  if (!allowedTypes.has(file.type)) {
    return 'Formato não suportado. Use JPG, PNG ou WebP.';
  }

  if (file.size > MAX_MEDIA_FILE_SIZE_BYTES) {
    return 'Arquivo muito grande. Escolha uma imagem menor que 10 MB.';
  }

  return null;
}

export function friendlyMediaUploadError(error: unknown) {
  if (error instanceof ApiError && (error.status === 413 || error.code === 'PAYLOAD_TOO_LARGE')) {
    return 'Arquivo muito grande. Escolha uma imagem menor que 10 MB.';
  }

  if (error instanceof ApiError && error.status === 400) {
    return 'A imagem não pôde ser processada. Use um arquivo JPG, PNG ou WebP válido.';
  }

  return 'Não foi possível salvar a imagem. Tente novamente.';
}

export async function uploadMediaFiles(
  files: File[],
  baseTitle: string,
  upload: (formData: FormData) => Promise<UploadMediaAsset>,
) {
  const uploadedAssets: UploadMediaAsset[] = [];
  const failedFiles: File[] = [];
  const issues: MediaUploadIssue[] = [];

  for (const [index, file] of files.entries()) {
    const formData = new FormData();
    formData.set('file', file);

    const fallbackTitle = file.name.replace(/\.[^.]+$/, '');
    const title = files.length === 1
      ? baseTitle || fallbackTitle
      : baseTitle
        ? `${baseTitle} ${index + 1}`
        : fallbackTitle;

    formData.set('title', title);
    formData.set('altText', title);

    try {
      uploadedAssets.push(await upload(formData));
    } catch (error) {
      failedFiles.push(file);
      issues.push({
        fileName: file.name,
        reason: friendlyMediaUploadError(error),
        stage: 'upload',
      });
    }
  }

  return { uploadedAssets, failedFiles, issues };
}
