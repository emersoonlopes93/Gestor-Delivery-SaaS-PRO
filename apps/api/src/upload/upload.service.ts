import { BadRequestException, Inject, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { StorageService } from './storage.service';
import { ImageOptimizerService } from './image-optimizer.service';
import { createHash, randomUUID } from 'crypto';
import { ConfigService } from '@nestjs/config';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { Prisma } from '@prisma/client';
import { resolveMediaMaxSizeBytes } from '../config/environment-aliases';

export interface CreateMediaAssetInput {
  tenantId: string | null;
  scope: string;
  file: {
    buffer: Buffer;
    originalname: string;
    mimetype: string;
    size: number;
  };
  title?: string;
  description?: string;
  category?: string;
  categoryId?: string | null;
  altText?: string;
  createdByUserId?: string | null;
  publicationStatus?: 'draft' | 'published' | 'unpublished';
  tagsJson?: Prisma.InputJsonValue;
  metadataJson?: Prisma.InputJsonValue;
}

@Injectable()
export class UploadService {
  private readonly logger = new Logger(UploadService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly optimizer: ImageOptimizerService,
    private readonly config: ConfigService,
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
  ) {}

  async createMediaAsset(input: CreateMediaAssetInput) {
    const { tenantId, scope, file, category, categoryId, altText, tagsJson, metadataJson } = input;

    if (scope !== 'system_gallery' && !tenantId) {
      throw new BadRequestException('Upload tenant exige tenantId.');
    }

    const maxSizeBytes = resolveMediaMaxSizeBytes({
      MEDIA_MAX_SIZE_BYTES: this.config.get<string>('MEDIA_MAX_SIZE_BYTES'),
      MEDIA_MAX_FILE_SIZE_MB: this.config.get<string>('MEDIA_MAX_FILE_SIZE_MB'),
    });
    if (file.size > maxSizeBytes || file.buffer.length > maxSizeBytes) {
      throw new BadRequestException('O arquivo excede o limite maximo de tamanho permitido.');
    }

    validateOriginalFilename(file.originalname);
    validateFileExtension(file.originalname, file.mimetype);
    validateBufferSafety(file.buffer, file.mimetype);

    this.logger.log(`media_upload_started scope=${scope} tenantId=${tenantId ?? 'system'} provider=${this.storage.getDriver()}`);

    const { buffer: optimizedBuffer, info } = await this.optimizer.optimize(
      file.buffer,
      file.originalname,
    );

    const uuid = randomUUID();
    const folder = scope.replace(/_/g, '-');
    const key =
      scope === 'system_gallery'
        ? `system/gallery/${uuid}.webp`
        : `tenants/${tenantId}/${folder}/${uuid}.webp`;
    const checksum = createHash('sha256').update(optimizedBuffer).digest('hex');

    const storageResult = await this.storage.uploadBuffer({
      buffer: optimizedBuffer,
      key,
      contentType: 'image/webp',
    });

    let asset;
    try {
      asset = await this.prisma.mediaAsset.create({
        data: {
          tenantId,
          scope,
          source: 'upload',
          title: input.title ?? sanitizedTitle(file.originalname),
          description: input.description ?? null,
          category,
          categoryId: categoryId ?? null,
          filename: `${uuid}.webp`,
          originalName: file.originalname,
          mimeType: 'image/webp',
          sizeBytes: optimizedBuffer.length,
          width: info.width,
          height: info.height,
          path: storageResult.key,
          storageProvider: this.storage.getDriver(),
          storageKey: storageResult.key,
          publicUrl: storageResult.url,
          checksum,
          altText,
          tagsJson: tagsJson as Prisma.InputJsonValue,
          metadataJson: metadataJson as Prisma.InputJsonValue,
          isSystem: scope === 'system_gallery',
          status: 'active',
          publicationStatus: input.publicationStatus ?? 'published',
          createdByUserId: input.createdByUserId ?? null,
          isActive: true,
        },
      });
    } catch (error) {
      await this.storage.delete(storageResult.key);
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`media_upload_persist_failed scope=${scope} tenantId=${tenantId ?? 'system'} error=${message}`);
      throw error;
    }

    await this.invalidateStorefrontCache(tenantId);
    this.logger.log(`media_upload_completed assetId=${asset.id} scope=${scope} tenantId=${tenantId ?? 'system'} provider=${this.storage.getDriver()}`);

    return asset;
  }

  async deleteMediaAsset(tenantId: string, assetId: string) {
    const asset = await this.prisma.mediaAsset.findFirst({
      where: { id: assetId, tenantId, deletedAt: null },
    });

    if (!asset) {
      throw new BadRequestException('Midia nao encontrada ou sem permissao.');
    }

    await this.storage.delete(asset.storageKey ?? asset.path);

    const settings = await this.prisma.tenantSettings.findUnique({
      where: { tenantId },
      include: { tenant: { select: { slug: true } } },
    });

    if (settings && settings.storefrontThemeJson && typeof settings.storefrontThemeJson === 'object') {
      const theme = settings.storefrontThemeJson as Record<string, unknown>;
      let themeChanged = false;

      if (theme.backgroundImageMediaId === assetId) {
        theme.backgroundImageMediaId = null;
        theme.backgroundImageUrl = null;
        themeChanged = true;
      }

      if (theme.heroImageMediaId === assetId) {
        theme.heroImageMediaId = null;
        theme.heroImageUrl = null;
        themeChanged = true;
      }

      if (themeChanged) {
        await this.prisma.tenantSettings.update({
          where: { tenantId },
          data: {
            storefrontThemeJson: theme as Prisma.InputJsonValue,
          },
        });
      }
    }

    const updated = await this.prisma.mediaAsset.update({
      where: { id: assetId },
      data: {
        status: 'deleted',
        isActive: false,
        publicationStatus: 'unpublished',
        deletedAt: new Date(),
      },
    });

    await this.invalidateStorefrontCache(tenantId);
    this.logger.log(`media_asset_soft_deleted assetId=${assetId} tenantId=${tenantId}`);
    return updated;
  }

  async resolveTenantIdFromRequestUser(user: unknown): Promise<string> {
    const tenantId = (user as { tenantId?: unknown } | null)?.tenantId;
    if (typeof tenantId === 'string' && tenantId.length > 0) {
      return tenantId;
    }

    throw new Error('TenantId nao encontrado no usuario autenticado');
  }

  private async invalidateStorefrontCache(tenantId: string | null): Promise<void> {
    if (!tenantId) return;
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { slug: true },
    });
    if (!tenant) return;

    const cacheKeys = [
      `storefront:${tenant.slug}:delivery`,
      `storefront:${tenant.slug}:pickup`,
    ];
    for (const key of cacheKeys) {
      await this.cacheManager.del(key);
    }
  }
}

