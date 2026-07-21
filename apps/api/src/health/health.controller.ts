import { Controller, Get, Param, UseGuards, HttpStatus, Res } from '@nestjs/common';
import { Response } from 'express';
import { Public } from '../common/decorators';
import { TenantHealthService } from './tenant-health.service';
import { HealthService } from './health.service';
import { AdminAuthGuard } from '../admin/auth/admin-auth.guard';

@Controller('health')
export class HealthController {
  constructor(
    private readonly tenantHealthService: TenantHealthService,
    private readonly healthService: HealthService,
  ) {}

  /**
   * GET /health
   * Liveness Check extremamente simples. Serve apenas para atestar que o processo HTTP está ativo.
   */
  @Public()
  @Get()
  checkLiveness() {
    return { status: 'ok' };
  }

  /**
   * GET /health/ready
   * Readiness Check real avaliando infraestrutura de banco de dados, Redis, BullMQ e WebSockets.
   * HTTP 200 para ok/degraded e HTTP 503 para down.
   */
  @Public()
  @Get('ready')
  async checkReadiness(@Res() res: Response) {
    const payload = await this.healthService.getReadiness();
    if (payload.status === 'down') {
      return res.status(HttpStatus.SERVICE_UNAVAILABLE).json(payload);
    }
    return res.status(HttpStatus.OK).json(payload);
  }

  /**
   * GET /health/ready/websocket
   * Diagnóstico específico dos Gateways de WebSocket ativos da API.
   */
  @Public()
  @Get('ready/websocket')
  async checkWebSocketReady() {
    const payload = await this.healthService.getReadiness();
    const ws = payload.details.websocket;
    const allActive = ws.ordersGateway.active && ws.deliveryGateway.active && ws.chatGateway.active;
    return {
      status: allActive ? 'ok' : 'degraded',
      timestamp: payload.timestamp,
      gateways: {
        orders: { active: ws.ordersGateway.active, connections: ws.ordersGateway.clientsCount, reason: ws.ordersGateway.reason },
        delivery: { active: ws.deliveryGateway.active, connections: ws.deliveryGateway.clientsCount, reason: ws.deliveryGateway.reason },
        chat: { active: ws.chatGateway.active, connections: ws.chatGateway.clientsCount, reason: ws.chatGateway.reason },
      },
    };
  }

  @UseGuards(AdminAuthGuard)
  @Get('tenants')
  async listTenantsHealth() {
    return this.tenantHealthService.listAllTenantsHealth();
  }

  @UseGuards(AdminAuthGuard)
  @Get('tenants/:id')
  async getTenantHealth(@Param('id') id: string) {
    return this.tenantHealthService.getTenantHealth(id);
  }
}
