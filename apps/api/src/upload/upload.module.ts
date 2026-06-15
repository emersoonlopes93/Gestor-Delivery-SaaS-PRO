import { Module, forwardRef } from '@nestjs/common';
import { UploadController } from './upload.controller';
import { UploadService } from './upload.service';
import { ImageOptimizerService } from './image-optimizer.service';
import { StorageService } from './storage.service';
import { MediaLibraryService } from './media-library.service';
import { AdminMediaController, TenantMediaController } from './media.controllers';
import { DatabaseModule } from '../database/database.module';
import { RbacModule } from '../rbac/rbac.module';
import { AdminRbacService } from '../admin/rbac/admin-rbac.service';
import { AiAgentModule } from '../ai-agent/ai-agent.module';

@Module({
  imports: [DatabaseModule, RbacModule, forwardRef(() => AiAgentModule)],
  controllers: [UploadController, AdminMediaController, TenantMediaController],
  providers: [UploadService, ImageOptimizerService, StorageService, MediaLibraryService, AdminRbacService],
  exports: [StorageService, UploadService, MediaLibraryService],
})
export class UploadModule {}
