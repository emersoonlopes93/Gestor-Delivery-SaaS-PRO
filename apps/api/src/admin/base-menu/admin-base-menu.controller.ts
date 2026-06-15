import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { RequireAdminPermissions } from '../../common/decorators';
import { AdminAuthGuard } from '../auth/admin-auth.guard';
import { AdminPermissionsGuard } from '../rbac/admin-permissions.guard';
import { AdminBaseMenuService } from './admin-base-menu.service';

@Controller('admin/base-menus')
@UseGuards(AdminAuthGuard, AdminPermissionsGuard)
export class AdminBaseMenuController {
  constructor(private readonly baseMenus: AdminBaseMenuService) {}

  @Get()
  @RequireAdminPermissions('saas.base_menu.read')
  list() {
    return this.baseMenus.list();
  }

  @Get(':id/versions')
  @RequireAdminPermissions('saas.base_menu.read')
  listVersions(@Param('id') id: string) {
    return this.baseMenus.listVersions(id);
  }

  @Get(':id')
  @RequireAdminPermissions('saas.base_menu.read')
  get(@Param('id') id: string) {
    return this.baseMenus.get(id);
  }
}
