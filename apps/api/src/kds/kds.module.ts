import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { RbacModule } from '../rbac/rbac.module';
import { KdsController } from './kds.controller';
import { KdsService } from './kds.service';
import { PrinterModule } from '../pos/printer.module';

@Module({
  imports: [DatabaseModule, RbacModule, PrinterModule],
  controllers: [KdsController],
  providers: [KdsService],
  exports: [KdsService],
})
export class KdsModule {}
