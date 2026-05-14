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
import { memoryStorage } from 'multer';
import { extname } from 'path';
import { ImageOptimizerService } from './image-optimizer.service';
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
  constructor(private readonly optimizer: ImageOptimizerService) {}
  @Post('image')
  @RequirePermissions('catalog.update')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: {
        fileSize: 10 * 1024 * 1024, // Aumentado para 10MB pois vamos comprimir
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

    const uploaded = file as { buffer: Buffer; originalname: string };
    const tenantId = req.user.tenantId;

    const filename = await this.optimizer.optimize(
      uploaded.buffer,
      tenantId,
      uploaded.originalname,
    );

    const url = `/api/v1/static/${encodeURIComponent(tenantId)}/${encodeURIComponent(filename)}`;

    return { url };
  }
}
