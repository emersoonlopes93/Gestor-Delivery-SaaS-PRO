import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { AuthModule } from '../auth/auth.module';
import { RbacModule } from '../rbac/rbac.module';
import { CouponsController } from './coupons.controller';
import { CouponsService } from './coupons.service';
import { CashbackController } from './cashback.controller';
import { CashbackService } from './cashback.service';
import { LoyaltyController, PublicCustomerLoyaltyController } from './loyalty.controller';
import { LoyaltyService } from './loyalty.service';
import { WalletController, PublicCustomerWalletController } from './wallet.controller';
import { WalletService } from './wallet.service';

@Module({
  imports: [DatabaseModule, AuthModule, RbacModule],
  controllers: [
    CouponsController,
    CashbackController,
    LoyaltyController,
    PublicCustomerLoyaltyController,
    WalletController,
    PublicCustomerWalletController,
  ],
  providers: [CouponsService, CashbackService, LoyaltyService, WalletService],
  exports: [CouponsService, CashbackService, LoyaltyService, WalletService],
})
export class PromotionsModule {}
