import { Module } from '@nestjs/common';
import { SuppliersService } from './suppliers.service';
import { SuppliersController } from './suppliers.controller';
import { PurchasesService } from './purchases.service';
import { PurchasesController } from './purchases.controller';
import { DatabaseModule } from '../database/database.module';
import { RbacModule } from '../rbac/rbac.module';

@Module({
  imports: [DatabaseModule, RbacModule],
  controllers: [SuppliersController, PurchasesController],
  providers: [SuppliersService, PurchasesService],
  exports: [SuppliersService, PurchasesService],
})
export class PurchasingModule {}
