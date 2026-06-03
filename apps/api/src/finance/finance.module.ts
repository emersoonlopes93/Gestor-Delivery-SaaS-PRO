import { Module } from '@nestjs/common';
import { FinancialAccountsService } from './financial-accounts.service';
import { FinancialTransactionsService } from './financial-transactions.service';
import { FinanceController } from './finance.controller';
import { DatabaseModule } from '../database/database.module';
import { RbacModule } from '../rbac/rbac.module';

@Module({
  imports: [DatabaseModule, RbacModule],
  controllers: [FinanceController],
  providers: [FinancialAccountsService, FinancialTransactionsService],
  exports: [FinancialAccountsService, FinancialTransactionsService],
})
export class FinanceModule {}
