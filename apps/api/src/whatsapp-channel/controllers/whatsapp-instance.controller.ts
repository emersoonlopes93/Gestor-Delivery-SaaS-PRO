import {
  Controller,
  Get,
  Post,
  Body,
  UseGuards,
  Request,
  Delete,
  HttpCode,
} from '@nestjs/common';
import { WhatsAppInstanceService, CreateInstanceDto } from '../services/whatsapp-instance.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../rbac/guards/permissions.guard';
import { RequirePermissions as Permissions } from '../../common/decorators';

@Controller('whatsapp/instance')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class WhatsAppInstanceController {
  constructor(private readonly instanceService: WhatsAppInstanceService) {}

  @Get()
  @Permissions('settings.manage')
  async getInstance(@Request() req: any) {
    return this.instanceService.getInstance(req.user.tenantId);
  }

  @Post()
  @Permissions('settings.manage')
  async createOrUpdateInstance(@Request() req: any, @Body() dto: CreateInstanceDto) {
    return this.instanceService.createInstance(req.user.tenantId, dto);
  }

  @Get('status')
  @Permissions('settings.manage')
  async getStatus(@Request() req: any) {
    return this.instanceService.getStatus(req.user.tenantId);
  }

  @Post('connect')
  @HttpCode(200)
  @Permissions('settings.manage')
  async connect(@Request() req: any, @Body('webhookUrl') webhookUrl: string) {
    return this.instanceService.connectInstance(req.user.tenantId, webhookUrl);
  }

  @Post('disconnect')
  @HttpCode(200)
  @Permissions('settings.manage')
  async disconnect(@Request() req: any) {
    return this.instanceService.disconnectInstance(req.user.tenantId);
  }

  @Get('qr-code')
  @Permissions('settings.manage')
  async getQrCode(@Request() req: any) {
    const qrCode = await this.instanceService.getQrCode(req.user.tenantId);
    return { qrCode };
  }
}
