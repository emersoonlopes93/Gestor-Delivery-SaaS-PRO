import {
  BadRequestException,
  Controller,
  Post,
  Request,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  Query,
  Delete,
  Param,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Request as ExpressRequest } from 'express';
import { memoryStorage } from 'multer';
import { randomUUID } from 'crypto';
import { ImageOptimizerService } from './image-optimizer.service';
import { StorageService } from './storage.service';
import { UploadService, validateBufferSafety } from './upload.service';
import { TenantAuthGuard } from '../auth/guards/tenant-auth.guard';
import { PermissionsGuard } from '../rbac/guards/permissions.guard';
import { RequirePermissions } from '../common/decorators';
import type { TenantJwtPayload } from '@gestor/types';

type FileFilterCallback = (error: Error | null, acceptFile: boolean) => void;

type MulterFileLike = {
  originalname: string;
  mimetype: string;
  filename?: string;
};

@Controller('upload')
@UseGuards(TenantAuthGuard, PermissionsGuard)
export class UploadController {
  constructor(
    private readonly optimizer: ImageOptimizerService,
    private readonly storageService: StorageService,
    private readonly uploadService: UploadService,
  ) {}

  /**
   * New endpoint for Storefront Background Upload.
   * Leverages the new MediaAsset architecture.
   */
  @Post('storefront-background')
  @Throttle({ public: { limit: 20, ttl: 60 } })
  @RequirePermissions('settings.manage')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: {
        fileSize: 5 * 1024 * 1024, // 5MB limit for backgrounds
      },
      fileFilter: (_req: ExpressRequest, file: MulterFileLike, cb: FileFilterCallback) => {
        const allowedMime = new Set(['image/jpeg', 'image/png', 'image/webp']);
        if (!allowedMime.has(file.mimetype)) {
          cb(new BadRequestException('Formato de imagem inválido. Use JPG, PNG ou WEBP.'), false);
          return;
        }
        cb(null, true);
      },
    }),
  )
  async uploadStorefrontBackground(
    @Request() req: ExpressRequest & { user: TenantJwtPayload },
    @UploadedFile() file: unknown,
  ) {
    if (!file) {
      throw new BadRequestException('Arquivo não enviado');
    }

    const uploaded = file as { buffer: Buffer; originalname: string; mimetype: string; size: number };

    return this.uploadService.createMediaAsset({
      tenantId: req.user.tenantId,
      scope: 'storefront_background',
      file: {
        buffer: uploaded.buffer,
        originalname: uploaded.originalname,
        mimetype: uploaded.mimetype,
        size: uploaded.size,
      },
    });
  }

  @Delete('media/:id')
  @RequirePermissions('settings.manage')
  async deleteMedia(
    @Request() req: ExpressRequest & { user: TenantJwtPayload },
    @Param('id') id: string,
  ) {
    return this.uploadService.deleteMediaAsset(req.user.tenantId, id);
  }

  @Post('image')
  @Throttle({ public: { limit: 30, ttl: 60 } })
  @RequirePermissions('catalog.update')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: {
        fileSize: 10 * 1024 * 1024, // 10MB limit
      },
      fileFilter: (_req: ExpressRequest, file: MulterFileLike, cb: FileFilterCallback) => {
        const allowedMime = new Set(['image/jpeg', 'image/png', 'image/webp']);
        if (!allowedMime.has(file.mimetype)) {
          cb(new BadRequestException('Formato de imagem inválido. Use JPG, PNG ou WEBP.'), false);
          return;
        }
        cb(null, true);
      },
    }),
  )
  async uploadImage(
    @Request() req: ExpressRequest & { user: TenantJwtPayload },
    @UploadedFile() file: unknown,
    @Query('type') type?: string,
  ) {
    if (!file) {
      throw new BadRequestException('Arquivo não enviado');
    }

    const uploaded = file as { buffer: Buffer; originalname: string; mimetype: string; size: number };
    const tenantId = req.user.tenantId;

    // 1. Enforce size limit from environment variables
    const maxSizeBytes =
      Number(process.env.MEDIA_MAX_SIZE_BYTES) ||
      (Number(process.env.MEDIA_MAX_FILE_SIZE_MB) ? Number(process.env.MEDIA_MAX_FILE_SIZE_MB) * 1024 * 1024 : 10 * 1024 * 1024);
    if (uploaded.size > maxSizeBytes || uploaded.buffer.length > maxSizeBytes) {
      throw new BadRequestException('O arquivo excede o limite máximo de tamanho permitido.');
    }

    // 2. Perform magic number and script/SVG injection validations
    validateBufferSafety(uploaded.buffer, uploaded.mimetype);

    // 3. Otimiza a imagem na memória
    const { buffer: optimizedBuffer } = await this.optimizer.optimize(
      uploaded.buffer,
      uploaded.originalname,
    );

    // 2. Define a key multi-tenant
    const uuid = randomUUID();
    const folder = type === 'logo' ? 'logos' : type === 'combo' ? 'combos' : 'products';
    const key = `tenants/${tenantId}/${folder}/${uuid}.webp`;

    // 3. Salva no storage (local ou R2)
    const result = await this.storageService.uploadBuffer({
      buffer: optimizedBuffer,
      key,
      contentType: 'image/webp',
    });

    return {
      url: result.url,
      key: result.key,
    };
  }
}
