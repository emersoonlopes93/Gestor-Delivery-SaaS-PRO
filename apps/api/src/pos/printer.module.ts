import { Module } from '@nestjs/common';
import { PrinterService } from './printer.service';
import { DatabaseModule } from '../database/database.module';

@Module({
  imports: [DatabaseModule],
  providers: [PrinterService],
  exports: [PrinterService],
})
export class PrinterModule {}
