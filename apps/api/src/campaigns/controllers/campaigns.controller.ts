import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  HttpCode,
  UseGuards,
  Request,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { CampaignsService, CreateCampaignDto } from '../services/campaigns.service';
import { RecoveryCampaignService } from '../services/recovery-campaign.service';
import { UpsellRecommendationEngine, UpsellRecommendationInput } from '../services/upsell-recommendation.engine';
import { AbandonedCartService } from '../services/abandoned-cart.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../rbac/guards/permissions.guard';
import { RequirePermissions as Permissions } from '../../common/decorators';
import { AuthenticatedRequest } from '../../common/interfaces/request.interface';

@Controller('campaigns')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class CampaignsController {
  constructor(
    private readonly campaignsService: CampaignsService,
    private readonly recoveryCampaignService: RecoveryCampaignService,
    private readonly upsellRecommendationEngine: UpsellRecommendationEngine,
    private readonly abandonedCartService: AbandonedCartService,
  ) {}

  @Get()
  @Permissions('crm.read')
  async list(@Request() req: AuthenticatedRequest) {
    return this.campaignsService.listCampaigns(req.user.tenantId);
  }

  @Get('automations')
  @Permissions('crm.read')
  async automations(@Request() req: AuthenticatedRequest) {
    const [recovery, abandonedCarts] = await Promise.all([
      this.recoveryCampaignService.preview(req.user.tenantId),
      this.abandonedCartService.getDueCarts(req.user.tenantId),
    ]);

    return {
      recovery,
      abandonedCarts,
      automations: [
        { id: 'customer_recovery', name: 'Recuperacao de clientes', enabled: true },
        { id: 'abandoned_cart', name: 'Carrinho abandonado', enabled: true },
        { id: 'scheduled_promotions', name: 'Promocoes agendadas', enabled: true },
        { id: 'whatsapp_messages', name: 'Mensagens WhatsApp', enabled: true },
      ],
    };
  }

  @Post('recovery/:days')
  @Permissions('crm.manage_coupons')
  async createRecovery(@Request() req: AuthenticatedRequest, @Param('days') days: string) {
    const parsedDays = Number(days);
    if (parsedDays !== 30 && parsedDays !== 60 && parsedDays !== 90) {
      throw new BadRequestException('Janela de recuperacao invalida. Use 30, 60 ou 90 dias.');
    }
    return this.recoveryCampaignService.createRecoveryCampaign(req.user.tenantId, parsedDays);
  }

  @Post('upsell/recommendations')
  @Permissions('crm.read')
  async recommendUpsells(@Request() req: AuthenticatedRequest, @Body() body: UpsellRecommendationInput) {
    return this.upsellRecommendationEngine.recommend(req.user.tenantId, body);
  }

  @Post('abandoned-cart/dispatch')
  @Permissions('crm.manage_coupons')
  async dispatchAbandonedCart(@Request() req: AuthenticatedRequest, @Body() body?: { limit?: number }) {
    return this.abandonedCartService.dispatchDueReminders(req.user.tenantId, body?.limit);
  }

  @Get(':id')
  @Permissions('crm.read')
  async get(@Request() req: AuthenticatedRequest, @Param('id') id: string) {
    const campaign = await this.campaignsService.getCampaignDetails(req.user.tenantId, id);
    if (!campaign) throw new NotFoundException('Campanha não encontrada');
    return campaign;
  }

  @Post()
  @Permissions('crm.manage_coupons')
  async create(@Request() req: AuthenticatedRequest, @Body() dto: CreateCampaignDto) {
    return this.campaignsService.createCampaign(req.user.tenantId, dto);
  }

  @Post(':id/start')
  @HttpCode(200)
  @Permissions('crm.manage_coupons')
  async start(@Request() req: AuthenticatedRequest, @Param('id') id: string) {
    try {
      return await this.campaignsService.startCampaign(req.user.tenantId, id);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Unknown error';
      throw new BadRequestException(message);
    }
  }

  @Post(':id/pause')
  @HttpCode(200)
  @Permissions('crm.manage_coupons')
  async pause(@Request() req: AuthenticatedRequest, @Param('id') id: string) {
    await this.campaignsService.pauseCampaign(req.user.tenantId, id);
    return { message: 'Campanha pausada' };
  }

  @Post(':id/cancel')
  @HttpCode(200)
  @Permissions('crm.manage_coupons')
  async cancel(@Request() req: AuthenticatedRequest, @Param('id') id: string) {
    await this.campaignsService.cancelCampaign(req.user.tenantId, id);
    return { message: 'Campanha cancelada' };
  }
}
