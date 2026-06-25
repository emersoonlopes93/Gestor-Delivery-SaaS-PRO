import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Request,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import type { Request as ExpressRequest } from 'express';
import type { AdminJwtPayload } from '@gestor/types';
import { CurrentUser, RequireAdminPermissions } from '../../common/decorators';
import { AdminAuthGuard } from '../auth/admin-auth.guard';
import { AdminPermissionsGuard } from '../rbac/admin-permissions.guard';
import { AdminBaseMediaService, BaseMediaListFilters } from './admin-base-media.service';
import type { MediaUploadFile } from '../../upload/media-library.service';

type BulkBody = {
  ids?: string[];
};

type FileFilterCallback = (error: Error | null, acceptFile: boolean) => void;

type MulterFileLike = {
  originalname: string;
  mimetype: string;
};

const imageUploadInterceptor = FileInterceptor('file', {
  storage: memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req: ExpressRequest, file: MulterFileLike, cb: FileFilterCallback) => {
    const allowedMime = new Set(['image/jpeg', 'image/png', 'image/webp']);
    if (!allowedMime.has(file.mimetype)) {
      cb(new BadRequestException('Formato de imagem invalido. Use JPG, PNG ou WEBP.'), false);
      return;
    }
    cb(null, true);
  },
});

@Controller('admin/base-media')
@UseGuards(AdminAuthGuard, AdminPermissionsGuard)
export class AdminBaseMediaController {
  constructor(private readonly baseMedia: AdminBaseMediaService) {}

  @Get()
  @RequireAdminPermissions('saas.base_media.read')
  list(@Query() query: BaseMediaListFilters) {
    return this.baseMedia.list(query);
  }

  @Get(':id')
  @RequireAdminPermissions('saas.base_media.read')
  get(@Param('id') id: string) {
    return this.baseMedia.get(id);
  }

  @Post(':id/publish')
  @RequireAdminPermissions('saas.base_media.manage')
  publish(@Param('id') id: string, @CurrentUser('sub') adminId: string, @Request() req: ExpressRequest & { user: AdminJwtPayload }) {
    return this.baseMedia.publish(id, { id: adminId, ip: req.ip });
  }

  @Post(':id/unpublish')
  @RequireAdminPermissions('saas.base_media.manage')
  unpublish(@Param('id') id: string, @CurrentUser('sub') adminId: string, @Request() req: ExpressRequest & { user: AdminJwtPayload }) {
    return this.baseMedia.unpublish(id, { id: adminId, ip: req.ip });
  }

  @Post(':id/archive')
  @RequireAdminPermissions('saas.base_media.manage')
  archive(@Param('id') id: string, @CurrentUser('sub') adminId: string, @Request() req: ExpressRequest & { user: AdminJwtPayload }) {
    return this.baseMedia.archive(id, { id: adminId, ip: req.ip });
  }

  @Post(':id/restore')
  @RequireAdminPermissions('saas.base_media.manage')
  restore(@Param('id') id: string, @CurrentUser('sub') adminId: string, @Request() req: ExpressRequest & { user: AdminJwtPayload }) {
    return this.baseMedia.restore(id, { id: adminId, ip: req.ip });
  }

  @Post(':id/delete')
  @RequireAdminPermissions('saas.base_media.manage')
  delete(@Param('id') id: string, @CurrentUser('sub') adminId: string, @Request() req: ExpressRequest & { user: AdminJwtPayload }) {
    return this.baseMedia.delete(id, { id: adminId, ip: req.ip });
  }

  @Post('bulk-publish')
  @RequireAdminPermissions('saas.base_media.manage')
  bulkPublish(@Body() body: BulkBody, @CurrentUser('sub') adminId: string, @Request() req: ExpressRequest & { user: AdminJwtPayload }) {
    return this.baseMedia.bulk(body.ids ?? [], 'published', 'media.base.bulk_publish', { id: adminId, ip: req.ip });
  }

  @Post('bulk-unpublish')
  @RequireAdminPermissions('saas.base_media.manage')
  bulkUnpublish(@Body() body: BulkBody, @CurrentUser('sub') adminId: string, @Request() req: ExpressRequest & { user: AdminJwtPayload }) {
    return this.baseMedia.bulk(body.ids ?? [], 'draft', 'media.base.bulk_unpublish', { id: adminId, ip: req.ip });
  }

  @Post('bulk-archive')
  @RequireAdminPermissions('saas.base_media.manage')
  bulkArchive(@Body() body: BulkBody, @CurrentUser('sub') adminId: string, @Request() req: ExpressRequest & { user: AdminJwtPayload }) {
    return this.baseMedia.bulk(body.ids ?? [], 'archived', 'media.base.bulk_archive', { id: adminId, ip: req.ip });
  }

  @Post(':id/replace')
  @RequireAdminPermissions('saas.base_media.manage')
  @UseInterceptors(imageUploadInterceptor)
  replace(
    @Param('id') id: string,
    @UploadedFile() file: unknown,
    @CurrentUser('sub') adminId: string,
    @Request() req: ExpressRequest & { user: AdminJwtPayload },
  ) {
    return this.baseMedia.replace(id, asUploadedImage(file), { id: adminId, ip: req.ip });
  }
}

function asUploadedImage(file: unknown): MediaUploadFile {
  if (!file || typeof file !== 'object') {
    throw new BadRequestException('Arquivo nao enviado.');
  }
  const candidate = file as Partial<MediaUploadFile>;
  if (!Buffer.isBuffer(candidate.buffer) || typeof candidate.originalname !== 'string' || typeof candidate.mimetype !== 'string' || typeof candidate.size !== 'number') {
    throw new BadRequestException('Arquivo invalido.');
  }
  return {
    buffer: candidate.buffer,
    originalname: candidate.originalname,
    mimetype: candidate.mimetype,
    size: candidate.size,
  };
}
