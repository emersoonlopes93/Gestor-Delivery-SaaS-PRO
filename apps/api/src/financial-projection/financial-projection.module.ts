import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { FinancialProjectionService } from './financial-projection.service';

@Module({
  imports: [DatabaseModule],
  providers: [FinancialProjectionService],
  exports: [FinancialProjectionService],
})
export class FinancialProjectionModule {}
