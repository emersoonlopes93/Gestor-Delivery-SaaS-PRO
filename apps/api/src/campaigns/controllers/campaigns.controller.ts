import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  HttpCode,
  UseGuards,
  Request,
  NotFoundException,
  BadRequestException,
  Put,
  ForbiddenException,
} from '@nestjs/common';
import { CampaignsService, CreateCampaignDto } from '../services/campaigns.service';
import { RecoveryCampaignService } from '../services/recovery-campaign.service';
import { UpsellRecommendationEngine, UpsellRecommendationInput } from '../services/upsell-recommendation.engine';
import { AbandonedCartService } from '../services/abandoned-cart.service';
import { CampaignAutomationService } from '../services/campaign-automation.service';
import { TenantAuthGuard } from '../../auth/guards/tenant-auth.guard';
import { PermissionsGuard } from '../../rbac/guards/permissions.guard';
import { RequirePermissions as Permissions } from '../../common/decorators';
import { RequiresFeature } from '../../common/decorators/requires-feature.decorator';
import { AuthenticatedRequest } from '../../common/interfaces/request.interface';
import { BillingEntitlementsService } from '../../billing/billing-entitlements.service';

@Controller('campaigns')
@UseGuards(TenantAuthGuard, PermissionsGuard)
@RequiresFeature('campaigns')
export class CampaignsController {
  constructor(
    private readonly campaignsService: CampaignsService,
    private readonly recoveryCampaignService: RecoveryCampaignService,
    private readonly upsellRecommendationEngine: UpsellRecommendationEngine,
    private readonly abandonedCartService: AbandonedCartService,
    private readonly campaignAutomationService: CampaignAutomationService,
    private readonly billingEntitlements: BillingEntitlementsService,
  ) {}

  @Get()
  @Permissions('crm.read')
  async list(@Request() req: AuthenticatedRequest) {
    await this.assertCampaignsAvailable(req.user.tenantId);
    return this.campaignsService.listCampaigns(req.user.tenantId);
  }

  @Get('automations')
  @Permissions('crm.read')
  async automations(@Request() req: AuthenticatedRequest) {
    await this.assertCampaignsAvailable(req.user.tenantId);
    const [recovery, abandonedCarts, center] = await Promise.all([
      this.recoveryCampaignService.preview(req.user.tenantId),
      this.abandonedCartService.getDueCarts(req.user.tenantId),
      this.campaignsService.getAutomationCenter(req.user.tenantId),
    ]);

    return {
      recovery,
      abandonedCarts,
      center,
      automations: [
        { id: 'customer_recovery', name: 'Recuperacao de clientes', enabled: true },
        { id: 'abandoned_cart', name: 'Carrinho abandonado', enabled: true },
        { id: 'scheduled_reorder', name: 'Recompra programada', enabled: true },
        { id: 'post_purchase_upsell', name: 'Upsell pos-compra', enabled: true },
        { id: 'scheduled_promotions', name: 'Promocoes agendadas', enabled: true },
        { id: 'whatsapp_messages', name: 'Mensagens WhatsApp', enabled: true },
      ],
    };
  }

  @Get('automations/feedbacks')
  @Permissions('crm.read')
  async feedbacks(@Request() req: AuthenticatedRequest) {
    await this.assertCampaignsAvailable(req.user.tenantId);
    return this.campaignAutomationService.getFeedbackMetrics(req.user.tenantId);
  }

  @Get('automations/config')
  @Permissions('crm.read')
  async getAutomationConfigs(@Request() req: AuthenticatedRequest) {
    await this.assertCampaignsAvailable(req.user.tenantId);
    return this.campaignAutomationService.getAutomationConfigs(req.user.tenantId);
  }

  @Put('automations/config/:type')
  @Permissions('crm.manage_coupons')
  async saveAutomationConfig(
    @Request() req: AuthenticatedRequest,
    @Param('type') type: string,
    @Body() body: { enabled: boolean; messageTemplate: string; config: Record<string, unknown> },
  ) {
    await this.assertCampaignsAvailable(req.user.tenantId);
    return this.campaignAutomationService.saveAutomationConfig(req.user.tenantId, type, {
      enabled: body.enabled,
      messageTemplate: body.messageTemplate,
      config: (body.config || {}) as import('@prisma/client').Prisma.InputJsonObject,
    });
  }

  @Get('automations/inventory')
  @Permissions('crm.read')
  async automationInventory(@Request() req: AuthenticatedRequest) {
    await this.assertCampaignsAvailable(req.user.tenantId);
    return this.campaignAutomationService.getReuseInventory(req.user.tenantId);
  }

  @Post('automations/run')
  @HttpCode(200)
  @Permissions('crm.manage_coupons')
  async runAutomations(@Request() req: AuthenticatedRequest) {
    await this.assertCampaignsAvailable(req.user.tenantId);
    return this.campaignAutomationService.runTenantAutomations(req.user.tenantId);
  }

