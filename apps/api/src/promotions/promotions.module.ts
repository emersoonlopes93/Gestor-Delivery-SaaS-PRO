import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { AuthModule } from '../auth/auth.module';
import { RbacModule } from '../rbac/rbac.module';
import { CouponsController } from './coupons.controller';
import { CouponsService } from './coupons.service';
import { CashbackController } from './cashback.controller';
import { CashbackService } from './cashback.service';

@Module({
  imports: [DatabaseModule, AuthModule, RbacModule],
  controllers: [CouponsController, CashbackController],
  providers: [CouponsService, CashbackService],
  exports: [CouponsService, CashbackService],
})
export class PromotionsModule {}
