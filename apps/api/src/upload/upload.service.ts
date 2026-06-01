import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { StorageService } from './storage.service';
import { ImageOptimizerService } from './image-optimizer.service';
import { randomUUID } from 'crypto';

export interface CreateMediaAssetInput {
  tenantId: string;
  scope: string;
  file: {
    buffer: Buffer;
    originalname: string;
    mimetype: string;
    size: number;
  };
  category?: string;
  altText?: string;
}

@Injectable()
export class UploadService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly optimizer: ImageOptimizerService,
  ) {}

  /**
   * Processes an upload and creates a MediaAsset record.
   * Centralized logic for the new media library.
   */
  async createMediaAsset(input: CreateMediaAssetInput) {
    const { tenantId, scope, file, category, altText } = input;

    // 1. Basic security validation (extra layer)
    const allowedMime = new Set(['image/jpeg', 'image/png', 'image/webp']);
    if (!allowedMime.has(file.mimetype)) {
      throw new BadRequestException('Formato de arquivo não suportado.');
    }

    // 2. Optimize image
    const { buffer: optimizedBuffer, info } = await this.optimizer.optimize(
      file.buffer,
      file.originalname,
    );

    // 3. Prepare storage path
    const uuid = randomUUID();
    const folder = scope.replace(/_/g, '-'); // e.g. storefront-background
    const key = `tenants/${tenantId}/${folder}/${uuid}.webp`;

    // 4. Upload to storage
    const storageResult = await this.storage.uploadBuffer({
      buffer: optimizedBuffer,
      key,
      contentType: 'image/webp',
    });

    // 5. Create database record
    return this.prisma.mediaAsset.create({
      data: {
        tenantId,
        scope,
        source: 'upload',
        category,
        filename: `${uuid}.webp`,
        originalName: file.originalname,
        mimeType: 'image/webp',
        sizeBytes: optimizedBuffer.length,
        width: info.width,
        height: info.height,
        path: storageResult.key,
        publicUrl: storageResult.url,
        altText,
        isActive: true,
      },
    });
  }

  /**
   * Deletes a media asset and its physical file.
   */
  async deleteMediaAsset(tenantId: string, assetId: string) {
    const asset = await this.prisma.mediaAsset.findFirst({
      where: { id: assetId, tenantId },
    });

    if (!asset) {
      throw new BadRequestException('Mídia não encontrada ou sem permissão.');
    }

    // 1. Delete physical file
    await this.storage.delete(asset.path);

    // 2. Delete database record
    return this.prisma.mediaAsset.delete({
      where: { id: assetId },
    });
  }

  async resolveTenantIdFromRequestUser(user: unknown): Promise<string> {
    const tenantId = (user as { tenantId?: unknown } | null)?.tenantId;
    if (typeof tenantId === 'string' && tenantId.length > 0) {
      return tenantId;
    }

    throw new Error('TenantId não encontrado no usuário autenticado');
  }
}
