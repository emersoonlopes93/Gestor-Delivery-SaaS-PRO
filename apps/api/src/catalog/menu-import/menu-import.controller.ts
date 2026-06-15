import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
  NotFoundException,
} from '@nestjs/common';
import { TenantAuthGuard } from '../../auth/guards/tenant-auth.guard';
import { RequirePermissions } from '../../common/decorators';
import { PermissionsGuard } from '../../rbac/guards/permissions.guard';
import { MenuImportService, MenuImportOptions } from './menu-import.service';
import { IsBoolean, IsOptional, IsString } from 'class-validator';

class ExecuteImportDto {
  @IsString()
  templateId!: string;

  @IsBoolean()
  @IsOptional()
  skipExisting?: boolean;
}

@Controller('catalog/menu-import')
@UseGuards(TenantAuthGuard, PermissionsGuard)
export class MenuImportController {
  constructor(private readonly menuImportService: MenuImportService) {}

  /**
   * Lista todos os templates de cardápio disponíveis.
   * GET /catalog/menu-import/templates
   */
  @Get('templates')
  @RequirePermissions('catalog.read')
  async listTemplates() {
    return this.menuImportService.listTemplates();
  }

  /**
   * Retorna o template recomendado baseado no segmento do tenant.
   * GET /catalog/menu-import/recommended
   */
  @Get('recommended')
  @RequirePermissions('catalog.read')
  async getRecommended() {
    const template = await this.menuImportService.detectRecommendedTemplate();
    return { recommended: template };
  }

  /**
   * Retorna os detalhes de um template específico (incluindo produtos).
   * GET /catalog/menu-import/templates/:id
   */
  @Get('templates/:id')
  @RequirePermissions('catalog.read')
  async getTemplate(@Param('id') id: string) {
    const template = await this.menuImportService.getTemplate(id);
    if (!template) {
      throw new NotFoundException(`Template "${id}" não encontrado.`);
    }
    return template;
  }

  /**
   * Executa a importação de um template para o tenant atual.
   * POST /catalog/menu-import/execute
   *
   * Body: { templateId: string, skipExisting?: boolean }
   */
  @Post('execute')
  @RequirePermissions('catalog.create')
  @HttpCode(HttpStatus.OK)
  async executeImport(@Body() dto: ExecuteImportDto) {
    const options: MenuImportOptions = {
      skipExisting: dto.skipExisting ?? true,
    };
    return this.menuImportService.importTemplate(dto.templateId, options);
  }
}
