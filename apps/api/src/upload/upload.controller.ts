import {
  BadRequestException,
  Controller,
  Post,
  Request,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Request as ExpressRequest } from 'express';
import { diskStorage } from 'multer';
import { mkdirSync } from 'fs';
import { extname } from 'path';
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
  @Post('image')
  @RequirePermissions('catalog.update')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: (req: ExpressRequest, _file: MulterFileLike, cb: DestinationCallback) => {
          const tenantId = (req as ExpressRequest & { user?: TenantJwtPayload }).user?.tenantId;
          if (!tenantId) {
            cb(new Error('TenantId ausente'), '');
            return;
          }
          const destination = `uploads/${tenantId}`;
          mkdirSync(destination, { recursive: true });
          cb(null, destination);
        },
        filename: (_req: ExpressRequest, file: MulterFileLike, cb: FileNameCallback) => {
          const safeExt = extname(file.originalname || '').toLowerCase();
          const allowedExts = new Set(['.jpg', '.jpeg', '.png', '.webp']);
          const finalExt = allowedExts.has(safeExt) ? safeExt : '.jpg';
          const random = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
          cb(null, `${random}${finalExt}`);
        },
      }),
      limits: {
        fileSize: 5 * 1024 * 1024,
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
  ) {
    if (!file) {
      throw new BadRequestException('Arquivo não enviado');
    }

    const uploaded = file as { filename?: unknown };
    if (typeof uploaded.filename !== 'string' || uploaded.filename.length === 0) {
      throw new BadRequestException('Upload inválido');
    }

    const tenantId = req.user.tenantId;
    const url = `/api/v1/static/${encodeURIComponent(tenantId)}/${encodeURIComponent(uploaded.filename)}`;

    return { url };
  }
}
