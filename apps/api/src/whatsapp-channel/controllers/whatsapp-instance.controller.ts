import {
  Controller,
  Get,
  Post,
  Body,
  UseGuards,
  Request,
  HttpCode,
} from '@nestjs/common';
import { WhatsAppInstanceService, CreateInstanceDto } from '../services/whatsapp-instance.service';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../database/prisma.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../rbac/guards/permissions.guard';
import { RequirePermissions as Permissions } from '../../common/decorators';

import { Request as ExpressRequest } from 'express';

interface AuthenticatedRequest extends ExpressRequest {
  user: {
    tenantId: string;
    id: string;
    [key: string]: any;
  };
}

@Controller('whatsapp/instance')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class WhatsAppInstanceController {
  constructor(
    private readonly instanceService: WhatsAppInstanceService,
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  private buildWebhookUrl(req: AuthenticatedRequest, tenantId: string): string {
    const prefix = this.configService.get<string>('API_PREFIX', '/api/v1');
    const host = req?.get?.('host') || req?.headers?.host || 'localhost:3333';
    const forwardedProto = req?.get?.('x-forwarded-proto') || req?.headers?.['x-forwarded-proto'];
    const proto = (Array.isArray(forwardedProto) ? forwardedProto[0] : forwardedProto) || req?.protocol || 'http';
    return `${proto}://${host}${prefix}/webhooks/whatsapp/${tenantId}`;
  }

  @Get()
  @Permissions('settings.manage')
  async getInstance(@Request() req: AuthenticatedRequest) {
    return this.instanceService.getInstance(req.user.tenantId);
  }

  @Post()
  @Permissions('settings.manage')
  async createOrUpdateInstance(@Request() req: AuthenticatedRequest, @Body() dto: CreateInstanceDto) {
    const tenantId = req.user.tenantId;
    const safeDto: CreateInstanceDto = {
      ...dto,
      webhookUrl: dto?.webhookUrl?.trim() || this.buildWebhookUrl(req, tenantId),
    };
    return this.instanceService.createInstance(tenantId, safeDto);
  }

  @Get('status')
  @Permissions('settings.manage')
  async getStatus(@Request() req: AuthenticatedRequest) {
    console.log(`[WhatsApp Status] tenantId: ${req.user.tenantId}`);
    const result = await this.instanceService.getStatus(req.user.tenantId);
    console.log(`[WhatsApp Status] result:`, result);
    return result;
  }

  @Post('connect')
  @HttpCode(200)
  @Permissions('settings.manage')
  async connect(@Request() req: AuthenticatedRequest, @Body('webhookUrl') webhookUrl: string) {
    const tenantId = req.user.tenantId;
    const effectiveWebhookUrl = webhookUrl?.trim() || this.buildWebhookUrl(req, tenantId);
    console.log(`[WhatsApp Connect] tenantId: ${tenantId}, webhookUrl: ${effectiveWebhookUrl}`);
    const result = await this.instanceService.connectInstance(tenantId, effectiveWebhookUrl);
    console.log(`[WhatsApp Connect] result:`, result);
    console.log(`[WhatsApp Connect] QR Code present:`, result.qrCode ? 'YES' : 'NO');
    console.log(`[WhatsApp Connect] Status:`, result.status);
    return result;
  }

  @Post('disconnect')
  @HttpCode(200)
  @Permissions('settings.manage')
  async disconnect(@Request() req: AuthenticatedRequest) {
    return this.instanceService.disconnectInstance(req.user.tenantId);
  }

  @Post('pair')
  @HttpCode(200)
  @Permissions('settings.manage')
  async generatePairingCode(@Request() req: AuthenticatedRequest, @Body('phone') phone?: string) {
    const tenantId = req.user.tenantId;
    console.log(`[WhatsApp Pair] tenantId: ${tenantId}, phone: ${phone || 'not provided'}`);
    const result = await this.instanceService.generatePairingCode(tenantId, phone);
    console.log(`[WhatsApp Pair] result:`, result);
    return result;
  }

  @Get('qr-code')
  @Permissions('settings.manage')
  async getQrCode(@Request() req: AuthenticatedRequest) {
    const qrCode = await this.instanceService.getQrCode(req.user.tenantId);
    return { qrCode };
  }

  @Get('debug')
  @Permissions('settings.manage')
  async debug(@Request() req: AuthenticatedRequest) {
    const tenantId = req.user.tenantId;
    
    // Verificar configuração global
    const systemConfig = await this.prisma.systemConfig.findUnique({ where: { id: 'global' } });
    
    // Verificar instância do tenant
    const instance = await this.prisma.whatsAppInstance.findUnique({ where: { tenantId } });
    
    return {
      tenantId,
      systemConfig: {
        evolutionUrl: systemConfig?.evolutionUrl,
        evolutionGlobalToken: systemConfig?.evolutionGlobalToken ? '***CONFIGURADO***' : 'NÃO CONFIGURADO',
        defaultWhatsAppProvider: systemConfig?.defaultWhatsAppProvider,
      },
      instance: instance ? {
        id: instance.id,
        instanceName: instance.instanceName,
        providerType: instance.providerType,
        status: instance.status,
        phoneNumber: instance.phoneNumber,
        apiUrl: instance.apiUrl,
        apiKey: instance.apiKey ? '***CONFIGURADO***' : 'NÃO CONFIGURADO',
        evolutionInstanceId: instance.evolutionInstanceId,
      } : 'NÃO ENCONTRADA',
    };
  }
}
