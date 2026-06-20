import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Request, UseGuards } from '@nestjs/common';
import type { Request as ExpressRequest } from 'express';
import type { AdminJwtPayload } from '@gestor/types';
import { CurrentUser, RequireAdminPermissions } from '../../common/decorators';
import { AdminAuthGuard } from '../auth/admin-auth.guard';
import { AdminPermissionsGuard } from '../rbac/admin-permissions.guard';
import { AdminBaseMenuService, CategoryBody, CreateTemplateBody, DuplicateTemplateBody, ProductBody, UpdateTemplateBody } from './admin-base-menu.service';

@Controller('admin/base-menus')
@UseGuards(AdminAuthGuard, AdminPermissionsGuard)
export class AdminBaseMenuController {
  constructor(private readonly baseMenus: AdminBaseMenuService) {}

  @Get()
  @RequireAdminPermissions('saas.base_menu.read')
  list() {
    return this.baseMenus.list();
  }

  @Post()
  @RequireAdminPermissions('saas.base_menu.manage')
  createTemplate(@Body() body: CreateTemplateBody, @CurrentUser('sub') adminId: string, @Request() req: ExpressRequest & { user: AdminJwtPayload }) {
    return this.baseMenus.createTemplate(body, { id: adminId, ip: req.ip });
  }

  @Post(':id/duplicate')
  @RequireAdminPermissions('saas.base_menu.manage')
  duplicateTemplate(@Param('id') id: string, @Body() body: DuplicateTemplateBody, @CurrentUser('sub') adminId: string, @Request() req: ExpressRequest & { user: AdminJwtPayload }) {
    return this.baseMenus.duplicateTemplate(id, body, { id: adminId, ip: req.ip });
  }

  @Post(':id/archive')
  @RequireAdminPermissions('saas.base_menu.manage')
  archiveTemplate(@Param('id') id: string, @CurrentUser('sub') adminId: string, @Request() req: ExpressRequest & { user: AdminJwtPayload }) {
    return this.baseMenus.archiveTemplate(id, { id: adminId, ip: req.ip });
  }

  @Post(':id/restore')
  @RequireAdminPermissions('saas.base_menu.manage')
  restoreTemplate(@Param('id') id: string, @CurrentUser('sub') adminId: string, @Request() req: ExpressRequest & { user: AdminJwtPayload }) {
    return this.baseMenus.restoreTemplate(id, { id: adminId, ip: req.ip });
  }

  @Get(':id/versions')
  @RequireAdminPermissions('saas.base_menu.read')
  listVersions(@Param('id') id: string) {
    return this.baseMenus.listVersions(id);
  }

  @Get(':id/import-logs')
  @RequireAdminPermissions('saas.base_menu.read')
  listImportLogs(@Param('id') id: string) {
    return this.baseMenus.listImportLogs(id);
  }

  @Get(':id/draft')
  @RequireAdminPermissions('saas.base_menu.read')
  getDraft(@Param('id') id: string) {
    return this.baseMenus.getDraft(id);
  }

  @Get(':id/draft-version')
  @RequireAdminPermissions('saas.base_menu.manage')
  getOrCreateDraftVersion(@Param('id') id: string, @CurrentUser('sub') adminId: string, @Request() req: ExpressRequest & { user: AdminJwtPayload }) {
    return this.baseMenus.createDraftVersion(id, { id: adminId, ip: req.ip });
  }

  @Get(':id/draft/validation')
  @RequireAdminPermissions('saas.base_menu.read')
  validateDraft(@Param('id') id: string) {
    return this.baseMenus.validateDraft(id);
  }

  @Post(':id/draft-version')
  @RequireAdminPermissions('saas.base_menu.manage')
  createDraft(@Param('id') id: string, @CurrentUser('sub') adminId: string, @Request() req: ExpressRequest & { user: AdminJwtPayload }) {
    return this.baseMenus.createDraftVersion(id, { id: adminId, ip: req.ip });
  }

