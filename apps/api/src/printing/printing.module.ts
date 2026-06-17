import { Module } from '@nestjs/common';
import { PrintingController } from './printing.controller';
import { PrintingService } from './printing.service';
import { DatabaseModule } from '../../database/database.module';
import { PrinterModule } from '../pos/printer.module';

@Module({
  imports: [DatabaseModule, PrinterModule],
  controllers: [PrintingController],
  providers: [PrintingService],
  exports: [PrintingService],
})
export class PrintingModule {}
