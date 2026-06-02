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

type DestinationCallback = (error: Error | null, destination: string) => void;
type FileNameCallback = (error: Error | null, filename: string) => void;
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
    @UploadedFile() file: any,
  ) {
    if (!file) {
      throw new BadRequestException('Arquivo não enviado');
    }

    return this.uploadService.createMediaAsset({
      tenantId: req.user.tenantId,
      scope: 'storefront_background',
      file: {
        buffer: file.buffer,
        originalname: file.originalname,
        mimetype: file.mimetype,
        size: file.size,
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
    const maxSizeBytes = Number(process.env.MEDIA_MAX_SIZE_BYTES) || 10 * 1024 * 1024;
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
