import { Controller, Get, Post, Body, Put, Param, UseGuards, Query } from '@nestjs/common';
import { FinancialAccountsService } from './financial-accounts.service';
import { FinancialTransactionsService } from './financial-transactions.service';
import { 
  CreateFinancialAccountDTO, 
  UpdateFinancialAccountDTO, 
  FinancialAccountDTO,
  CreateFinancialTransactionDTO,
  UpdateFinancialTransactionDTO,
  FinancialTransactionDTO,
  FinancialStatus,
  FinancialTransactionType,
} from '@gestor/types';
import { TenantAuthGuard } from '../auth/guards/tenant-auth.guard';
import { CurrentTenant } from '../common/decorators';

@Controller('finance')
@UseGuards(TenantAuthGuard)
export class FinanceController {
  constructor(
    private readonly accountsService: FinancialAccountsService,
    private readonly transactionsService: FinancialTransactionsService,
  ) {}

  // Accounts
  @Get('accounts')
  async findAllAccounts(@CurrentTenant() tenantId: string): Promise<FinancialAccountDTO[]> {
    return this.accountsService.findAll(tenantId);
  }

  @Post('accounts')
  async createAccount(
    @CurrentTenant() tenantId: string,
    @Body() dto: CreateFinancialAccountDTO,
  ): Promise<FinancialAccountDTO> {
    return this.accountsService.create(tenantId, dto);
  }

  @Put('accounts/:id')
  async updateAccount(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
    @Body() dto: UpdateFinancialAccountDTO,
  ): Promise<FinancialAccountDTO> {
    return this.accountsService.update(tenantId, id, dto);
  }

  // Transactions
  @Get('transactions')
  async findAllTransactions(
    @CurrentTenant() tenantId: string,
    @Query('accountId') accountId?: string,
    @Query('type') type?: FinancialTransactionType,
    @Query('status') status?: FinancialStatus,
  ): Promise<FinancialTransactionDTO[]> {
    return this.transactionsService.findAll(tenantId, { accountId, type, status });
  }

  @Post('transactions')
  async createTransaction(
    @CurrentTenant() tenantId: string,
    @Body() dto: CreateFinancialTransactionDTO,
  ): Promise<FinancialTransactionDTO> {
    return this.transactionsService.create(tenantId, dto);
  }

  @Put('transactions/:id')
  async updateTransaction(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
    @Body() dto: UpdateFinancialTransactionDTO,
  ): Promise<FinancialTransactionDTO> {
    return this.transactionsService.update(tenantId, id, dto);
  }
}
