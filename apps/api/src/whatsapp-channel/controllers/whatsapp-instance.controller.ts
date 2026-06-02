import {
  Controller,
  Get,
  Post,
  Body,
  UseGuards,
  Request,
  HttpCode,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { WhatsAppInstanceService, CreateInstanceDto } from '../services/whatsapp-instance.service';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../database/prisma.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../rbac/guards/permissions.guard';
import { RequirePermissions as Permissions } from '../../common/decorators';

import { AuthenticatedRequest } from '../../common/interfaces/request.interface';

@Controller('whatsapp/instance')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class WhatsAppInstanceController {
  private readonly logger = new Logger('WhatsAppInstanceController');

  constructor(
    private readonly instanceService: WhatsAppInstanceService,
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  private async buildWebhookUrl(req: AuthenticatedRequest, tenantId: string): Promise<string> {
    const publicUrl = this.configService.get<string>('PUBLIC_API_URL');
    const prefix = this.configService.get<string>('API_PREFIX', '/api/v1');
    
    let baseUrl = '';
    if (publicUrl) {
      baseUrl = publicUrl.replace(/\/+$/, '');
    } else {
      const host = req?.get?.('host') || req?.headers?.host || 'localhost:3333';

      if (host.includes('vercel.app') || host.includes('vercel.com')) {
        throw new BadRequestException(
          'PUBLIC_API_URL não configurado na API. Configure no Render como https://SUA_API_RENDER.onrender.com (sem /api/v1).',
        );
      }
      const forwardedProto = req?.get?.('x-forwarded-proto') || req?.headers?.['x-forwarded-proto'];
      const proto = (Array.isArray(forwardedProto) ? forwardedProto[0] : forwardedProto) || req?.protocol || 'http';
      baseUrl = `${proto}://${host}`;
    }
    
    const instance = await this.prisma.whatsAppInstance.findUnique({ where: { tenantId } });
    const secret = instance?.webhookSecret ? `?secret=${instance.webhookSecret}` : '';
    
    const fullUrl = `${baseUrl}${prefix}/whatsapp/evolution/webhook${secret}`;
    
    const safeSecret = instance?.webhookSecret 
      ? `${instance.webhookSecret.substring(0, 3)}***${instance.webhookSecret.substring(instance.webhookSecret.length - 3)}`
      : 'none';
    
    console.log(`[WhatsApp Webhook Config] tenantId: ${tenantId}, instance: ${instance?.instanceName}, url: ${baseUrl}${prefix}/whatsapp/evolution/webhook?secret=${safeSecret}`);
    
    return fullUrl;
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
    
    // Primeiro cria a instância (para gerar o secret se for nova)
    await this.instanceService.createInstance(tenantId, dto);
    
    // Depois reconecta com a URL de webhook correta incluindo o secret
    const webhookUrl = dto?.webhookUrl?.trim() || await this.buildWebhookUrl(req, tenantId);
    return this.instanceService.connectInstance(tenantId, webhookUrl);
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
    
    // Auto-create instance if it doesn't exist
    const instance = await this.instanceService.getInstance(tenantId);
    if (!instance) {
      this.logger.log(`Auto-creating new WhatsAppInstance for tenant ${tenantId} on connect request`);
      await this.instanceService.createInstance(tenantId, {});
    }

    const effectiveWebhookUrl = webhookUrl?.trim() || await this.buildWebhookUrl(req, tenantId);
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
    await this.instanceService.disconnectInstance(req.user.tenantId);
    return { status: 'disconnected', qrCode: null };
  }

  @Post('dev-reset')
  @HttpCode(200)
  @Permissions('settings.manage')
  async devReset(@Request() req: AuthenticatedRequest) {
    await this.instanceService.devResetInstance(req.user.tenantId);
    return { success: true };
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
