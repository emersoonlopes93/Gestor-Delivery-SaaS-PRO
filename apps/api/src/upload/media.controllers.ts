import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Request,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Request as ExpressRequest } from 'express';
import { memoryStorage } from 'multer';
import { IsBoolean, IsOptional, IsString } from 'class-validator';
import { TenantAuthGuard } from '../auth/guards/tenant-auth.guard';
import { PermissionsGuard } from '../rbac/guards/permissions.guard';
import { AdminAuthGuard } from '../admin/auth/admin-auth.guard';
import { AdminPermissionsGuard } from '../admin/rbac/admin-permissions.guard';
import { CurrentTenant, RequireAdminPermissions, RequirePermissions } from '../common/decorators';
import type { AdminJwtPayload, TenantJwtPayload } from '@gestor/types';
import { MediaLibraryService, MediaListFilters, MediaMetadataInput, MediaScope } from './media-library.service';
import { OpenAiImageProvider } from '../ai-agent/providers/openai-image.provider';

type FileFilterCallback = (error: Error | null, acceptFile: boolean) => void;

type MulterFileLike = {
  originalname: string;
  mimetype: string;
};

type UploadedImage = {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
  size: number;
};

class MediaMetadataDto {
  @IsString()
  @IsOptional()
  title?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  altText?: string;

  @IsString()
  @IsOptional()
  categoryId?: string;

  @IsString()
  @IsOptional()
  category?: string;

  @IsString()
  @IsOptional()
  tags?: string;

  @IsString()
  @IsOptional()
  status?: 'active' | 'inactive';

  @IsString()
  @IsOptional()
  publicationStatus?: 'draft' | 'published' | 'unpublished';
}

class AiGenerateDto {
  @IsString()
  prompt!: string;

  @IsString()
  title!: string;

  @IsString()
  @IsOptional()
  categoryId?: string;

  @IsString()
  @IsOptional()
  tags?: string;
}

class MediaCategoryDto {
  @IsString()
  name!: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}

const imageUploadInterceptor = FileInterceptor('file', {
  storage: memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024,
  },
  fileFilter: (_req: ExpressRequest, file: MulterFileLike, cb: FileFilterCallback) => {
    const allowedMime = new Set(['image/jpeg', 'image/png', 'image/webp']);
    if (!allowedMime.has(file.mimetype)) {
      cb(new BadRequestException('Formato de imagem invalido. Use JPG, PNG ou WEBP.'), false);
      return;
    }
    cb(null, true);
  },
});

@Controller('admin/media')
@UseGuards(AdminAuthGuard, AdminPermissionsGuard)
export class AdminMediaController {
  constructor(
    private readonly media: MediaLibraryService,
    private readonly aiImageProvider: OpenAiImageProvider,
  ) {}

  @Post('ai-generate')
  @Throttle({ public: { limit: 10, ttl: 60 } })
  @RequireAdminPermissions('saas.settings.manage')
  async aiGenerateGlobal(
    @Request() req: ExpressRequest & { user: AdminJwtPayload },
    @Body() body: AiGenerateDto,
  ) {
    const isAvailable = await this.aiImageProvider.isAvailable();
    if (!isAvailable) {
      throw new BadRequestException('A integracao com a OpenAI para imagens nao esta configurada.');
    }

    const result = await this.aiImageProvider.generateImage({
      prompt: body.prompt,
      n: 1,
      size: '1024x1024',
      response_format: 'b64_json',
    });

    if (result.error || !result.data[0]?.b64_json) {
      throw new BadRequestException(`Falha na geracao de imagem: ${result.error?.message || 'Nenhum dado retornado.'}`);
    }

    const buffer = Buffer.from(result.data[0].b64_json, 'base64');
    const safeTitle = body.title.replace(/[^a-z0-9]/gi, '_').toLowerCase();
    
    const uploadedFile: UploadedImage = {
      buffer,
      originalname: `ai_generated_${safeTitle}.png`,
      mimetype: 'image/png',
      size: buffer.length,
    };

    let tagsList = parseTags(body.tags) || [];
    tagsList.push('ai_generated');

    const metadata: MediaMetadataInput = {
      title: body.title,
      altText: body.title,
      categoryId: body.categoryId,
      publicationStatus: 'draft',
      tags: tagsList,
      description: `Prompt: ${body.prompt}`,
    };

    return this.media.uploadSystemAsset(uploadedFile, metadata, req.user.sub);
  }

  @Post('gallery/upload')
  @Throttle({ public: { limit: 20, ttl: 60 } })
  @RequireAdminPermissions('saas.settings.manage')
  @UseInterceptors(imageUploadInterceptor)
  uploadGlobal(
    @Request() req: ExpressRequest & { user: AdminJwtPayload },
    @UploadedFile() file: unknown,
    @Body() body: MediaMetadataDto,
  ) {
    const uploaded = asUploadedImage(file);
    return this.media.uploadSystemAsset(uploaded, dtoToMetadata(body), req.user.sub);
  }

