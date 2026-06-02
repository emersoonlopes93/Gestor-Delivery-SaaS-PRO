import { Injectable, BadRequestException, Inject } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { StorageService } from './storage.service';
import { ImageOptimizerService } from './image-optimizer.service';
import { randomUUID } from 'crypto';
import { ConfigService } from '@nestjs/config';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';

import { Prisma } from '@prisma/client';

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
  tagsJson?: Prisma.InputJsonValue;
}

@Injectable()
export class UploadService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly optimizer: ImageOptimizerService,
    private readonly config: ConfigService,
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
  ) {}

  /**
   * Processes an upload and creates a MediaAsset record.
   * Centralized logic for the new media library.
   */
  async createMediaAsset(input: CreateMediaAssetInput) {
    const { tenantId, scope, file, category, altText, tagsJson } = input;

    // 1. Enforce size limit from environment variables
    const maxSizeBytes = this.config.get<number>('MEDIA_MAX_SIZE_BYTES') || 10 * 1024 * 1024; // fallback to 10MB
    if (file.size > maxSizeBytes || file.buffer.length > maxSizeBytes) {
      throw new BadRequestException('O arquivo excede o limite máximo de tamanho permitido.');
    }

    // 2. Perform magic number and script/SVG injection validations
    validateBufferSafety(file.buffer, file.mimetype);

    // 3. Optimize image
    const { buffer: optimizedBuffer, info } = await this.optimizer.optimize(
      file.buffer,
      file.originalname,
    );

    // 4. Prepare storage path
    const uuid = randomUUID();
    const folder = scope.replace(/_/g, '-'); // e.g. storefront-background
    const key = `tenants/${tenantId}/${folder}/${uuid}.webp`;

    // 5. Upload to storage
    const storageResult = await this.storage.uploadBuffer({
      buffer: optimizedBuffer,
      key,
      contentType: 'image/webp',
    });

    // 6. Create database record
    const asset = await this.prisma.mediaAsset.create({
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
        tagsJson: tagsJson as Prisma.InputJsonValue,
        isActive: true,
      },
    });

    // 7. Invalidate public storefront cache
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { slug: true },
    });
    if (tenant) {
      const cacheKeys = [
        `storefront:${tenant.slug}:delivery`,
        `storefront:${tenant.slug}:pickup`,
      ];
      for (const key of cacheKeys) {
        await this.cacheManager.del(key);
      }
    }

    return asset;
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

    // 2. Clean references in storefront background config
    const settings = await this.prisma.tenantSettings.findUnique({
      where: { tenantId },
      include: { tenant: { select: { slug: true } } },
    });

    if (settings && settings.storefrontThemeJson && typeof settings.storefrontThemeJson === 'object') {
      const theme = settings.storefrontThemeJson as Record<string, unknown>;
      if (theme.backgroundImageMediaId === assetId) {
        theme.backgroundImageMediaId = null;
        theme.backgroundImageUrl = null;

        await this.prisma.tenantSettings.update({
          where: { tenantId },
          data: {
            storefrontThemeJson: theme as Prisma.InputJsonValue,
          },
        });

        // Invalidate public storefront cache
        const slug = settings.tenant.slug;
        const cacheKeys = [
          `storefront:${slug}:delivery`,
          `storefront:${slug}:pickup`,
        ];
        for (const key of cacheKeys) {
          await this.cacheManager.del(key);
        }
      }
    }

    // 3. Delete database record
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

/**
 * Safely validates a file buffer against magic numbers and checks for malicious scripts/HTML/SVG.
 */
export function validateBufferSafety(buffer: Buffer, mimetype: string) {
  if (!buffer || buffer.length === 0) {
    throw new BadRequestException('Arquivo vazio ou inválido.');
  }

  // 1. Check magic numbers/signatures
  const hex = buffer.toString('hex', 0, 8).toUpperCase();

  if (mimetype === 'image/jpeg') {
    // JPEG starts with FF D8 FF
    if (!hex.startsWith('FFD8FF')) {
      throw new BadRequestException('Assinatura do arquivo JPEG inválida.');
    }
  } else if (mimetype === 'image/png') {
    // PNG starts with 89 50 4E 47 0D 0A 1A 0A
    if (!hex.startsWith('89504E470D0A1A0A')) {
      throw new BadRequestException('Assinatura do arquivo PNG inválida.');
    }
  } else if (mimetype === 'image/webp') {
    // WebP starts with RIFF and has WEBP at offset 8
    const riff = buffer.toString('ascii', 0, 4);
    const webp = buffer.toString('ascii', 8, 12);
    if (riff !== 'RIFF' || webp !== 'WEBP') {
      throw new BadRequestException('Assinatura do arquivo WebP inválida.');
    }
  } else {
    throw new BadRequestException('MIME type não suportado.');
  }

  // 2. Scan the first 1024 bytes for malicious scripts, HTML elements or SVGs (polyglot file prevention)
  const checkLength = Math.min(buffer.length, 1024);
  const headerContent = buffer.toString('utf-8', 0, checkLength).toLowerCase();

  const dangerousPatterns = [
    '<svg',
    'svg>',
    '<?xml',
    '<html',
    '<script',
    '<body',
    'onload=',
    'onerror=',
    'javascript:',
  ];

  for (const pattern of dangerousPatterns) {
    if (headerContent.includes(pattern)) {
      throw new BadRequestException('Conteúdo de arquivo inválido ou potencialmente perigoso detectado.');
    }
  }
}