  @Post(':id/publish-draft')
  @RequireAdminPermissions('saas.base_menu.manage')
  publishDraft(@Param('id') id: string, @CurrentUser('sub') adminId: string, @Request() req: ExpressRequest & { user: AdminJwtPayload }) {
    return this.baseMenus.publishDraft(id, { id: adminId, ip: req.ip });
  }

  @Post(':id/discard-draft')
  @RequireAdminPermissions('saas.base_menu.manage')
  discardDraft(@Param('id') id: string, @CurrentUser('sub') adminId: string, @Request() req: ExpressRequest & { user: AdminJwtPayload }) {
    return this.baseMenus.discardDraft(id, { id: adminId, ip: req.ip });
  }

  @Patch(':id')
  @RequireAdminPermissions('saas.base_menu.manage')
  updateTemplate(@Param('id') id: string, @Body() body: UpdateTemplateBody, @CurrentUser('sub') adminId: string, @Request() req: ExpressRequest & { user: AdminJwtPayload }) {
    return this.baseMenus.updateTemplate(id, body, { id: adminId, ip: req.ip });
  }

  @Post(':id/versions/:versionId/categories')
  @RequireAdminPermissions('saas.base_menu.manage')
  createCategory(@Param('id') id: string, @Param('versionId') versionId: string, @Body() body: CategoryBody, @CurrentUser('sub') adminId: string, @Request() req: ExpressRequest & { user: AdminJwtPayload }) {
    return this.baseMenus.createCategory(id, versionId, body, { id: adminId, ip: req.ip });
  }

  @Patch(':id/versions/:versionId/categories/:categoryId')
  @RequireAdminPermissions('saas.base_menu.manage')
  updateCategory(@Param('id') id: string, @Param('versionId') versionId: string, @Param('categoryId') categoryId: string, @Body() body: CategoryBody, @CurrentUser('sub') adminId: string, @Request() req: ExpressRequest & { user: AdminJwtPayload }) {
    return this.baseMenus.updateCategory(id, versionId, categoryId, body, { id: adminId, ip: req.ip });
  }

  @Delete(':id/versions/:versionId/categories/:categoryId')
  @RequireAdminPermissions('saas.base_menu.manage')
  deleteCategory(@Param('id') id: string, @Param('versionId') versionId: string, @Param('categoryId') categoryId: string, @Query('force') force: string | undefined, @CurrentUser('sub') adminId: string, @Request() req: ExpressRequest & { user: AdminJwtPayload }) {
    return this.baseMenus.deleteCategory(id, versionId, categoryId, { id: adminId, ip: req.ip }, force === 'true');
  }

  @Post(':id/versions/:versionId/categories/:categoryId/products')
  @RequireAdminPermissions('saas.base_menu.manage')
  createProduct(@Param('id') id: string, @Param('versionId') versionId: string, @Param('categoryId') categoryId: string, @Body() body: ProductBody, @CurrentUser('sub') adminId: string, @Request() req: ExpressRequest & { user: AdminJwtPayload }) {
    return this.baseMenus.createProduct(id, versionId, categoryId, body, { id: adminId, ip: req.ip });
  }

  @Patch(':id/versions/:versionId/products/:productId')
  @RequireAdminPermissions('saas.base_menu.manage')
  updateProduct(@Param('id') id: string, @Param('versionId') versionId: string, @Param('productId') productId: string, @Body() body: ProductBody, @CurrentUser('sub') adminId: string, @Request() req: ExpressRequest & { user: AdminJwtPayload }) {
    return this.baseMenus.updateProduct(id, versionId, productId, body, { id: adminId, ip: req.ip });
  }

  @Delete(':id/versions/:versionId/products/:productId')
  @RequireAdminPermissions('saas.base_menu.manage')
  deleteProduct(@Param('id') id: string, @Param('versionId') versionId: string, @Param('productId') productId: string, @CurrentUser('sub') adminId: string, @Request() req: ExpressRequest & { user: AdminJwtPayload }) {
    return this.baseMenus.deleteProduct(id, versionId, productId, { id: adminId, ip: req.ip });
  }

  @Get(':id')
  @RequireAdminPermissions('saas.base_menu.read')
  get(@Param('id') id: string) {
    return this.baseMenus.get(id);
  }
}
