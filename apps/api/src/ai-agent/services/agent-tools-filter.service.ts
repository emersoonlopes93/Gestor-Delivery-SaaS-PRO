import { Injectable } from '@nestjs/common';
import { AdminModulesService } from '../../admin/modules/admin-modules.service';
import { AI_TOOL_MODULE_REQUIREMENTS } from '../constants/agent-tool-modules';
import type { AiToolDefinition } from '../interfaces/ai-provider.interface';

@Injectable()
export class AgentToolsFilterService {
  constructor(private readonly adminModulesService: AdminModulesService) {}

  async filterForTenant(
    tenantId: string,
    tools: AiToolDefinition[],
  ): Promise<AiToolDefinition[]> {
    const filtered: AiToolDefinition[] = [];

    for (const tool of tools) {
      const requiredModule = AI_TOOL_MODULE_REQUIREMENTS[tool.name];
      if (!requiredModule) {
        filtered.push(tool);
        continue;
      }
      const allowed = await this.adminModulesService.hasModuleAccess(
        tenantId,
        requiredModule,
      );
      if (allowed) {
        filtered.push(tool);
      }
    }

    return filtered;
  }
}
