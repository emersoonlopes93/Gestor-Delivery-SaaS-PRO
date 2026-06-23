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
import { CurrentTenant, RequirePermissions } from '../common/decorators';
import { PermissionsGuard } from '../rbac/guards/permissions.guard';
import { RequiresFeature } from '../common/decorators/requires-feature.decorator';

@Controller('finance')
@UseGuards(TenantAuthGuard, PermissionsGuard)
@RequiresFeature('finance')
export class FinanceController {
  constructor(
    private readonly accountsService: FinancialAccountsService,
    private readonly transactionsService: FinancialTransactionsService,
  ) {}

  // Accounts
  @Get('accounts')
  @RequirePermissions('finance.read')
  async findAllAccounts(@CurrentTenant() tenantId: string): Promise<FinancialAccountDTO[]> {
    return this.accountsService.findAll(tenantId);
  }

  @Post('accounts')
  @RequirePermissions('finance.manage')
  async createAccount(
    @CurrentTenant() tenantId: string,
    @Body() dto: CreateFinancialAccountDTO,
  ): Promise<FinancialAccountDTO> {
    return this.accountsService.create(tenantId, dto);
  }

  @Put('accounts/:id')
  @RequirePermissions('finance.manage')
  async updateAccount(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
    @Body() dto: UpdateFinancialAccountDTO,
  ): Promise<FinancialAccountDTO> {
    return this.accountsService.update(tenantId, id, dto);
  }

  // Transactions
  @Get('transactions')
  @RequirePermissions('finance.read')
  async findAllTransactions(
    @CurrentTenant() tenantId: string,
    @Query('accountId') accountId?: string,
    @Query('type') type?: FinancialTransactionType,
    @Query('status') status?: FinancialStatus,
  ): Promise<FinancialTransactionDTO[]> {
    return this.transactionsService.findAll(tenantId, { accountId, type, status });
  }

  @Post('transactions')
  @RequirePermissions('finance.manage')
  async createTransaction(
    @CurrentTenant() tenantId: string,
    @Body() dto: CreateFinancialTransactionDTO,
  ): Promise<FinancialTransactionDTO> {
    return this.transactionsService.create(tenantId, dto);
  }

  @Put('transactions/:id')
  @RequirePermissions('finance.manage')
  async updateTransaction(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
    @Body() dto: UpdateFinancialTransactionDTO,
  ): Promise<FinancialTransactionDTO> {
    return this.transactionsService.update(tenantId, id, dto);
  }
}
