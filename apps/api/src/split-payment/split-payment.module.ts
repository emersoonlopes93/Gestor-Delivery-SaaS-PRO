import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { RbacModule } from '../rbac/rbac.module';
import { SplitPaymentController } from './split-payment.controller';
import { SplitPaymentService } from './split-payment.service';

@Module({
  imports: [DatabaseModule, RbacModule],
  controllers: [SplitPaymentController],
  providers: [SplitPaymentService],
  exports: [SplitPaymentService],
})
export class SplitPaymentModule {}
