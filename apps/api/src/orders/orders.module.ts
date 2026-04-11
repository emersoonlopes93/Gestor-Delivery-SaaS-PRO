import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { CheckoutValidatorService } from './checkout-validator.service';
import { AuthModule } from '../auth/auth.module';
import { RbacModule } from '../rbac/rbac.module';

@Module({
  imports: [DatabaseModule, AuthModule, RbacModule],
  controllers: [OrdersController],
  providers: [OrdersService, CheckoutValidatorService],
  exports: [OrdersService, CheckoutValidatorService],
})
export class OrdersModule {}
