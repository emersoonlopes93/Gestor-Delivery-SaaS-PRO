import {
  Controller,
  Post,
  Get,
  Param,
  Body,
  Query,
  Request,
  UseGuards,
  DefaultValuePipe,
  ParseIntPipe,
  BadRequestException,
} from '@nestjs/common';
import { CashService } from './cash.service';
import { TenantAuthGuard } from '../auth/guards/tenant-auth.guard';
import { PermissionsGuard } from '../rbac/guards/permissions.guard';
import { RequirePermissions } from '../common/decorators';
import { OpenCashSessionDTO, CloseCashSessionDTO, CreateCashMovementDTO } from '@gestor/types';

interface TenantRequest {
  user: {
    tenantId: string;
    id: string;
    permissions?: string[];
  };
}

@Controller('cash')
@UseGuards(TenantAuthGuard, PermissionsGuard)
export class CashController {
  constructor(private readonly cashService: CashService) {}

  // POST /cash/sessions/open
  @Post('sessions/open')
  @RequirePermissions('cash.open')
  async openSession(
    @Request() req: TenantRequest,
    @Body() dto: OpenCashSessionDTO,
  ) {
    return this.cashService.openSession(
      req.user.tenantId,
      req.user.id,
      dto.openingAmount,
    );
  }

  // POST /cash/sessions/:id/close
  @Post('sessions/:id/close')
  @RequirePermissions('cash.close')
  async closeSession(
    @Request() req: TenantRequest,
    @Param('id') sessionId: string,
    @Body() dto: CloseCashSessionDTO,
  ) {
    return this.cashService.closeSession(
      req.user.tenantId,
      sessionId,
      req.user.id,
      dto.closingAmountDeclared,
      dto.notes,
    );
  }

  // GET /cash/sessions/active
  @Get('sessions/active')
  @RequirePermissions('cash.read')
  async getActiveSession(@Request() req: TenantRequest) {
    return this.cashService.getActiveSession(req.user.tenantId, req.user.id);
  }

  // GET /cash/sessions
  @Get('sessions')
  @RequirePermissions('cash.read')
  async listSessions(
    @Request() req: TenantRequest,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    return this.cashService.listSessions(req.user.tenantId, page, limit);
  }

  // GET /cash/sessions/:id
  @Get('sessions/:id')
  @RequirePermissions('cash.read')
  async getSessionDetail(
    @Request() req: TenantRequest,
    @Param('id') sessionId: string,
  ) {
    return this.cashService.getSessionDetail(req.user.tenantId, sessionId);
  }

  // POST /cash/sessions/:id/movements
  @Post('sessions/:id/movements')
  @RequirePermissions('cash.add_withdrawal', 'cash.add_supply', 'cash.manage')
  async addMovement(
    @Request() req: TenantRequest,
    @Param('id') sessionId: string,
    @Body() dto: CreateCashMovementDTO,
  ) {
    if (dto.type !== 'withdrawal' && dto.type !== 'supply') {
      throw new BadRequestException('Tipo de movimentação inválido. Use withdrawal ou supply.');
    }

    return this.cashService.addMovement(
      req.user.tenantId,
      sessionId,
      req.user.id,
      dto.type as 'withdrawal' | 'supply',
      dto.amount,
      dto.description,
    );
  }
}
