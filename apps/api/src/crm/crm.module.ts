import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { CustomerController } from './customer.controller';
import { CustomerService } from './customer.service';
import { AuthModule } from '../auth/auth.module';
import { RbacModule } from '../rbac/rbac.module';

@Module({
  imports: [DatabaseModule, AuthModule, RbacModule],
  controllers: [CustomerController],
  providers: [CustomerService],
  exports: [CustomerService],
})
export class CrmModule {}