  @Get('gallery')
  @RequireAdminPermissions('saas.settings.read')
  listGlobal(@Query() query: MediaListFilters) {
    return this.media.listAdminAssets(query);
  }

  @Patch('gallery/:id')
  @RequireAdminPermissions('saas.settings.manage')
  updateGlobal(@Param('id') id: string, @Body() body: MediaMetadataDto) {
    return this.media.updateSystemAsset(id, dtoToMetadata(body));
  }

  @Delete('gallery/:id')
  @RequireAdminPermissions('saas.settings.manage')
  deleteGlobal(@Param('id') id: string) {
    return this.media.deleteSystemAsset(id);
  }

  @Get('categories')
  @RequireAdminPermissions('saas.settings.read')
  listCategories() {
    return this.media.listCategories('system_gallery', null);
  }

  @Post('categories')
  @RequireAdminPermissions('saas.settings.manage')
  createCategory(@Body() body: MediaCategoryDto) {
    return this.media.upsertCategory('system_gallery', null, body);
  }

  @Patch('categories/:id')
  @RequireAdminPermissions('saas.settings.manage')
  updateCategory(@Param('id') id: string, @Body() body: MediaCategoryDto) {
    return this.media.upsertCategory('system_gallery', null, { id, ...body });
  }

  @Delete('categories/:id')
  @RequireAdminPermissions('saas.settings.manage')
  deleteCategory(@Param('id') id: string) {
    return this.media.deleteCategory('system_gallery', null, id);
  }
}

@Controller('media')
@UseGuards(TenantAuthGuard, PermissionsGuard)
export class TenantMediaController {
  constructor(private readonly media: MediaLibraryService) {}

  @Post('upload')
  @Throttle({ public: { limit: 30, ttl: 60 } })
  @RequirePermissions('catalog.update')
  @UseInterceptors(imageUploadInterceptor)
  uploadTenant(
    @Request() req: ExpressRequest & { user: TenantJwtPayload },
    @UploadedFile() file: unknown,
    @Body() body: MediaMetadataDto,
  ) {
    const uploaded = asUploadedImage(file);
    return this.media.uploadTenantAsset(req.user.tenantId, uploaded, dtoToMetadata(body), req.user.sub);
  }

  @Get('assets')
  @RequirePermissions('catalog.read')
  listTenant(@CurrentTenant() tenantId: string, @Query() query: MediaListFilters) {
    return this.media.listTenantAssets(tenantId, query);
  }

  @Get('assets/:id')
  @RequirePermissions('catalog.read')
  getTenant(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    return this.media.getTenantAsset(tenantId, id);
  }

  @Patch('assets/:id')
  @RequirePermissions('catalog.update')
  updateTenant(@CurrentTenant() tenantId: string, @Param('id') id: string, @Body() body: MediaMetadataDto) {
    return this.media.updateTenantAsset(tenantId, id, dtoToMetadata(body));
  }

  @Delete('assets/:id')
  @RequirePermissions('catalog.update')
  deleteTenant(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    return this.media.deleteTenantAsset(tenantId, id);
  }

  @Get('categories')
  @RequirePermissions('catalog.read')
  listCategories(@CurrentTenant() tenantId: string, @Query('scope') scope?: MediaScope) {
    return this.media.listCategories(scope === 'system_gallery' ? 'system_gallery' : 'tenant_library', scope === 'system_gallery' ? null : tenantId);
  }

  @Post('categories')
  @RequirePermissions('catalog.update')
  createCategory(@CurrentTenant() tenantId: string, @Body() body: MediaCategoryDto) {
    return this.media.upsertCategory('tenant_library', tenantId, body);
  }

  @Patch('categories/:id')
  @RequirePermissions('catalog.update')
  updateCategory(@CurrentTenant() tenantId: string, @Param('id') id: string, @Body() body: MediaCategoryDto) {
    return this.media.upsertCategory('tenant_library', tenantId, { id, ...body });
  }

  @Delete('categories/:id')
  @RequirePermissions('catalog.update')
  deleteCategory(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    return this.media.deleteCategory('tenant_library', tenantId, id);
  }
}

function asUploadedImage(file: unknown): UploadedImage {
  if (!file || typeof file !== 'object') {
    throw new BadRequestException('Arquivo nao enviado.');
  }
  const candidate = file as Partial<UploadedImage>;
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

function dtoToMetadata(dto: MediaMetadataDto): MediaMetadataInput {
  return {
    title: dto.title,
    description: dto.description,
    altText: dto.altText,
    categoryId: dto.categoryId,
    category: dto.category,
    tags: parseTags(dto.tags),
    status: dto.status,
    publicationStatus: dto.publicationStatus,
  };
}

function parseTags(raw: string | undefined): string[] | undefined {
  if (!raw) return undefined;
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  if (trimmed.startsWith('[')) {
    const parsed: unknown = JSON.parse(trimmed);
    if (!Array.isArray(parsed) || !parsed.every((item) => typeof item === 'string')) {
      throw new BadRequestException('Tags invalidas.');
    }
    return parsed;
  }
  return trimmed.split(',').map((tag) => tag.trim()).filter((tag) => tag.length > 0);
}