  @Get('ai/recommendations')
  @Permissions('crm.read')
  async aiRecommendations(@Request() req: AuthenticatedRequest) {
    await this.assertCampaignsAvailable(req.user.tenantId);
    return this.campaignAutomationService.getCommercialAiRecommendations(req.user.tenantId);
  }

  @Post('recovery/:days')
  @Permissions('crm.manage_coupons')
  async createRecovery(@Request() req: AuthenticatedRequest, @Param('days') days: string) {
    await this.assertCampaignsAvailable(req.user.tenantId);
    const parsedDays = Number(days);
    if (parsedDays !== 30 && parsedDays !== 60 && parsedDays !== 90) {
      throw new BadRequestException('Janela de recuperacao invalida. Use 30, 60 ou 90 dias.');
    }
    return this.recoveryCampaignService.createRecoveryCampaign(req.user.tenantId, parsedDays);
  }

  @Get('recovery/:days')
  @Permissions('crm.read')
  async previewRecovery(@Request() req: AuthenticatedRequest, @Param('days') days: string) {
    await this.assertCampaignsAvailable(req.user.tenantId);
    const parsedDays = Number(days);
    if (parsedDays !== 30 && parsedDays !== 60 && parsedDays !== 90) {
      throw new BadRequestException('Janela de recuperacao invalida. Use 30, 60 ou 90 dias.');
    }
    const preview = await this.recoveryCampaignService.preview(req.user.tenantId);
    return preview.find((scenario) => scenario.days === parsedDays);
  }

  @Get('upsell/recommendations')
  @Permissions('crm.read')
  async previewUpsells(
    @Request() req: AuthenticatedRequest,
    @Query('productId') productId?: string,
    @Query('comboId') comboId?: string,
    @Query('customerId') customerId?: string,
    @Query('limit') limit?: string,
  ) {
    await this.assertCampaignsAvailable(req.user.tenantId);
    return this.upsellRecommendationEngine.recommend(req.user.tenantId, {
      items: productId || comboId ? [{ productId, comboId, quantity: 1 }] : [],
      customerId,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Post('upsell/recommendations')
  @Permissions('crm.read')
  async recommendUpsells(@Request() req: AuthenticatedRequest, @Body() body: UpsellRecommendationInput) {
    await this.assertCampaignsAvailable(req.user.tenantId);
    return this.upsellRecommendationEngine.recommend(req.user.tenantId, body);
  }

  @Post('abandoned-cart/dispatch')
  @Permissions('crm.manage_coupons')
  async dispatchAbandonedCart(@Request() req: AuthenticatedRequest, @Body() body?: { limit?: number }) {
    await this.assertCampaignsAvailable(req.user.tenantId);
    return this.abandonedCartService.dispatchDueReminders(req.user.tenantId, body?.limit);
  }

  @Post('estimate')
  @Permissions('crm.read')
  @HttpCode(200)
  async estimate(@Request() req: AuthenticatedRequest, @Body() dto: CreateCampaignDto) {
    await this.assertCampaignsAvailable(req.user.tenantId);
    return this.campaignsService.estimateAudience(req.user.tenantId, dto.segmentRules);
  }

  @Get(':id')
  @Permissions('crm.read')
  async get(@Request() req: AuthenticatedRequest, @Param('id') id: string) {
    await this.assertCampaignsAvailable(req.user.tenantId);
    const campaign = await this.campaignsService.getCampaignDetails(req.user.tenantId, id);
    if (!campaign) throw new NotFoundException('Campanha não encontrada');
    return campaign;
  }

  @Post()
  @Permissions('crm.manage_coupons')
  async create(@Request() req: AuthenticatedRequest, @Body() dto: CreateCampaignDto) {
    await this.assertCampaignsAvailable(req.user.tenantId);
    return this.campaignsService.createCampaign(req.user.tenantId, dto);
  }

  @Post(':id/start')
  @HttpCode(200)
  @Permissions('crm.manage_coupons')
  async start(@Request() req: AuthenticatedRequest, @Param('id') id: string) {
    await this.assertCampaignsAvailable(req.user.tenantId);
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
    await this.assertCampaignsAvailable(req.user.tenantId);
    await this.campaignsService.pauseCampaign(req.user.tenantId, id);
    return { message: 'Campanha pausada' };
  }

  @Post(':id/cancel')
  @HttpCode(200)
  @Permissions('crm.manage_coupons')
  async cancel(@Request() req: AuthenticatedRequest, @Param('id') id: string) {
    await this.assertCampaignsAvailable(req.user.tenantId);
    await this.campaignsService.cancelCampaign(req.user.tenantId, id);
    return { message: 'Campanha cancelada' };
  }

  private async assertCampaignsAvailable(tenantId: string) {
    const entitlements = await this.billingEntitlements.resolveTenantEntitlements(tenantId);
    if (!entitlements.flags.canUseCampaigns) {
      throw new ForbiddenException('Campanhas pesadas estao disponiveis apenas no Trial Pro ou para clientes pagantes.');
    }
  }
}
