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
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../rbac/guards/permissions.guard';
import { RequirePermissions as Permissions } from '../../common/decorators';
import { AuthenticatedRequest } from '../../common/interfaces/request.interface';

@Controller('campaigns')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class CampaignsController {
  constructor(private readonly campaignsService: CampaignsService) {}

  @Get()
  @Permissions('crm.read')
  async list(@Request() req: AuthenticatedRequest) {
    return this.campaignsService.listCampaigns(req.user.tenantId);
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
