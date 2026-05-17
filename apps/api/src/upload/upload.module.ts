import { Module } from '@nestjs/common';
import { UploadController } from './upload.controller';
import { UploadService } from './upload.service';
import { ImageOptimizerService } from './image-optimizer.service';
import { StorageService } from './storage.service';
import { DatabaseModule } from '../database/database.module';
import { RbacModule } from '../rbac/rbac.module';

@Module({
  imports: [DatabaseModule, RbacModule],
  controllers: [UploadController],
  providers: [UploadService, ImageOptimizerService, StorageService],
  exports: [StorageService],
})
export class UploadModule {}
