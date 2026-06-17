import { Module } from '@nestjs/common';
import { PrintingController } from './printing.controller';
import { PrintingService } from './printing.service';
import { DatabaseModule } from '../database/database.module';
import { PrinterModule } from '../pos/printer.module';
import { RbacModule } from '../rbac/rbac.module';

@Module({
  imports: [DatabaseModule, PrinterModule, RbacModule],
  controllers: [PrintingController],
  providers: [PrintingService],
  exports: [PrintingService],
})
export class PrintingModule {}
