import { Body, Controller, Get, Param, Patch, Post, Query, Request, UseGuards } from '@nestjs/common';
import { CrmPipelineStage, CrmTaskStatus } from '@prisma/client';
import { RequirePermissions } from '../common/decorators';
import { RequiresFeature } from '../common/decorators/requires-feature.decorator';
import { TenantAuthGuard } from '../auth/guards/tenant-auth.guard';
import { PermissionsGuard } from '../rbac/guards/permissions.guard';
import { CrmEnterpriseService } from './crm-enterprise.service';

type TenantRequest = {
  user: {
    id?: string;
    tenantId: string;
  };
};

@Controller('crm')
@UseGuards(TenantAuthGuard, PermissionsGuard)
@RequiresFeature('crm_enterprise')
export class CrmEnterpriseController {
  constructor(private readonly crmEnterpriseService: CrmEnterpriseService) {}

  @Get('dashboard')
  @RequirePermissions('crm.read')
  dashboard(@Request() req: TenantRequest) {
    return this.crmEnterpriseService.getDashboard(req.user.tenantId);
  }

  @Get('pipeline')
  @RequirePermissions('crm.read')
  pipeline(@Request() req: TenantRequest) {
    return this.crmEnterpriseService.getPipeline(req.user.tenantId);
  }

  @Patch('pipeline/:customerId')
  @RequirePermissions('crm.manage_customers')
  updatePipeline(
    @Request() req: TenantRequest,
    @Param('customerId') customerId: string,
    @Body() body: { stage: CrmPipelineStage; source?: string; reason?: string },
  ) {
    return this.crmEnterpriseService.upsertPipelineStage(req.user.tenantId, customerId, body);
  }

  @Get('recommendations')
  @RequirePermissions('crm.read')
  recommendations(@Request() req: TenantRequest) {
    return this.crmEnterpriseService.getCommercialAiRecommendations(req.user.tenantId);
  }

  @Get('tasks')
  @RequirePermissions('crm.read')
  tasks(@Request() req: TenantRequest, @Query('customerId') customerId?: string) {
    return this.crmEnterpriseService.listTasks(req.user.tenantId, customerId);
  }

  @Post('tasks')
  @RequirePermissions('crm.manage_customers')
  createTask(
    @Request() req: TenantRequest,
    @Body() body: { customerId: string; title: string; description?: string; dueAt?: string; status?: CrmTaskStatus },
  ) {
    return this.crmEnterpriseService.createTask(req.user.tenantId, req.user.id, body);
  }

  @Patch('tasks/:taskId')
  @RequirePermissions('crm.manage_customers')
  updateTask(
    @Request() req: TenantRequest,
    @Param('taskId') taskId: string,
    @Body() body: { title?: string; description?: string; dueAt?: string; status?: CrmTaskStatus },
  ) {
    return this.crmEnterpriseService.updateTask(req.user.tenantId, taskId, body);
  }

  @Get('customers/:customerId/timeline')
  @RequirePermissions('crm.read')
  timeline(@Request() req: TenantRequest, @Param('customerId') customerId: string) {
    return this.crmEnterpriseService.getCustomerTimeline(req.user.tenantId, customerId);
  }

  @Get('customers/:customerId/health')
  @RequirePermissions('crm.read')
  health(@Request() req: TenantRequest, @Param('customerId') customerId: string) {
    return this.crmEnterpriseService.getCustomerHealth(req.user.tenantId, customerId);
  }

  @Get('customers/:customerId/notes')
  @RequirePermissions('crm.read')
  notes(@Request() req: TenantRequest, @Param('customerId') customerId: string) {
    return this.crmEnterpriseService.listNotes(req.user.tenantId, customerId);
  }

  @Post('notes')
  @RequirePermissions('crm.manage_customers')
  createNote(@Request() req: TenantRequest, @Body() body: { customerId: string; content: string }) {
    return this.crmEnterpriseService.createNote(req.user.tenantId, req.user.id, body);
  }

  @Get('enterprise-certification')
  @RequirePermissions('crm.read')
  certification(@Request() req: TenantRequest) {
    return this.crmEnterpriseService.getReuseCertification(req.user.tenantId);
  }
}