function sanitizedTitle(originalName: string): string {
  return originalName
    .replace(/\.[^.]+$/, '')
    .replace(/[^\w\s.-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120) || 'Imagem';
}

function validateOriginalFilename(originalName: string): void {
  const normalized = originalName.replace(/\\/g, '/');
  const lower = normalized.toLowerCase();
  if (
    normalized.includes('../') ||
    normalized.includes('..\\') ||
    normalized.includes('/') ||
    lower.includes('%2f') ||
    lower.includes('%5c') ||
    lower.includes('..%')
  ) {
    throw new BadRequestException('Nome de arquivo invalido.');
  }
  const dangerousExtensions = ['.svg', '.html', '.htm', '.js', '.pdf', '.zip', '.exe', '.bat', '.cmd', '.ps1'];
  if (dangerousExtensions.some((ext) => lower.endsWith(ext) || lower.includes(`${ext}.`))) {
    throw new BadRequestException('Extensao de arquivo nao permitida.');
  }
}

function validateFileExtension(originalName: string, mimetype: string): void {
  const lower = originalName.toLowerCase();
  const extension = lower.includes('.') ? lower.slice(lower.lastIndexOf('.')) : '';
  const allowedByMime: Record<string, string[]> = {
    'image/jpeg': ['.jpg', '.jpeg'],
    'image/png': ['.png'],
    'image/webp': ['.webp'],
  };
  const allowed = allowedByMime[mimetype];
  if (!allowed || !allowed.includes(extension)) {
    throw new BadRequestException('Extensao incompativel com o tipo de imagem.');
  }
}

export function validateBufferSafety(buffer: Buffer, mimetype: string) {
  if (!buffer || buffer.length === 0) {
    throw new BadRequestException('Arquivo vazio ou invalido.');
  }

  const hex = buffer.toString('hex', 0, 8).toUpperCase();

  if (mimetype === 'image/jpeg') {
    if (!hex.startsWith('FFD8FF')) {
      throw new BadRequestException('Assinatura do arquivo JPEG invalida.');
    }
  } else if (mimetype === 'image/png') {
    if (!hex.startsWith('89504E470D0A1A0A')) {
      throw new BadRequestException('Assinatura do arquivo PNG invalida.');
    }
  } else if (mimetype === 'image/webp') {
    const riff = buffer.toString('ascii', 0, 4);
    const webp = buffer.toString('ascii', 8, 12);
    if (riff !== 'RIFF' || webp !== 'WEBP') {
      throw new BadRequestException('Assinatura do arquivo WebP invalida.');
    }
  } else {
    throw new BadRequestException('MIME type nao suportado.');
  }

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
      throw new BadRequestException('Conteudo de arquivo invalido ou potencialmente perigoso detectado.');
    }
  }
}
