import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { CheckoutValidatorService } from './checkout-validator.service';

@Module({
  imports: [DatabaseModule],
  controllers: [OrdersController],
  providers: [OrdersService, CheckoutValidatorService],
  exports: [OrdersService],
})
export class OrdersModule {}
