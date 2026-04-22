import { Controller, Get, Post, Body, Put, Param, UseGuards, Query } from '@nestjs/common';
import { FinancialAccountsService } from './financial-accounts.service';
import { FinancialTransactionsService } from './financial-transactions.service';
import { 
  CreateFinancialAccountDTO, 
  UpdateFinancialAccountDTO, 
  FinancialAccountDTO,
  CreateFinancialTransactionDTO,
  UpdateFinancialTransactionDTO,
  FinancialTransactionDTO
} from '@gestor/types';
import { TenantGuard } from '../auth/guards/tenant.guard';
import { CurrentTenant } from '../common/decorators/current-tenant.decorator';

@Controller('finance')
@UseGuards(TenantGuard)
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
    @Query() query: any,
  ): Promise<FinancialTransactionDTO[]> {
    return this.transactionsService.findAll(tenantId, query);
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
