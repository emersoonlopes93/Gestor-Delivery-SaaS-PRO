import { Module, forwardRef } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { RbacModule } from '../rbac/rbac.module';
import { KdsController } from './kds.controller';
import { KdsService } from './kds.service';
import { PrinterModule } from '../pos/printer.module';
import { OrdersModule } from '../orders/orders.module';

@Module({
  imports: [DatabaseModule, RbacModule, PrinterModule, forwardRef(() => OrdersModule)],
  controllers: [KdsController],
  providers: [KdsService],
  exports: [KdsService],
})
export class KdsModule {}
