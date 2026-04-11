import { Module } from '@nestjs/common';
import { PosController } from './pos.controller';
import { PosService } from './pos.service';
import { DatabaseModule } from '../database/database.module';
import { AuthModule } from '../auth/auth.module';
import { RbacModule } from '../rbac/rbac.module';
import { CashModule } from '../cash/cash.module';
import { OrdersModule } from '../orders/orders.module';
import { CrmModule } from '../crm/crm.module';
import { PromotionsModule } from '../promotions/promotions.module';
import { InventoryModule } from '../inventory/inventory.module';

@Module({
  imports: [DatabaseModule, AuthModule, RbacModule, CashModule, OrdersModule, CrmModule, PromotionsModule, InventoryModule],
  controllers: [PosController],
  providers: [PosService],
})
export class PosModule {}
